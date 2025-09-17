const jsforce = require('jsforce');

/* -------------------- helpers -------------------- */

// normalize to 62xxxxxxxxx (no plus)
function normalizeIndoPhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('0')) d = d.slice(1);
  if (!d.startsWith('62')) d = '62' + d;
  return d;
}

function dataUrlToBase64(dataUrl) {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:([\w/+.-]+);base64,(.*)$/);
  if (!m) return null;
  return { mime: m[1], base64: m[2] };
}

async function getPersonAccountRecordTypeId(conn) {
  const rt = await conn.query(`
    SELECT Id, Name, DeveloperName
    FROM RecordType
    WHERE SobjectType = 'Account' AND IsActive = true
  `);
  const rec = (rt.records || []).find(
    r => /person/i.test(r.Name || '') || /person/i.test(r.DeveloperName || '')
  );
  return rec ? rec.Id : null;
}

// filter only fields that exist on sobject schema
async function filterFields(conn, sobjectName, body) {
  const desc = await conn.describe(sobjectName);
  const allowed = new Set(desc.fields.map(f => f.name));
  const cleaned = {};
  Object.keys(body || {}).forEach(k => {
    const v = body[k];
    if (v !== undefined && v !== null && allowed.has(k)) cleaned[k] = v;
  });
  return cleaned;
}

async function getConvertedLeadStatus(conn) {
  const q = await conn.query(`SELECT MasterLabel FROM LeadStatus WHERE IsConverted = true ORDER BY SortOrder LIMIT 1`);
  return (q.records && q.records[0] && q.records[0].MasterLabel) || 'Qualified';
}

async function uploadAndLinkToOpty(conn, opportunityId, fileObj, fallbackName) {
  if (!fileObj?.dataUrl) return null;
  const parsed = dataUrlToBase64(fileObj.dataUrl);
  if (!parsed) return null;

  const safeName = (fileObj.fileName || fallbackName || 'file').replace(/[^\w.\- ]/g,'_');

  const cvRes = await conn.sobject('ContentVersion').create({
    Title: safeName.replace(/\.[^.]+$/, ''),
    PathOnClient: safeName,
    VersionData: parsed.base64
  });
  if (!cvRes.success) return null;

  const cv = await conn.query(`SELECT ContentDocumentId FROM ContentVersion WHERE Id='${cvRes.id}'`);
  const docId = cv.records?.[0]?.ContentDocumentId;
  if (!docId) return null;

  await conn.sobject('ContentDocumentLink').create({
    ContentDocumentId: docId,
    LinkedEntityId: opportunityId,
    ShareType: 'V'
  });

  return docId;
}

