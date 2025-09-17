const jsforce = require('jsforce');

// --- util: dataURL -> base64 ---
function dataUrlToBase64(dataUrl) {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:([\w/+.-]+);base64,(.*)$/);
  if (!m) return null;
  return { mime: m[1], base64: m[2] };
}

// --- util: cari RecordType Person Account yang aktif ---
async function getPersonAccountRecordTypeId(conn) {
  // Cari RT Account yang mengandung 'Person' di Name/DeveloperName
  const rt = await conn.query(`
    SELECT Id, Name, DeveloperName
    FROM RecordType
    WHERE SobjectType = 'Account' AND IsActive = true
  `);
  const rec = (rt.records || []).find(
    r => /person/i.test(r.Name || '') || /person/i.test(r.DeveloperName || '')
  );
  return rec ? rec.Id : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const {
    firstName, lastName, email, phone,
    campusId, campusName,
    masterIntakeId, intakeName,            // opsional
    studyProgramId, studyProgramName,
    graduationYear,
    schoolId,                               // Salesforce Id dari MasterSchool__c
    paymentProof,                           // { dataUrl, fileName }
    photo                                   // { dataUrl, fileName }
  } = req.body || {};

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    // =========================================================================
    // 1) Temukan / Buat PERSON ACCOUNT
    // =========================================================================
    let accountId = null;

    // Cari person account dari email (PersonEmail)
    if (email) {
      const accQ = await conn.query(`
        SELECT Id FROM Account
        WHERE IsPersonAccount = true AND PersonEmail = '${String(email).replace(/'/g, "\\'")}'
        LIMIT 1
      `);
      if (accQ.totalSize > 0) {
        accountId = accQ.records[0].Id;
      }
    }

    // Buat Person Account bila belum ada
    if (!accountId) {
      // Dapatkan RecordTypeId untuk Person Account
      const paRtId = await getPersonAccountRecordTypeId(conn);

      // Siapkan payload Account (Person)
      const accBody = {
        FirstName: firstName || '',
        LastName : (lastName && lastName.trim()) ? lastName.trim() : (firstName || 'Applicant'),
        PersonEmail: email || '',
        Phone: phone || ''
      };

      // Jika ketemu record type person → pakai RT; kalau tidak, coba IsPersonAccount=true
      if (paRtId) {
        accBody.RecordTypeId = paRtId;
      } else {
        accBody.IsPersonAccount = true; // fallback; butuh permission
      }

      const accIns = await conn.sobject('Account').create(accBody);
      if (!accIns.success) {
        throw new Error(
          (accIns.errors && accIns.errors[0] && accIns.errors[0].message) ||
          'Gagal membuat Person Account'
        );
      }
      accountId = accIns.id;
    }

    // =========================================================================
    // 2) Buat OPPORTUNITY ter-hubung ke Person Account
    // =========================================================================
    const today = new Date();
    const closeDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)
      .toISOString().slice(0, 10);

    const oppBody = {
      Name: `REG - ${firstName || ''} ${lastName || ''} - ${studyProgramName || 'Program'}`.trim(),
      AccountId: accountId,                          // 🔗 link ke Person Account
      StageName: 'Booking Form',                     // default stage
      CloseDate: closeDate,

      // Lookups/fields di org kamu
      Campus__c: campusId || null,
      Master_Intake__c: masterIntakeId || null,      // opsional
      Study_Program__c: studyProgramId || null,
      Graduation_Year__c: graduationYear ? Number(graduationYear) : null,
      Master_School__c: schoolId || null,             // ✅ pakai MasterSchool__c (benar)

      // Booking fee
      Booking_Fee_Amount__c: 300000,
      Is_Booking_Fee_Paid__c: !!paymentProof         // true jika ada bukti bayar
    };

    // buang key yang null/undefined supaya aman di org yg tidak punya field opsional
    Object.keys(oppBody).forEach(k => (oppBody[k] === null || oppBody[k] === undefined) && delete oppBody[k]);

    const oppIns = await conn.sobject('Opportunity').create(oppBody);
    if (!oppIns.success) {
      throw new Error(
        (oppIns.errors && oppIns.errors[0] && oppIns.errors[0].message) ||
        'Gagal membuat Opportunity'
      );
    }
    const opportunityId = oppIns.id;

    // =========================================================================
    // 3) Upload dokumen (ContentVersion) & tautkan ke Opportunity
    // =========================================================================
    async function uploadAndLink(fileObj, fallbackName) {
      if (!fileObj || !fileObj.dataUrl) return null;
      const parsed = dataUrlToBase64(fileObj.dataUrl);
      if (!parsed) return null;

      const safeName = (fileObj.fileName || fallbackName || 'file').replace(/[^\w.\- ]/g, '_');

      const cvRes = await conn.sobject('ContentVersion').create({
        Title: safeName.replace(/\.[^.]+$/, ''),
        PathOnClient: safeName,
        VersionData: parsed.base64
      });
      if (!cvRes.success) return null;

      // Ambil ContentDocumentId dari ContentVersion
      const cv = await conn.query(`SELECT ContentDocumentId FROM ContentVersion WHERE Id='${cvRes.id}'`);
      const docId = cv.records?.[0]?.ContentDocumentId;
      if (!docId) return null;

      // Link ke Opportunity
      await conn.sobject('ContentDocumentLink').create({
        ContentDocumentId: docId,
        LinkedEntityId: opportunityId,
        ShareType: 'V' // Viewer
      });

      return docId;
    }

    // Bukti pembayaran → trigger Is_Booking_Fee_Paid__c = true (sudah di body)
    await uploadAndLink(paymentProof, 'Bukti_Pembayaran');

    // Pas foto 3x4
    await uploadAndLink(photo, 'Pas_Foto_3x4');

    return res.status(200).json({ success: true, opportunityId });

  } catch (err) {
    console.error('Register API error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Gagal proses registrasi' });
  }
};
