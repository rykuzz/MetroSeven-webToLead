// Membuat/Upsert Person Account → Create Opportunity (Booking Form)
// Upload Bukti Pembayaran & Pas Foto (ContentVersion) → Link ke Account & Opportunity
// Set Is_Booking_Fee_Paid__c = true dan Booking_Fee_Amount__c = 300000

const jsforce = require('jsforce');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Gunakan POST' });

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);
    const b = req.body || {};

    const getBase64FromDataUrl = (dataUrl) => {
      const m = /^data:(.*?);base64,(.*)$/.exec(dataUrl || '');
      if (!m) return null;
      return { mime: m[1], base64: m[2] };
    };

    // ===== Upsert Person Account by Email =====
    let accountId = null;
    if (b.email) {
      const emailEsc = String(b.email).replace(/'/g, "\\'");
      const found = await conn.query(`
        SELECT Id FROM Account
        WHERE IsPersonAccount = true AND PersonEmail = '${emailEsc}'
        LIMIT 1
      `);
      if (found.records.length) {
        accountId = found.records[0].Id;
        await conn.sobject('Account').update({
          Id: accountId,
          FirstName: b.firstName || '',
          LastName : b.lastName  || '-',
          PersonEmail: b.email,
          PersonMobilePhone: b.phone || null,
          ...(b.schoolId ? { MasterSchool__c: b.schoolId } : {})
        });
      }
    }
    if (!accountId) {
      const accDesc = await conn.sobject('Account').describe();
      const rt =
        (accDesc.recordTypeInfos||[]).find(r => r.available && (r.name?.toLowerCase().includes('person') || r.developerName?.toLowerCase().includes('person'))) ||
        (accDesc.recordTypeInfos||[]).find(r => r.available);

      const created = await conn.sobject('Account').create({
        RecordTypeId: rt?.recordTypeId,
        FirstName: b.firstName || '',
        LastName : b.lastName  || '-',
        PersonEmail: b.email,
        Phone: b.phone || null,
        ...(b.schoolId ? { MasterSchool__c: b.schoolId } : {})
      });
      if (!created.success) throw new Error(created.errors?.join(', ') || 'Gagal membuat Account');
      accountId = created.id;
    }

    // ===== Create Opportunity (Booking Form) =====
    const closeDate = new Date(); closeDate.setDate(closeDate.getDate() + 30);
    const oppFields = {
      Name: `REG - ${b.lastName || 'Applicant'} - ${b.studyProgramName || 'Program'}`,
      StageName: 'Booking Form',
      CloseDate: closeDate.toISOString().slice(0,10),
      AccountId: accountId,
      Study_Program__c: b.studyProgramId || null,
      Campus__c: b.campusId || null,
      Master_Intake__c: b.masterIntakeId || null,
      Graduation_Year__c: b.graduationYear || null,
      LeadSource: 'Metro Seven LP',
      Is_Booking_Fee_Paid__c: true,
      Booking_Fee_Amount__c: 300000 // << hardcode 300k
    };
    const oppIns = await conn.sobject('Opportunity').create(oppFields);
    if (!oppIns.success) throw new Error(oppIns.errors?.join(', ') || 'Gagal membuat Opportunity');
    const opportunityId = oppIns.id;

    // ===== Upload Bukti Pembayaran (wajib) =====
    if (!b.paymentProof || !(b.paymentProof.dataUrl || b.paymentProof.base64)) {
      throw new Error('Bukti pembayaran wajib diunggah.');
    }
    const pp = b.paymentProof.dataUrl
      ? getBase64FromDataUrl(b.paymentProof.dataUrl)
      : { mime: 'application/octet-stream', base64: b.paymentProof.base64 };
    if (!pp || !pp.base64) throw new Error('Format bukti pembayaran tidak valid.');
    const proofCV = await conn.sobject('ContentVersion').create({
      Title: `Bukti Pembayaran - ${b.firstName || ''} ${b.lastName || ''}`.trim(),
      PathOnClient: b.paymentProof.fileName || 'bukti-pembayaran',
      VersionData: pp.base64
    });
    if (!proofCV.success) throw new Error(proofCV.errors?.join(', ') || 'Gagal upload bukti pembayaran');
    const proofDoc = await conn.query(`SELECT ContentDocumentId FROM ContentVersion WHERE Id='${proofCV.id}' LIMIT 1`);
    const proofDocId = proofDoc.records[0].ContentDocumentId;
    await conn.sobject('ContentDocumentLink').create({ ContentDocumentId: proofDocId, LinkedEntityId: opportunityId, ShareType:'V', Visibility:'AllUsers' });
    await conn.sobject('ContentDocumentLink').create({ ContentDocumentId: proofDocId, LinkedEntityId: accountId,      ShareType:'V', Visibility:'AllUsers' });

    // ===== Upload Pas Foto 3x4 (wajib) =====
    if (!b.photo || !(b.photo.dataUrl || b.photo.base64)) {
      throw new Error('Pas foto 3×4 wajib diunggah.');
    }
    const ph = b.photo.dataUrl
      ? getBase64FromDataUrl(b.photo.dataUrl)
      : { mime: 'application/octet-stream', base64: b.photo.base64 };
    if (!ph || !ph.base64) throw new Error('Format pas foto tidak valid.');
    const photoCV = await conn.sobject('ContentVersion').create({
      Title: `Pas Foto 3x4 - ${b.firstName || ''} ${b.lastName || ''}`.trim(),
      PathOnClient: b.photo.fileName || 'pas-foto-3x4.jpg',
      VersionData: ph.base64
    });
    if (!photoCV.success) throw new Error(photoCV.errors?.join(', ') || 'Gagal upload pas foto');
    const photoDoc = await conn.query(`SELECT ContentDocumentId FROM ContentVersion WHERE Id='${photoCV.id}' LIMIT 1`);
    const photoDocId = photoDoc.records[0].ContentDocumentId;
    await conn.sobject('ContentDocumentLink').create({ ContentDocumentId: photoDocId, LinkedEntityId: accountId,      ShareType:'V', Visibility:'AllUsers' });
    await conn.sobject('ContentDocumentLink').create({ ContentDocumentId: photoDocId, LinkedEntityId: opportunityId, ShareType:'V', Visibility:'AllUsers' });

    return res.status(200).json({
      success: true,
      accountId,
      opportunityId,
      paymentProofDocId: proofDocId,
      photoDocId
    });
  } catch (e) {
    console.error('register error:', e);
    return res.status(500).json({ success:false, message:e.message });
  }
};
