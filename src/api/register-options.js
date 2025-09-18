// src/api/register-options.js
const jsforce = require('jsforce');

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
        const soql = `
          SELECT Id, Name, Start_Date__c, End_Date__c
          FROM Master_Intake__c
          WHERE Campus__c = :campusId
          ORDER BY Start_Date__c DESC
        `;
        const r = await conn.query(soql, { campusId });
        return res.status(200).json({ success:true, records: r.records });
      }

      if (type === 'programs') {
        const { campusId, intakeId } = query;
        // dapatkan Faculty_Campus__c
        const fc = await conn.query("SELECT Id FROM Faculty_Campus__c WHERE Campus__c = :campusId LIMIT 100", { campusId });
        const fcIds = fc.records.map(x=>x.Id);
        if (!fcIds.length) return res.status(200).json({ success:true, records: [] });

        const soql = `
          SELECT Id, Study_Program__r.Id, Study_Program__r.Name
          FROM Study_Program_Faculty_Campus__c
          WHERE Faculty_Campus__c IN :fcIds
          AND   Id IN (
            SELECT Study_Program_Faculty_Campus__c
            FROM Study_Program_Intake__c
            WHERE Master_Intake__c = :intakeId
          )
          ORDER BY Study_Program__r.Name
        `;
        const r = await conn.query(soql, { fcIds, intakeId });
        const records = (r.records||[]).map(x=>({
          Id: x.Id,
          StudyProgramId: x.Study_Program__r.Id,
          StudyProgramName: x.Study_Program__r.Name
        }));
        return res.status(200).json({ success:true, records });
      }

      if (type === 'masterBatch') {
        const { intakeId, date } = query;
        const soql = `
          SELECT Id, Name, Batch_Start_Date__c, Batch_End_Date__c
          FROM Master_Batches__c
          WHERE Intake__c = :intakeId
          AND Batch_Start_Date__c <= :dateVal
          AND Batch_End_Date__c >= :dateVal
          ORDER BY Batch_Start_Date__c DESC
          LIMIT 1
        `;
        const r = await conn.query(soql, { intakeId, dateVal: date });
        const rec = r.records?.[0];
        return res.status(200).json({ success:true, id: rec?.Id || null, name: rec?.Name || null });
      }

      if (type === 'bsp') {
        const { masterBatchId, studyProgramId } = query;
        const soql = `
          SELECT Id, Name
          FROM Batch_Study_Program__c
          WHERE Master_Batch__c  = :masterBatchId
          AND   Study_Program__c = :studyProgramId
          LIMIT 1
        `;
        const r = await conn.query(soql, { masterBatchId, studyProgramId });
        const rec = r.records?.[0];
        return res.status(200).json({ success:true, id: rec?.Id || null, name: rec?.Name || null });
      }

      return res.status(400).json({ success:false, message: 'Unknown GET type' });
    }

    if (method === 'POST') {
      // action: saveReg → simpan BSP ke Opportunity + update name
      if (body?.action === 'saveReg') {
        const { opportunityId, bspId } = body;
        if (!opportunityId || !bspId) throw new Error('Param kurang');

        // Ambil nama BSP untuk append ke Opportunity Name
        const bsp = await conn.sobject('Batch_Study_Program__c').retrieve(bspId);

        // Update Opp
        await conn.sobject('Opportunity').update({
          Id: opportunityId,
          Batch_Study_Program__c: bspId,
          Name: `{!Opportunity.Name}` // placeholder but not workable in API
        });

        // Kita perlu ambil nama opp lama, lalu append:
        const opp = await conn.sobject('Opportunity').retrieve(opportunityId);
        const newName = `${opp.Name.split('/REG')[0]}/REG/${bsp.Name}`;
        await conn.sobject('Opportunity').update({ Id: opportunityId, Name: newName });

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
