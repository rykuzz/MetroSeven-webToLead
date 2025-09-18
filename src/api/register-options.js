const jsforce = require('jsforce');

function escSOQL(v){ return String(v||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function inList(ids){ return "(" + ids.map(id => "'" + escSOQL(id) + "'").join(",") + ")"; }

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
          "SELECT Id, Name, Start_Date__c, End_Date__c FROM Master_Intake__c " +
          "WHERE Campus__c = '" + escSOQL(campusId) + "' ORDER BY Start_Date__c DESC";
        const r = await conn.query(soql);
        return res.status(200).json({ success:true, records: r.records });
      }

      if (type === 'programs') {
        const { campusId, intakeId } = query;
        const fc = await conn.query("SELECT Id FROM Faculty_Campus__c WHERE Campus__c = '" + escSOQL(campusId) + "' LIMIT 100");
        const fcIds = (fc.records||[]).map(x=>x.Id);
        if (!fcIds.length) return res.status(200).json({ success:true, records: [] });

        const soql =
          "SELECT Id, Study_Program__r.Id, Study_Program__r.Name FROM Study_Program_Faculty_Campus__c " +
          "WHERE Faculty_Campus__c IN " + inList(fcIds) + " " +
          "AND Id IN (SELECT Study_Program_Faculty_Campus__c FROM Study_Program_Intake__c WHERE Master_Intake__c = '" + escSOQL(intakeId) + "')" +
          " ORDER BY Study_Program__r.Name";
        const r = await conn.query(soql);
        const records = (r.records||[]).map(x=>({
          Id: x.Id,
          StudyProgramId: x.Study_Program__r.Id,
          StudyProgramName: x.Study_Program__r.Name
        }));
        return res.status(200).json({ success:true, records });
      }

      if (type === 'masterBatch') {
        const { intakeId, date } = query;
        const soql =
          "SELECT Id, Name, Batch_Start_Date__c, Batch_End_Date__c FROM Master_Batches__c " +
          "WHERE Intake__c = '" + escSOQL(intakeId) + "' " +
          "AND Batch_Start_Date__c <= " + escSOQL(date) + " " +
          "AND Batch_End_Date__c >= " + escSOQL(date) + " " +
          "ORDER BY Batch_Start_Date__c DESC LIMIT 1";
        const r = await conn.query(soql);
        const rec = r.records?.[0];
        return res.status(200).json({ success:true, id: rec?.Id || null, name: rec?.Name || null });
      }

      if (type === 'bsp') {
        const { masterBatchId, studyProgramId } = query;
        const soql =
          "SELECT Id, Name FROM Batch_Study_Program__c " +
          "WHERE Master_Batch__c = '" + escSOQL(masterBatchId) + "' " +
          "AND Study_Program__c = '" + escSOQL(studyProgramId) + "' LIMIT 1";
        const r = await conn.query(soql);
        const rec = r.records?.[0];
        return res.status(200).json({ success:true, id: rec?.Id || null, name: rec?.Name || null });
      }

      return res.status(400).json({ success:false, message: 'Unknown GET type' });
    }

    if (method === 'POST') {
      if (body?.action === 'saveReg') {
        const { opportunityId, bspId } = body;
        if (!opportunityId || !bspId) throw new Error('Param kurang');

        const [bsp, opp] = await Promise.all([
          conn.sobject('Batch_Study_Program__c').retrieve(bspId),
          conn.sobject('Opportunity').retrieve(opportunityId),
        ]);

        const baseName = (opp.Name || '').split('/REG')[0] + '/REG';
        const newName = `${baseName}/${bsp.Name}`;

        await conn.sobject('Opportunity').update({ Id: opportunityId, Batch_Study_Program__c: bspId, Name: newName });
        return res.status(200).json({ success:true });
      }

      return res.status(400).json({ success:false, message: 'Unknown POST action' });
    }

    return res.status(405).json({ success:false, message:'Method not allowed' });
  } catch (err) {
    console.error('register-options ERR:', err);
    return res.status(500).json({ success:false, message: err.message || 'Error' });
  }
};
