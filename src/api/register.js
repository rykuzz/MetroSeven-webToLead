
const { getConn } = require('./_sf');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Gunakan POST method' });
  }

  try {
    const b = req.body || {};
    const conn = await getConn();
    const existing = await conn.query(
      `SELECT Id FROM Account WHERE PersonEmail = '${b.email}' AND IsPersonAccount = true LIMIT 1`
    );

    let accountId;
    if (existing.records.length > 0) {
      accountId = existing.records[0].Id;
      await conn.sobject('Account').update({
        Id: accountId,
        FirstName: b.firstName || '',
        LastName: b.lastName || '-',
        PersonEmail: b.email,
        PersonMobilePhone: b.phone || null
      });
    } else {

      const acc = await conn.sobject('Account').create({
        RecordTypeId: b.recordTypeId || null, 
        FirstName: b.firstName || '',
        LastName: b.lastName || '-',
        PersonEmail: b.email,
        PersonMobilePhone: b.phone || null,
        IsPersonAccount: true
      });
      if (!acc.success) throw new Error('Gagal membuat Person Account');
      accountId = acc.id;
    }

    const closeDate = new Date(); closeDate.setDate(closeDate.getDate() + 30);
    const opp = await conn.sobject('Opportunity').create({
      Name: `REG - ${b.lastName || 'Applicant'} - ${b.studyProgramName || 'Program'}`,
      StageName: 'Prospecting',
      CloseDate: closeDate.toISOString().slice(0,10),
      AccountId: accountId,
      Study_Program__c: b.studyProgramId || null,
      Campus__c: b.campusId || null,
      Master_Intake__c: b.masterIntakeId || null,
      Graduation_Year__c: b.graduationYear || null,
      School_Name__c: b.schoolName || null,
      LeadSource: 'Metro Seven LP',
      CampaignId: b.campaignId || null
    });
    if (!opp.success) throw new Error('Gagal membuat Opportunity');

    res.status(200).json({
      success: true,
      accountId,
      opportunityId: opp.id
    });

  } catch (error) {
    console.error('Register Error:', error);
    res.status(500).json({ message: 'Gagal membuat Opportunity', error: error.message });
  }
};
