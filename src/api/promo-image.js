// /api/promo-image.js
const jsforce = require('jsforce');

const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\'/g, "\\'");
const now = () => new Date().toISOString().slice(0,19).replace('T',' ');

async function latestVersionIdByDoc(conn, docId) {
  const q = await conn.query(
    `SELECT Id
     FROM ContentVersion
     WHERE ContentDocumentId='${esc(docId)}'
     ORDER BY VersionNumber DESC
     LIMIT 1`
  );
  return q.records?.[0]?.Id || null;
}

async function getOrCreatePublicUrl(conn, versionId) {
  const q = await conn.query(
    `SELECT Id, DistributionPublicUrl, ContentDownloadUrl
     FROM ContentDistribution
     WHERE ContentVersionId='${esc(versionId)}'
     ORDER BY LastModifiedDate DESC
     LIMIT 1`
  );
  let dist = q.records?.[0];

  if (!dist) {
    const ins = await conn.sobject('ContentDistribution').create({
      Name: `Promo Public Link ${now()}`,
      ContentVersionId: versionId,
      PreferencesAllowViewInBrowser: true,
      PreferencesAllowOriginalDownload: false,
      PreferencesPasswordRequired: false,
      PreferencesNotifyOnVisit: false,
      PreferencesLinkLatestVersion: true,
    });
    if (!ins.success) throw new Error('Failed to create ContentDistribution');
    dist = await conn.sobject('ContentDistribution').retrieve(ins.id);
  }

  // Prioritaskan URL yang bisa langsung dipakai <img>
  const url = dist.ContentDownloadUrl || dist.DistributionPublicUrl;
  if (!url) throw new Error('Public URL not available (check Files public link setting)');
  return url;
}

// Cari file yg nyangkut ke Campaign (Files > ContentDocumentLink).
// Jika tidak ada, fallback Attachment -> convert jadi File.
async function latestVersionIdByCampaign(conn, campaignId) {
  const qDoc = await conn.query(
    `SELECT ContentDocumentId
     FROM ContentDocumentLink
     WHERE LinkedEntityId='${esc(campaignId)}'
       AND ShareType IN ('V','I')
     ORDER BY SystemModstamp DESC
     LIMIT 1`
  );
  const docId = qDoc.records?.[0]?.ContentDocumentId;
  if (docId) {
    const v = await latestVersionIdByDoc(conn, docId);
    if (v) return v;
  }

  // Fallback: Attachment lama
  const qAtt = await conn.query(
    `SELECT Id, Name, Body
     FROM Attachment
     WHERE ParentId='${esc(campaignId)}'
     ORDER BY LastModifiedDate DESC
     LIMIT 1`
  );
  const att = qAtt.records?.[0];
  if (!att) return null;

  const buf = await conn.request({ url: att.Body, encoding: null });
  const base64 = Buffer.from(buf).toString('base64');
  const title = (att.Name || 'promo').replace(/\.[^.]+$/,'');
  const ext   = (att.Name || 'png').split('.').pop();

  const cv = await conn.sobject('ContentVersion').create({
    Title: title,
    PathOnClient: `${title}.${ext}`,
    VersionData: base64,
    FirstPublishLocationId: campaignId,
  });
  if (!cv.success) throw new Error('Failed to create ContentVersion from Attachment');
  return cv.id;
}

module.exports = async (req, res) => {
  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const { campaignId, docId, versionId, format } = req.query || {};

  if (!campaignId && !docId && !versionId) {
    return res.status(400).json({ success:false, message:'Missing campaignId/docId/versionId' });
  }

  try {
    const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
    await conn.login(SF_USERNAME, SF_PASSWORD);

    let vId = versionId || null;
    if (!vId && docId)     vId = await latestVersionIdByDoc(conn, docId);
    if (!vId && campaignId) vId = await latestVersionIdByCampaign(conn, campaignId);
    if (!vId) return res.status(404).json({ success:false, message:'No image found for this Campaign' });

    const publicUrl = await getOrCreatePublicUrl(conn, vId);

    // opsional: simpan balik ke Campaign supaya FE bisa langsung pakai next time
    if (campaignId) {
      try { await conn.sobject('Campaign').update({ Id: campaignId, Promo_Image_URL__c: publicUrl }); } catch(e) {}
    }

    if (format === 'url' || (req.headers.accept||'').includes('application/json')) {
      return res.status(200).json({ success:true, url: publicUrl, meta:{ versionId: vId } });
    }

    // default redirect — bisa dipakai langsung juga di <img src="/api/promo-image?...">
    res.statusCode = 302;
    res.setHeader('Location', publicUrl);
    res.end();
  } catch (e) {
    console.error('[promo-image] err', e);
    res.status(500).json({ success:false, message: e.message || 'Failed' });
  }
};
