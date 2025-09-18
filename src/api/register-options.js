// src/api/register-options.js
// Endpoint opsi untuk wizard: campuses, intakes, programs (by campus)
// Mengembalikan shape konsisten: { records: [...] }

const jsforce = require('jsforce');

module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;

  const bad = (code, message, extra = {}) => res.status(code).json({ message, ...extra });
  const ok  = (data) => res.status(200).json(data);
  const esc = (s) => String(s || '').replace(/'/g, "\\'");

  // NOTE: route ini dipanggil seperti: /api/register-options?type=campuses|intakes|programs&campusId=...
  const { type, term = '', campusId = '' } = req.query || {};
  if (!type) return bad(400, "type wajib diisi");

  if (!SF_LOGIN_URL || !SF_USERNAME || !SF_PASSWORD) {
    return bad(500, "ENV Salesforce belum lengkap", { hint: "SF_LOGIN_URL,SF_USERNAME,SF_PASSWORD" });
  }

  // Login SF
  let conn;
  try {
    conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
    await conn.login(SF_USERNAME, SF_PASSWORD);
  } catch (e) {
    console.error("SF login error:", e);
    return bad(500, "Gagal login ke Salesforce", { error: String(e && e.message || e) });
  }

  try {
    // ===================== CAMPUSES =====================
    if (type === 'campuses' || type === 'campus') {
      try {
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
        // Fallback bila org tidak punya Campus__c → pakai distinct Account.Master_School__c
        const msg = String(e && e.message || e);
        const needFallback = /INVALID_TYPE|sObject type .* is not supported|No such column/i.test(msg);
        if (!needFallback) {
          console.error('campuses query error:', e);
          return bad(500, 'Gagal query campuses', { error: msg });
        }
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
          const rows = (q.records || []).map(r => ({
            Id: r.Master_School__c,
            Name: r.Master_School__c
          }));
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
          return ok({ records: rows, fallback: 'Account.Master_School__c' });
        } catch (e2) {
          console.error('campuses fallback error:', e2);
          return bad(500, 'Gagal query fallback campuses', { error: String(e2 && e2.message || e2) });
        }
      }
    }

    // ===================== INTAKES =====================
    if (type === 'intakes' || type === 'intake') {
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
          Id: r.Id, Name: r.Name, Academic_Year__c: r.Academic_Year__c
        }))
      });
    }

    // ===================== PROGRAMS (by campus) =====================
    if (type === 'programs' || type === 'program') {
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
          Id: r.Id, Name: r.Name, Campus__c: r.Campus__c
        }))
      });
    }

    return bad(400, `type tidak dikenali: ${type}`);
  } catch (e) {
    console.error("register-options fatal:", e);
    return bad(500, "Gagal memproses request", { error: String(e && e.message || e) });
  }
};
