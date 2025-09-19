// src/js/register-wizard.js
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // === Utils
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').toLowerCase());
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const normalizePhone = (raw) => {
    let p = digits(raw || '');
    if (!p) return null;
    if (p.startsWith('0')) p = p.slice(1);
    if (!p.startsWith('62')) p = '62' + p;
    return '+' + p;
  };

  // Safe API: coba parse JSON; kalau non-JSON tampilkan text-nya
  async function api(url, opts) {
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); }
    catch {
      const t = await res.text().catch(()=> '');
      throw new Error(t?.slice(0,400) || 'Server mengembalikan respons non-JSON');
    }
    if (!res.ok || data?.success === false) throw new Error(data?.message || `Permintaan gagal (${res.status})`);
    return data;
  }
  async function fileToBase64(file) {
    const buf = await file.arrayBuffer();
    let binary=''; const bytes=new Uint8Array(buf);
    for (let i=0;i<bytes.byteLength;i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  // === Local state
  const K = (k) => `m7_reg_${k}`;
  const S = {
    get opp() { return localStorage.getItem(K('opp')) || ''; },
    set opp(v) { localStorage.setItem(K('opp'), v || ''); },
    get acc() { return localStorage.getItem(K('acc')) || ''; },
    set acc(v) { localStorage.setItem(K('acc'), v || ''); },
    set pemohon(o){ localStorage.setItem(K('pemohon'), JSON.stringify(o||{})); },
    get pemohon(){ try{ return JSON.parse(localStorage.getItem(K('pemohon'))||'{}'); }catch{ return {}; } },
    set reg(o){ localStorage.setItem(K('reg'), JSON.stringify(o||{})); },
    get reg(){ try{ return JSON.parse(localStorage.getItem(K('reg'))||'{}'); }catch{ return {}; } },
    set sekolah(o){ localStorage.setItem(K('sekolah'), JSON.stringify(o||{})); },
    get sekolah(){ try{ return JSON.parse(localStorage.getItem(K('sekolah'))||'{}'); }catch{ return {}; } },
  };

  // === UI helpers
  function updateProgress(currentStep) {
    $$('#progressSteps .step-item').forEach(li => {
      const step = Number(li.dataset.step);
      li.classList.toggle('is-active', step === currentStep);
      li.classList.toggle('is-complete', step < currentStep);
      if (step === currentStep) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  }
  function setStep(n){ $$('.form-step').forEach(s => s.style.display = (s.dataset.step===String(n))?'':'none'); updateProgress(n); window.scrollTo({top:0,behavior:'smooth'}); }
  const toastOk = (t) => Swal.fire({ icon:'success', title:'Berhasil', text:t, timer:1600, showConfirmButton:false });
  const showLoading = (t='Memproses…') => Swal.fire({ title:t, didOpen:()=>Swal.showLoading(), allowOutsideClick:false, showConfirmButton:false });
  const closeLoading = () => Swal.close();
  const showError = (m) => Swal.fire({ icon:'error', title:'Gagal', text:m||'Terjadi kesalahan' });

  async function pollStatus(email, phone) {
    for (let i=0;i<10;i++){
      try { const j = await api(`/api/register-status?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`); if (j.opportunityId) return j; }
      catch {}
      await new Promise(r=>setTimeout(r,1000));
    }
    return null;
  }

  // === STEP 1
  $('#formStep1').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const firstName=$('#firstName').value.trim();
    const lastName=$('#lastName').value.trim();
    const email=$('#email').value.trim();
    const phone=normalizePhone($('#phone').value);
    const msg=$('#msgStep1'); msg.style.display='none';
    if(!firstName || !lastName || !emailOk(email) || !phone){ msg.textContent='Lengkapi data dengan benar.'; msg.style.display='block'; return; }

    try{
      showLoading('Menyiapkan data Anda…');
      const j = await api('/api/register-lead-convert',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({firstName,lastName,email,phone})});
      let oppId=j.opportunityId, accId=j.accountId;
      if(!oppId){ const ps=await pollStatus(email,phone); if(!ps) throw new Error('Konversi memerlukan waktu lebih lama. Coba lagi.'); oppId=ps.opportunityId; accId=ps.accountId; }
      S.opp=oppId; S.acc=accId; S.pemohon={firstName,lastName,email,phone};
      $('#opptyIdLabel').textContent=oppId; $('#accountIdLabel').textContent=accId;
      closeLoading(); toastOk('Data pemohon disimpan.'); setStep(2);
    }catch(err){ closeLoading(); showError(err.message); }
  });

  // === STEP 2
  $('#btnBack2').addEventListener('click', ()=> setStep(1));
  $('#formStep2').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const oppId=S.opp, accId=S.acc;
    const file=$('#proofFile').files[0];
    const msg=$('#msgStep2'); msg.style.display='none';
    if(!oppId){ showError('Opportunity belum tersedia. Kembali ke langkah 1.'); return; }
    if(!file){ msg.textContent='Pilih file bukti pembayaran.'; msg.style.display='block'; return; }
    if(file.size>1024*1024){ msg.textContent='Maksimal 1MB.'; msg.style.display='block'; return; }
    const allowed=['application/pdf','image/png','image/jpeg']; if(file.type && !allowed.includes(file.type)){ msg.textContent='Format harus PDF/PNG/JPG.'; msg.style.display='block'; return; }

    try{
      showLoading('Mengunggah bukti pembayaran…');
      const payload={ opportunityId:oppId, accountId:accId, filename:file.name, mime:file.type||'application/octet-stream', data:await fileToBase64(file) };
      await api('/api/register-upload-proof',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      closeLoading(); toastOk('Bukti pembayaran berhasil diupload.'); setStep(3); loadStep3Options();
    }catch(err){ closeLoading(); showError(err.message); }
  });

  // === STEP 3
  async function loadCampuses(){
    const wrap=$('#campusRadios'); wrap.innerHTML='<div class="note">Memuat…</div>';
    try{
      const j=await api('/api/register-options?type=campuses'); const recs=j.records||[]; if(!recs.length){ wrap.innerHTML='<div class="field-error">Data campus tidak tersedia.</div>'; return; }
      wrap.innerHTML='';
      recs.forEach((c,i)=>{ const id=`camp_${c.Id}`; const label=document.createElement('label'); label.className='radio-item'; label.htmlFor=id; label.innerHTML=`<input type="radio" id="${id}" name="campus" value="${c.Id}" ${i===0?'checked':''}><div><div class="radio-title">${c.Name}</div></div>`; wrap.appendChild(label); });
    }catch{ wrap.innerHTML='<div class="field-error">Gagal memuat campus.</div>'; }
  }
  async function loadIntakes(campusId){
    const sel=$('#intakeSelect'); sel.innerHTML='<option value="">Memuat…</option>';
    const j=await api(`/api/register-options?type=intakes${campusId?`&campusId=${encodeURIComponent(campusId)}`:''}`); const recs=j.records||[];
    sel.innerHTML='<option value="">Pilih tahun ajaran</option>'; recs.forEach(x=> sel.innerHTML += `<option value="${x.Id}">${x.Name}</option>`);
  }
  async function loadPrograms(campusId,intakeId){
    const sel=$('#programSelect'); 
    if(!intakeId){ sel.innerHTML='<option value="">Pilih intake terlebih dahulu</option>'; return; }
    sel.innerHTML='<option value="">Memuat…</option>';
    const j=await api(`/api/register-options?type=programs&intakeId=${encodeURIComponent(intakeId)}${campusId?`&campusId=${encodeURIComponent(campusId)}`:''}`); 
    const recs=j.records||[];
    if(!recs.length){ sel.innerHTML='<option value="">Program belum tersedia untuk kombinasi ini</option>'; return; }
    sel.innerHTML='<option value="">Pilih program</option>'; recs.forEach(x=> sel.innerHTML+=`<option value="${x.Id}">${x.Name}</option>`);
  }
  async function loadStep3Options(){ await loadCampuses(); const campusId=$('input[name="campus"]:checked')?.value; if(campusId) await loadIntakes(campusId); else await loadIntakes(''); }
  $('#campusRadios')?.addEventListener('change', async (e)=>{ if(e.target?.name==='campus'){ await loadIntakes(e.target.value); $('#programSelect').innerHTML='<option value="">Pilih intake terlebih dahulu</option>'; } });
  $('#intakeSelect')?.addEventListener('change', async ()=>{ const campusId=$('input[name="campus"]:checked')?.value||''; const intakeId=$('#intakeSelect').value||''; await loadPrograms(campusId,intakeId); });
  $('#btnBack3').addEventListener('click', ()=> setStep(2));

  $('#formStep3').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const campusId=$('input[name="campus"]:checked')?.value||'';
    const intakeId=$('#intakeSelect').value;
    const programId=$('#programSelect').value;
    const msg=$('#msgStep3'); msg.style.display='none';
    if(!campusId||!intakeId||!programId){ msg.textContent='Pilih campus, tahun ajaran, dan program.'; msg.style.display='block'; return; }
    try{
      showLoading('Menyimpan pilihan program…');
      await api('/api/register-options',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'saveReg', opportunityId:S.opp, campusId, intakeId, studyProgramId:programId })});
      S.reg={ campusId,intakeId,programId };
      closeLoading(); toastOk('Preferensi studi tersimpan.'); setStep(4); populateYears();
    }catch(err){ closeLoading(); showError(err.message); }
  });

  // === STEP 4
  function populateYears(){
  const sel = $('#gradYearSelect');
  const now = new Date().getFullYear();
  const max = now + 5;         // ke atas 5 tahun (ubah sesuai kebutuhan)
  sel.innerHTML = '<option value="">Pilih tahun</option>';
  for (let y = now; y <= max; y++) {   // urut naik
    sel.innerHTML += `<option value="${y}">${y}</option>`;
    }
  }
  $('#btnBack4').addEventListener('click', ()=> setStep(3));
  $('#formStep4').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const oppId=S.opp, accId=S.acc; const schoolId=$('#schoolId').value.trim(); const schoolName=$('#schoolInput').value.trim(); const gradYear=$('#gradYearSelect').value; const photo=$('#photoFile').files[0];
    const msg=$('#msgStep4'); msg.style.display='none';
    if(!schoolName){ msg.textContent='Isi sekolah asal.'; msg.style.display='block'; return; }
    if(!gradYear){ msg.textContent='Pilih tahun lulus.'; msg.style.display='block'; return; }
    if(!photo){ msg.textContent='Pilih pas foto.'; msg.style.display='block'; return; }
    if(photo.size>1024*1024){ msg.textContent='Ukuran pas foto maksimal 1MB.'; msg.style.display='block'; return; }

    try{
      showLoading('Menyimpan data sekolah & pas foto…');
      await api('/api/register-save-education',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ opportunityId:oppId, accountId:accId, masterSchoolId:schoolId||null, schoolName, graduationYear:gradYear })});
      const payload2={ opportunityId:oppId, accountId:accId, filename:photo.name, mime:photo.type||'image/jpeg', data:await fileToBase64(photo) };
      await api('/api/register-upload-photo',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload2) });
      S.sekolah={ schoolId, schoolName, gradYear, photoName:photo.name };
      closeLoading(); toastOk('Data sekolah & pas foto tersimpan.'); buildReview(); setStep(5);
    }catch(err){ closeLoading(); showError(err.message); }
  });

  // === STEP 5
  $('#btnBack5').addEventListener('click', ()=> setStep(4));
  function buildReview(){
    const p=S.pemohon, r=S.reg, s=S.sekolah;
    $('#reviewBox').innerHTML = `
      <div class="review-section"><h4>Data Pemohon</h4>
        <div><b>Nama:</b> ${p.firstName} ${p.lastName}</div>
        <div><b>Email:</b> ${p.email}</div>
        <div><b>Phone:</b> ${p.phone}</div>
      </div>
      <div class="review-section"><h4>Preferensi Studi</h4>
        <div><b>Campus ID:</b> ${r.campusId}</div>
        <div><b>Intake ID:</b> ${r.intakeId}</div>
        <div><b>Program ID:</b> ${r.programId}</div>
      </div>
      <div class="review-section"><h4>Data Sekolah</h4>
        <div><b>Sekolah Asal:</b> ${s.schoolName}</div>
        <div><b>Tahun Lulus:</b> ${s.gradYear}</div>
        <div><b>Pas Foto:</b> ${s.photoName}</div>
      </div>
      <div class="hint">Saat Submit: Stage Opportunity → <b>Registration</b> & credentials ditampilkan sekali.</div>`;
  }
  $('#btnSubmitFinal').addEventListener('click', async ()=>{
    try{
      showLoading('Menyelesaikan registrasi…');
      const j = await api('/api/register-finalize',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ opportunityId:S.opp, accountId:S.acc })});
      closeLoading();
      Swal.fire({ icon:'success', title:'Registrasi Berhasil', html:`<div style="text-align:left"><p><b>SIMPAN CREDENTIALS INI</b> (ditampilkan sekali):</p><p>Username: <code>${j.username}</code></p><p>Password: <code>${j.passwordPlain}</code></p></div>`, confirmButtonText:'Selesai' })
        .then(()=> location.href='thankyou.html');
    }catch(err){ closeLoading(); showError(err.message); }
  });

  // init
  document.addEventListener('DOMContentLoaded', ()=>{ /* init opsional */ });
})();

