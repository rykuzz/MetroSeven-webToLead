const jsforce = require('jsforce');

// POST /api/register
// Body JSON:
// { firstName, lastName, email, phone, studyProgramId, studyProgramName,
//   campusId, masterIntakeId, schoolName, graduationYear, campaignId }
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Gunakan POST' });
  }

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);
    const b = req.body || {};

    // 1) Find or Create Person Account by email (tanpa RecordTypeId)
    let accountId = null;

    if (b.email) {
      const emailEsc = String(b.email).replace(/'/g, "\\'");
      const existing = await conn.query(
        `SELECT Id FROM Account WHERE IsPersonAccount = true AND PersonEmail = '${emailEsc}' LIMIT 1`
      );
      if (existing.records.length) {
        accountId = existing.records[0].Id;
        // Update data dasar (jangan ubah RecordTypeId di sini)
        await conn.sobject('Account').update({
          Id: accountId,
          FirstName: b.firstName || '',
          LastName : b.lastName  || '-',
          PersonEmail: b.email,
          PersonMobilePhone: b.phone || null
        });
      }
    }

    if (!accountId) {
      const accBody = {
        // >>> RecordTypeId sengaja tidak di-set supaya pakai default Person Account RT
        // RecordTypeId: '012xxxxxxxxxxxx', // <-- DI-COMMENT
        IsPersonAccount: true,
        FirstName: b.firstName || '',
        LastName : b.lastName  || '-',
        PersonEmail: b.email,
        PersonMobilePhone: b.phone || null
      };

      const acc = await conn.sobject('Account').create(accBody);
      if (!acc.success) throw new Error(acc.errors?.join(', ') || 'Gagal membuat Person Account');
      accountId = acc.id;
    }

    // 2) Create Opportunity yang terhubung ke Person Account
    const closeDate = new Date();
    closeDate.setDate(closeDate.getDate() + 30);

    const oppBody = {
      Name: `REG - ${b.lastName || 'Applicant'} - ${b.studyProgramName || 'Program'}`,
      StageName: 'Prospecting',
      CloseDate: closeDate.toISOString().slice(0, 10),
      AccountId: accountId,

      // Sesuaikan API name field custom di org kamu:
      Study_Program__c: b.studyProgramId || null,
      Campus__c: b.campusId || null,
      Master_Intake__c: b.masterIntakeId || null,   // Tahun Ajaran (Master Intake)
      School_Name__c: b.schoolName || null,
      Graduation_Year__c: b.graduationYear || null,

      LeadSource: 'Metro Seven LP',
      CampaignId: b.campaignId || null
    };

    const opp = await conn.sobject('Opportunity').create(oppBody);
    if (!opp.success) throw new Error(opp.errors?.join(', ') || 'Gagal membuat Opportunity');

    return res.status(200).json({ success: true, accountId, opportunityId: opp.id });

  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal membuat Opportunity',
      error: error.message
    });
  }
};
