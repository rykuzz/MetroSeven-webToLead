const jsforce = require('jsforce');

// Serverless API untuk query ke Salesforce (autocomplete & master data)
module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const { type, term = '', campusId = '', intakeId = '' } = req.query;
    const t = term.trim();
    const sanitizedTerm = t.replace(/'/g, "\\'");
    const camp = String(campusId).trim();
    const intake = String(intakeId).trim();

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
        LIMIT 50
      `;
      const result = await conn.query(soqlQuery);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).json(result);

    } else if (type === 'sekolah') {
      if (t.length < 2) {
        return res.status(400).json({ message: 'Kata kunci pencarian terlalu pendek' });
      }
      soqlQuery = `
        SELECT NPSN__c, Name
        FROM MasterSchool__c
        WHERE Name LIKE '%${sanitizedTerm}%'
        ORDER BY Name
        LIMIT 50
      `;
      const result = await conn.query(soqlQuery);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).json(result);

    } else if (type === 'campus') {
      // daftar campus
      soqlQuery = t.length >= 2
        ? `SELECT Id, Name FROM Campus__c WHERE Name LIKE '%${sanitizedTerm}%' ORDER BY Name LIMIT 200`
        : `SELECT Id, Name FROM Campus__c ORDER BY Name LIMIT 200`;
      const result = await conn.query(soqlQuery);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).json(result);

    } else if (type === 'intake') {
      // Tahun ajaran filter by campus (fallback: semua)
      let result;
      try {
        if (camp) {
          soqlQuery = `
            SELECT Id, Name
            FROM Master_Intake__c
            WHERE Campus__c = '${camp}'
            ORDER BY Name
            LIMIT 200
          `;
          result = await conn.query(soqlQuery);
        }
        if (!result || !result.records || result.records.length === 0) {
          soqlQuery = `SELECT Id, Name FROM Master_Intake__c ORDER BY Name LIMIT 200`;
          result = await conn.query(soqlQuery);
        }
      } catch (e) {
        soqlQuery = `SELECT Id, Name FROM Master_Intake__c ORDER BY Name LIMIT 200`;
        result = await conn.query(soqlQuery);
      }
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).json(result);

    } else if (type === 'program') {
      // Study Program filter by intake (jika ada junction) atau by campus, lalu fallback: semua
      let result;

      if (intake) {
        try {
          // Ganti nama junction jika berbeda di org kamu
          soqlQuery = `
            SELECT Id, Name
            FROM Study_Program__c
            WHERE Id IN (
              SELECT Study_Program__c
              FROM Study_Program_Intake__c
              WHERE Master_Intake__c = '${intake}'
            )
            ORDER BY Name
            LIMIT 200
          `;
          result = await conn.query(soqlQuery);
        } catch (e) {}
      }

      if ((!result || result.records.length === 0) && camp) {
        try {
          soqlQuery = `
            SELECT Id, Name
            FROM Study_Program__c
            WHERE Campus__c = '${camp}'
            ORDER BY Name
            LIMIT 200
          `;
          result = await conn.query(soqlQuery);
        } catch (e) {}
      }

      if (!result || !result.records || result.records.length === 0) {
        soqlQuery = `SELECT Id, Name FROM Study_Program__c ORDER BY Name LIMIT 200`;
        result = await conn.query(soqlQuery);
      }

      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).json(result);

    } else {
      return res.status(400).json({
        message: 'Tipe query tidak valid. Gunakan "jurusan", "sekolah", "campus", "intake", atau "program".'
      });
    }
  } catch (error) {
    console.error('Salesforce API Error:', error);
    return res.status(500).json({
      message: 'Gagal mengambil data dari Salesforce',
      error: error.message,
    });
  }
};
