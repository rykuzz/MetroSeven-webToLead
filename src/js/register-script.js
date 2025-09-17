// ===== Utils =====
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).toLowerCase());
const digits  = (s) => String(s||'').replace(/\D/g,'');
function goToStep(n){ $$('.form-step').forEach(sec => sec.hidden = sec.getAttribute('data-step') !== String(n)); window.scrollTo({top:0,behavior:'smooth'}); }
window.goToStep = goToStep;

// ===== Step 1: Payment Proof =====
const MAX_PROOF = 5 * 1024 * 1024;
const ALLOWED_PROOF = ['image/jpeg','image/png','application/pdf'];
let paymentProofDataURL = null;
let paymentProofFileName = null;

const proofInput = $('#paymentProof');
const proofErr   = $('#paymentProofError');
const proofPrev  = $('#paymentProofPreview');
const proofImg   = $('#paymentProofImg');
const proofMeta  = $('#paymentProofMeta');
const nextBtn1   = $('#nextBtn1');

if (proofInput) {
  proofInput.addEventListener('change', async (e) => {
    proofErr.textContent = ''; proofPrev.style.display = 'none';
    paymentProofDataURL = null; paymentProofFileName = null; nextBtn1.disabled = true;

    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!ALLOWED_PROOF.includes(file.type)) { proofErr.textContent = 'File harus JPG/PNG atau PDF.'; return; }
    if (file.size > MAX_PROOF) { proofErr.textContent = 'Ukuran maksimal 5 MB.'; return; }

    paymentProofFileName = file.name || 'bukti-pembayaran';

    // Preview
    proofPrev.style.display = 'block';
    proofMeta.textContent = `${paymentProofFileName} • ${(file.size/1024/1024).toFixed(2)} MB`;
    if (file.type.startsWith('image/')) {
      const fr = new FileReader();
      fr.onload = () => { paymentProofDataURL = fr.result; proofImg.src = fr.result; proofImg.style.display='block'; };
      fr.readAsDataURL(file);
    } else {
      const fr = new FileReader();
      fr.onload = () => { paymentProofDataURL = fr.result; };
      fr.readAsDataURL(file);
      proofImg.style.display='none';
    }
    nextBtn1.disabled = false;
  });

  nextBtn1?.addEventListener('click', () => goToStep(2));
}

// ===== Step 2: Data Pemohon =====
$('#prevBtn2')?.addEventListener('click', () => goToStep(1));
$('#nextBtn2')?.addEventListener('click', () => {
  const firstName = $('#firstName')?.value.trim();
  const email = $('#email')?.value.trim();
  const phone = $('#phone')?.value.trim();
  if (!firstName) return alert('Nama depan wajib.');
  if (!emailOk(email)) return alert('Format email tidak valid.');
  if (!phone) return alert('No. HP wajib.');
  goToStep(3);
});

// ===== Step 3: Campus radio =====
let campusLoaded = false;

