// api/register-lead-convert.js
const jsforce = require('jsforce');

function digits(s){ return String(s||'').replace(/\D/g,''); }
function normalizePhone(raw){
  let p = digits(raw||''); if(!p) return null;
  if(p.startsWith('0')) p = p.slice(1);
  if(!p.startsWith('62')) p = '62'+p;
  return '+'+p;
}

// Fallback RT ID (kamu kirim): University
const OPP_RT_UNIVERSITY_FALLBACK = '012gL000002NZITQA4';

async function getOppUniversityRT(conn) {
  const r = await conn.query(
    "SELECT Id, Name FROM RecordType WHERE SobjectType='Opportunity' AND Name='University' LIMIT 1"
  );
  return r.records?.[0]?.Id || null;
}

async function getPersonAccountRT(conn) {
  const r = await conn.query(
    "SELECT Id FROM RecordType WHERE SobjectType='Account' AND IsPersonType=true LIMIT 1"
  );
  return r.records?.[0]?.Id || null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Method not allowed' });

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    const { firstName, lastName, email, phone } = req.body || {};
    if(!firstName || !lastName || !email || !phone) throw new Error('Data tidak lengkap');

    await conn.login(SF_USERNAME, SF_PASSWORD);

    // Cari Lead dengan Email AND Phone
    const phoneDigits = digits(normalizePhone(phone));
    const soqlLead = `
      SELECT Id, Email, Phone, Is_Convert__c, ConvertedOpportunityId
      FROM Lead
      WHERE Email = :email AND (Phone LIKE :p1 OR Phone LIKE :p2)
      ORDER BY CreatedDate DESC
      LIMIT 1
    `;
    const p1 = '%+' + phoneDigits + '%';
    const p2 = '%' + (phoneDigits.startsWith('62') ? phoneDigits.slice(2) : phoneDigits) + '%';
    const leadRes = await conn.query(soqlLead, { email: email.toLowerCase(), p1, p2 });
    const lead = leadRes.records?.[0];

    if (lead) {
      // Tandai agar Apex melakukan auto-convert
      await conn.sobject('Lead').update(
        { Id: lead.Id, Is_Convert__c: true },
        { headers: { 'Sforce-Duplicate-Rule-Header': 'allowSave=true' } }
      );

      if (lead.ConvertedOpportunityId) {
        const opp = await conn.sobject('Opportunity').retrieve(lead.ConvertedOpportunityId);
        return res.status(200).json({ success:true, opportunityId: opp.Id, accountId: opp.AccountId });
      }
      return res.status(200).json({ success:true, message:'Lead ditandai untuk konversi' });
    }

    // Tidak ada lead → buat Person Account + Opportunity (RT University)
    const personRT = await getPersonAccountRT(conn);
    const oppRT    = (await getOppUniversityRT(conn)) || OPP_RT_UNIVERSITY_FALLBACK;

    const accIns = {
      RecordTypeId: personRT || undefined,
      LastName: lastName,
      FirstName: firstName,
      PersonEmail: email.toLowerCase(),
      PersonMobilePhone: normalizePhone(phone)
    };
    const acc = await conn.sobject('Account').create(accIns);
    if(!acc.success) throw new Error(acc.errors?.join(', ') || 'Gagal membuat Account');

    const closeDate = new Date(); closeDate.setDate(closeDate.getDate()+30);
    const oppIns = {
      RecordTypeId: oppRT, // ← dipastikan University by Name, fallback ID ini
      AccountId: acc.id,
      Name: `${firstName} ${lastName}/REG`,
      StageName: 'Booking Form',
      CloseDate: closeDate.toISOString().slice(0,10)
    };
    const opp = await conn.sobject('Opportunity').create(
      oppIns,
      { headers: { 'Sforce-Duplicate-Rule-Header': 'allowSave=true' } }
    );
    if(!opp.success) throw new Error(opp.errors?.join(', ') || 'Gagal membuat Opportunity');

    return res.status(200).json({ success:true, opportunityId: opp.id, accountId: acc.id });
  } catch (err) {
    console.error('register-lead-convert ERR:', err);
    return res.status(500).json({ success:false, message: err.message || 'Gagal memproses' });
  }
};
