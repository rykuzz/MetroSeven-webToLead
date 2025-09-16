const jsforce = require('jsforce');

// GANTI dengan API name field teks di Account untuk menyimpan nama sekolah:
const SCHOOL_ACCOUNT_FIELD = 'Master_School__c'; // <-- TODO: sesuaikan

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Gunakan POST' });
  }

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);
    const b = req.body || {};

    // 1) Ambil RecordType "Person" untuk Account (tanpa hard-code ID)
    const rt = await conn.query(`
      SELECT Id, Name, IsPersonType, IsDefault
      FROM RecordType
      WHERE SobjectType = 'Account' AND IsPersonType = true
      ORDER BY IsDefault DESC, CreatedDate ASC
      LIMIT 1
    `);
    const personRtId = rt.records?.[0]?.Id;
    if (!personRtId) {
      return res.status(500).json({
        success: false,
        message: 'Tidak ada Record Type bertipe Person untuk Account pada user integrasi.'
      });
    }

    // 2) Find or Create Person Account by PersonEmail (TANPA set IsPersonAccount)
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
          PersonMobilePhone: b.phone || null,
          ...(b.schoolName ? { [SCHOOL_ACCOUNT_FIELD]: b.schoolName } : {})
        });
      }
    }

    if (!accountId) {
      const acc = await conn.sobject('Account').create({
        RecordTypeId: personRtId,          // → otomatis Person Account
        FirstName: b.firstName || '',
        LastName : b.lastName  || '-',
        PersonEmail: b.email,
        PersonMobilePhone: b.phone || null,
        ...(b.schoolName ? { [SCHOOL_ACCOUNT_FIELD]: b.schoolName } : {})
      });
      if (!acc.success) throw new Error(acc.errors?.join(', ') || 'Gagal membuat Person Account');
      accountId = acc.id;
    }

    // 3) Buat Opportunity (TANPA School_Name__c; sekolah sudah di Account)
    const closeDate = new Date(); closeDate.setDate(closeDate.getDate() + 30);
    const opp = await conn.sobject('Opportunity').create({
      Name: `REG - ${b.lastName || 'Applicant'} - ${b.studyProgramName || 'Program'}`,
      StageName: 'Prospecting',
      CloseDate: closeDate.toISOString().slice(0, 10),
      AccountId: accountId,
      Study_Program__c: b.studyProgramId || null,
      Campus__c: b.campusId || null,
      Master_Intake__c: b.masterIntakeId || null, // "Tahun Ajaran"
      Graduation_Year__c: b.graduationYear || null,
      LeadSource: 'Metro Seven LP',
      CampaignId: b.campaignId || null
    });
    if (!opp.success) throw new Error(opp.errors?.join(', ') || 'Gagal membuat Opportunity');

    return res.status(200).json({ success: true, accountId, opportunityId: opp.id });

  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
