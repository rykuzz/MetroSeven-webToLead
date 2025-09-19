// GET: campuses, intakes(by campus), programs(by campus+intake)
// POST: saveStudy → set Campus/Intake/Program ke Opportunity & update Name "First Last/REG/{ProgramName}"
const jsforce = require('jsforce');
function escSOQL(v){ return String(v||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

module.exports = async (req, res) => {
  const { method, query, body } = req;
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    if (method === 'GET') {
      const { type } = query;

      if (type === 'campuses') {
        const r = await conn.query("SELECT Id, Name FROM Campus__c WHERE IsActive__c = true ORDER BY Name");
        return res.status(200).json({ success:true, records: r.records });
      }

      if (type === 'intakes') {
        const { campusId } = query;
        const soql =
          "SELECT Id, Name FROM Master_Intake__c " +
          (campusId ? ("WHERE Campus__c = '" + escSOQL(campusId) + "' ") : '') +
          "ORDER BY Name DESC LIMIT 200";
        const r = await conn.query(soql);
        return res.status(200).json({ success:true, records: r.records });
      }

      if (type === 'programs') {
        const { campusId, intakeId } = query;
        if (!campusId || !intakeId) return res.status(400).json({ success:false, message:'campusId & intakeId wajib' });

        // Skema 1: Program tersedia di Campus & Intake melalui junction Study_Program_Intake__c
        const soql =
          "SELECT Id, Study_Program__r.Id, Study_Program__r.Name " +
          "FROM Study_Program_Intake__c " +
          "WHERE Campus__c = '" + escSOQL(campusId) + "' " +
          "AND Master_Intake__c = '" + escSOQL(intakeId) + "' " +
          "ORDER BY Study_Program__r.Name";
        const r = await conn.query(soql);
        const records = (r.records||[]).map(x=>({ Id: x.Study_Program__r.Id, Name: x.Study_Program__r.Name }));
        return res.status(200).json({ success:true, records });
      }

      return res.status(400).json({ success:false, message:'Unknown GET type' });
    }

    if (method === 'POST') {
      if (body?.action === 'saveStudy') {
        const { opportunityId, campusId, intakeId, programId } = body;
        if (!opportunityId || !campusId || !intakeId || !programId) throw new Error('Param kurang');

        // ambil opp untuk base name & update fields
        const opp = await conn.sobject('Opportunity').retrieve(opportunityId);
        const prog = await conn.sobject('Study_Program__c').retrieve(programId);
        const baseName = (opp.Name || '').split('/REG')[0] + '/REG';
        const newName = `${baseName}/${prog.Name}`;

        await conn.sobject('Opportunity').update({
          Id: opportunityId,
          Campus__c: campusId,
          Master_Intake__c: intakeId,
          Study_Program__c: programId,
          Name: newName
        });

        return res.status(200).json({ success:true });
      }
      return res.status(400).json({ success:false, message:'Unknown POST action' });
    }

    res.status(405).json({ success:false, message:'Method not allowed' });
  } catch (err) {
    console.error('register-options ERR:', err);
    res.status(500).json({ success:false, message: err.message || 'Error' });
  }
};
