// Endpoint opsi wizard: campuses, intakes, programs (by campus)
// Mengembalikan { records: [...] } — untuk intakes hanya { Id, Name }.

const jsforce = require('jsforce');

module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const { type, term = '', campusId = '' } = req.query || {};

  const send = (code, obj) => res.status(code).json(obj);
  const ok   = (data) => send(200, data);
  const fail = (code, message, extra = {}) => send(code, { message, ...extra });
  const esc  = (s) => String(s || '').replace(/'/g, "\\'");

  if (!type) return fail(400, 'type wajib diisi');

  // Fallback intakes (generate tahun ajaran → Name saja)
  function buildYearIntakes(rangeBack = 5, rangeFwd = 1) {
    const now = new Date();
    const y = now.getFullYear();
    const out = [];
    for (let yr = y + rangeFwd; yr >= y - rangeBack; yr--) {
      const name = `${yr}/${yr + 1}`;
      out.push({ Id: name, Name: name });
    }
    return out;
  }

  async function login() {
    if (!SF_LOGIN_URL || !SF_USERNAME || !SF_PASSWORD) {
      throw new Error('ENV Salesforce belum lengkap (SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD)');
    }
    const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
    await conn.login(SF_USERNAME, SF_PASSWORD);
    return conn;
  }

  try {
    // ============ CAMPUSES ============
    if (type === 'campuses' || type === 'campus') {
      const conn = await login();
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
        const msg = String(e && e.message || e);
        const fallbackable = /INVALID_TYPE|sObject type .* is not supported|No such column/i.test(msg);
        if (!fallbackable) return fail(500, 'Gagal query campuses', { error: msg });

        try {
          const conn2 = await login();
          const q = await conn2.query(`
            SELECT Master_School__c
            FROM Account
            WHERE Master_School__c != null
              AND Master_School__c LIKE '%${esc(term)}%'
            GROUP BY Master_School__c
            ORDER BY Master_School__c
            LIMIT 200
          `);
          const rows = (q.records || []).map(r => ({
            Id: r.Master_School__c, Name: r.Master_School__c
          }));
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
          return ok({ records: rows, fallback: 'Account.Master_School__c' });
        } catch (e2) {
          return fail(500, 'Gagal query fallback campuses', { error: String(e2 && e2.message || e2) });
        }
      }
    }

    // ============ INTAKES (Name saja) ============
    if (type === 'intakes' || type === 'intake') {
      try {
        const conn = await login();
        const q = await conn.query(`
          SELECT Id, Name
          FROM Master_Intake__c
          WHERE Name LIKE '%${esc(term)}%'
          ORDER BY Name DESC
          LIMIT 200
        `);
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return ok({ records: q.records.map(r => ({ Id: r.Id, Name: r.Name })) });
      } catch (e) {
        // fallback dinamis → hanya Name
        const msg = String(e && e.message || e);
        const fallback = buildYearIntakes(5, 1);
        return ok({ records: fallback, fallback: 'dynamic-years', error: msg });
      }
    }

    // ============ PROGRAMS (by campus) ============
    if (type === 'programs' || type === 'program') {
      if (!campusId) return fail(400, 'campusId wajib diisi');
      const conn = await login();
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
        return fail(500, 'Gagal query programs', { error: String(e && e.message || e) });
      }
    }

    return fail(400, `type tidak dikenali: ${type}`);
  } catch (e) {
    return fail(500, 'Gagal memproses request', { error: String(e && e.message || e) });
  }
};
