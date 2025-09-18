// src/js/register-wizard.js
async function postJSON(url, data) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const j = await r.json();
  if (!r.ok || j.status === 'error') throw new Error(j.message || 'Request failed');
  return j;
}

function saveTriple({ accountId, contactId, opportunityId }) {
  sessionStorage.setItem('accId', accountId || '');
  sessionStorage.setItem('conId', contactId || '');
  sessionStorage.setItem('oppId', opportunityId || '');
}

function getTriple() {
  return {
    accountId: sessionStorage.getItem('accId'),
    contactId: sessionStorage.getItem('conId'),
    opportunityId: sessionStorage.getItem('oppId')
  };
}

// STEP 1 – submit data pemohon
export async function submitApplicant(formValues) {
  const res = await postJSON('/api/register', {
    firstName: formValues.firstName,
    lastName: formValues.lastName,
    email: formValues.email,
    phone: formValues.phone
  });
  // penting: simpan triple ID, JANGAN simpan LeadId
  saveTriple(res);
  return res;
}

// STEP 2 – upload bukti
export async function uploadProof(file) {
  const { opportunityId } = getTriple();
  const fd = new FormData();
  fd.append('opportunityId', opportunityId);
  fd.append('file', file);
  const r = await fetch('/api/register-upload-proof', { method: 'POST', body: fd });
  const j = await r.json();
  if (!r.ok || j.status === 'error') throw new Error(j.message || 'Upload failed');
  return j;
}

// STEP 3 – data sekolah + pas foto (foto di step ini juga boleh)
export async function saveEducation(payload) {
  const { accountId, opportunityId } = getTriple();
  return postJSON('/api/register-save-education', {
    ...payload,
    accountId,
    opportunityId
  });
}
export async function uploadPhoto(file) {
  const { opportunityId } = getTriple();
  const fd = new FormData();
  fd.append('opportunityId', opportunityId);
  fd.append('file', file);
  const r = await fetch('/api/register-upload-photo', { method: 'POST', body: fd });
  const j = await r.json();
  if (!r.ok || j.status === 'error') throw new Error(j.message || 'Upload failed');
  return j;
}

// STEP 5 – finalize
export async function finalize() {
  const { opportunityId } = getTriple();
  return postJSON('/api/register-finalize', { opportunityId });
}
