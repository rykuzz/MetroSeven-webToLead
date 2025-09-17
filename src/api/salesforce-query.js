const jsforce = require('jsforce');

// Serverless API untuk query ke Salesforce
module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;

  const conn = new jsforce.Connection({
    loginUrl: SF_LOGIN_URL,
  });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const { type, term } = req.query;
    const t = (term || '').trim();
    const sanitizedTerm = t.replace(/'/g, "\\'");

    let soqlQuery = '';

    if (type === 'jurusan') {
      if (t.length < 2) {
        return res.status(400).json({ message: 'Kata kunci pencarian terlalu pendek' });
      }
      soqlQuery = `
        SELECT Id, Name
        FROM Study_Program__c
        WHERE Name LIKE '%${sanitizedTerm}%'
        ORDER BY Name
        LIMIT 10
      `;
    } else if (type === 'sekolah') {
      if (t.length < 2) {
        return res.status(400).json({ message: 'Kata kunci pencarian terlalu pendek' });
      }
      soqlQuery = `
        SELECT NPSN__c, Name
        FROM MasterSchool__c
        WHERE Name LIKE '%${sanitizedTerm}%'
        ORDER BY Name
        LIMIT 10
      `;
    } else if (type === 'campus') {
      // Ambil daftar campus. Jika ada term (>=2), filter LIKE. Kalau tidak, ambil semua (dibatasi).
      soqlQuery = t.length >= 2
        ? `SELECT Id, Name FROM Campus__c WHERE Name LIKE '%${sanitizedTerm}%' ORDER BY Name LIMIT 200`
        : `SELECT Id, Name FROM Campus__c ORDER BY Name LIMIT 200`;
    } else {
      return res.status(400).json({ message: 'Tipe query tidak valid. Gunakan "jurusan", "sekolah", atau "campus".' });
    }

    const result = await conn.query(soqlQuery);

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