async function loadCampuses(initialTerm = '') {
  const container = $('#campusRadios');
  if (!container || campusLoaded) return;
  campusLoaded = true;

  try {
    const url = initialTerm && initialTerm.trim().length >= 2
      ? `/api/salesforce-query?type=campus&term=${encodeURIComponent(initialTerm)}`
      : `/api/salesforce-query?type=campus`;

    const r = await fetch(url);
    const j = await r.json();
    const recs = j.records || [];

    if (!recs.length) {
      container.innerHTML = `<div class="note">Data campus tidak tersedia.</div>`;
      return;
    }

    container.innerHTML = '';
    recs.forEach((c, idx) => {
      const id = `camp_${c.Id}`;
      const label = document.createElement('label');
      label.className = 'radio-item';
      label.htmlFor = id;
      label.innerHTML = `
        <input id="${id}" type="radio" name="campusOption" value="${c.Id}" ${idx===0?'checked':''}>
        <div>
          <div class="radio-title">${c.Name}</div>
        </div>
      `;
      container.appendChild(label);
    });

    // set hidden awal
    const checked = container.querySelector('input[name="campusOption"]:checked');
    if (checked) {
      $('#campusId').value = checked.value;
      $('#campusName').value = checked.closest('label').querySelector('.radio-title').textContent;
    }

    // sync saat berubah
    container.addEventListener('change', (e) => {
      if (e.target && e.target.name === 'campusOption') {
        $('#campusId').value = e.target.value;
        $('#campusName').value = e.target.closest('label').querySelector('.radio-title').textContent;
      }
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="field-error">Gagal memuat data Campus.</div>`;
  }
}

// load daftar campus saat halaman siap
document.addEventListener('DOMContentLoaded', () => loadCampuses());

// tombol step 3
$('#prevBtn3')?.addEventListener('click', () => goToStep(2));
$('#nextBtn3')?.addEventListener('click', () => {
  if (!$('#studyProgramId')?.value) return alert('Pilih Study Program.');
  if (!$('#campusId')?.value) return alert('Pilih Campus.');
  if (!$('#masterIntakeId')?.value) return alert('Pilih Tahun Ajaran.');
  goToStep(4);
});

// ===== Step 4: Sekolah =====
const toggleSchoolManual = $('#schoolManualToggle');
const otherSchoolBox = $('#otherSchoolContainer');
toggleSchoolManual?.addEventListener('change', e => { otherSchoolBox.style.display = e.target.checked ? 'block' : 'none'; });

$('#prevBtn4')?.addEventListener('click', () => goToStep(3));
$('#nextBtn4')?.addEventListener('click', () => {
  if (!toggleSchoolManual?.checked && !$('#schoolId')?.value) return alert('Pilih sekolah atau aktifkan input manual.');
  goToStep(5);
});

// ===== Step 5: Pas Foto =====
const MAX_PHOTO = 1 * 1024 * 1024;
const ALLOWED_PHOTO = ['image/jpeg','image/png'];
let photoDataURL = null;
let photoFileName = null;

const photoIn  = $('#photo');
const photoErr = $('#photoError');
const photoPrev = $('#photoPreview');

photoIn?.addEventListener('change', e => {
  photoErr.textContent = ''; photoPrev.style.display='none';
  photoDataURL = null; photoFileName = null; $('#nextBtn5').disabled = true;

  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!ALLOWED_PHOTO.includes(file.type)) { photoErr.textContent = 'Tipe harus JPG/PNG.'; return; }
  if (file.size > MAX_PHOTO) { photoErr.textContent = 'Ukuran maksimal 1 MB.'; return; }

  const fr = new FileReader();
  fr.onload = () => {
    photoDataURL = fr.result;
    photoFileName = file.name || 'pas-foto-3x4.jpg';
    photoPrev.src = fr.result;
    photoPrev.style.display='block';
    $('#nextBtn5').disabled = false;
  };
  fr.readAsDataURL(file);
});

$('#prevBtn5')?.addEventListener('click', () => goToStep(4));
$('#nextBtn5')?.addEventListener('click', () => {
  if (!photoDataURL) { photoErr.textContent = 'Unggah pas foto 3×4 terlebih dahulu.'; return; }
  // isi ringkasan
  $('#sumName').textContent = `${$('#firstName').value} ${$('#lastName').value || ''}`.trim();
  $('#sumEmail').textContent = $('#email').value;
  $('#sumPhone').textContent = `+62${digits($('#phone').value)}`.replace('++','+');
  $('#sumStudyProgram').textContent = $('#studyProgramSearch').value || $('#studyProgramName').value || '-';
  $('#sumCampus').textContent = $('#campusName').value || '-';
  $('#sumIntake').textContent = $('#intakeSearch').value || '-';
  $('#sumSchool').textContent = toggleSchoolManual?.checked ? ($('#schoolNameManual').value || '-') : ($('#schoolSearch').value || '-');
  $('#sumGradYear').textContent = $('#gradYear').value || '-';
  goToStep(6);
});

// ===== Step 6: Submit =====
$('#prevBtn6')?.addEventListener('click', () => goToStep(5));

$('#submitBtn')?.addEventListener('click', async (e)=>{
  e.preventDefault();
  const agree = $('#agreeTerms')?.checked;
  if (!agree) { $('#agreeError').textContent = 'Harus menyetujui kebijakan.'; return; }
  $('#agreeError').textContent = '';

  try {
    $('#submitBtn').disabled = true; $('#submitBtn').textContent = 'Mengirim…';

    // normalisasi +62
    let ph = digits($('#phone').value || '');
    if (ph.startsWith('0')) ph = ph.slice(1);
    if (!ph.startsWith('62')) ph = `62${ph}`;
    const phoneNorm = `+${ph}`;

    const payload = {
      firstName: $('#firstName').value.trim(),
      lastName : $('#lastName').value.trim() || '-',
      email    : $('#email').value.trim(),
      phone    : phoneNorm,
      studyProgramId   : $('#studyProgramId').value || null,
      studyProgramName : $('#studyProgramSearch').value || null,
      campusId         : $('#campusId').value || null,
      campusName       : $('#campusName').value || null,
      masterIntakeId   : $('#masterIntakeId').value || null,
      schoolId         : $('#schoolId').value || null,
      graduationYear   : $('#gradYear').value || null,
      // bukti pembayaran (wajib)
      paymentProof: paymentProofDataURL ? { dataUrl: paymentProofDataURL, fileName: paymentProofFileName || 'bukti-pembayaran' } : null,
      // pas foto (wajib)
      photo: photoDataURL ? { dataUrl: photoDataURL, fileName: photoFileName || 'pas-foto-3x4.jpg' } : null
    };

    const r = await fetch('/api/register', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    if (!r.ok || !j.success) throw new Error(j.message || 'Gagal submit pendaftaran');

    location.href = 'thankyou.html';
  } catch (err) {
    alert(err.message || 'Terjadi kesalahan.');
  } finally {
    $('#submitBtn').disabled = false; $('#submitBtn').textContent = 'Kirim';
  }
});
