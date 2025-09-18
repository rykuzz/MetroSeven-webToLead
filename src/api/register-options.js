// Endpoint opsi wizard: campuses, intakes, programs
// - programs sekarang difilter by intakeId (opsional bisa digabung campusId)
// - intakes hanya kirim {Id, Name}

const jsforce = require('jsforce');

module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const { type, term = '', campusId = '', intakeId = '' } = req.query || {};

  const send = (code, obj) => res.status(code).json(obj);
  const ok   = (data) => send(200, data);
  const fail = (code, message, extra = {}) => send(code, { message, ...extra });
  const esc  = (s) => String(s || '').replace(/'/g, "\\'");

  if (!type) return fail(400, 'type wajib diisi');

  function yearFallback(rangeBack = 5, rangeFwd = 1) {
    const y = new Date().getFullYear();
    const arr = [];
    for (let yr = y + rangeFwd; yr >= y - rangeBack; yr--) {
      const name = `${yr}/${yr + 1}`;
      arr.push({ Id: name, Name: name });
    }
    return arr;
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
    // ========= CAMPUSES =========
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

        // Fallback: distinct Account.Master_School__c
        const q = await (await login()).query(`
          SELECT Master_School__c
          FROM Account
          WHERE Master_School__c != null
            AND Master_School__c LIKE '%${esc(term)}%'
          GROUP BY Master_School__c
          ORDER BY Master_School__c
          LIMIT 200
        `);
        const rows = (q.records || []).map(r => ({ Id: r.Master_School__c, Name: r.Master_School__c }));
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return ok({ records: rows, fallback: 'Account.Master_School__c' });
      }
    }

    // ========= INTAKES (Name saja) =========
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
        return ok({ records: yearFallback(), fallback: 'dynamic-years', error: String(e && e.message || e) });
      }
    }

    // ========= PROGRAMS (by intakeId; optional campusId) =========
    if (type === 'programs' || type === 'program') {
      if (!intakeId) return fail(400, 'intakeId wajib diisi');

      const conn = await login();

      // Kita coba beberapa kemungkinan skema, urutkan prioritas:
      // 1) Junction object Program_Intake__c (relasi many-to-many)
      // 2) Study_Program__c dengan lookup Master_Intake__c
      // 3) Study_Program__c dengan lookup Intake__c
      // (opsional filter campusId jika ada field Campus__c)

      // 1) Program_Intake__c (Program__c -> Study_Program__c, Intake__c -> Master_Intake__c)
      try {
        const q1 = await conn.query(`
          SELECT Program__c, Program__r.Name
          FROM Program_Intake__c
          WHERE Intake__c = '${esc(intakeId)}'
            AND Program__r.Name LIKE '%${esc(term)}%'
          LIMIT 500
        `);
        if (q1.totalSize > 0) {
          const rows = q1.records.map(r => ({ Id: r.Program__c, Name: r.Program__r?.Name }));
          return ok({ records: rows, source: 'Program_Intake__c' });
        }
      } catch (_) { /* ignore */ }

      // 2) Study_Program__c dengan Master_Intake__c
      try {
        const campusFilter = campusId ? `AND Campus__c = '${esc(campusId)}'` : '';
        const q2 = await conn.query(`
          SELECT Id, Name
          FROM Study_Program__c
          WHERE Master_Intake__c = '${esc(intakeId)}'
            ${campusFilter}
            AND Name LIKE '%${esc(term)}%'
          ORDER BY Name
          LIMIT 500
        `);
        if (q2.totalSize > 0) {
          const rows = q2.records.map(r => ({ Id: r.Id, Name: r.Name }));
          return ok({ records: rows, source: 'Study_Program__c.Master_Intake__c' });
        }
      } catch (_) { /* ignore */ }

      // 3) Study_Program__c dengan Intake__c
      try {
        const campusFilter = campusId ? `AND Campus__c = '${esc(campusId)}'` : '';
        const q3 = await conn.query(`
          SELECT Id, Name
          FROM Study_Program__c
          WHERE Intake__c = '${esc(intakeId)}'
            ${campusFilter}
            AND Name LIKE '%${esc(term)}%'
          ORDER BY Name
          LIMIT 500
        `);
        if (q3.totalSize > 0) {
          const rows = q3.records.map(r => ({ Id: r.Id, Name: r.Name }));
          return ok({ records: rows, source: 'Study_Program__c.Intake__c' });
        }
      } catch (e) {
        return fail(500, 'Gagal query programs', { error: String(e && e.message || e) });
      }

      // Jika semua gagal/0 record
      return ok({ records: [], source: 'not-found' });
    }

    return fail(400, `type tidak dikenali: ${type}`);
  } catch (e) {
    return fail(500, 'Gagal memproses request', { error: String(e && e.message || e) });
  }
};
