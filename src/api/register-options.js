// src/api/register-options.js
// Wizard options: campuses, intakes, programs, schools (Master_School__c)

const jsforce = require('jsforce');

// escape sederhana untuk SOQL
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
      const { type, term = '', campusId = '', intakeId = '' } = query || {};
      if (!type) return fail(400, 'type wajib diisi');

      // ---------- CAMPUSES ----------
      if (type === 'campuses' || type === 'campus') {
        const conn = await login();
        try {
          const r = await conn.query(`
            SELECT Id, Name
            FROM Campus__c
            ${term ? `WHERE Name LIKE '%${esc(term)}%'` : ''}
            ORDER BY Name
            LIMIT 200
          `);
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
          return ok({ success: true, records: r.records });
        } catch (e) {
          // fallback if Campus__c not available
          const msg = String(e && e.message || e);
          const fallbackable = /INVALID_TYPE|No such column|is not supported/i.test(msg);
          if (!fallbackable) return ok({ success: true, records: [], errors: [msg], source: 'campuses:err' });

          const conn2 = await login();
          const r2 = await conn2.query(`
            SELECT Master_School__c
            FROM Account
            WHERE Master_School__c != null
              ${term ? `AND Master_School__c LIKE '%${esc(term)}%'` : ''}
            GROUP BY Master_School__c
            ORDER BY Master_School__c
            LIMIT 200
          `);
          const rows = (r2.records || []).map(x => ({
            Id: x.Master_School__c,
            Name: x.Master_School__c
          }));
          return ok({ success: true, records: rows, fallback: 'Account.Master_School__c' });
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
          // fallback dynamic
          const now = new Date(); const y = now.getFullYear();
          const fallback = [];
          for (let yr = y + 1; yr >= y - 5; yr--) {
            const name = `${yr}/${yr + 1}`;
            fallback.push({ Id: name, Name: name });
          }
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
          if (q1.totalSize > 0) {
            rows = q1.records.map(r => ({
              Id: r.Study_Program__c,
              Name: r.Study_Program__r?.Name
            }));
          }
        } catch (e) { errors.push('SPI__c: ' + (e.message || String(e))); }

        // Try 2: Study_Program__c lookup Master_Intake__c
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

        // Try 3: fallback by campus
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

        return ok({
          success: true,
          records: rows || [],
          source: rows && rows.length ? 'resolved' : 'not-found',
          errors: errors.length ? errors : undefined
        });
      }

      // ---------- SCHOOLS (Master_School__c) ----------
      if (type === 'schools' || type === 'school') {
        const conn = await login();
        const r = await conn.query(`
          SELECT Id, Name
          FROM Master_School__c
          ${term ? `WHERE Name LIKE '%${esc(term)}%'` : ''}
          ORDER BY Name
          LIMIT 50
        `);
        return ok({ success: true, records: r.records });
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
          Master_Intake__c: intakeId,   // <- sesuai field di org kamu
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
