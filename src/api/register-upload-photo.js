// Upload pas foto ke ContentVersion, lalu buat record Account_Document__c (Document_Type__c='Pas Foto')
// dan simpan link download ke Document_Link__c
const jsforce = require('jsforce');
const MAX_SIZE = 1024 * 1024;
const ALLOWED = ['image/png','image/jpeg'];

function ymd(){ return new Date().toISOString().slice(0,10).replace(/-/g,''); }

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Method not allowed' });
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;

  try {
    const ctype=req.headers['content-type']||''; if(!ctype.includes('application/json')) return res.status(400).json({ success:false, message:'Unsupported Content-Type' });
    const body = await new Promise((resolve,reject)=>{ let raw=''; req.on('data',c=>raw+=c); req.on('end',()=>{ try{ resolve(JSON.parse(raw||'{}')); }catch(e){ reject(e);} }); });
    const oppId=body.opportunityId, accId=body.accountId, filename=body.filename||'pasfoto.jpg', mime=body.mime||'image/jpeg', base64=body.data;
    if(!oppId||!accId||!filename||!base64) throw new Error('Data tidak lengkap (JSON)');

    const size=Buffer.from(base64,'base64').length; if(size>MAX_SIZE) throw new Error('Ukuran file maksimal 1MB');
    if(mime && !ALLOWED.includes(mime)) throw new Error('Format file harus PNG/JPG');

    const conn=new jsforce.Connection({ loginUrl:SF_LOGIN_URL }); await conn.login(SF_USERNAME,SF_PASSWORD);

    // Ambil nama account untuk pola nama
    const acc = await conn.sobject('Account').retrieve(accId);
    const title = `PasFoto-${(acc.Name||'Account').replace(/[^\w\- ]/g,'').slice(0,60)}-${ymd()}`;
    const ext = (filename.split('.').pop()|| (mime==='image/png'?'png':'jpg')).toLowerCase();

    // Upload ke ContentVersion dan publish ke Opportunity
    const cv=await conn.sobject('ContentVersion').create({ Title:title, PathOnClient:`${title}.${ext}`, VersionData:base64, FirstPublishLocationId:oppId });
    if(!cv.success) throw new Error(cv.errors?.join(', ') || 'Gagal upload pas foto');

    // Ambil ContentDocumentId untuk link
    const q=await conn.query(`SELECT ContentDocumentId FROM ContentVersion WHERE Id='${cv.id}' LIMIT 1`);
    const docId=q.records?.[0]?.ContentDocumentId;

    // Buat Account_Document__c
    let link = docId ? `/sfc/servlet.shepherd/document/download/${docId}` : null;
    const ad = await conn.sobject('Account_Document__c').create({
      Account__c: accId,
      Name: title,
      Document_Type__c: 'Pas Foto',
      Document_Link__c: link,
      Application_Progress__c: null, // opsional
      Verified__c: false
    });
    if(!ad.success) throw new Error(ad.errors?.join(', ') || 'Gagal membuat Account Document');

    res.status(200).json({ success:true, contentVersionId: cv.id, accountDocumentId: ad.id, link });
  } catch (err) {
    console.error('register-upload-photo ERR:', err);
    res.status(500).json({ success:false, message: err.message || 'Upload pas foto gagal' });
  }
};
