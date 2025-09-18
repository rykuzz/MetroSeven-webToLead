// src/api/register-finalize.js
const jsforce = require('jsforce');
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Method not allowed' });

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    const { opportunityId, accountId } = req.body || {};
    if (!opportunityId || !accountId) throw new Error('Param kurang');

    await conn.login(SF_USERNAME, SF_PASSWORD);

    // Update Stage -> Registration
    await conn.sobject('Opportunity').update({ Id: opportunityId, StageName: 'Registration' });

    // Fetch data for credentials
    const acc = await conn.sobject('Account').retrieve(accountId);
    const opp = await conn.sobject('Opportunity').retrieve(opportunityId);

    const first = (acc.FirstName || '').toLowerCase();
    const last  = (acc.LastName  || '').toLowerCase();
    const username = `${first}${last}`.replace(/\s+/g,'');

    const year = (opp.CreatedDate || '').slice(0,4) || (new Date().getFullYear().toString());
    const passwordPlain = `m7u${first}${year}`;
    const passwordHash = crypto.createHash('sha256').update(passwordPlain).digest('hex');

    await conn.sobject('Account').update({ Id: accountId, Password__c: passwordHash });

    return res.status(200).json({ success:true, username, passwordPlain });
  } catch (err) {
    console.error('register-finalize ERR:', err);
    return res.status(500).json({ success:false, message: err.message || 'Finalize failed' });
  }
};
