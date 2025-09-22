// /api/promo-image.js
const jsforce = require('jsforce');

const MIME = { PNG:'image/png', JPG:'image/jpeg', JPEG:'image/jpeg', GIF:'image/gif', WEBP:'image/webp', PDF:'application/pdf' };
const esc = v => String(v||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const now = () => new Date().toISOString().slice(0,19).replace('T',' ');

async function getLatestVersionIdByDoc(conn, docId){
  const q = await conn.query(
    `SELECT Id FROM ContentVersion
     WHERE ContentDocumentId='${esc(docId)}'
     ORDER BY VersionNumber DESC LIMIT 1`
  );
  return q.records?.[0]?.Id || null;
}
async function getOrCreateDistributionUrl(conn, versionId){
  const q = await conn.query(
    `SELECT Id, DistributionPublicUrl, ContentDownloadUrl
     FROM ContentDistribution
     WHERE ContentVersionId='${esc(versionId)}'
     ORDER BY LastModifiedDate DESC LIMIT 1`
  );
  let dist = q.records?.[0];
  if (!dist){
    const ins = await conn.sobject('ContentDistribution').create({
      Name: `Promo Public Link ${now()}`,
      ContentVersionId: versionId,
      PreferencesAllowViewInBrowser: true,
      PreferencesAllowOriginalDownload: false,
      PreferencesPasswordRequired: false,
      PreferencesNotifyOnVisit: false,
      PreferencesLinkLatestVersion: true,
    });
    if (!ins.success) throw new Error(ins.errors?.join(', ') || 'Failed to create ContentDistribution');
    dist = await conn.sobject('ContentDistribution').retrieve(ins.id);
  }
  const url = dist.DistributionPublicUrl || dist.ContentDownloadUrl;
  if (!url) throw new Error('Public URL not available.');
  return url;
}
async function getLatestVersionIdByCampaign(conn, campaignId){
  // Prioritas Files
  const qDoc = await conn.query(
    `SELECT ContentDocumentId
     FROM ContentDocumentLink
     WHERE LinkedEntityId='${esc(campaignId)}' AND ShareType IN ('V','I')
     ORDER BY SystemModstamp DESC LIMIT 1`
  );
  const docId = qDoc.records?.[0]?.ContentDocumentId;
  if (docId){
    const vId = await getLatestVersionIdByDoc(conn, docId);
    if (vId) return vId;
  }
  // Fallback Attachment → convert ke File
  const qAtt = await conn.query(
    `SELECT Id, Name, Body FROM Attachment
     WHERE ParentId='${esc(campaignId)}'
     ORDER BY LastModifiedDate DESC LIMIT 1`
  );
  const att = qAtt.records?.[0];
  if (!att) return null;

  const bodyBuf = await conn.request({ url: att.Body, encoding: null });
  const base64 = Buffer.from(bodyBuf).toString('base64');
  const title = (att.Name||'promo').replace(/\.[^.]+$/,'');
  const ext = (att.Name||'').split('.').pop() || 'png';
  const cv = await conn.sobject('ContentVersion').create({
    Title: title, PathOnClient: `${title}.${ext}`,
    VersionData: base64, FirstPublishLocationId: campaignId,
  });
  if (!cv.success) throw new Error(cv.errors?.join(', ') || 'Failed to create ContentVersion from Attachment');
  return cv.id;
}

module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const { campaignId, versionId, docId, format } = req.query || {};
  if (!campaignId && !versionId && !docId) return res.status(400).send('Missing campaignId / versionId / docId');

  try {
    const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
    await conn.login(SF_USERNAME, SF_PASSWORD);

    let vId = versionId || null;
    if (!vId && docId) vId = await getLatestVersionIdByDoc(conn, docId);
    if (!vId && campaignId) vId = await getLatestVersionIdByCampaign(conn, campaignId);
    if (!vId) return res.status(404).json({ success:false, message:'No image found for this Campaign' });

    const publicUrl = await getOrCreateDistributionUrl(conn, vId);

    // optional: simpan ke field Campaign kalau ada
    try { if (campaignId) await conn.sobject('Campaign').update({ Id: campaignId, Promo_Image_URL__c: publicUrl }); } catch {}

    if (format === 'url' || (req.headers.accept||'').includes('application/json')) {
      return res.status(200).json({
        success: true,
        url: publicUrl,
        meta: { versionId: vId }
      });
    }

    res.statusCode = 302;
    res.setHeader('Location', publicUrl);
    res.end();
  } catch (e) {
    console.error('[promo-image] error:', e);
    res.status(500).json({ success:false, message: e.message || 'Failed to fetch promo image' });
  }
};
