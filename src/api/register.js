const jsforce = require('jsforce');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Gunakan POST' });
  }

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);
    const b = req.body || {};

    // -------------------------------------------------
    // 1) Pilih RecordType PERSON ACCOUNT via describe()
    //    -> ambil RT yang "available" untuk user integrasi
    // -------------------------------------------------
    const desc = await conn.sobject('Account').describe();
    const rts = (desc.recordTypeInfos || []).filter(rt => rt.available);
    if (!rts.length) {
      return res.status(500).json({
        success: false,
        message: 'User integrasi tidak punya Record Type Account yang available. Setidaknya 1 Person Account RT harus available.'
      });
    }
    // Opsional: b.accountType = "school" | "university"
    const want = String(b.accountType || '').toLowerCase();
    let chosen = null;
    const match = needle => rts.find(rt =>
      (rt.developerName || '').toLowerCase().includes(needle) ||
      (rt.name || '').toLowerCase().includes(needle)
    );
    if (want) chosen = match(want);
    if (!chosen) chosen = match('university') || match('school') || rts[0];
    const personRtId = chosen.recordTypeId; // <-- dipakai saat create

    // -------------------------------------------------
    // 2) Find-or-create Person Account by email
    //    (JANGAN set IsPersonAccount; otomatis karena RT Person)
    // -------------------------------------------------
    let accountId = null;

    if (b.email) {
      const emailEsc = String(b.email).replace(/'/g, "\\'");
      const q = await conn.query(`
        SELECT Id FROM Account
        WHERE IsPersonAccount = true AND PersonEmail = '${emailEsc}' LIMIT 1
      `);
      if (q.records.length) {
        accountId = q.records[0].Id;
        const upd = {
          Id: accountId,
          FirstName: b.firstName || '',
          LastName : b.lastName  || '-',
          PersonEmail: b.email,
          PersonMobilePhone: b.phone || null
        };
        // set sekolah ke lookup MasterSchool__c kalau ada Id dari frontend
        if (b.schoolId) upd.Master_School__c = b.schoolId;
        await conn.sobject('Account').update(upd);
      }
    }

    if (!accountId) {
      const acc = await conn.sobject('Account').create({
        RecordTypeId: personRtId,          // → otomatis Person Account
        FirstName: b.firstName || '',
        LastName : b.lastName  || '-',
        PersonEmail: b.email,
        PersonMobilePhone: b.phone || null,
        ...(b.schoolId ? { MasterSchool__c: b.schoolId } : {}) // simpan sekolah (lookup)
      });
      if (!acc.success) throw new Error(acc.errors?.join(', ') || 'Gagal membuat Person Account');
      accountId = acc.id;
    }

    // -------------------------------------------------
    // 3) Create Opportunity (tanpa field sekolah; sekolah ada di Account)
    // -------------------------------------------------
    const closeDate = new Date(); closeDate.setDate(closeDate.getDate() + 30);
    const opp = await conn.sobject('Opportunity').create({
      Name: `REG - ${b.lastName || 'Applicant'} - ${b.studyProgramName || 'Program'}`,
      StageName: 'Prospecting',
      CloseDate: closeDate.toISOString().slice(0, 10),
      AccountId: accountId,
      Study_Program__c: b.studyProgramId || null,
      Campus__c: b.campusId || null,
      Master_Intake__c: b.masterIntakeId || null,
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
