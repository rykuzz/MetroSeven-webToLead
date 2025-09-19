// Upload bukti pembayaran ke Opportunity + set Amount=300000, Is_Booking_Fee_Paid__c=true, Stage → Form Payment
const jsforce = require('jsforce');
const MAX_SIZE = 1024 * 1024;
const ALLOWED = ['image/png','image/jpeg','application/pdf'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Method not allowed' });
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;

  try {
    const ctype=req.headers['content-type']||''; if(!ctype.includes('application/json')) return res.status(400).json({ success:false, message:'Unsupported Content-Type' });
    const body = await new Promise((resolve,reject)=>{ let raw=''; req.on('data',c=>raw+=c); req.on('end',()=>{ try{ resolve(JSON.parse(raw||'{}')); }catch(e){ reject(e);} }); });
    const oppId=body.opportunityId, accId=body.accountId, filename=body.filename||'bukti.jpg', mime=body.mime||'image/jpeg', base64=body.data;
    if(!oppId||!accId||!filename||!base64) throw new Error('Data tidak lengkap');

    const size=Buffer.from(base64,'base64').length; if(size>MAX_SIZE) throw new Error('Ukuran file maksimal 1MB');
    if(mime && !ALLOWED.includes(mime)) throw new Error('Format file harus PDF/PNG/JPG');

    const conn=new jsforce.Connection({ loginUrl:SF_LOGIN_URL }); await conn.login(SF_USERNAME,SF_PASSWORD);

    const title=`BuktiPembayaran-${oppId}-${new Date().toISOString().slice(0,10)}`;
    const ext = (filename.split('.').pop()||'jpg').toLowerCase();
    const cv=await conn.sobject('ContentVersion').create({ Title:title, PathOnClient:`${title}.${ext}`, VersionData:base64, FirstPublishLocationId:oppId });
    if(!cv.success) throw new Error(cv.errors?.join(', ') || 'Gagal upload bukti');

    // Update Opportunity flag & amount & stage
    await conn.sobject('Opportunity').update({ Id: oppId, Is_Booking_Fee_Paid__c: true, Amount: 300000, StageName: 'Form Payment' });

    res.status(200).json({ success:true, contentVersionId: cv.id });
  } catch (err) {
    console.error('register-upload-proof ERR:', err);
    res.status(500).json({ success:false, message: err.message || 'Upload bukti gagal' });
  }
};
