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

    const acc = await conn.sobject('Account').retrieve(accountId);
    const opp = await conn.sobject('Opportunity').retrieve(opportunityId);

    let studyProgramName = '';
    if (opp.Study_Program__c) {
      const sp = await conn.sobject('Study_Program__c').retrieve(opp.Study_Program__c);
      studyProgramName = sp?.Name || '';
    }

    const first = (acc.FirstName || '').trim();
    const last  = (acc.LastName  || '').trim();
    const base  = `${first} ${last}`.trim();
    const newOppName = studyProgramName ? `${base}/REG/${studyProgramName}` : `${base}/REG`;

    await conn.sobject('Opportunity').update({ Id: opportunityId, StageName: 'Registration', Name: newOppName });

    const year = (opp.CreatedDate || '').slice(0,4) || (new Date().getFullYear().toString());
    const username = `${first}${last}`.replace(/\s+/g,'').toLowerCase();
    const passwordPlain = `m7u${first.toLowerCase()}${year}`;
    const passwordHash = crypto.createHash('sha256').update(passwordPlain).digest('hex');

    await conn.sobject('Account').update({ Id: accountId, Password__c: passwordHash });

    return res.status(200).json({ success:true, username, passwordPlain });
  } catch (err) {
    console.error('register-finalize ERR:', err);
    return res.status(500).json({ success:false, message: err.message || 'Finalize failed' });
  }
};
