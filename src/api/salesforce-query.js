const jsforce = require('jsforce');

// Serverless function (Vercel)
// GET /api/salesforce-query?type=...&term=...&campusId=...&intakeId=...
module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;

  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const { type, term = '', campusId = '', intakeId = '' } = req.query || {};
    if (!type) return res.status(400).json({ message: 'type wajib diisi' });

    const sanitize = (s) => String(s || '').replace(/'/g, "\\'");
    const sanitizedTerm = sanitize(term);
    const sanitizedCampusId = sanitize(campusId);
    const sanitizedIntakeId = sanitize(intakeId);

    let soql = '';

    if (type === 'jurusan') {
      soql = `
        SELECT Id, Name
        FROM Study_Program__c
        WHERE Name LIKE '%${sanitizedTerm}%'
        ORDER BY Name
        LIMIT 50
      `;
    } else if (type === 'sekolah') {
      // ✅ Kembalikan Id untuk lookup ke MasterSchool__c
      if (sanitizedTerm.length < 2) {
        return res.status(400).json({ message: 'Kata kunci terlalu pendek' });
      }
      soql = `
        SELECT Id, NPSN__c, Name
        FROM MasterSchool__c
        WHERE Name LIKE '%${sanitizedTerm}%'
        ORDER BY Name
        LIMIT 10
      `;
    } else if (type === 'campus') {
      soql = `
        SELECT Id, Name
        FROM Campus__c
        ORDER BY Name
        LIMIT 200
      `;
    } else if (type === 'intake') {
      // Tahun Ajaran (Master Intake) – difilter per campus jika tersedia
      if (sanitizedCampusId) {
        soql = `
          SELECT Id, Name
          FROM Master_Intake__c
          WHERE Campus__c = '${sanitizedCampusId}'
          ORDER BY Name
          LIMIT 200
        `;
      } else {
        soql = `
          SELECT Id, Name
          FROM Master_Intake__c
          ORDER BY Name
          LIMIT 200
        `;
      }
    } else if (type === 'program') {
      // Study Program – difilter sesuai campus/intake jika field relasi ada
      const where = [];
      if (sanitizedCampusId) where.push(`(Campus__c = '${sanitizedCampusId}')`);
      if (sanitizedIntakeId) where.push(`(Master_Intake__c = '${sanitizedIntakeId}')`);
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      soql = `
        SELECT Id, Name
        FROM Study_Program__c
        ${whereClause}
        ORDER BY Name
        LIMIT 200
      `;
    } else {
      return res.status(400).json({ message: 'Tipe query tidak valid.' });
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
