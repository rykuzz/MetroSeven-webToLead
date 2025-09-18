// src/api/salesforce-query.js
// Serverless function di Vercel untuk mengambil data referensi dari Salesforce.
// Menangani: campus, intake, program (by Campus).

const jsforce = require('jsforce');

module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;

  // Helpers
  const send = (code, data) => res.status(code).json(data);
  const bad  = (code, message) => send(code, { message });
  const ok   = (data) => send(200, data);
  const esc  = (s) => String(s || '').replace(/'/g, "\\'");

  if (!SF_LOGIN_URL || !SF_USERNAME || !SF_PASSWORD) {
    return bad(500, 'Environment variable Salesforce belum lengkap');
  }

  // Login
  let conn;
  try {
    conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
    await conn.login(SF_USERNAME, SF_PASSWORD);
  } catch (e) {
    console.error('SF login error:', e);
    return bad(500, 'Gagal login ke Salesforce');
  }

  try {
    const { type, term = '', campusId = '' } = req.query || {};
    if (!type) return bad(400, 'type wajib diisi');

    // === CAMPUS ===
    if (type === 'campus') {
      const q = await conn.query(`
        SELECT Id, Name
        FROM Campus__c
        WHERE Name LIKE '%${esc(term)}%'
        ORDER BY Name
        LIMIT 200
      `);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return ok({ records: q.records.map(r => ({ Id: r.Id, Name: r.Name })) });
    }

    // === INTAKE / MASTER INTAKE ===
    if (type === 'intake') {
      const q = await conn.query(`
        SELECT Id, Name, Academic_Year__c
        FROM Master_Intake__c
        WHERE Name LIKE '%${esc(term)}%'
        ORDER BY Name DESC
        LIMIT 200
      `);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return ok({
        records: q.records.map(r => ({
          Id: r.Id,
          Name: r.Name,
          Academic_Year__c: r.Academic_Year__c
        }))
      });
    }

    // === STUDY PROGRAM by CAMPUS ===
    if (type === 'program') {
      if (!campusId) return bad(400, 'campusId wajib diisi');
      const q = await conn.query(`
        SELECT Id, Name, Campus__c
        FROM Study_Program__c
        WHERE Campus__c = '${esc(campusId)}'
          AND Name LIKE '%${esc(term)}%'
        ORDER BY Name
        LIMIT 200
      `);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return ok({
        records: q.records.map(r => ({
          Id: r.Id,
          Name: r.Name,
          Campus__c: r.Campus__c
        }))
      });
    }

    // === Fallback ===
    return bad(400, `type tidak dikenali: ${type}`);
  } catch (e) {
    console.error('salesforce-query error:', e);
    return bad(500, 'Gagal memproses query');
  }
};
