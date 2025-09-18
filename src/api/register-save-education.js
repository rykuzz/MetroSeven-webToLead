const jsforce = require('jsforce');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Method not allowed' });

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    const { opportunityId, accountId, masterSchoolId, schoolName, graduationYear } = req.body || {};
    if (!opportunityId || !accountId || !schoolName || !graduationYear) throw new Error('Data tidak lengkap');

    await conn.login(SF_USERNAME, SF_PASSWORD);

    const accUpd = { Id: accountId };
    if (masterSchoolId) accUpd.Master_School__c = masterSchoolId; else accUpd.OtherSchool__c = schoolName;
    await conn.sobject('Account').update(accUpd);

    await conn.sobject('Opportunity').update({ Id: opportunityId, Graduation_Year__c: graduationYear });

    return res.status(200).json({ success:true });
  } catch (err) {
    console.error('register-save-education ERR:', err);
    return res.status(500).json({ success:false, message: err.message || 'Gagal menyimpan data pendidikan' });
  }
};
