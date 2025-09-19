// src/api/register-options.js
// Wizard options: campuses, intakes, programs, schools (MasterSchool__c / Master_School__c / Account.Master_School__c)
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
    if (method === 'GET') {
      const { type } = query || {};
      const searchTerm = (query.term ?? query.t ?? '').trim();
      const campusId   = (query.campusId ?? '').trim();
      const intakeId   = (query.intakeId ?? '').trim();
      if (!type) return fail(400, 'type wajib diisi');

      // ---------- CAMPUSES ----------
      if (type === 'campuses' || type === 'campus') {
        const conn = await login();
        try {
          const where = searchTerm ? `WHERE Name LIKE '%${esc(searchTerm)}%'` : '';
          const soql = `
            SELECT Id, Name
            FROM Campus__c
            ${where}
            ORDER BY Name
            LIMIT 200
          `;
          const r = await conn.query(soql);
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
          return ok({ success: true, records: r.records });
        } catch (e) {
          // fallback: Account.Master_School__c (kalau object Campus__c tidak ada)
          const msg = String(e && e.message || e);
          const fallbackable = /INVALID_TYPE|No such column|is not supported/i.test(msg);
          if (!fallbackable) return ok({ success: true, records: [], errors: [msg], source: 'campuses:err' });

          const conn2 = await login();
          const where2 = searchTerm
            ? `AND (Master_School__r.Name LIKE '%${esc(searchTerm)}%' OR Name LIKE '%${esc(searchTerm)}%')`
            : '';
          const soql2 = `
            SELECT Master_School__c, Master_School__r.Name
            FROM Account
            WHERE Master_School__c != null
            ${where2}
            ORDER BY Master_School__r.Name
            LIMIT 500
          `;
          const r2 = await conn2.query(soql2);
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
          const where = campusId ? `WHERE Campus__c = '${esc(campusId)}'` : '';
          const soql = `
            SELECT Id, Name
            FROM Master_Intake__c
            ${where}
            ORDER BY Name DESC
            LIMIT 200
          `;
          const r = await conn.query(soql);
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
          return ok({ success: true, records: r.records.map(x => ({ Id: x.Id, Name: x.Name })) });
        } catch (e) {
          // fallback dinamis agar UI tetap jalan
          const now = new Date(); const y = now.getFullYear();
          const fallback = [];
          for (let yr = y + 1; yr >= y - 5; yr--) {
            const name = `${yr}/${yr + 1}`;
            fallback.push({ Id: name, Name: name });
          }
          return ok({ success: true, records: fallback, fallback: 'dynamic-years', errors: [String(e && e.message || e)] });
        }
      }

      // ---------- PROGRAMS (berdasarkan intake) ----------
      if (type === 'programs' || type === 'program') {
        if (!intakeId) return fail(400, 'intakeId wajib diisi');
        const conn = await login();
        const errors = [];
        let rows = null;

        // Try 1: junction Study_Program_Intake__c
        try {
          const andCampus = campusId ? `AND (Study_Program__r.Campus__c = '${esc(campusId)}')` : '';
          const soql1 = `
            SELECT Study_Program__c, Study_Program__r.Name
            FROM Study_Program_Intake__c
            WHERE Master_Intake__c = '${esc(intakeId)}'
            ${andCampus}
            ORDER BY Study_Program__r.Name
            LIMIT 500
          `;
          const q1 = await conn.query(soql1);
          if (q1.totalSize > 0) rows = q1.records.map(r => ({ Id: r.Study_Program__c, Name: r.Study_Program__r?.Name }));
        } catch (e) { errors.push('SPI__c: ' + (e.message || String(e))); }

        // Try 2: Study_Program__c dengan lookup Master_Intake__c
        if (!rows || rows.length === 0) {
          try {
            const andCampus2 = campusId ? `AND Campus__c = '${esc(campusId)}'` : '';
            const soql2 = `
              SELECT Id, Name
              FROM Study_Program__c
              WHERE Master_Intake__c = '${esc(intakeId)}'
              ${andCampus2}
              ORDER BY Name
              LIMIT 500
            `;
            const q2 = await conn.query(soql2);
            if (q2.totalSize > 0) rows = q2.records.map(r => ({ Id: r.Id, Name: r.Name }));
          } catch (e) { errors.push('SP.Master_Intake__c: ' + (e.message || String(e))); }
        }

        // Try 3: fallback by campus (kalau skema tidak punya relasi ke intake)
        if ((!rows || rows.length === 0) && campusId) {
          try {
            const soql3 = `
              SELECT Id, Name
              FROM Study_Program__c
              WHERE Campus__c = '${esc(campusId)}'
              ORDER BY Name
              LIMIT 500
            `;
            const q3 = await conn.query(soql3);
            if (q3.totalSize > 0) rows = q3.records.map(r => ({ Id: r.Id, Name: r.Name }));
          } catch (e) { errors.push('SP.byCampus: ' + (e.message || String(e))); }
        }

        return ok({
          success: true,
          records: rows || [],
          source: rows && rows.length ? 'resolved' : 'not-found',
          errors: errors.length ? errors : undefined
        });
      }

      // ---------- SCHOOLS (autocomplete) ----------
      if (type === 'schools' || type === 'school') {
        const conn = await login();
        const errors = [];
        let rows = null;

        // Try 1: MasterSchool__c
        try {
          const where = searchTerm
            ? `(Name LIKE '%${esc(searchTerm)}%' OR NPSN__c LIKE '%${esc(searchTerm)}%')`
            : `Name != null`;
          const soql1 = `
            SELECT Id, Name, NPSN__c
            FROM MasterSchool__c
            WHERE ${where}
            ORDER BY Name
            LIMIT 50
          `;
          const r1 = await conn.query(soql1);
          if (r1.totalSize > 0) rows = r1.records.map(x => ({ Id:x.Id, Name:x.Name, NPSN:x.NPSN__c || null }));
        } catch (e) { errors.push('MasterSchool__c: ' + (e.message || String(e))); }

        // Try 2: Master_School__c
        if (!rows || rows.length === 0) {
          try {
            const where2 = searchTerm
              ? `(Name LIKE '%${esc(searchTerm)}%' OR NPSN__c LIKE '%${esc(searchTerm)}%')`
              : `Name != null`;
            const soql2 = `
              SELECT Id, Name, NPSN__c
              FROM Master_School__c
              WHERE ${where2}
              ORDER BY Name
              LIMIT 50
            `;
            const r2 = await conn.query(soql2);
            if (r2.totalSize > 0) rows = r2.records.map(x => ({ Id:x.Id, Name:x.Name, NPSN:x.NPSN__c || null }));
          } catch (e) { errors.push('Master_School__c: ' + (e.message || String(e))); }
        }

        // Try 3: Fallback distinct dari Account.Master_School__c
        if (!rows || rows.length === 0) {
          try {
            const andTerm = searchTerm
              ? `AND (Master_School__r.Name LIKE '%${esc(searchTerm)}%' OR Name LIKE '%${esc(searchTerm)}%')`
              : '';
            const soql3 = `
              SELECT Master_School__c, Master_School__r.Name, Master_School__r.NPSN__c
              FROM Account
              WHERE Master_School__c != null
              ${andTerm}
              ORDER BY Master_School__r.Name
              LIMIT 500
            `;
            const r3 = await conn.query(soql3);
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
    return fail(500, err.message || 'Gagal memproses request');
  }
};
