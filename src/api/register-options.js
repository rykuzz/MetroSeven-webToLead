// Wizard options: campuses, intakes, programs, sekolah (autocomplete)
// Output untuk "programs" diseragamkan: SELALU { Id, Name }

const jsforce = require('jsforce');

// escape sederhana untuk SOQL
const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const ok = (res, data) =>
  res.status(200).json({ success: true, ...data });

const fail = (res, code, message, extra = {}) =>
  res.status(code).json({ success: false, message, ...extra });

async function login(env) {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = env;
  if (!SF_LOGIN_URL || !SF_USERNAME || !SF_PASSWORD) {
    throw new Error('ENV Salesforce belum lengkap (SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD)');
  }
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
  await conn.login(SF_USERNAME, SF_PASSWORD);
  return conn;
}

module.exports = async (req, res) => {
  const env = {
    SF_LOGIN_URL: process.env.SF_LOGIN_URL,
    SF_USERNAME: process.env.SF_USERNAME,
    SF_PASSWORD: process.env.SF_PASSWORD,
  };

  const { method, query, body } = req;

  try {
    // =================== GET ===================
    if (method === 'GET') {
      const { type } = query || {};
      const searchTerm = (query.term ?? query.t ?? '').trim();
      const campusId   = (query.campusId ?? '').trim();
      const intakeId   = (query.intakeId ?? '').trim();

      if (!type) return fail(res, 400, 'type wajib diisi');

      // ---------- CAMPUSES ----------
      if (type === 'campuses' || type === 'campus') {
        const conn = await login(env);
        const r = await conn.query(`
          SELECT Id, Name
          FROM Campus__c
          ${searchTerm ? `WHERE Name LIKE '%${esc(searchTerm)}%'` : ''}
          ORDER BY Name
          LIMIT 200
        `);
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return ok(res, { records: (r.records || []).map(x => ({ Id: x.Id, Name: x.Name })) });
      }

      // ---------- INTAKES ----------
      if (type === 'intakes' || type === 'intake') {
        const conn = await login(env);
        const r = await conn.query(`
          SELECT Id, Name
          FROM Master_Intake__c
          ${campusId ? `WHERE Campus__c = '${esc(campusId)}'` : ''}
          ORDER BY Name DESC
          LIMIT 200
        `);
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return ok(res, { records: (r.records || []).map(x => ({ Id: x.Id, Name: x.Name })) });
      }

      // ---------- PROGRAMS (by Campus + Intake) ----------
      // SERAGAMKAN output: { Id, Name }
      if (type === 'programs' || type === 'program') {
        if (!campusId) return fail(res, 400, 'campusId wajib diisi');
        if (!intakeId) return fail(res, 400, 'intakeId wajib diisi');

        const conn = await login(env);

        const q = await conn.query(`
          SELECT Study_Program__r.Id, Study_Program__r.Name
          FROM Study_Program_Intake__c
          WHERE Campus__c = '${esc(campusId)}'
            AND Master_Intake__c = '${esc(intakeId)}'
          ORDER BY Study_Program__r.Name
          LIMIT 500
        `);

        const rows = (q.records || [])
          .map(r => ({
            Id:   r.Study_Program__r?.Id,
            Name: r.Study_Program__r?.Name,
          }))
          .filter(x => x.Id && x.Name);

        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return ok(res, { records: rows });
      }

      // ---------- SEKOLAH (autocomplete) ----------
      if (type === 'sekolah') {
        const conn = await login(env);
        if (searchTerm.length < 2) return fail(res, 400, 'Kata kunci terlalu pendek');

        // Coba dua nama objek master sekolah (beda org bisa beda)
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
        return ok(res, { records: rows });
      }

      return fail(res, 400, 'Unknown GET type');
    }

    // =================== POST ===================
    if (method === 'POST') {
      const conn = await login(env);

      // Simpan Preferensi Studi
      if (body?.action === 'saveStudy') {
        const { opportunityId, campusId, intakeId, programId } = body || {};
        if (!opportunityId || !campusId || !intakeId || !programId) {
          return fail(res, 400, 'Param kurang (opportunityId, campusId, intakeId, programId)');
        }

        await conn.sobject('Opportunity').update({
          Id: opportunityId,
          Campus__c: campusId,
          Master_Intake__c: intakeId,
          Study_Program__c: programId
        });

        // Update Name → "First Last/REG/{ProgramName}"
        const [opp, prog] = await Promise.all([
          conn.sobject('Opportunity').retrieve(opportunityId),
          conn.sobject('Study_Program__c').retrieve(programId)
        ]);
        const baseName = (opp.Name || '').split('/REG')[0] + '/REG';
        const newName = `${baseName}/${prog.Name}`;
        await conn.sobject('Opportunity').update({ Id: opportunityId, Name: newName });

        return ok(res, {});
      }

      return fail(res, 400, 'Unknown POST action');
    }

    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    return fail(res, 500, err.message || 'Gagal memproses request');
  }
};
