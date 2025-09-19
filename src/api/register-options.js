// src/api/register-options.js
// Wizard options: campuses, intakes, programs, schools/sekolah

const jsforce = require('jsforce');
const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const { method, query, body } = req;

  const send = (code, obj) => res.status(code).json(obj);
  const ok   = (data) => send(200, data);
  const fail = (code, msg, extra = {}) => send(code, { success: false, message: msg, ...extra });

  async function login() {
    if (!SF_LOGIN_URL || !SF_USERNAME || !SF_PASSWORD) {
      throw new Error('ENV Salesforce belum lengkap (SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD)');
    }
    const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
    await conn.login(SF_USERNAME, SF_PASSWORD);
    return conn;
  }

  try {
    // =================== GET ===================
    if (method === 'GET') {
      const { type } = query || {};
      // dukung term (lama) dan t (versi kamu)
      const searchTerm = (query.term ?? query.t ?? '').trim();
      const campusId   = (query.campusId ?? '').trim();
      const intakeId   = (query.intakeId ?? '').trim();
      if (!type) return fail(400, 'type wajib diisi');

      // ---------- CAMPUSES ----------
      if (type === 'campuses' || type === 'campus') {
        const conn = await login();
        try {
          const r = await conn.query(`
            SELECT Id, Name
            FROM Campus__c
            ${searchTerm ? `WHERE Name LIKE '%${esc(searchTerm)}%'` : ''}
            ORDER BY Name
            LIMIT 200
          `);
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
          return ok({ success: true, records: r.records });
        } catch (e) {
          // fallback: distinct pada Account.Master_School__c jika Campus__c tidak ada
          const msg = String(e && e.message || e);
          const fallbackable = /INVALID_TYPE|No such column|is not supported/i.test(msg);
          if (!fallbackable) return ok({ success: true, records: [], errors: [msg], source: 'campuses:err' });

          const conn2 = await login();
          const r2 = await conn2.query(`
            SELECT Master_School__c, Master_School__r.Name
            FROM Account
            WHERE Master_School__c != null
              ${searchTerm ? `AND (Master_School__r.Name LIKE '%${esc(searchTerm)}%' OR Name LIKE '%${esc(searchTerm)}%')` : ''}
            ORDER BY Master_School__r.Name
            LIMIT 500
          `);
          const map = new Map();
          (r2.records || []).forEach(x => {
            const id = x.Master_School__c;
            const nm = x.Master_School__r && x.Master_School__r.Name;
            if (id && nm && !map.has(id)) map.set(id, { Id: id, Name: nm });
          });
          return ok({ success: true, records: Array.from(map.values()), fallback: 'Account.Master_School__c' });
        }
      }

      // ---------- INTAKES ----------
      if (type === 'intakes' || type === 'intake') {
        const conn = await login();
        try {
          const r = await conn.query(`
            SELECT Id, Name
            FROM Master_Intake__c
            ${campusId ? `WHERE Campus__c = '${esc(campusId)}'` : ''}
            ORDER BY Name DESC
            LIMIT 200
          `);
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
          return ok({ success: true, records: r.records.map(x => ({ Id: x.Id, Name: x.Name })) });
        } catch (e) {
          // fallback dinamis agar UI tetap jalan
          const y = new Date().getFullYear();
          const fallback = [];
          for (let yr = y + 1; yr >= y - 5; yr--) fallback.push({ Id: `${yr}/${yr+1}`, Name: `${yr}/${yr+1}` });
          return ok({ success: true, records: fallback, fallback: 'dynamic-years', errors: [String(e && e.message || e)] });
        }
      }

      // ---------- PROGRAMS ----------
      if (type === 'programs' || type === 'program') {
        if (!intakeId) return fail(400, 'intakeId wajib diisi');
        const conn = await login();
        const errors = [];
        let rows = null;

        // Try 1: junction Study_Program_Intake__c
        try {
          const campusFilter = campusId ? `AND (Study_Program__r.Campus__c = '${esc(campusId)}')` : '';
          const q1 = await conn.query(`
            SELECT Study_Program__c, Study_Program__r.Name
            FROM Study_Program_Intake__c
            WHERE Master_Intake__c = '${esc(intakeId)}'
              ${campusFilter}
            ORDER BY Study_Program__r.Name
            LIMIT 500
          `);
          if (q1.totalSize > 0) rows = q1.records.map(r => ({ Id: r.Study_Program__c, Name: r.Study_Program__r?.Name }));
        } catch (e) { errors.push('SPI__c: ' + (e.message || String(e))); }

        // Try 2: langsung di Study_Program__c (lookup Master_Intake__c)
        if (!rows || rows.length === 0) {
          try {
            const campusFilter = campusId ? `AND Campus__c = '${esc(campusId)}'` : '';
            const q2 = await conn.query(`
              SELECT Id, Name
              FROM Study_Program__c
              WHERE Master_Intake__c = '${esc(intakeId)}'
                ${campusFilter}
              ORDER BY Name
              LIMIT 500
            `);
            if (q2.totalSize > 0) rows = q2.records.map(r => ({ Id: r.Id, Name: r.Name }));
          } catch (e) { errors.push('SP.Master_Intake__c: ' + (e.message || String(e))); }
        }

        // Try 3: fallback by campus saja
        if ((!rows || rows.length === 0) && campusId) {
          try {
            const q4 = await conn.query(`
              SELECT Id, Name
              FROM Study_Program__c
              WHERE Campus__c = '${esc(campusId)}'
              ORDER BY Name
              LIMIT 500
            `);
            if (q4.totalSize > 0) rows = q4.records.map(r => ({ Id: r.Id, Name: r.Name }));
          } catch (e) { errors.push('SP.byCampus: ' + (e.message || String(e))); }
        }

        return ok({ success: true, records: rows || [], errors: errors.length ? errors : undefined });
      }

      // ---------- SEKOLAH (versi kamu): type=sekolah, param t ----------
      if (type === 'sekolah') {
        const conn = await login();
        if (searchTerm.length < 2) {
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
          return ok({ success: true, totalSize: 0, records: [] });
        }

        const errors = [];
        let rows = null;

        // Try 1: MasterSchool__c + NPSN__c
        try {
          const r = await conn.query(`
            SELECT Id, Name, NPSN__c
            FROM MasterSchool__c
            WHERE Name LIKE '%${esc(searchTerm)}%' OR NPSN__c LIKE '%${esc(searchTerm)}%'
            ORDER BY Name
            LIMIT 10
          `);
          if (r.totalSize > 0) rows = r.records.map(x => ({ Id:x.Id, Name:x.Name, NPSN:x.NPSN__c || null }));
        } catch (e) { errors.push('MasterSchool__c.NPSN__c: ' + (e.message || String(e))); }

        // Try 1b: MasterSchool__c + npsn__c (kalau penamaan field huruf kecil)
        if (!rows || rows.length === 0) {
          try {
            const r = await conn.query(`
              SELECT Id, Name, npsn__c
              FROM MasterSchool__c
              WHERE Name LIKE '%${esc(searchTerm)}%' OR npsn__c LIKE '%${esc(searchTerm)}%'
              ORDER BY Name
              LIMIT 10
            `);
            if (r.totalSize > 0) rows = r.records.map(x => ({ Id:x.Id, Name:x.Name, NPSN:x.npsn__c || null }));
          } catch (e) { errors.push('MasterSchool__c.npsn__c: ' + (e.message || String(e))); }
        }

        // Try 2: Master_School__c (varian lain)
        if (!rows || rows.length === 0) {
          try {
            const r = await conn.query(`
              SELECT Id, Name, NPSN__c
              FROM Master_School__c
              WHERE Name LIKE '%${esc(searchTerm)}%' OR NPSN__c LIKE '%${esc(searchTerm)}%'
              ORDER BY Name
              LIMIT 10
            `);
            if (r.totalSize > 0) rows = r.records.map(x => ({ Id:x.Id, Name:x.Name, NPSN:x.NPSN__c || null }));
          } catch (e) { errors.push('Master_School__c.NPSN__c: ' + (e.message || String(e))); }
        }

        // Try 3: Fallback distinct dari Account.Master_School__c
        if (!rows || rows.length === 0) {
          try {
            const r = await conn.query(`
              SELECT Master_School__c, Master_School__r.Name, Master_School__r.NPSN__c
              FROM Account
              WHERE Master_School__c != null
                AND Master_School__r.Name LIKE '%${esc(searchTerm)}%'
              ORDER BY Master_School__r.Name
              LIMIT 200
            `);
            const map = new Map();
            (r.records || []).forEach(x => {
              const id = x.Master_School__c;
              const nm = x.Master_School__r && x.Master_School__r.Name;
              const npsn = x.Master_School__r && x.Master_School__r.NPSN__c;
              if (id && nm && !map.has(id)) map.set(id, { Id:id, Name:nm, NPSN:npsn || null });
            });
            rows = Array.from(map.values());
          } catch (e) { errors.push('Account.Master_School__c: ' + (e.message || String(e))); }
        }

        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return ok({ success: true, totalSize: rows ? rows.length : 0, records: rows || [], errors: errors.length ? errors : undefined });
      }

      // ---------- SCHOOLS (umum): type=schools|school, param term ----------
      if (type === 'schools' || type === 'school') {
        const conn = await login();
        const errors = [];
        let rows = null;

        // Try MasterSchool__c
        try {
          const r1 = await conn.query(`
            SELECT Id, Name, NPSN__c
            FROM MasterSchool__c
            WHERE ${searchTerm ? `(Name LIKE '%${esc(searchTerm)}%' OR NPSN__c LIKE '%${esc(searchTerm)}%')` : `Name != null`}
            ORDER BY Name
            LIMIT 50
          `);
          if (r1.totalSize > 0) rows = r1.records.map(x => ({ Id:x.Id, Name:x.Name, NPSN:x.NPSN__c || null }));
        } catch (e) { errors.push('MasterSchool__c: ' + (e.message || String(e))); }

        // Try Master_School__c
        if (!rows || rows.length === 0) {
          try {
            const r2 = await conn.query(`
              SELECT Id, Name, NPSN__c
              FROM Master_School__c
              WHERE ${searchTerm ? `(Name LIKE '%${esc(searchTerm)}%' OR NPSN__c LIKE '%${esc(searchTerm)}%')` : `Name != null`}
              ORDER BY Name
              LIMIT 50
            `);
            if (r2.totalSize > 0) rows = r2.records.map(x => ({ Id:x.Id, Name:x.Name, NPSN:x.NPSN__c || null }));
          } catch (e) { errors.push('Master_School__c: ' + (e.message || String(e))); }
        }

        // Fallback Account.Master_School__c
        if (!rows || rows.length === 0) {
          try {
            const r3 = await conn.query(`
              SELECT Master_School__c, Master_School__r.Name, Master_School__r.NPSN__c
              FROM Account
              WHERE Master_School__c != null
                ${searchTerm ? `AND (Master_School__r.Name LIKE '%${esc(searchTerm)}%' OR Name LIKE '%${esc(searchTerm)}%')` : ''}
              ORDER BY Master_School__r.Name
              LIMIT 500
            `);
            const map = new Map();
            (r3.records || []).forEach(x => {
              const id = x.Master_School__c;
              const nm = x.Master_School__r && x.Master_School__r.Name;
              const npsn = x.Master_School__r && x.Master_School__r.NPSN__c;
              if (id && nm && !map.has(id)) map.set(id, { Id:id, Name:nm, NPSN:npsn || null });
            });
            rows = Array.from(map.values());
          } catch (e) { errors.push('Account.Master_School__c: ' + (e.message || String(e))); }
        }

        return ok({ success: true, records: rows || [], errors: errors.length ? errors : undefined });
      }

      return fail(400, 'Unknown GET type');
    }

    // =================== POST ===================
    if (method === 'POST') {
      const conn = await login();

      if (body?.action === 'saveReg') {
        const { opportunityId, campusId, intakeId, studyProgramId } = body || {};
        if (!opportunityId || !campusId || !intakeId || !studyProgramId) {
          return fail(400, 'Param kurang (opportunityId, campusId, intakeId, studyProgramId)');
        }
        await conn.sobject('Opportunity').update({
          Id: opportunityId,
          Campus__c: campusId,
          Master_Intake__c: intakeId,
          Study_Program__c: studyProgramId
        });
        return ok({ success: true });
      }

      return fail(400, 'Unknown POST action');
    }

    return fail(405, 'Method not allowed');
  } catch (err) {
    // Pastikan tetap JSON agar frontend tidak error parsing
    return ok({ success: false, records: [], message: err.message || 'Gagal memproses request' });
  }
};
