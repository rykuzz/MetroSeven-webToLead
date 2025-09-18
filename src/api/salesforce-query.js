const jsforce = require('jsforce');

module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;

  const bad = (code, message, extra={}) => res.status(code).json({ message, ...extra });
  const ok  = (data) => res.status(200).json(data);
  const esc = (s) => String(s || '').replace(/'/g, "\\'");

  if (!SF_LOGIN_URL || !SF_USERNAME || !SF_PASSWORD) {
    return bad(500, 'ENV Salesforce belum lengkap', { hint: 'Set SF_LOGIN_URL,SF_USERNAME,SF_PASSWORD' });
  }

  let conn;
  try {
    conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
    await conn.login(SF_USERNAME, SF_PASSWORD);
  } catch (e) {
    console.error('SF login error:', e);
    return bad(500, 'Gagal login ke Salesforce', { error: String(e && e.message || e) });
  }

  try {
    const { type, term = '', campusId = '' } = req.query || {};
    if (!type) return bad(400, 'type wajib diisi');

    // ===== CAMPUS =====
    if (type === 'campus') {
      try {
        // Coba dari object Campus__c (kalau ada)
        const q = await conn.query(`
          SELECT Id, Name
          FROM Campus__c
          WHERE Name LIKE '%${esc(term)}%'
          ORDER BY Name
          LIMIT 200
        `);
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return ok({ records: q.records.map(r => ({ Id: r.Id, Name: r.Name })) });
      } catch (e) {
        // Jika object tidak ada / INVALID_TYPE → fallback dari Account.Master_School__c (distinct)
        const msg = String(e && e.message || e);
        const needFallback = /INVALID_TYPE|sObject type .* is not supported|No such column/i.test(msg);
        if (!needFallback) {
          console.error('Campus query error:', e);
          return bad(500, 'Gagal query Campus', { error: msg });
        }

        // Fallback: ambil distinct Master_School__c dari Account sebagai pseudo-campus
        try {
          const q = await conn.query(`
            SELECT Master_School__c
            FROM Account
            WHERE Master_School__c != null
              AND Master_School__c LIKE '%${esc(term)}%'
            GROUP BY Master_School__c
            ORDER BY Master_School__c
            LIMIT 200
          `);
          const rows = (q.records || []).map((r, i) => ({
            Id: r.Master_School__c,   // gunakan namanya sebagai value
            Name: r.Master_School__c
          }));
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
          return ok({ records: rows, fallback: 'Account.Master_School__c' });
        } catch (e2) {
          console.error('Campus fallback error:', e2);
          return bad(500, 'Gagal query fallback Campus', { error: String(e2 && e2.message || e2) });
        }
      }
    }

    // ===== INTAKE =====
    if (type === 'intake') {
      const q = await conn.query(`
        SELECT Id, Name, Academic_Year__c
        FROM Master_Intake__c
        WHERE Name LIKE '%${esc(term)}%'
        ORDER BY Name DESC
        LIMIT 200
      `);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return ok({ records: q.records.map(r => ({
        Id: r.Id, Name: r.Name, Academic_Year__c: r.Academic_Year__c
      })) });
    }

    // ===== STUDY PROGRAM by CAMPUS =====
    if (type === 'program') {
      if (!campusId) return bad(400, 'campusId wajib diisi');

      // Coba query by Campus__c terlebih dulu
      try {
        const q = await conn.query(`
          SELECT Id, Name, Campus__c
          FROM Study_Program__c
          WHERE Campus__c = '${esc(campusId)}'
            AND Name LIKE '%${esc(term)}%'
          ORDER BY Name
          LIMIT 200
        `);
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return ok({ records: q.records.map(r => ({
          Id: r.Id, Name: r.Name, Campus__c: r.Campus__c
        })) });
      } catch (e) {
        const msg = String(e && e.message || e);
        // Jika skema beda, kembalikan error yang jelas ke UI
        console.error('Program query error:', e);
        return bad(500, 'Gagal query Study Program', { error: msg });
      }
    }

    return bad(400, `type tidak dikenali: ${type}`);
  } catch (e) {
    console.error('salesforce-query fatal:', e);
    return bad(500, 'Gagal memproses query', { error: String(e && e.message || e) });
  }
};
