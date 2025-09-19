// Simpan data sekolah (Account) + tahun lulus (Opportunity).
// Jika pilih dari master: isi Account.Master_School__c saja.
// Jika manual: isi Account.Draft_Sekolah__c & Account.Draft_NPSN__c saja.

const jsforce = require('jsforce');

const ok = (res, data) => res.status(200).json({ success: true, ...data });
const fail = (res, code, message, extra = {}) =>
  res.status(code).json({ success: false, message, ...extra });

async function login(env) {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = env;
  if (!SF_LOGIN_URL || !SF_USERNAME || !SF_PASSWORD) {
    throw new Error('ENV Salesforce belum lengkap (SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD)');
  }
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
  await conn.login(SF_USERNAME, SF_PASSWORD);
  return conn;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const env = {
    SF_LOGIN_URL: process.env.SF_LOGIN_URL,
    SF_USERNAME : process.env.SF_USERNAME,
    SF_PASSWORD : process.env.SF_PASSWORD,
  };

  try {
    const {
      opportunityId,
      accountId,
      graduationYear,      // string/number
      masterSchoolId,      // optional
      draftSchool,         // optional (manual)
      draftNpsn,           // optional (manual)
    } = req.body || {};

    if (!opportunityId || !accountId) {
      return fail(res, 400, 'Param kurang (opportunityId, accountId)');
    }
    if (!graduationYear) {
      return fail(res, 400, 'graduationYear wajib diisi');
    }
    if (!masterSchoolId && !draftSchool) {
      return fail(res, 400, 'Isi sekolah (pilih master atau isi manual)');
    }

    const conn = await login(env);

    // 1) Opportunity
    const grad = parseInt(String(graduationYear), 10);
    await conn.sobject('Opportunity').update({
      Id: opportunityId,
      Graduation_Year__c: isNaN(grad) ? null : grad,
    });

    // 2) Account
    const accUpdate = { Id: accountId };
    if (masterSchoolId) {
      accUpdate.Master_School__c = masterSchoolId;
    } else {
      accUpdate.Draft_Sekolah__c = draftSchool || null;
      accUpdate.Draft_NPSN__c    = draftNpsn   || null;
    }

    try {
      await conn.sobject('Account').update(accUpdate);
    } catch (e) {
      const msg = String(e && e.message || e);
      if (!masterSchoolId && /No such column.*Draft_/i.test(msg)) {
        return fail(res, 400, 'Field draft (Draft_Sekolah__c / Draft_NPSN__c) belum tersedia di Account. Pilih sekolah dari daftar atau buat field tersebut.');
      }
      throw e;
    }

    return ok(res, {});
  } catch (err) {
    return fail(res, 500, err.message || 'Gagal menyimpan data sekolah');
  }
};
