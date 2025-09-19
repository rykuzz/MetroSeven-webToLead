// Wizard options: campuses, intakes, programs, masterBatch, bsp, sekolah, schools
// Catatan: endpoint "programs" memakai rantai Faculty_Campus__c → Study_Program_Faculty_Campus__c
//          dan difilter intake via Study_Program_Intake__c. Output SELALU { Id, Name }.

const jsforce = require('jsforce');
const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const { method, query, body } = req;

  const send = (code, obj) => res.status(code).json(obj);
  const ok   = (data) => send(200, { success: true, ...data });
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
      const searchTerm = (query.term ?? query.t ?? '').trim();
      const campusId   = (query.campusId ?? '').trim();
      const intakeId   = (query.intakeId ?? '').trim();
      const dateStr    = (query.date ?? '').trim(); // opsional utk masterBatch
      if (!type) return fail(400, 'type wajib diisi');

      // ---------- CAMPUSES ----------
      if (type === 'campuses' || type === 'campus') {
        const conn = await login();
        const r = await conn.query(`
          SELECT Id, Name
          FROM Campus__c
          ${searchTerm ? `WHERE Name LIKE '%${esc(searchTerm)}%'` : ''}
          ORDER BY Name
          LIMIT 200
        `);
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return ok({ records: (r.records || []).map(x => ({ Id: x.Id, Name: x.Name })) });
      }

      // ---------- INTAKES ----------
      if (type === 'intakes' || type === 'intake') {
        const conn = await login();
        const r = await conn.query(`
          SELECT Id, Name
          FROM Master_Intake__c
          ${campusId ? `WHERE Campus__c = '${esc(campusId)}'` : ''}
          ORDER BY Name DESC
          LIMIT 200
        `);
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return ok({ records: (r.records || []).map(x => ({ Id: x.Id, Name: x.Name })) });
      }

      // ---------- PROGRAMS (filter by Campus + Intake) ----------
      if (type === 'programs' || type === 'program') {
        if (!campusId) return fail(400, 'campusId wajib diisi');
        if (!intakeId) return fail(400, 'intakeId wajib diisi');

        const conn = await login();

        // 1) Ambil Faculty_Campus__c untuk campus tsb
        const fc = await conn.query(`
          SELECT Id
          FROM Faculty_Campus__c
          WHERE Campus__c = '${esc(campusId)}'
          LIMIT 500
        `);
        const fcIds = (fc.records || []).map(r => r.Id);
        if (fcIds.length === 0) return ok({ records: [], source: 'no-faculty-campus' });

        const fcList = fcIds.map(id => `'${esc(id)}'`).join(',');

        // 2) Ambil Study_Program_Faculty_Campus__c yang related ke intake via Study_Program_Intake__c
        const spfc = await conn.query(`
          SELECT Study_Program__r.Id, Study_Program__r.Name
          FROM Study_Program_Faculty_Campus__c
          WHERE Faculty_Campus__c IN (${fcList})
            AND Id IN (
              SELECT Study_Program_Faculty_Campus__c
              FROM Study_Program_Intake__c
              WHERE Master_Intake__c = '${esc(intakeId)}'
            )
          ORDER BY Study_Program__r.Name
          LIMIT 500
        `);

        const rows = (spfc.records || [])
          .map(r => ({
            Id:   r.Study_Program__r?.Id || null,
            Name: r.Study_Program__r?.Name || ''
          }))
          .filter(x => x.Id && x.Name);

        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return ok({ records: rows, source: 'faculty+intake' });
      }

      // ---------- (opsional) MASTER BATCH ----------
      if (type === 'masterBatch') {
        if (!intakeId) return fail(400, 'intakeId wajib diisi');
        if (!dateStr)  return fail(400, 'date wajib diisi (YYYY-MM-DD)');
        const conn = await login();

        const r = await conn.query(`
          SELECT Id, Name, Batch_Start_Date__c, Batch_End_Date__c
          FROM Master_Batches__c
          WHERE Intake__c = '${esc(intakeId)}'
            AND Batch_Start_Date__c <= '${esc(dateStr)}'
            AND Batch_End_Date__c   >= '${esc(dateStr)}'
          ORDER BY Batch_Start_Date__c DESC
          LIMIT 1
        `);
        const rec = (r.records || [])[0];
        return ok({ id: rec?.Id || null, name: rec?.Name || null });
      }

      // ---------- (opsional) BSP echo ----------
      if (type === 'bsp') {
        const masterBatchId = (query.masterBatchId || '').trim();
        const studyProgramId = (query.studyProgramId || '').trim();
        if (!masterBatchId || !studyProgramId) {
          return fail(400, 'masterBatchId dan studyProgramId wajib diisi');
        }
        return ok({ id: `${masterBatchId}::${studyProgramId}`, name: 'BSP', masterBatchId, studyProgramId });
      }

      // ---------- SEKOLAH (autocomplete cepat) ----------
      if (type === 'sekolah') {
        const conn = await login();
        if (searchTerm.length < 2) return fail(400, 'Kata kunci terlalu pendek');

        let rows = [];
        try {
          const q1 = await conn.query(`
            SELECT Id, Name, NPSN__c
            FROM MasterSchool__c
            WHERE Name LIKE '%${esc(searchTerm)}%' OR NPSN__c LIKE '%${esc(searchTerm)}%'
            ORDER BY Name
            LIMIT 10
          `);
          rows = q1.records || [];
        } catch {}

        if (rows.length === 0) {
          try {
            const q2 = await conn.query(`
              SELECT Id, Name, NPSN__c
              FROM Master_School__c
              WHERE Name LIKE '%${esc(searchTerm)}%' OR NPSN__c LIKE '%${esc(searchTerm)}%'
              ORDER BY Name
              LIMIT 10
            `);
            rows = q2.records || [];
          } catch {}
        }

        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return ok({ records: rows });
      }

      // ---------- SCHOOLS (fallback luas) ----------
      if (type === 'schools' || type === 'school') {
        const conn = await login();
        const errors = [];
        let rows = null;

        try {
          const r1 = await conn.query(`
            SELECT Id, Name, NPSN__c
            FROM MasterSchool__c
            WHERE ${searchTerm ? `(Name LIKE '%${esc(searchTerm)}%' OR NPSN__c LIKE '%${esc(searchTerm)}%')` : `Name != null`}
            ORDER BY Name
            LIMIT 50
          `);
          if (r1.totalSize > 0) rows = r1.records.map(x => ({ Id: x.Id, Name: x.Name, NPSN: x.NPSN__c || null }));
        } catch (e) { errors.push('MasterSchool__c: ' + (e.message || String(e))); }

        if (!rows || rows.length === 0) {
          try {
            const r2 = await conn.query(`
              SELECT Id, Name, NPSN__c
              FROM Master_School__c
              WHERE ${searchTerm ? `(Name LIKE '%${esc(searchTerm)}%' OR NPSN__c LIKE '%${esc(searchTerm)}%')` : `Name != null`}
              ORDER BY Name
              LIMIT 50
            `);
            if (r2.totalSize > 0) rows = r2.records.map(x => ({ Id: x.Id, Name: x.Name, NPSN: x.NPSN__c || null }));
          } catch (e) { errors.push('Master_School__c: ' + (e.message || String(e))); }
        }

        if (!rows || rows.length === 0) {
          try {
            const r3 = await conn.query(`
              SELECT Master_School__c, Master_School__r.Name
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
              if (id && nm && !map.has(id)) map.set(id, { Id: id, Name: nm, NPSN: null });
            });
            rows = Array.from(map.values());
          } catch (e) { errors.push('Account.Master_School__c: ' + (e.message || String(e))); }
        }

        return ok({ records: rows || [], errors: errors.length ? errors : undefined });
      }

      return fail(400, 'Unknown GET type');
    }

    // =================== POST ===================
    if (method === 'POST') {
      const conn = await login();

      // Simpan preferensi studi (alias saveReg/saveStudy)
      if (body?.action === 'saveReg' || body?.action === 'saveStudy') {
        const opportunityId = body.opportunityId;
        const campusId  = body.campusId;
        const intakeId  = body.intakeId;
        const programId = body.studyProgramId || body.programId;

        if (!opportunityId || !campusId || !intakeId || !programId) {
          return fail(400, 'Param kurang (opportunityId, campusId, intakeId, studyProgramId/programId)');
        }

        await conn.sobject('Opportunity').update({
          Id: opportunityId,
          Campus__c: campusId,
          Master_Intake__c: intakeId,
          Study_Program__c: programId
        });

        // Update Name: "First Last/REG/{Program Name}"
        try {
          const [opp, prog] = await Promise.all([
            conn.sobject('Opportunity').retrieve(opportunityId),
            conn.sobject('Study_Program__c').retrieve(programId)
          ]);
          const baseName = (opp.Name || '').split('/REG')[0] + '/REG';
          const newName  = `${baseName}/${prog.Name}`;
          await conn.sobject('Opportunity').update({ Id: opportunityId, Name: newName });
        } catch {}

        return ok({});
      }

      return fail(400, 'Unknown POST action');
    }

    return fail(405, 'Method not allowed');
  } catch (err) {
    return fail(500, err.message || 'Gagal memproses request');
  }
};
