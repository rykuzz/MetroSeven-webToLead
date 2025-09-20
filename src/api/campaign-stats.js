// api/campaign-stats.js
const jsforce = require('jsforce');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Gunakan GET' });

  const { campaignId } = req.query;
  if (!campaignId) return res.status(400).json({ message: 'campaignId wajib' });

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    // --- quota field detection ---
    const campDesc = await conn.sobject('Campaign').describe();
    const campFields = new Set(campDesc.fields.map(f => f.name));
    const quotaField = ['Quota__c','Max_Quota__c','Capacity__c','Max_Seats__c']
      .find(f => campFields.has(f)) || null;

    // --- fetch campaign & quota (coerce to number) ---
    const c = await conn.query(
      `SELECT Id${quotaField ? ',' + quotaField : ''} FROM Campaign WHERE Id='${campaignId}' LIMIT 1`
    );
    if (!c.records.length) return res.status(404).json({ message: 'Campaign tidak ditemukan' });

    const rawQuota = quotaField ? c.records[0][quotaField] : null;
    const quota = rawQuota == null ? null : Number(rawQuota);
    const quotaIsValid = Number.isFinite(quota);

    // --- count used: try 3 strategies (formula -> responded -> all) ---
    const [qAll, qResp, qFormula] = await Promise.all([
      conn.query(`SELECT COUNT() FROM CampaignMember WHERE CampaignId='${campaignId}'`),
      conn.query(`SELECT COUNT() FROM CampaignMember WHERE CampaignId='${campaignId}' AND HasResponded = true`),
      conn.query(`SELECT COUNT() FROM CampaignMember WHERE CampaignId='${campaignId}' AND Counts_Toward_Quota__c = true`)
        .catch(() => ({ totalSize: 0 }))
    ]);

    let used = 0, method = 'none';
    if (qFormula.totalSize > 0) { used = qFormula.totalSize; method = 'formula'; }
    else if (qResp.totalSize > 0) { used = qResp.totalSize; method = 'responded'; }
    else { used = qAll.totalSize || 0; method = 'all'; }

    const remaining = quotaIsValid ? Math.max(0, quota - used) : null;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      campaignId,
      quota: quotaIsValid ? quota : null,
      used,
      remaining,
      method,
      isFull: remaining !== null ? remaining <= 0 : false
    });
  } catch (err) {
    console.error('Campaign Stats Error:', err);
    return res.status(500).json({ message: 'Gagal ambil statistik campaign', error: err.message });
  }
};
