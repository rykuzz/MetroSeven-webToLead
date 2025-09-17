const jsforce = require('jsforce');

// POST /api/register
module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);
    const {
      firstName, lastName, email, phone,
      campusId, masterIntakeId, studyProgramId,
      graduationYear, schoolId,
      studyProgramName,
      paymentProof, photo
    } = req.body || {};

    // ----- Create Person Account (opsional; jika kamu sudah punya flow sendiri, lewati) -----
    // Pastikan org kamu mengizinkan create IsPersonAccount dari API.
    // Jika tidak, kamu bisa cari/merge existing account by email/phone.
    const accountName = `${firstName} ${lastName || ''}`.trim();
    let accountId;

    try {
      const acc = await conn.sobject('Account').create({
        RecordTypeId: null,          // biarkan default Person Account
        IsPersonAccount: true,       // butuh permission
        FirstName: firstName,
        LastName: lastName || '-',
        PersonEmail: email,
        Phone: phone,
        Name: accountName
      });
      if (!acc.success) throw new Error('Failed to create Person Account');
      accountId = acc.id;
    } catch (e) {
      // Jika tidak boleh set IsPersonAccount, fallback: cari existing by email
      const existing = await conn.query(`
        SELECT Id FROM Account WHERE PersonEmail = '${(email || '').replace(/'/g,"\\'")}' LIMIT 1
      `);
      if (existing.totalSize > 0) {
        accountId = existing.records[0].Id;
      } else {
        // buat business account biasa
        const acc2 = await conn.sobject('Account').create({
          Name: accountName
        });
        accountId = acc2.id;
      }
    }

    // ----- Create Opportunity (Application Progress) -----
    const oppName = `REG - ${studyProgramName || 'Program'} - ${accountName}`;
    const today = new Date();
    const isoDate = today.toISOString().slice(0,10);

    const oppPayload = {
      Name: oppName,
      StageName: 'Booking Form',               // default stage
      CloseDate: isoDate,

      AccountId: accountId,                    // Applicant Name (Lookup Account/Applicant)
      Campus__c: campusId || null,
      Master_Intake__c: masterIntakeId || null,
      Study_Program__c: studyProgramId || null,
      Graduation_Year__c: graduationYear ? Number(graduationYear) : null,

      Master_School__c: schoolId || null,       

      Booking_Fee_Amount__c: 300000,           
      Is_Booking_Fee_Paid__c: !!paymentProof,  
    };

    const oppRes = await conn.sobject('Opportunity').create(oppPayload);
    if (!oppRes.success) throw new Error('Gagal membuat Opportunity');
    const oppId = oppRes.id;

    // ----- helper upload ContentVersion -----
    const uploadContent = async (file, title) => {
      if (!file || !file.dataUrl) return null;
      const m = String(file.dataUrl).match(/^data:(.*?);base64,(.*)$/);
      if (!m) return null;
      const contentType = m[1] || 'application/octet-stream';
      const base64Body  = m[2];

      const cv = await conn.sobject('ContentVersion').create({
        Title: title || (file.fileName || 'file'),
        PathOnClient: file.fileName || 'file',
        VersionData: base64Body,
        FirstPublishLocationId: oppId, // auto-link ke Opp
      });
      return cv;
    };

    // Upload bukti pembayaran & pas foto
    await uploadContent(paymentProof, 'Bukti Pembayaran');
    await uploadContent(photo, 'Pas Foto 3x4');

    return res.status(200).json({ success: true, id: oppId });

  } catch (err) {
    console.error('Register Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Gagal memproses pendaftaran' });
  }
};
