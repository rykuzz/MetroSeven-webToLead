// api/salesforce-query.js
const jsforce = require('jsforce');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Gunakan GET' });

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const { type, term } = req.query;
    if (!type) return res.status(400).json({ message: 'Parameter "type" wajib' });
    if (!term || String(term).trim().length < 2) {
      return res.status(400).json({ message: 'Kata kunci terlalu pendek' });
    }

    const q = String(term).replace(/'/g, "\\'");
    let soql = '';

    switch (type) {
      case 'jurusan':
        soql = `SELECT Id, Name FROM Study_Program__c WHERE Name LIKE '%${q}%' ORDER BY Name LIMIT 10`;
        break;
      case 'sekolah':
        soql = `SELECT Id, Name, NPSN__c FROM MasterSchool__c WHERE Name LIKE '%${q}%' ORDER BY Name LIMIT 10`;
        break;
      case 'campus':
        soql = `SELECT Id, Name FROM Campus__c WHERE Name LIKE '%${q}%' ORDER BY Name LIMIT 10`;
        break;
      case 'intake':
        soql = `SELECT Id, Name FROM Master_Intake__c WHERE Name LIKE '%${q}%' ORDER BY Name LIMIT 10`;
        break;
      default:
        return res.status(400).json({ message: 'type invalid: jurusan|sekolah|campus|intake' });
    }

    const result = await conn.query(soql);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(result);

  } catch (e) {
    console.error('Salesforce API Error:', e);
    return res.status(500).json({ message: 'Gagal query Salesforce', error: e.message });
  }
};
