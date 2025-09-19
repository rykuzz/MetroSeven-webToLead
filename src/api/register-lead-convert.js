// cek Lead by Email+Phone; jika ada → set Is_Convert__c=true (Apex handle convert)
// jika tidak ada → enforce single Account (duplicate validation di org) dan buat Opp University (Booking Form)
const jsforce = require('jsforce');

function digits(s){ return String(s||'').replace(/\D/g,''); }
function normalizePhone(raw){ let p=digits(raw||''); if(!p) return null; if(p.startsWith('0')) p=p.slice(1); if(!p.startsWith('62')) p='62'+p; return '+'+p; }
function esc(v){ return String(v||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Method not allowed' });
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    const { firstName, lastName, email, phone } = req.body || {};
    if(!firstName || !lastName || !email || !phone) throw new Error('Data tidak lengkap');
    await conn.login(SF_USERNAME, SF_PASSWORD);

    // 1) cari lead
    const phoneDigits = digits(normalizePhone(phone));
    const p1 = `%+${phoneDigits}%`;
    const p2 = `%${phoneDigits.startsWith('62') ? phoneDigits.slice(2) : phoneDigits}%`;
    const soqlLead =
      "SELECT Id, ConvertedOpportunityId FROM Lead " +
      "WHERE Email = '" + esc(email.toLowerCase()) + "' " +
      "AND (Phone LIKE '" + esc(p1) + "' OR Phone LIKE '" + esc(p2) + "') " +
      "ORDER BY CreatedDate DESC LIMIT 1";
    const leadRes = await conn.query(soqlLead);
    const lead = (leadRes.records||[])[0];

    if (lead) {
      await conn.sobject('Lead').update({ Id: lead.Id, Is_Convert__c: true }, { headers:{'Sforce-Duplicate-Rule-Header':'allowSave=true'} });
      if (lead.ConvertedOpportunityId) {
        const opp = await conn.sobject('Opportunity').retrieve(lead.ConvertedOpportunityId);
        return res.status(200).json({ success:true, opportunityId: opp.Id, accountId: opp.AccountId });
      }
      // kalau Apex convert async, fallback: buat Opp baru di Account hasil duplicate-rule (atau existing)
    }

    // 2) pakai Account yang sudah ada (duplicate rule di org) atau create bila perlu
    async function getPersonRT(){ const r=await conn.query("SELECT Id FROM RecordType WHERE SobjectType='Account' AND IsPersonType=true LIMIT 1"); return r.records?.[0]?.Id||null; }
    async function getOppUniversityRT(){ const r=await conn.query("SELECT Id FROM RecordType WHERE SobjectType='Opportunity' AND Name='University' LIMIT 1"); return r.records?.[0]?.Id||null; }

    // coba temukan account by email/phone
    const soqlAcc =
      "SELECT Id FROM Account WHERE IsPersonAccount = true AND (" +
      "PersonEmail = '" + esc(email.toLowerCase()) + "' " +
      "OR PersonMobilePhone LIKE '" + esc(p1) + "' OR PersonMobilePhone LIKE '" + esc(p2) + "'" +
      ") ORDER BY CreatedDate DESC LIMIT 1";
    const accQ = await conn.query(soqlAcc);
    let accountId = accQ.records?.[0]?.Id;

    if (!accountId) {
      const accIns = await conn.sobject('Account').create({
        RecordTypeId: await getPersonRT() || undefined,
        LastName: lastName,
        FirstName: firstName,
        PersonEmail: email.toLowerCase(),
        PersonMobilePhone: normalizePhone(phone)
      }, { headers:{'Sforce-Duplicate-Rule-Header':'allowSave=true'} });
      if (!accIns.success) throw new Error(accIns.errors?.join(', ') || 'Gagal membuat Account');
      accountId = accIns.id;
    }

    const closeDate = new Date(); closeDate.setDate(closeDate.getDate()+30);
    const oppIns = await conn.sobject('Opportunity').create({
      RecordTypeId: await getOppUniversityRT() || undefined,
      AccountId: accountId,
      Name: `${firstName} ${lastName}/REG`,
      StageName: 'Booking Form',
      CloseDate: closeDate.toISOString().slice(0,10)
    }, { headers:{'Sforce-Duplicate-Rule-Header':'allowSave=true'} });
    if(!oppIns.success) throw new Error(oppIns.errors?.join(', ') || 'Gagal membuat Opportunity');

    res.status(200).json({ success:true, opportunityId: oppIns.id, accountId });
  } catch (err) {
    console.error('register-lead-convert ERR:', err);
    res.status(500).json({ success:false, message: err.message || 'Gagal memproses' });
  }
};
