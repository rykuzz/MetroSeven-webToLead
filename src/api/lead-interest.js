// api/lead-interest.js
const jsforce = require('jsforce');

module.exports = async (req, res) => {
  if (req.method !== 'POST')
    return res.status(405).json({ message: 'Gunakan POST' });

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  try {
    const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const {
      firstName, lastName, email, phone,
      campaignId,
      leadSource = 'Promo Page',
      leadStatus = 'Open - Not Contacted',
      campaignMemberStatus = 'Responded'
    } = req.body || {};

    if (!firstName || !lastName || !email || !campaignId)
      return res.status(400).json({ message: 'firstName, lastName, email, campaignId wajib' });

    // normalisasi phone → +62xxxxxxxxxx
    let phoneNorm = null;
    if (phone) {
      let s = String(phone).replace(/\D/g, '');
      if (s.startsWith('0')) s = s.slice(1);
      phoneNorm = s ? `+62${s}` : null;
    }
    const esc = (s) => String(s || '').replace(/'/g, "\\'");

    // cari/ update lead
    const where = [`LOWER(Email)='${esc(email.toLowerCase())}'`];
    if (phoneNorm) where.push(`Phone='${esc(phoneNorm)}'`);
    const found = await conn.query(`SELECT Id FROM Lead WHERE ${where.join(' OR ')} LIMIT 1`);

    let leadId;
    if (found.totalSize > 0) {
      leadId = found.records[0].Id;
      await conn.sobject('Lead').update({
        Id: leadId, FirstName: firstName, LastName: lastName, Email: email,
        ...(phoneNorm ? { Phone: phoneNorm } : {}),
        LeadSource: leadSource, Status: leadStatus
      });
    } else {
      const created = await conn.sobject('Lead').create({
        FirstName: firstName, LastName: lastName, Email: email,
        ...(phoneNorm ? { Phone: phoneNorm } : {}),
        LeadSource: leadSource, Status: leadStatus
      });
      if (!created.success) throw new Error('Gagal membuat Lead');
      leadId = created.id;
    }

    // upsert campaign member
    const cm = await conn.query(
      `SELECT Id FROM CampaignMember WHERE CampaignId='${esc(campaignId)}' AND LeadId='${leadId}' LIMIT 1`
    );
    if (cm.totalSize > 0) {
      await conn.sobject('CampaignMember').update({
        Id: cm.records[0].Id, Status: campaignMemberStatus, HasResponded: true
      });
    } else {
      await conn.sobject('CampaignMember').create({
        CampaignId: campaignId, LeadId: leadId,
        Status: campaignMemberStatus, HasResponded: true
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Lead interest error:', err);
    return res.status(500).json({ message: err.message || 'Gagal menyimpan pendaftaran' });
  }
};
