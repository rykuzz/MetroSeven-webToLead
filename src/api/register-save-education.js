// src/api/register-save-education.js
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
    const { accountId, opportunityId, schoolAccountId, major, graduationYear } = req.body || {};
    if (!accountId || !opportunityId) throw new Error('Missing accountId/opportunityId');

    const conn = await login();

    // School disimpan ke Account (Master_School__c)
    if (schoolAccountId) {
      await conn.sobject('Account').update({
        Id: accountId,
        Master_School__c: schoolAccountId
      });
    }

    // Graduation year disimpan di Opportunity (Graduation_Year__c)
    await conn.sobject('Opportunity').update({
      Id: opportunityId,
      Graduation_Year__c: graduationYear || null,
      Major__c: major || null
    });

    res.json({ status: 'ok' });
  } catch (e) {
    res.status(400).json({ status: 'error', message: e.message || String(e) });
  }
}
