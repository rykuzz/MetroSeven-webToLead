// src/js/register-wizard.js
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').toLowerCase());
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const normalizePhone = (raw) => {
    let p = digits(raw || '');
    if (!p) return null;
    if (p.startsWith('0')) p = p.slice(1);
    if (!p.startsWith('62')) p = '62' + p;
    return '+' + p;
  };

  // ====== state (localStorage) ======
  const K = (k) => `m7_reg_${k}`;
  const S = {
    get opp() { return localStorage.getItem(K('opp')) || ''; },
    set opp(v) { localStorage.setItem(K('opp'), v || ''); },
    get acc() { return localStorage.getItem(K('acc')) || ''; },
    set acc(v) { localStorage.setItem(K('acc'), v || ''); },

    set pemohon(o){ localStorage.setItem(K('pemohon'), JSON.stringify(o||{})); },
    get pemohon(){ try{ return JSON.parse(localStorage.getItem(K('pemohon'))||'{}'); }catch(e){ return {}; } },

    set reg(o){ localStorage.setItem(K('reg'), JSON.stringify(o||{})); },
    get reg(){ try{ return JSON.parse(localStorage.getItem(K('reg'))||'{}'); }catch(e){ return {}; } },

    set sekolah(o){ localStorage.setItem(K('sekolah'), JSON.stringify(o||{})); },
    get sekolah(){ try{ return JSON.parse(localStorage.getItem(K('sekolah'))||'{}'); }catch(e){ return {}; } },

    set payment(o){ localStorage.setItem(K('payment'), JSON.stringify(o||{})); },
    get payment(){ try{ return JSON.parse(localStorage.getItem(K('payment'))||'{}'); }catch(e){ return {}; } },
  };

  function setStep(n) {
    $$('.stepper .step').forEach((el) => el.classList.toggle('is-active', Number(el.dataset.step) === n));
    $('#step1').style.display = (n===1)?'':'none';
    $('#step2').style.display = (n===2)?'':'none';
    $('#step3').style.display = (n===3)?'':'none';
    $('#step4').style.display = (n===4)?'':'none';
    $('#step5').style.display = (n===5)?'':'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toastOk(text) {
    Swal.fire({ icon: 'success', title: 'Berhasil', text, timer: 2000, showConfirmButton: false });
  }
  function showLoading(title = 'Memproses…') {
    Swal.fire({ title, didOpen: () => Swal.showLoading(), allowOutsideClick: false, showConfirmButton: false });
  }
  function closeLoading(){ Swal.close(); }
  function showError(msg){ Swal.fire({ icon:'error', title:'Gagal', text: msg||'Terjadi kesalahan' }); }

  async function pollStatus(email, phone) {
    for (let i = 0; i < 10; i++) {
      const r = await fetch(`/api/register-status?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
      const j = await r.json();
      if (j.success && j.opportunityId) return j;
      await new Promise(res => setTimeout(res, 1000));
    }
    return null;
  }

  // ====== Step 1: Data Pemohon ======
  $('#formStep1').addEventListener('submit', async (e) => {
    e.preventDefault();
    const firstName = $('#firstName').value.trim();
    const lastName  = $('#lastName').value.trim();
    const email     = $('#email').value.trim();
    const phone     = normalizePhone($('#phone').value);

    const msg = $('#msgStep1'); msg.style.display='none';

    if (!firstName || !lastName || !emailOk(email) || !phone) {
      msg.textContent = 'Lengkapi data dengan benar.'; msg.style.display = 'block'; return;
    }

    try {
      showLoading('Menyiapkan data Anda…');

      const r = await fetch('/api/register-lead-convert', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ firstName, lastName, email, phone })
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || 'Gagal memproses');

      let oppId = j.opportunityId, accId = j.accountId;
      if (!oppId) {
        const status = await pollStatus(email, phone);
        if (!status) throw new Error('Konversi memerlukan waktu lebih lama dari biasanya. Coba lagi.');
        oppId = status.opportunityId; accId = status.accountId;
      }

      S.opp = oppId; S.acc = accId;
      S.pemohon = { firstName, lastName, email, phone };
      $('#opptyIdLabel').textContent = oppId;
      $('#accountIdLabel').textContent = accId;

      closeLoading();
      toastOk('Data pemohon disimpan.');
      setStep(2);
    } catch (err) {
      closeLoading(); showError(err.message);
    }
  });

  // ====== Step 2: Bukti Pembayaran ======
  $('#btnBack2').addEventListener('click', () => setStep(1));
  $('#formStep2').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const file = $('#proofFile').files[0];
    const msg = $('#msgStep2'); msg.style.display='none';

    const oppId = S.opp; const accId = S.acc;
    if (!oppId) { showError('Opportunity belum tersedia. Kembali ke langkah 1.'); return; }
    if (!file) { msg.textContent='Pilih file bukti pembayaran.'; msg.style.display='block'; return; }
    if (file.size > 1024*1024) { msg.textContent='Ukuran file maksimal 1MB.'; msg.style.display='block'; return; }
    const allowed = ['application/pdf','image/png','image/jpeg'];
    if (file.type && !allowed.includes(file.type)) { msg.textContent='Format file harus PDF/PNG/JPG.'; msg.style.display='block'; return; }

    try {
      showLoading('Mengunggah bukti pembayaran…');
      const form = new FormData();
      form.append('file', file);
      form.append('opportunityId', oppId);
      form.append('accountId', accId);

      const r = await fetch('/api/register-upload-proof', { method:'POST', body: form });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || 'Upload gagal');

      // simpan untuk ringkasan
      S.payment = { proofName: file.name };

      closeLoading(); toastOk('Bukti pembayaran berhasil diupload.');
      setStep(3);
      loadStep3Options(); // preload
    } catch(err){ closeLoading(); showError(err.message); }
  });

  // ====== Step 3: Registration (Campus → Intake → Program) ======
  async function loadCampuses() {
    const wrap = $('#campusRadios'); wrap.innerHTML = '<div class="note">Memuat…</div>';
    try {
      const r = await fetch('/api/register-options?type=campuses');
      const j = await r.json(); const recs = j.records || [];
      if (!recs.length) { wrap.innerHTML = '<div class="field-error">Data campus tidak tersedia.</div>'; return; }
      wrap.innerHTML = '';
      recs.forEach((c, i)=>{
        const id = `camp_${c.Id}`;
        const label = document.createElement('label');
        label.className='radio-item'; label.htmlFor=id;
        label.innerHTML = `<input type="radio" id="${id}" name="campus" value="${c.Id}" ${i===0?'checked':''}><div><div class="radio-title">${c.Name}</div></div>`;
        wrap.appendChild(label);
      });
    } catch(e){ wrap.innerHTML = '<div class="field-error">Gagal memuat campus.</div>'; }
  }
  async function loadIntakes(campusId){
    const sel = $('#intakeSelect'); sel.innerHTML = '<option value="">Memuat…</option>';
    const r = await fetch(`/api/register-options?type=intakes&campusId=${encodeURIComponent(campusId)}`);
    const j = await r.json(); const recs = j.records || [];
    sel.innerHTML = '<option value="">Pilih tahun ajaran</option>';
    recs.forEach(x => sel.innerHTML += `<option value="${x.Id}">${x.Name}</option>`);
  }
  async function loadPrograms(campusId, intakeId){
    const sel = $('#programSelect'); sel.innerHTML = '<option value="">Memuat…</option>';
    const r = await fetch(`/api/register-options?type=programs&campusId=${encodeURIComponent(campusId)}&intakeId=${encodeURIComponent(intakeId)}`);
    const j = await r.json(); const recs = j.records || [];
    sel.innerHTML = '<option value="">Pilih program</option>';
    recs.forEach(x => sel.innerHTML += `<option value="${x.StudyProgramId}">${x.StudyProgramName}</option>`);
  }
  async function resolveBSP(intakeId, studyProgramId){
    const today = new Date().toISOString().slice(0,10);
    const mb = await fetch(`/api/register-options?type=masterBatch&intakeId=${encodeURIComponent(intakeId)}&date=${today}`).then(r=>r.json());
    if (!mb || !mb.id) throw new Error('Batch untuk intake ini belum tersedia.');
    const bsp = await fetch(`/api/register-options?type=bsp&masterBatchId=${encodeURIComponent(mb.id)}&studyProgramId=${encodeURIComponent(studyProgramId)}`).then(r=>r.json());
    if (!bsp || !bsp.id) throw new Error('Batch Study Program belum tersedia.');
    return { masterBatchId: mb.id, masterBatchName: mb.name, bspId: bsp.id, bspName: bsp.name };
  }

  async function loadStep3Options(){
    await loadCampuses();
    const campusId = $('input[name="campus"]:checked')?.value;
    if (campusId) await loadIntakes(campusId);
  }

  $('#formStep3').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const campusId = $('input[name="campus"]:checked')?.value || '';
    const intakeId = $('#intakeSelect').value;
    const programId = $('#programSelect').value;

    const msg = $('#msgStep3'); msg.style.display = 'none';
    if (!campusId || !intakeId || !programId) {
      msg.textContent = 'Pilih campus, tahun ajaran, dan program.'; msg.style.display='block'; return;
    }

    try {
      showLoading('Menyimpan pilihan program…');

      const { bspId, bspName } = await resolveBSP(intakeId, programId);

      // Simpan ke Opportunity: Campus__c, BSP & update Name (sesuai brief)
      const r = await fetch('/api/register-options', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action: 'saveReg',
          opportunityId: S.opp,
          campusId, intakeId, studyProgramId: programId, bspId
        })
      });
      const j = await r.json(); if(!r.ok || !j.success) throw new Error(j.message || 'Gagal menyimpan');

      S.reg = { campusId, intakeId, programId, bspId, bspName };
      closeLoading(); toastOk('Pilihan program tersimpan.');
      setStep(4);
      populateYears(); // preload years
    } catch(err){ closeLoading(); showError(err.message); }
  });

  $('#btnBack3').addEventListener('click', () => setStep(2));
  $('#campusRadios')?.addEventListener('change', async (e)=>{
    if (e.target && e.target.name === 'campus') await loadIntakes(e.target.value);
  });
  $('#intakeSelect')?.addEventListener('change', async ()=> {
    const campusId = $('input[name="campus"]:checked')?.value || '';
    const intakeId = $('#intakeSelect').value || '';
    if (campusId && intakeId) await loadPrograms(campusId, intakeId);
  });

  // ====== Step 4: Data Sekolah + Pas Foto ======
  function populateYears(){
    const sel = $('#gradYearSelect');
    const now = new Date().getFullYear();
    sel.innerHTML = '<option value="">Pilih tahun</option>';
    for (let y = now + 5; y >= now - 30; y--) {
      sel.innerHTML += `<option value="${y}">${y}</option>`;
    }
  }
  $('#btnBack4').addEventListener('click', () => setStep(3));
  $('#formStep4').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const oppId = S.opp; const accId = S.acc;
    const schoolId = $('#schoolId').value.trim();
    const schoolName = $('#schoolInput').value.trim();
    const gradYear = $('#gradYearSelect').value;
    const photo = $('#photoFile').files[0];

    const msg = $('#msgStep4'); msg.style.display='none';
    if (!schoolName) { msg.textContent='Isi sekolah asal.'; msg.style.display='block'; return; }
    if (!gradYear) { msg.textContent='Pilih tahun lulus.'; msg.style.display='block'; return; }
    if (!photo) { msg.textContent='Pilih pas foto.'; msg.style.display='block'; return; }
    if (photo.size > 1024*1024) { msg.textContent='Ukuran pas foto maksimal 1MB.'; msg.style.display='block'; return; }

    try{
      showLoading('Menyimpan data sekolah & pas foto…');

      // Save school & grad year
      const r1 = await fetch('/api/register-save-education', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ opportunityId: oppId, accountId: accId, masterSchoolId: schoolId||null, schoolName, graduationYear: gradYear })
      });
      const j1 = await r1.json(); if(!r1.ok || !j1.success) throw new Error(j1.message || 'Gagal menyimpan data sekolah');

      // Upload photo
      const form = new FormData();
      form.append('file', photo);
      form.append('opportunityId', oppId);
      form.append('accountId', accId);
      const r2 = await fetch('/api/register-upload-photo', { method:'POST', body: form });
      const j2 = await r2.json(); if(!r2.ok || !j2.success) throw new Error(j2.message || 'Upload pas foto gagal');

      S.sekolah = { schoolId, schoolName, gradYear, photoName: photo.name };

      closeLoading(); toastOk('Data sekolah & pas foto tersimpan.');
      buildReview(); setStep(5);
    }catch(err){ closeLoading(); showError(err.message); }
  });

  // ====== Step 5: Review & Submit ======
  $('#btnBack5').addEventListener('click', () => setStep(4));
  function buildReview(){
    const p = S.pemohon, r = S.reg, s = S.sekolah, pay = S.payment;
    const box = $('#reviewBox');
    box.innerHTML = `
      <div class="review-section">
        <h4>Data Pemohon</h4>
        <div><b>Nama:</b> ${p.firstName} ${p.lastName}</div>
        <div><b>Email:</b> ${p.email}</div>
        <div><b>Phone:</b> ${p.phone}</div>
      </div>
      <div class="review-section">
        <h4>Pembayaran</h4>
        <div><b>Bukti Bayar:</b> ${pay.proofName || '(terunggah)'}</div>
      </div>
      <div class="review-section">
        <h4>Registration</h4>
        <div><b>BSP:</b> ${r.bspName || '-'}</div>
      </div>
      <div class="review-section">
        <h4>Data Sekolah</h4>
        <div><b>Sekolah Asal:</b> ${s.schoolName}</div>
        <div><b>Tahun Lulus:</b> ${s.gradYear}</div>
        <div><b>Pas Foto:</b> ${s.photoName}</div>
      </div>
      <div class="hint">Pastikan data sudah benar sebelum submit. Setelah submit, Stage Opportunity akan menjadi <b>Registration</b>.</div>
    `;
  }

  $('#btnSubmitFinal').addEventListener('click', async ()=>{
    try{
      showLoading('Menyelesaikan registrasi…');
      const r = await fetch('/api/register-finalize', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ opportunityId: S.opp, accountId: S.acc })
      });
      const j = await r.json(); if(!r.ok || !j.success) throw new Error(j.message || 'Gagal menyelesaikan registrasi');

      closeLoading();
      Swal.fire({
        icon:'success',
        title:'Registrasi Berhasil',
        html: `
          <div style="text-align:left">
            <p><b>SIMPAN CREDENTIALS INI</b> (ditampilkan sekali):</p>
            <p>Username: <code>${j.username}</code></p>
            <p>Password: <code>${j.passwordPlain}</code></p>
          </div>
        `,
        confirmButtonText:'Salin & Selesai',
        didOpen: () => {
          // tombol copy cepat
        }
      }).then(()=> location.href='thankyou.html');
    }catch(err){ closeLoading(); showError(err.message); }
  });

  // Init (kalau refresh, tampilkan id)
  document.addEventListener('DOMContentLoaded', () => {
    if (S.opp) { $('#opptyIdLabel').textContent = S.opp; }
    if (S.acc) { $('#accountIdLabel').textContent = S.acc; }
  });
})();
