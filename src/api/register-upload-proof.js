// src/api/register-upload-proof.js
const jsforce = require('jsforce');
const multiparty = require('multiparty');

const MAX_SIZE = 1024 * 1024;
const ALLOWED = ['application/pdf','image/png','image/jpeg'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Method not allowed' });

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    const form = new multiparty.Form();
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }));
    });

    const opportunityId = fields?.opportunityId?.[0];
    const accountId = fields?.accountId?.[0];
    const file = files?.proofFile?.[0] || files?.file?.[0];

    if (!opportunityId || !accountId || !file) throw new Error('Data tidak lengkap');
    if (file.size > MAX_SIZE) throw new Error('Ukuran file maksimal 1MB');
    const ctype = file.headers?.['content-type'] || '';
    if (ctype && !ALLOWED.includes(ctype)) throw new Error('Format file harus PDF/PNG/JPG/PDF');

    await conn.login(SF_USERNAME, SF_PASSWORD);

    const fs = require('fs'); const path = require('path');
    const buff = fs.readFileSync(file.path); const base64 = buff.toString('base64');
    const ext = path.extname(file.originalFilename || '').replace('.','').toLowerCase() || 'pdf';
    const title = `BuktiBayar-${opportunityId}-${new Date().toISOString().slice(0,10)}`;

    // Upload & relate ke Opportunity
    const cv = await conn.sobject('ContentVersion').create({
      Title: title,
      PathOnClient: `${title}.${ext}`,
      VersionData: base64,
      FirstPublishLocationId: opportunityId
    });
    if (!cv.success) throw new Error(cv.errors?.join(', ') || 'Gagal upload bukti');

    // Dapatkan ContentDocumentId lalu relate juga ke Account (agar muncul di Account Documents)
    const q = await conn.query(`SELECT ContentDocumentId FROM ContentVersion WHERE Id='${cv.id}' LIMIT 1`);
    const docId = q.records?.[0]?.ContentDocumentId;
    if (docId) {
      await conn.sobject('ContentDocumentLink').create({
        ContentDocumentId: docId,
        LinkedEntityId: accountId,
        ShareType: 'V'
      });
    }

    // Set flag & stage
    await conn.sobject('Opportunity').update({
      Id: opportunityId,
      Is_Booking_Fee_Paid__c: true,
      StageName: 'Form Payment'
    });

    return res.status(200).json({ success:true, contentVersionId: cv.id });
  } catch (err) {
    console.error('register-upload-proof ERR:', err);
    return res.status(500).json({ success:false, message: err.message || 'Upload gagal' });
  }
};
