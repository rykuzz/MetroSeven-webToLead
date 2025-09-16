const jsforce = require('jsforce');

// GET /api/salesforce-query?type=jurusan|sekolah|campus|intake&term=...
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed. Gunakan GET.' });
  }

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const { type, term } = req.query;

    if (!type) {
      return res.status(400).json({ message: 'Parameter "type" wajib diisi.' });
    }
    if (!term || String(term).trim().length < 2) {
      return res.status(400).json({ message: 'Kata kunci pencarian terlalu pendek (min 2 huruf).' });
    }

    const q = String(term).replace(/'/g, "\\'");
    let soql = '';

    switch (type) {
      case 'jurusan':
        soql = `
          SELECT Id, Name
          FROM Study_Program__c
          WHERE Name LIKE '%${q}%'
          ORDER BY Name
          LIMIT 10
        `;
        break;

      case 'sekolah':
        soql = `
          SELECT Id, Name, NPSN__c
          FROM MasterSchool__c
          WHERE Name LIKE '%${q}%'
          ORDER BY Name
          LIMIT 10
        `;
        break;

      case 'campus':
        soql = `
          SELECT Id, Name
          FROM Campus__c
          WHERE Name LIKE '%${q}%'
          ORDER BY Name
          LIMIT 10
        `;
        break;

      case 'intake': // Tahun ajaran / Master Intake
        soql = `
          SELECT Id, Name
          FROM Master_Intake__c
          WHERE Name LIKE '%${q}%'
          ORDER BY Name
          LIMIT 10
        `;
        break;

      default:
        return res.status(400).json({
          message: 'Tipe query tidak valid. Gunakan "jurusan", "sekolah", "campus", atau "intake".'
        });
    }

    const result = await conn.query(soql);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(result);

  } catch (error) {
    console.error('Salesforce API Error:', error);
    return res.status(500).json({
      message: 'Gagal mengambil data dari Salesforce',
      error: error.message,
    });
  }
};
