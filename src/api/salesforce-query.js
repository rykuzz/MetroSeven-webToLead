const jsforce = require('jsforce');

// GET /api/salesforce-query?type=...&term=...&campusId=...&intakeId=...
module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const { type, term = '', campusId = '', intakeId = '' } = req.query || {};
    if (!type) return res.status(400).json({ message: 'type wajib diisi' });

    const esc = (s) => String(s || '').replace(/'/g, "\\'");
    const t  = esc(term);
    const c  = esc(campusId);
    const i  = esc(intakeId);

    let soql = '';

    if (type === 'jurusan') {
      soql = `
        SELECT Id, Name
        FROM Study_Program__c
        WHERE Name LIKE '%${t}%'
        ORDER BY Name
        LIMIT 50
      `;
      const q = await conn.query(soql);
      return res.status(200).json(q);
    }

    if (type === 'sekolah') {
      if (t.length < 2) return res.status(400).json({ message: 'Kata kunci terlalu pendek' });
      soql = `
        SELECT Id, NPSN__c, Name
        FROM MasterSchool__c
        WHERE Name LIKE '%${t}%'
        ORDER BY Name
        LIMIT 10
      `;
      const q = await conn.query(soql);
      return res.status(200).json(q);
    }

    if (type === 'campus') {
      soql = `SELECT Id, Name FROM Campus__c ORDER BY Name LIMIT 200`;
      const q = await conn.query(soql);
      return res.status(200).json(q);
    }

    if (type === 'intake') {
      if (c) {
        soql = `
          SELECT Id, Name
          FROM Master_Intake__c
          WHERE Campus__c = '${c}'
          ORDER BY Name
          LIMIT 200
        `;
      } else {
        soql = `SELECT Id, Name FROM Master_Intake__c ORDER BY Name LIMIT 200`;
      }
      const q = await conn.query(soql);
      return res.status(200).json(q);
    }

    if (type === 'program') {
      // ✅ Utamakan baca dari junction (Study_Program_Intake__c)
      if (c && i) {
        const junctionSOQL = `
          SELECT Id, Study_Program__c, Study_Program__r.Name
          FROM Study_Program_Intake__c
          WHERE Campus__c = '${c}' AND Master_Intake__c = '${i}'
          ORDER BY Study_Program__r.Name
          LIMIT 500
        `;
        const q = await conn.query(junctionSOQL);
        // Map & de-duplicate ke format {Id, Name}
        const seen = new Set();
        const records = [];
        (q.records || []).forEach(r => {
          const id = r.Study_Program__c;
          const name = r.Study_Program__r && r.Study_Program__r.Name;
          if (id && !seen.has(id)) { seen.add(id); records.push({ Id: id, Name: name }); }
        });
        return res.status(200).json({ totalSize: records.length, done: true, records });
      }

      // Fallback bila tidak ada junction (atau user belum pilih intake)
      if (c) {
        // Jika Study_Program__c punya field Campus__c di org kamu
        soql = `
          SELECT Id, Name
          FROM Study_Program__c
          WHERE Campus__c = '${c}'
          ORDER BY Name
          LIMIT 200
        `;
      } else {
        soql = `SELECT Id, Name FROM Study_Program__c ORDER BY Name LIMIT 200`;
      }
      const q = await conn.query(soql);
      return res.status(200).json(q);
    }

    return res.status(400).json({ message: 'Tipe query tidak valid.' });
  } catch (error) {
    console.error('Salesforce API Error:', error);
    return res.status(500).json({ message: 'Gagal mengambil data dari Salesforce', error: error.message });
  }
};