/* -------------------- handler -------------------- */

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const {
    // applicant
    firstName, lastName, email, phone,

    // preferences
    campusId,
    masterIntakeId,               // optional
    studyProgramId,
    graduationYear,

    // school (saved on Account)
    schoolId,                     // Id of MasterSchool__c

    // docs
    paymentProof,                 // { dataUrl, fileName }
    photo                         // { dataUrl, fileName }
  } = req.body || {};

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    const phoneNorm62 = normalizeIndoPhone(phone);         // '62xxxxxxxxx'
    const phoneE164   = phoneNorm62 ? ('+' + phoneNorm62) : null;

    /* =========================================================
     * 0) DUPLICATE CHECK ON LEAD → CONVERT IF EXISTS
     * ========================================================= */
    let opportunityId = null;
    let accountIdFromLead = null;

    // cari lead by email atau phone
    let lead = null;
    if (email) {
      const q = await conn.query(`
        SELECT Id FROM Lead
        WHERE IsConverted = false AND Email = '${String(email).replace(/'/g,"\\'")}'
        ORDER BY CreatedDate DESC LIMIT 1
      `);
      if (q.totalSize > 0) lead = q.records[0];
    }
    if (!lead && phoneNorm62) {
      const q2 = await conn.query(`
        SELECT Id FROM Lead
        WHERE IsConverted = false AND (Phone = '${phoneE164}' OR MobilePhone = '${phoneE164}')
        ORDER BY CreatedDate DESC LIMIT 1
      `);
      if (q2.totalSize > 0) lead = q2.records[0];
    }

    if (lead) {
      // Convert lead → create Account/Contact/Opportunity
      const convertedStatus = await getConvertedLeadStatus(conn);
      const lc = {
        leadId: lead.Id,
        convertedStatus,
        doNotCreateOpportunity: false,
        overwriteLeadSource: true,
        opportunityName: `REG - ${firstName || ''} ${lastName || ''}`.trim()
      };
      const convRes = await conn.sobject('Lead').convertLead(lc);
      const conv = Array.isArray(convRes) ? convRes[0] : convRes;

      if (!conv || !conv.success) {
        throw new Error((conv && conv.errors && conv.errors[0] && conv.errors[0].message) || 'Lead conversion failed');
      }

      opportunityId = conv.opportunityId || null;
      accountIdFromLead = conv.accountId || null;

      // Update Account hasil konversi dengan Master_School__c jika ada
      if (accountIdFromLead && schoolId) {
        const updAcc = await filterFields(conn, 'Account', {
          Id: accountIdFromLead,
          Master_School__c: schoolId
        });
        if (Object.keys(updAcc).length > 1) {
          await conn.sobject('Account').update(updAcc);
        }
      }

      // Jika conversion menghasilkan Opportunity → update field kita
      if (opportunityId) {
        const oppUpdate = await filterFields(conn, 'Opportunity', {
          Id: opportunityId,
          StageName: 'Booking Form',
          Campus__c: campusId || null,
          Master_Intake__c: masterIntakeId || null,
          Study_Program__c: studyProgramId || null,
          Graduation_Year__c: graduationYear ? Number(graduationYear) : null,
          Booking_Fee_Amount__c: 300000,
          Is_Booking_Fee_Paid__c: !!paymentProof
        });
        await conn.sobject('Opportunity').update(oppUpdate);

        // Upload docs
        await uploadAndLinkToOpty(conn, opportunityId, paymentProof, 'Bukti_Pembayaran');
        await uploadAndLinkToOpty(conn, opportunityId, photo, 'Pas_Foto_3x4');

        return res.status(200).json({ success: true, opportunityId, convertedFromLead: true });
      }
      // jika tidak ada opportunityId (rare), lanjut ke jalur create baru di bawah (pakai accountIdFromLead)
    }

    /* =========================================================
     * 1) FIND / CREATE PERSON ACCOUNT (by email)
     * ========================================================= */
    let accountId = null;

    if (email) {
      const accQ = await conn.query(`
        SELECT Id FROM Account
        WHERE IsPersonAccount = true AND PersonEmail = '${String(email).replace(/'/g,"\\'")}'
        ORDER BY CreatedDate DESC
        LIMIT 1
      `);
      if (accQ.totalSize > 0) accountId = accQ.records[0].Id;
    }

    if (!accountId) {
      accountId = accountIdFromLead || null; // reuse account from converted lead if exists
    }

    if (!accountId) {
      const paRtId = await getPersonAccountRecordTypeId(conn);
      const accountBodyRaw = {
        FirstName: firstName || '',
        LastName : (lastName && lastName.trim()) ? lastName.trim() : (firstName || 'Applicant'),
        PersonEmail: email || '',
        Phone: phoneE164 || '',
        Master_School__c: schoolId || null,     // school mapped to Account
      };
      if (paRtId) accountBodyRaw.RecordTypeId = paRtId; else accountBodyRaw.IsPersonAccount = true;

      const accountBody = await filterFields(conn, 'Account', accountBodyRaw);
      const accIns = await conn.sobject('Account').create(accountBody);
      if (!accIns.success) {
        throw new Error(accIns.errors?.[0]?.message || 'Gagal membuat Person Account');
      }
      accountId = accIns.id;
    } else {
      // update school / phone jika perlu
      const accUpdRaw = {
        Id: accountId,
        Phone: phoneE164 || undefined,
        Master_School__c: schoolId || undefined
      };
      const accUpd = await filterFields(conn, 'Account', accUpdRaw);
      if (Object.keys(accUpd).length > 1) await conn.sobject('Account').update(accUpd);
    }

    /* =========================================================
     * 2) DEDUPE OPPORTUNITY (this year, same Account + Program)
     * ========================================================= */
    const yr = new Date().getFullYear();
    let existingOppId = null;

    if (studyProgramId) {
      const oppQ = await conn.query(`
        SELECT Id
        FROM Opportunity
        WHERE AccountId = '${accountId}'
          AND Study_Program__c = '${studyProgramId}'
          AND CALENDAR_YEAR(CreatedDate) = ${yr}
        ORDER BY CreatedDate DESC
        LIMIT 1
      `);
      if (oppQ.totalSize > 0) existingOppId = oppQ.records[0].Id;
    }

    // payload umum utk create/update
    const oppCommonRaw = {
      StageName: 'Booking Form',
      Campus__c: campusId || null,
      Master_Intake__c: masterIntakeId || null,
      Study_Program__c: studyProgramId || null,
      Graduation_Year__c: graduationYear ? Number(graduationYear) : null,
      Booking_Fee_Amount__c: 300000,
      Is_Booking_Fee_Paid__c: !!paymentProof
    };
    const oppCommon = await filterFields(conn, 'Opportunity', oppCommonRaw);

    if (existingOppId) {
      // update saja
      await conn.sobject('Opportunity').update({ Id: existingOppId, ...oppCommon });
      opportunityId = existingOppId;
    } else {
      // create baru
      const today = new Date();
      const closeDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)
                        .toISOString().slice(0,10);

      const oppCreateRaw = {
        Name: `REG - ${firstName || ''} ${lastName || ''}`.trim(),
        AccountId: accountId,
        CloseDate: closeDate,
        ...oppCommon
      };
      const oppCreate = await filterFields(conn, 'Opportunity', oppCreateRaw);
      const oppIns = await conn.sobject('Opportunity').create(oppCreate);
      if (!oppIns.success) {
        throw new Error(oppIns.errors?.[0]?.message || 'Gagal membuat Opportunity');
      }
      opportunityId = oppIns.id;
    }

    /* =========================================================
     * 3) Upload docs → link ke Opportunity
     * ========================================================= */
    await uploadAndLinkToOpty(conn, opportunityId, paymentProof, 'Bukti_Pembayaran');
    await uploadAndLinkToOpty(conn, opportunityId, photo, 'Pas_Foto_3x4');

    return res.status(200).json({
      success: true,
      opportunityId,
      convertedFromLead: !!lead
    });

  } catch (err) {
    console.error('Register API error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Gagal proses registrasi' });
  }
};
