// src/api/register-upload-proof.js
import formidable from 'formidable';
import fs from 'fs';
import jsforce from 'jsforce';
export const config = { api: { bodyParser: false } };

async function login() {
  const conn = new jsforce.Connection({ loginUrl: process.env.SF_LOGIN_URL });
  await conn.login(process.env.SF_USERNAME, process.env.SF_PASSWORD + process.env.SF_TOKEN);
  return conn;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const form = formidable({ multiples: false });
  form.parse(req, async (err, fields, files) => {
    try {
      if (err) throw err;
      const opportunityId = fields.opportunityId?.toString();
      if (!opportunityId) throw new Error('opportunityId is required');

      const file = files.file;
      const data = fs.readFileSync(file.filepath);

      const conn = await login();
      // Simpan ke Opportunity sebagai ContentVersion
      const cv = await conn.sobject('ContentVersion').create({
        Title: `Proof-${Date.now()}`,
        PathOnClient: file.originalFilename || 'proof.pdf',
        VersionData: data.toString('base64')
      });

      // Link ke Opportunity
      const ver = await conn.sobject('ContentVersion').retrieve(cv.id);
      await conn.sobject('ContentDocumentLink').create({
        ContentDocumentId: ver.ContentDocumentId,
        LinkedEntityId: opportunityId,
        ShareType: 'V'
      });

      res.json({ status: 'ok' });
    } catch (e) {
      res.status(400).json({ status: 'error', message: e.message || String(e) });
    }
  });
}
