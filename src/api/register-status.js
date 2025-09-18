// src/api/register-status.js
const jsforce = require('jsforce');
const digits = (s) => String(s||'').replace(/\D/g,'');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ success:false, message:'Method not allowed' });

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    const { email, phone } = req.query || {};
    if(!email || !phone) throw new Error('Param kurang');

    await conn.login(SF_USERNAME, SF_PASSWORD);

    const pd = digits(phone);
    const p1 = '%+' + pd + '%';
    const p2 = '%' + (pd.startsWith('62') ? pd.slice(2) : pd) + '%';

    const soql = `
      SELECT Id, ConvertedOpportunityId
      FROM Lead
      WHERE Email = :email AND (Phone LIKE :p1 OR Phone LIKE :p2)
      ORDER BY LastModifiedDate DESC
      LIMIT 1
    `;
    const r = await conn.query(soql, { email: String(email).toLowerCase(), p1, p2 });
    const lead = r.records?.[0];

    if (lead?.ConvertedOpportunityId) {
      const opp = await conn.sobject('Opportunity').retrieve(lead.ConvertedOpportunityId);
      return res.status(200).json({ success:true, opportunityId: opp.Id, accountId: opp.AccountId });
    }

    return res.status(200).json({ success:true, opportunityId: null });
  } catch (err) {
    console.error('register-status ERR:', err);
    return res.status(500).json({ success:false, message: err.message || 'Status check failed' });
  }
};
