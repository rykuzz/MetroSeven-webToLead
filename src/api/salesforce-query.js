const jsforce = require('jsforce');

// Fungsi utama serverless
module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;

  // Buat koneksi baru
  const conn = new jsforce.Connection({
    loginUrl: SF_LOGIN_URL, // ← login URL dari env
  });

  try {
    // Login dengan username + password + token
    await conn.login(SF_USERNAME, SF_PASSWORD);

    // Ambil query parameter
    const { type, term } = req.query;

    if (!term || term.length < 2) {
      return res.status(400).json({ message: 'Kata kunci pencarian terlalu pendek' });
    }

    // Escape tanda kutip
    const sanitizedTerm = term.replace(/'/g, "\\'");

    let soqlQuery = '';
    if (type === 'jurusan') {
      // Query Study Program
      soqlQuery = `SELECT Id, Name 
                   FROM Study_Program__c 
                   WHERE Name LIKE '%${sanitizedTerm}%' 
                   ORDER BY Name 
                   LIMIT 10`;
    } else if (type === 'sekolah') {
      // Query Master School
      soqlQuery = `SELECT NPSN__c, Name 
                   FROM MasterSchool__c 
                   WHERE Name LIKE '%${sanitizedTerm}%' 
                   ORDER BY Name 
                   LIMIT 10`;
    } else {
      return res.status(400).json({ message: 'Tipe query tidak valid. Gunakan "jurusan" atau "sekolah".' });
    }

    // Jalankan query
    const result = await conn.query(soqlQuery);

    // Return hasil
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.status(200).json(result);

  } catch (error) {
    console.error('Salesforce API Error:', error);
    res.status(500).json({
      message: 'Gagal mengambil data dari Salesforce',
      error: error.message,
    });
  }
};
