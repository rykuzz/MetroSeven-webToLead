// src/api/register-finalize.js
import jsforce from 'jsforce';

async function login() {
  const conn = new jsforce.Connection({ loginUrl: process.env.SF_LOGIN_URL });
  await conn.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + process.env.SF_TOKEN
  );
  return conn;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const { opportunityId } = req.body || {};
    if (!opportunityId) throw new Error('opportunityId is required');

    const conn = await login();

    // Contoh finalize: ubah stage booking / flag form purchased
    await conn.sobject('Opportunity').update({
      Id: opportunityId,
      StageName: 'Booking Form',
    });

    res.json({ status: 'ok' });
  } catch (e) {
    res.status(400).json({ status: 'error', message: e.message || String(e) });
  }
}
