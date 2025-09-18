// api/register-options.js
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
        const r = await conn.query(
          "SELECT Id, Name FROM Campus__c WHERE IsActive__c = true ORDER BY Name"
        );
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
        const { campusId } = query;
        // Simple: program by campus (tanpa BSP)
        const soql = `
          SELECT Id, Name
          FROM Study_Program__c
          WHERE Campus__c = :campusId
          ORDER BY Name
        `;
        const r = await conn.query(soql, { campusId });
        return res.status(200).json({ success:true, records: r.records });
      }

      return res.status(400).json({ success:false, message: 'Unknown GET type' });
    }

    if (method === 'POST') {
      // Simpan preferensi studi ke Opportunity (tanpa BSP) + rename Name
      if (body?.action === 'saveReg') {
        const { opportunityId, campusId, intakeId, studyProgramId, studyProgramName } = body;
        if (!opportunityId || !campusId || !studyProgramId || !studyProgramName) {
          throw new Error('Param kurang');
        }

        // Update field pada Opportunity
        const upd = {
          Id: opportunityId,
          Campus__c: campusId,
          Study_Program__c: studyProgramId
        };
        if (typeof intakeId === 'string' && intakeId) {
          upd.Master_Intake__c = intakeId;
        }
        await conn.sobject('Opportunity').update(upd);

        // Rename Opportunity jadi "First Last/REG/{Study Program Name}"
        const opp = await conn.sobject('Opportunity').retrieve(opportunityId);
        const acc = await conn.sobject('Account').retrieve(opp.AccountId);
        const base = `${(acc.FirstName||'').trim()} ${(acc.LastName||'').trim()}`.trim();
        const newName = `${base}/REG/${studyProgramName}`;
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
