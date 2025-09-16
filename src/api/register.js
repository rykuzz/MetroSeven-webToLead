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
    // 1) Ambil RecordType yang AVAILABLE untuk Account,
    //    lalu pilih yang namanya mengandung "university" atau "school"
    //    (ini Person Account RT milikmu).
    // -------------------------------------------------
    const desc = await conn.sobject('Account').describe();
    const rts = (desc.recordTypeInfos || []).filter(rt => rt.available);

    const pickByName = (needle) =>
      rts.find(rt =>
        (rt.name || '').toLowerCase().includes(needle) ||
        (rt.developerName || '').toLowerCase().includes(needle)
      );

    // Kamu bisa mengirim b.accountType = "university" | "school" dari frontend.
    const want = String(b.accountType || '').toLowerCase();
    let chosen =
      (want && pickByName(want)) ||
      pickByName('university') ||
      pickByName('school');

    if (!chosen) {
      // Hindari pakai RT lain (berisiko Business). Lebih baik gagal dengan pesan jelas.
      const available = rts.map(rt => rt.name).join(', ');
      return res.status(500).json({
        success: false,
        message:
          `Record Type Person (University/School) tidak ditemukan/available untuk user integrasi. ` +
          `Record Type available: ${available}`
      });
    }

    const personRtId = chosen.recordTypeId;

    // -------------------------------------------------
    // 2) Find-or-create Person Account by email
    //    (JANGAN set IsPersonAccount; otomatis karena pakai Person RT)
    //    Simpan lookup sekolah ke MasterSchool__c.
    // -------------------------------------------------
    let accountId = null;

    if (b.email) {
      const emailEsc = String(b.email).replace(/'/g, "\\'");
      const q = await conn.query(`
        SELECT Id FROM Account
        WHERE IsPersonAccount = true AND PersonEmail = '${emailEsc}'
        LIMIT 1
      `);
      if (q.records.length) {
        accountId = q.records[0].Id;
        const upd = {
          Id: accountId,
          FirstName: b.firstName || '',
          LastName : b.lastName  || '-',
          PersonEmail: b.email,
          PersonMobilePhone: b.phone || null,
          ...(b.schoolId ? { Master_School__c: b.schoolId } : {})
        };
        await conn.sobject('Account').update(upd);
      }
    }

    if (!accountId) {
      const acc = await conn.sobject('Account').create({
        RecordTypeId: personRtId,      // → otomatis Person Account
        FirstName: b.firstName || '',
        LastName : b.lastName  || '-',
        PersonEmail: b.email,
        PersonMobilePhone: b.phone || null,
        ...(b.schoolId ? { MasterSchool__c: b.schoolId } : {})
      });
      if (!acc.success) throw new Error(acc.errors?.join(', ') || 'Gagal membuat Person Account');
      accountId = acc.id;
    }

    // -------------------------------------------------
    // 3) Create Opportunity (sekolah sudah di Account)
    // -------------------------------------------------
    const closeDate = new Date(); closeDate.setDate(closeDate.getDate() + 30);
    const opp = await conn.sobject('Opportunity').create({
      Name: `REG - ${b.lastName || 'Applicant'} - ${b.studyProgramName || 'Program'}`,
      StageName: 'Prospecting',
      CloseDate: closeDate.toISOString().slice(0, 10),
      AccountId: accountId,
      Study_Program__c: b.studyProgramId || null,
      Campus__c: b.campusId || null,
      Master_Intake__c: b.masterIntakeId || null,   // Tahun Ajaran
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
