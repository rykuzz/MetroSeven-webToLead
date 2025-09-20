// api/campaign-categories.js
const jsforce = require('jsforce');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Gunakan GET' });

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const desc = await conn.sobject('Campaign').describe();
    const catField = desc.fields.find(f => f.name === 'Category__c' && f.picklistValues);
    if (!catField) return res.status(200).json({ values: [] });


    const values = (catField.picklistValues || [])
      .filter(p => p.active)
      .map(p => ({ label: p.label || p.value, value: p.value }));

    return res.status(200).json({ values });
  } catch (err) {
    console.error('Campaign Categories Error:', err);
    return res.status(500).json({ message: 'Gagal mengambil kategori', error: err.message, values: [] });
  }
};
