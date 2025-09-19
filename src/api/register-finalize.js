// Finalisasi: Stage → Registration, generate username & password, simpan SHA-256 ke Account.Password__c
const jsforce = require('jsforce');
const crypto = require('crypto');

function sha256(s){ return crypto.createHash('sha256').update(String(s),'utf8').digest('hex'); }

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

    const first = (acc.FirstName || '').trim().toLowerCase().replace(/\s+/g,'');
    const last  = (acc.LastName || '').trim().toLowerCase().replace(/\s+/g,'');
    const username = (first + last).replace(/[^\w]/g,'');
    const year = new Date(opp.CreatedDate || new Date()).getFullYear();
    const passwordPlain = `m7u${(acc.FirstName||'').toLowerCase().replace(/\s+/g,'')}${year}`;
    const passwordHash = sha256(passwordPlain);

    await conn.sobject('Account').update({ Id: accountId, Password__c: passwordHash });
    await conn.sobject('Opportunity').update({ Id: opportunityId, StageName: 'Registration' });

    res.status(200).json({ success:true, username, passwordPlain });
  } catch (err) {
    console.error('register-finalize ERR:', err);
    res.status(500).json({ success:false, message: err.message || 'Gagal finalisasi' });
  }
};
