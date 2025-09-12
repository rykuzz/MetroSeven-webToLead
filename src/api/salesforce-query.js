const jsforce = require('jsforce');

// Fungsi utama yang akan dijalankan oleh Vercel
module.exports = async (req, res) => {
  // Ambil kredensial aman dari Vercel Environment Variables
  const { 
    SF_LOGIN_URL, 
    SF_USERNAME, 
    SF_PASSWORD, 
    SF_CLIENT_ID, 
    SF_CLIENT_SECRET 
  } = process.env;

  // Buat koneksi baru setiap kali fungsi dipanggil
  const conn = new jsforce.Connection({
    oauth2: {
      loginUrl: SF_LOGIN_URL,
      clientId: SF_CLIENT_ID,
      clientSecret: SF_CLIENT_SECRET,
    },
  });

  try {
    // Login ke Salesforce
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const { type, term } = req.query;

    if (!term || term.length < 2) {
      return res.status(400).json({ message: 'Kata kunci pencarian terlalu pendek' });
    }

    let soqlQuery = '';
    const sanitizedTerm = term.replace(/'/g, "\\'");

    if (type === 'jurusan') {
      soqlQuery = `SELECT Id, Name FROM Study_Program__c WHERE Name LIKE '%${sanitizedTerm}%' ORDER BY Name LIMIT 10`;
    } else if (type === 'sekolah') {
      soqlQuery = `SELECT NPSN__c, Name FROM MasterSchool__c WHERE Name LIKE '%${sanitizedTerm}%' ORDER BY Name LIMIT 10`;
    } else {
      return res.status(400).json({ message: 'Tipe query tidak valid' });
    }

    const result = await conn.query(soqlQuery);
    
    // Set header untuk caching dan kirim hasil
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.status(200).json(result);

  } catch (error) {
    console.error('Salesforce API Error:', error);
    res.status(500).json({ message: 'Gagal mengambil data dari Salesforce', error: error.message });
  }
};