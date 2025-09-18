// src/api/webtolead.js
const jsforce = require('jsforce');

function digits(s) { return String(s || '').replace(/\D/g, ''); }
function normalizePhone(raw) {
  let p = digits(raw || '');
  if (!p) return null;
  if (p.startsWith('0')) p = p.slice(1);
  if (!p.startsWith('62')) p = '62' + p;
  return '+' + p;
}
function makeExternalId(email, phone) {
  const e = String(email || '').trim().toLowerCase();
  const d = digits(phone || '');
  return `${e}|${d}`.slice(0, 255); // jaga panjang
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    const body = req.body || {};
    const firstName   = (body.firstName || '').trim();
    const lastName    = (body.lastName || '').trim();
    const email       = (body.email || '').trim().toLowerCase();
    const phoneNorm   = normalizePhone(body.phone);
    const campusId    = (body.campusId || '').trim();
    const description = (body.description || '') || null;

    // basic validations
    if (!firstName) throw new Error('First name wajib diisi.');
    if (!email)     throw new Error('Email wajib diisi.');
    if (!phoneNorm) throw new Error('Phone wajib diisi.');
    if (!campusId)  throw new Error('Campus wajib dipilih.');

    const externalId = makeExternalId(email, phoneNorm);

    await conn.login(SF_USERNAME, SF_PASSWORD);

    // ---- Cari kandidat lead: email ATAU phone (tanpa batasan kampus)
    // NB: Email di Salesforce case-insensitive untuk equality; phone kita cari dengan dua pola.
    const phoneDigits = digits(phoneNorm);
    const patPlus62   = '+' + phoneDigits;     // +62xxxx
    const patLocal    = phoneDigits.startsWith('62') ? phoneDigits.slice(2) : phoneDigits;

    const soql = `
      SELECT Id, FirstName, LastName, Email, Phone, Campus__c
      FROM Lead
      WHERE (Email = '${email}'
        OR Phone LIKE '%${patPlus62}%'
        OR Phone LIKE '%${patLocal}%'
      )
      ORDER BY CreatedDate DESC
      LIMIT 200
    `;
    const q = await conn.query(soql);
    const records = q.records || [];

    // pecah: sama kampus vs kampus lain
    const sameCampus = records.find(r => r.Campus__c === campusId);
    const anyMatch   = records.length > 0;

    // helper update fields if different
    async function updateLead(targetId) {
      const upd = {
        Id: targetId,
        FirstName: firstName,
        LastName: lastName || null,
        Email: email,
        Phone: phoneNorm,
        Description: description,
        LeadSource: 'Web',
        Status: 'New',              // sesuai request
        External_ID__c: externalId, // auto-set
        Campus__c: campusId
      };
      await conn.sobject('Lead').update(upd, { allowRecursive: true });
      return { action: 'updated', leadId: targetId };
    }

    async function createLead() {
      const ins = {
        FirstName: firstName,
        LastName: lastName || null,
        Email: email,
        Phone: phoneNorm,
        Description: description,
        LeadSource: 'Web',
        Status: 'New',
        External_ID__c: externalId,
        Campus__c: campusId
      };
      const result = await conn.sobject('Lead').create(ins);
      if (!result.success) throw new Error(result.errors?.join(', ') || 'Gagal membuat Lead.');
      return { action: 'created', leadId: result.id };
    }

    let outcome;
    if (sameCampus) {
      // Identitas sama + kampus sama → jangan buat baru; replace email/phone jika berubah (serta perbarui field lain).
      const needUpdate =
        (sameCampus.Email || '').toLowerCase() !== email ||
        (digits(sameCampus.Phone) !== digits(phoneNorm)) ||
        (sameCampus.FirstName || '') !== firstName ||
        (sameCampus.LastName || '') !== (lastName || '') ||
        (sameCampus.Campus__c || '') !== campusId ||
        (description && description !== (sameCampus.Description || ''));

      if (needUpdate) outcome = await updateLead(sameCampus.Id);
      else outcome = { action: 'skipped', leadId: sameCampus.Id };
    } else if (anyMatch) {
      // Ada match identitas tapi kampus berbeda → buat Lead baru
      outcome = await createLead();
    } else {
      // Tidak ada lead sama sekali → buat Lead baru
      outcome = await createLead();
    }

    return res.status(200).json({ success: true, ...outcome });
  } catch (error) {
    console.error('WebToLead Error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Gagal memproses form.' });
  }
};
