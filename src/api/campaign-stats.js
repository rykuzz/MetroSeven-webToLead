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

    // detect quota & CM formula checkbox
    const campDesc = await conn.sobject('Campaign').describe();
    const cmDesc = await conn.sobject('CampaignMember').describe();

    const quotaCandidates = ['Quota__c','Max_Quota__c','Capacity__c','Max_Seats__c'];
    const campFields = new Set(campDesc.fields.map(f=>f.name));
    const cmFields = new Set(cmDesc.fields.map(f=>f.name));

    const quotaField = quotaCandidates.find(f => campFields.has(f)) || null;
    const countsFormula = cmFields.has('Counts_Toward_Quota__c');

    // fetch campaign + quota
    const camp = await conn.query(
      `SELECT Id, Name, IsActive, StartDate, EndDate${quotaField ? ','+quotaField : ''} FROM Campaign WHERE Id='${campaignId}' LIMIT 1`
    );
    if (!camp.records.length) return res.status(404).json({ message: 'Campaign tidak ditemukan' });

    const rec = camp.records[0];
    const quota = quotaField ? rec[quotaField] : null;

    // count used
    let used = 0;
    if (countsFormula) {
      const q = await conn.query(
        `SELECT COUNT() FROM CampaignMember WHERE CampaignId='${campaignId}' AND Counts_Toward_Quota__c = true`
      );
      used = q.totalSize || 0;
    } else {
      // fallback: hitung SEMUA CM untuk campaign ini (tanpa bergantung HasResponded)
      const q = await conn.query(
        `SELECT COUNT() FROM CampaignMember WHERE CampaignId='${campaignId}'`
      );
      used = q.totalSize || 0;
    }

    const remaining = (typeof quota === 'number') ? Math.max(0, quota - used) : null;

    return res.status(200).json({
      campaignId, quota, used, remaining, isFull: remaining !== null ? remaining <= 0 : false
    });

  } catch (err) {
    console.error('Campaign Stats Error:', err);
    return res.status(500).json({ message: 'Gagal ambil statistik campaign', error: err.message });
  }
};
