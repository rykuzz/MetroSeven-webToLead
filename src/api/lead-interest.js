// api/lead-interest.js
const jsforce = require('jsforce');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success:false, message: 'Gunakan POST' });
    return;
  }

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const {
      firstName = '',
      lastName = '',
      email = '',
      phone = null,
      company = '',
      campaignId,
      leadSource = 'Promo Page',
      leadStatus = 'Open - Not Contacted',
      campaignMemberStatus = 'Responded'
    } = req.body || {};

    // --- Validasi ringan ---
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !campaignId) {
      return res.status(400).json({ success:false, message: 'Nama, email, dan campaignId wajib.' });
    }

    // normalisasi data
    const normEmail = String(email).trim().toLowerCase();
    const normCompany = (company && company.trim()) || 'Individual';
    let normPhone = (phone || '').toString().trim();
    if (normPhone) {
      // simpan apa adanya (sudah +62 di frontend); fallback sanitasi ringan
      normPhone = normPhone.replace(/[^\d+]/g, '');
    }

    // --- Cek Contact / Lead by email (TANPA LOWER di SOQL) ---
    const esc = s => String(s).replace(/'/g, "\\'");
    const contactQ = await conn.query(
      `SELECT Id FROM Contact WHERE Email = '${esc(normEmail)}' LIMIT 1`
    );
    let contactId = contactQ.records.length ? contactQ.records[0].Id : null;

    let leadId = null;
    if (!contactId) {
      const leadQ = await conn.query(
        `SELECT Id, IsConverted FROM Lead WHERE Email = '${esc(normEmail)}' ORDER BY CreatedDate DESC LIMIT 1`
      );
      if (leadQ.records.length) {
        const L = leadQ.records[0];
        if (!L.IsConverted) leadId = L.Id;
      }
    }

    // --- Cek CampaignMember existing untuk entity yang ketemu ---
    async function hasCMByContact(cId) {
      if (!cId) return false;
      const q = await conn.query(
        `SELECT Id FROM CampaignMember WHERE CampaignId='${esc(campaignId)}' AND ContactId='${esc(cId)}' LIMIT 1`
      );
      return q.records.length > 0 ? q.records[0].Id : null;
    }
    async function hasCMByLead(lId) {
      if (!lId) return false;
      const q = await conn.query(
        `SELECT Id FROM CampaignMember WHERE CampaignId='${esc(campaignId)}' AND LeadId='${esc(lId)}' LIMIT 1`
      );
      return q.records.length > 0 ? q.records[0].Id : null;
    }

    let existingCMId = null;
    if (contactId) existingCMId = await hasCMByContact(contactId);
    if (!existingCMId && leadId) existingCMId = await hasCMByLead(leadId);

    if (existingCMId) {
      return res.status(200).json({ success:true, alreadyRegistered:true, campaignMemberId: existingCMId });
    }

    // --- Jika belum ada Lead/Contact: buat Lead baru ---
    if (!contactId && !leadId) {
      const leadPayload = {
        FirstName: firstName.trim(),
        LastName: lastName.trim(),
        Company: normCompany,
        Email: normEmail,
        Phone: normPhone || null,
        LeadSource: leadSource,
        Status: leadStatus
      };
      const createLead = await conn.sobject('Lead').create(leadPayload);
      if (!createLead.success) throw new Error('Gagal membuat Lead baru');
      leadId = createLead.id;
    }

    // --- Buat CampaignMember ---
    const cmBody = {
      CampaignId: campaignId,
      Status: campaignMemberStatus,
      HasResponded: true
    };
    if (contactId) cmBody.ContactId = contactId; else cmBody.LeadId = leadId;

    const cmRes = await conn.sobject('CampaignMember').create(cmBody);
    if (!cmRes.success) throw new Error('Gagal membuat CampaignMember');

    return res.status(200).json({
      success: true,
      alreadyRegistered: false,
      campaignMemberId: cmRes.id
    });

  } catch (err) {
    console.error('Lead Interest Error:', err);
    // Selalu balikan JSON
    return res.status(500).json({
      success:false,
      message: err && err.message ? err.message : 'Gagal memproses pendaftaran'
    });
  }
};
