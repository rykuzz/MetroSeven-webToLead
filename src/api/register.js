const jsforce = require('jsforce');

// POST /api/register
// Body JSON:
// { firstName, lastName, email, phone, studyProgramId, studyProgramName, campusId, masterIntakeId, schoolName, graduationYear, campaignId, accountType? }
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Gunakan POST' });
  }

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  // RecordType Person Account (dari kamu)
  const RT_SCHOOL     = '012gL000002NZFFQA4';
  const RT_UNIVERSITY = '012gL000002NZITQA4'; // default

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const b = req.body || {};

    // Pilih record type jika dikirim (opsional)
    const isSchool = String(b.accountType || '').toLowerCase() === 'school';
    const accountRecordTypeId = isSchool ? RT_SCHOOL : RT_UNIVERSITY;

    // 1) Find or create Person Account by PersonEmail
    let accountId = null;
    if (b.email) {
      const emailEsc = String(b.email).replace(/'/g, "\\'");
      const existing = await conn.query(
        `SELECT Id FROM Account WHERE IsPersonAccount = true AND PersonEmail = '${emailEsc}' LIMIT 1`
      );
      if (existing.records.length) {
        accountId = existing.records[0].Id;
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
      const acc = await conn.sobject('Account').create({
        RecordTypeId: accountRecordTypeId,
        IsPersonAccount: true,
        FirstName: b.firstName || '',
        LastName : b.lastName  || '-',
        PersonEmail: b.email,
        PersonMobilePhone: b.phone || null
      });
      if (!acc.success) throw new Error('Gagal membuat Person Account');
      accountId = acc.id;
    }

    // 2) Create Opportunity (link ke Person Account)
    const closeDate = new Date(); closeDate.setDate(closeDate.getDate() + 30);
    const oppBody = {
      Name: `REG - ${b.lastName || 'Applicant'} - ${b.studyProgramName || 'Program'}`,
      StageName: 'Prospecting',
      CloseDate: closeDate.toISOString().slice(0,10),
      AccountId: accountId,

      // Sesuaikan API name field di org kamu:
      Study_Program__c: b.studyProgramId || null,
      Campus__c: b.campusId || null,
      Master_Intake__c: b.masterIntakeId || null, // ← Tahun Ajaran (Master Intake)
      School_Name__c: b.schoolName || null,
      Graduation_Year__c: b.graduationYear || null,

      LeadSource: 'Metro Seven LP',
      CampaignId: b.campaignId || null
    };

    const opp = await conn.sobject('Opportunity').create(oppBody);
    if (!opp.success) throw new Error('Gagal membuat Opportunity');

    return res.status(200).json({ success: true, accountId, opportunityId: opp.id });

  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({ message: 'Gagal membuat Opportunity', error: error.message });
  }
};
