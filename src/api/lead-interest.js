// api/lead-interest.js
const jsforce = require('jsforce');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Gunakan POST' });
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

    // --- Validasi dasar ---
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !campaignId) {
      return res.status(400).json({ success: false, message: 'Nama, email, dan campaignId wajib.' });
    }

    // --- Normalisasi & util ---
    const esc = (s) => String(s).replace(/'/g, "\\'");
    const normEmail = String(email).trim().toLowerCase();
    const normCompany = (company && company.trim()) || 'Individual';
    let normPhone = (phone || '').toString().trim();
    if (normPhone) normPhone = normPhone.replace(/[^\d+]/g, '');

    // --- Cari Contact / Lead by Email (TANPA LOWER) ---
    const contactQ = await conn.query(
      `SELECT Id FROM Contact WHERE Email = '${esc(normEmail)}' LIMIT 1`
    );
    let contactId = contactQ.records.length ? contactQ.records[0].Id : null;

    let leadId = null;
    if (!contactId) {
      const leadQ = await conn.query(
        `SELECT Id, IsConverted FROM Lead WHERE Email = '${esc(normEmail)}' ORDER BY CreatedDate DESC LIMIT 1`
      );
      if (leadQ.records.length && !leadQ.records[0].IsConverted) {
        leadId = leadQ.records[0].Id;
      }
    }

    // --- Cek CampaignMember existing ---
    async function findCMByContact(cId) {
      if (!cId) return null;
      const q = await conn.query(
        `SELECT Id FROM CampaignMember WHERE CampaignId='${esc(campaignId)}' AND ContactId='${esc(cId)}' LIMIT 1`
      );
      return q.records.length ? q.records[0].Id : null;
    }
    async function findCMByLead(lId) {
      if (!lId) return null;
      const q = await conn.query(
        `SELECT Id FROM CampaignMember WHERE CampaignId='${esc(campaignId)}' AND LeadId='${esc(lId)}' LIMIT 1`
      );
      return q.records.length ? q.records[0].Id : null;
    }

    let existingCMId = null;
    if (contactId) existingCMId = await findCMByContact(contactId);
    if (!existingCMId && leadId) existingCMId = await findCMByLead(leadId);

    if (existingCMId) {
      return res.status(200).json({ success: true, alreadyRegistered: true, campaignMemberId: existingCMId });
    }

    // --- Buat Lead baru kalau belum ada entity sama sekali ---
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

    // --- Tentukan Status CM yang benar (HasResponded = true) tanpa menyentuh field HasResponded ---
    let statusToUse = campaignMemberStatus || 'Responded';
    try {
      const st = await conn.query(
        `SELECT Label, HasResponded FROM CampaignMemberStatus WHERE CampaignId='${esc(campaignId)}'`
      );
      const all = st.records || [];
      // Jika status yang diminta tidak ada pada campaign ini, pilih yang HasResponded = true
      if (!all.some(s => s.Label === statusToUse)) {
        const responded = all.find(s => s.HasResponded);
        if (responded) statusToUse = responded.Label;
        else if (all[0]) statusToUse = all[0].Label; // fallback terakhir
      }
    } catch (e) {
      // jika query status gagal, keep statusToUse apa adanya
      console.warn('Gagal ambil CampaignMemberStatus:', e.message);
    }

    // --- Buat CampaignMember (TANPA HasResponded) ---
    const cmBody = {
      CampaignId: campaignId,
      Status: statusToUse,
      ...(contactId ? { ContactId: contactId } : { LeadId: leadId })
    };

    const cmRes = await conn.sobject('CampaignMember').create(cmBody);
    if (!cmRes.success) throw new Error('Gagal membuat CampaignMember');

    return res.status(200).json({
      success: true,
      alreadyRegistered: false,
      campaignMemberId: cmRes.id
    });

  } catch (err) {
    console.error('Lead Interest Error:', err);
    return res.status(500).json({
      success: false,
      message: err && err.message ? err.message : 'Gagal memproses pendaftaran'
    });
  }
};
