// /api/promo-image-batch.js
const jsforce = require('jsforce');
const esc = v => String(v||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const now = () => new Date().toISOString().slice(0,19).replace('T',' ');

async function getLatestVersionIdByCampaign(conn, campaignId){
  const qDoc = await conn.query(
    `SELECT ContentDocumentId
     FROM ContentDocumentLink
     WHERE LinkedEntityId='${esc(campaignId)}' AND ShareType IN ('V','I')
     ORDER BY SystemModstamp DESC LIMIT 1`
  );
  const docId = qDoc.records?.[0]?.ContentDocumentId;
  if (docId){
    const qv = await conn.query(
      `SELECT Id FROM ContentVersion
       WHERE ContentDocumentId='${esc(docId)}'
       ORDER BY VersionNumber DESC LIMIT 1`
    );
    return qv.records?.[0]?.Id || null;
  }
  // bisa tambahkan fallback Attachment → File kalau mau (sama seperti single)
  return null;
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
    if (!ins.success) throw new Error(ins.errors?.join(', ') || 'Create ContentDistribution failed');
    dist = await conn.sobject('ContentDistribution').retrieve(ins.id);
  }
  return dist.DistributionPublicUrl || dist.ContentDownloadUrl || null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Use POST' });

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const { campaignIds } = req.body || {};
  if (!Array.isArray(campaignIds) || !campaignIds.length) {
    return res.status(400).json({ success:false, message:'campaignIds must be an array' });
  }

  try {
    const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const results = {};
    for (const id of campaignIds) {
      try {
        const vId = await getLatestVersionIdByCampaign(conn, id);
        if (!vId) { results[id] = null; continue; }
        const url = await getOrCreateDistributionUrl(conn, vId);
        results[id] = url || null;
      } catch (e) {
        results[id] = null;
      }
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
    res.status(200).json({ success:true, items: results });
  } catch (e) {
    console.error('[promo-image-batch] err', e);
    res.status(500).json({ success:false, message: e.message || 'Failed' });
  }
};
