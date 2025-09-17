const jsforce = require('jsforce');

// GET /api/salesforce-query?type=...&term=...&campusId=...
module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;

  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const { type, term = '', campusId = '' } = req.query || {};
    if (!type) return res.status(400).json({ message: 'type wajib diisi' });

    const esc = (s) => String(s || '').replace(/'/g, "\\'");
    const t  = esc(term);
    const c  = esc(campusId);

    // ===== Study Program (free-text) – tidak dipakai di form utama =====
    if (type === 'jurusan') {
      const q = await conn.query(`
        SELECT Id, Name
        FROM Study_Program__c
        WHERE Name LIKE '%${t}%'
        ORDER BY Name
        LIMIT 50
      `);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).json(q);
    }

    // ===== Sekolah (autocomplete) – WAJIB kembalikan Id utk lookup =====
    if (type === 'sekolah') {
      if (t.length < 2) return res.status(400).json({ message: 'Kata kunci terlalu pendek' });
      const q = await conn.query(`
        SELECT Id, NPSN__c, Name
        FROM MasterSchool__c
        WHERE Name LIKE '%${t}%'
        ORDER BY Name
        LIMIT 10
      `);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).json(q);
    }

    // ===== Campus list =====
    if (type === 'campus') {
      const q = await conn.query(`SELECT Id, Name FROM Campus__c ORDER BY Name LIMIT 200`);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).json(q);
    }

    // ===== Master Intake (optional / tidak mengikat Study Program) =====
    if (type === 'intake') {
      const soql = `
        SELECT Id, Name
        FROM Master_Intake__c
        ${c ? `WHERE Campus__c = '${c}'` : ''}
        ORDER BY Name
        LIMIT 200
      `;
      const q = await conn.query(soql);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).json(q);
    }

    // ===== Study Program – HANYA by Campus =====
    if (type === 'program') {
      if (!c) return res.status(400).json({ message: 'campusId wajib diisi untuk program' });

      // 1) Coba skema langsung: Study_Program__c punya field Campus__c
      let merged = [];
      try {
        const q1 = await conn.query(`
          SELECT Id, Name
          FROM Study_Program__c
          WHERE Campus__c = '${c}'
          ORDER BY Name
          LIMIT 200
        `);
        merged = (q1.records || []).map(r => ({ Id: r.Id, Name: r.Name }));
      } catch (e) { /* lanjut ke junction */ }

      // 2) Fallback: pakai junction (mis. Study_Program_Intake__c) – filter hanya Campus
      try {
        const q2 = await conn.query(`
          SELECT Id, Study_Program__c, Study_Program__r.Name
          FROM Study_Program_Intake__c
          WHERE Campus__c = '${c}'
          ORDER BY Study_Program__r.Name
          LIMIT 500
        `);
        const seen = new Set(merged.map(m => m.Id));
        (q2.records || []).forEach(r => {
          const id = r.Study_Program__c;
          const name = r.Study_Program__r && r.Study_Program__r.Name;
          if (id && name && !seen.has(id)) { seen.add(id); merged.push({ Id: id, Name: name }); }
        });
      } catch (e) { /* jika junction tidak ada, biarkan hasil q1 saja */ }

      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).json({ totalSize: merged.length, done: true, records: merged });
    }

    return res.status(400).json({ message: 'Tipe query tidak valid.' });

  } catch (error) {
    console.error('Salesforce API Error:', error);
    return res.status(500).json({
      message: 'Gagal mengambil data dari Salesforce',
      error: error.message,
    });
  }
};
