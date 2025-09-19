// Wizard 5 langkah – tanpa localStorage
(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // Utils
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').toLowerCase());
  const digits  = (s) => String(s || '').replace(/\D/g, '');
  const normalizePhone = (raw) => {
    let p = digits(raw || '');
    if (!p) return null;
    if (p.startsWith('0')) p = p.slice(1);
    if (!p.startsWith('62')) p = '62' + p;
    return '+' + p;
  };
  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // UI helpers
  function updateProgress(currentStep) {
    $$('#progressSteps .step-item').forEach(li => {
      const step = Number(li.dataset.step);
      li.classList.toggle('is-active', step === currentStep);
      li.classList.toggle('is-complete', step < currentStep);
      if (step === currentStep) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  }
  function setStep(n) {
    $$('.form-step').forEach(s => s.style.display = (s.dataset.step === String(n)) ? '' : 'none');
    updateProgress(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const toastOk     = (t) => Swal.fire({ icon:'success', title:'Berhasil', text:t, timer:1600, showConfirmButton:false });
  const showLoading = (t='Memproses…') => Swal.fire({ title:t, didOpen:()=>Swal.showLoading(), allowOutsideClick:false, showConfirmButton:false });
  const closeLoading= () => Swal.close();
  const showError   = (m) => Swal.fire({ icon:'error', title:'Gagal', text:m||'Terjadi kesalahan' });

  // API helper
  async function api(url, opts) {
    const res = await fetch(url, opts);
    let data;
    try { data = await res.json(); }
    catch {
      const t = await res.text().catch(()=>'');
      throw new Error(t?.slice(0,400) || 'Server mengembalikan respons non-JSON');
    }
    if (!res.ok || data?.success === false) {
      throw new Error(data?.message || `Permintaan gagal (${res.status})`);
    }
    return data;
  }
  async function fileToBase64(file) {
    const buf = await file.arrayBuffer();
    let binary=''; const bytes=new Uint8Array(buf);
    for (let i=0;i<bytes.byteLength;i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  // state di memori (bukan localStorage)
  const state = { oppId:'', accId:'', pemohon:{}, studi:{}, sekolah:{} };

  // ===== STEP 1: Data Pemohon =====
  $('#formStep1')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const firstName=$('#firstName').value.trim();
    const lastName=$('#lastName').value.trim();
    const email=$('#email').value.trim();
    const phone=normalizePhone($('#phone').value);
    const msg=$('#msgStep1'); msg.style.display='none';
    if(!firstName || !lastName || !emailOk(email) || !phone){
      msg.textContent='Lengkapi data dengan benar.'; msg.style.display='block'; return;
    }
    try {
      showLoading('Menyiapkan data Anda…');
      const j = await api('/api/register-lead-convert', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ firstName, lastName, email, phone })
      });
      state.oppId = j.opportunityId;
      state.accId = j.accountId;
      state.pemohon = { firstName, lastName, email, phone };
      closeLoading(); toastOk('Data pemohon disimpan.'); setStep(2);
    } catch (err) { closeLoading(); showError(err.message); }
  });

  // ===== STEP 2: Bukti Pembayaran =====
  $('#btnBack2')?.addEventListener('click', ()=> setStep(1));
  $('#formStep2')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const file = $('#proofFile').files[0];
    const msg=$('#msgStep2'); msg.style.display='none';
    if(!state.oppId){ showError('Opportunity belum tersedia. Kembali ke langkah 1.'); return; }
    if(!file){ msg.textContent='Pilih file bukti pembayaran.'; msg.style.display='block'; return; }
    if(file.size > 1024*1024){ msg.textContent='Maksimal 1MB.'; msg.style.display='block'; return; }
    const allowed=['application/pdf','image/png','image/jpeg'];
    if(file.type && !allowed.includes(file.type)){ msg.textContent='Format harus PDF/PNG/JPG.'; msg.style.display='block'; return; }

    try {
      showLoading('Mengunggah bukti pembayaran…');
      await api('/api/register-upload-proof', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          opportunityId: state.oppId,
          accountId: state.accId,
          filename: file.name,
          mime: file.type || 'application/octet-stream',
          data: await fileToBase64(file)
        })
      });
      closeLoading(); toastOk('Bukti pembayaran berhasil diupload.'); setStep(3); loadStep3Options();
    } catch (err) { closeLoading(); showError(err.message); }
  });

  // ===== STEP 3: Preferensi Studi =====
  async function loadCampuses(){
    const wrap=$('#campusRadios'); if(!wrap) return;
    wrap.innerHTML='<div class="note">Memuat…</div>';
    try{
      const j=await api('/api/register-options?type=campuses');
      const recs=j.records||[];
      if(!recs.length){ wrap.innerHTML='<div class="field-error">Data campus tidak tersedia.</div>'; return; }
      wrap.innerHTML='';
      recs.forEach((c,i)=>{
        const id=`camp_${c.Id}`;
        const label=document.createElement('label');
        label.className='radio-item'; label.htmlFor=id;
        label.innerHTML = `
          <input type="radio" id="${id}" name="campus" value="${c.Id}" ${i===0?'checked':''}>
          <div><div class="radio-title">${c.Name}</div></div>
        `;
        wrap.appendChild(label);
      });
    }catch{ wrap.innerHTML='<div class="field-error">Gagal memuat campus.</div>'; }
  }
  async function loadIntakes(campusId){
    const sel=$('#intakeSelect'); if(!sel) return;
    sel.innerHTML='<option value="">Memuat…</option>';
    const j=await api(`/api/register-options?type=intakes&campusId=${encodeURIComponent(campusId)}`);
    const recs=j.records||[];
    sel.innerHTML='<option value="">Pilih tahun ajaran</option>';
    recs.forEach(x=> sel.innerHTML += `<option value="${x.Id}">${x.Name}</option>`);
  }
  // >>>> fungsi yang diperbaiki — selalu tampilkan Name
  async function loadPrograms(campusId,intakeId){
    const sel=$('#programSelect'); if(!sel) return;
    sel.innerHTML='<option value="">Memuat…</option>';
    const j=await api(`/api/register-options?type=programs&campusId=${encodeURIComponent(campusId)}&intakeId=${encodeURIComponent(intakeId)}`);
    const recs=j.records||[];
    sel.innerHTML='<option value="">Pilih program</option>';
    recs.forEach(x=>{
      const id   = x.Id || x.StudyProgramId || (x.Study_Program__r && x.Study_Program__r.Id);
      const name = x.Name || x.StudyProgramName || (x.Study_Program__r && x.Study_Program__r.Name) || '';
      if (id && name) sel.innerHTML += `<option value="${id}">${name}</option>`;
    });
  }
  async function loadStep3Options(){
    await loadCampuses();
    const campusId=$('input[name="campus"]:checked')?.value;
    if(campusId) await loadIntakes(campusId);
  }
  $('#campusRadios')?.addEventListener('change', async (e)=>{
    if(e.target?.name==='campus'){ await loadIntakes(e.target.value); $('#programSelect').innerHTML='<option value="">Pilih program</option>'; }
  });
  $('#intakeSelect')?.addEventListener('change', async ()=>{
    const campusId=$('input[name="campus"]:checked')?.value||'';
    const intakeId=$('#intakeSelect').value||'';
    if(campusId&&intakeId) await loadPrograms(campusId,intakeId);
  });
  $('#btnBack3')?.addEventListener('click', ()=> setStep(2));

  $('#formStep3')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const campusId=$('input[name="campus"]:checked')?.value||'';
    const intakeId=$('#intakeSelect').value;
    const programId=$('#programSelect').value;
    const msg=$('#msgStep3'); msg.style.display='none';
    if(!campusId||!intakeId||!programId){ msg.textContent='Pilih campus, tahun ajaran, dan program.'; msg.style.display='block'; return; }
    try{
      showLoading('Menyimpan preferensi studi…');
      await api('/api/register-options', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'saveStudy', opportunityId: state.oppId, campusId, intakeId, programId })
      });
      state.studi = { campusId, intakeId, programId };
      closeLoading(); toastOk('Preferensi studi tersimpan.'); setStep(4); populateYears(); initSchoolAutocomplete();
    }catch(err){ closeLoading(); showError(err.message); }
  });

  // ===== STEP 4: Sekolah + Pas Foto =====
  function populateYears(){
    const sel=$('#gradYearSelect'); if(!sel) return;
    const now=new Date().getFullYear();
    sel.innerHTML='<option value="">Pilih tahun</option>';
    for(let y=now+5; y>=now-30; y--) sel.innerHTML += `<option value="${y}">${y}</option>`;
  }

  function initSchoolAutocomplete(){
    const input=$('#schoolInput');
    const suggest=$('#schoolSuggest');
    const manualToggle=$('#schoolManualToggle');
    const manualBox=$('#schoolManualBox');
    const hiddenId=$('#schoolId');

    const applyToggle=()=>{ const m=manualToggle.checked; manualBox.style.display=m?'grid':'none'; if(m){ hiddenId.value=''; suggest.style.display='none'; } };
    manualToggle?.addEventListener('change', applyToggle); applyToggle();

    let timer=null;
    input?.addEventListener('input', ()=>{
      hiddenId.value=''; if((input.value||'').trim().length<2){ suggest.style.display='none'; suggest.innerHTML=''; return; }
      clearTimeout(timer);
      timer=setTimeout(async ()=>{
        try{
          const j=await api(`/api/register-options?type=sekolah&term=${encodeURIComponent((input.value||'').trim())}`);
          const recs=j.records||[];
          if(!recs.length){ suggest.innerHTML=''; suggest.style.display='none'; return; }
          suggest.innerHTML = recs.map(r=>{
            const npsn = r.NPSN__c ? `<span class="muted">• NPSN ${r.NPSN__c}</span>` : '';
            return `<li class="s-item" data-id="${r.Id}" data-name="${(r.Name||'').replace(/"/g,'&quot;')}">${r.Name} ${npsn}</li>`;
          }).join('');
          suggest.style.display='block';
        }catch{ suggest.innerHTML=''; suggest.style.display='none'; }
      },300);
    });
    suggest?.addEventListener('click', (e)=>{
      const li=e.target.closest('.s-item'); if(!li) return;
      input.value = li.dataset.name || '';
      hiddenId.value = li.dataset.id || '';
      suggest.style.display='none';
    });
    document.addEventListener('click', (e)=>{ if(!suggest.contains(e.target) && e.target!==input) suggest.style.display='none'; });

    // submit
    $('#formStep4')?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const schoolId=hiddenId.value.trim();
      const manual=manualToggle.checked;
      const manualName=$('#schoolNameManual').value.trim();
      const manualNpsn=$('#npsnManual').value.trim();
      const gradYear=$('#gradYearSelect').value;
      const photo=$('#photoFile').files[0];
      const msg=$('#msgStep4'); msg.style.display='none';

      if(!manual && !schoolId){ msg.textContent='Pilih sekolah dari daftar atau centang isi manual.'; msg.style.display='block'; return; }
      if(manual && !manualName){ msg.textContent='Isi nama sekolah manual.'; msg.style.display='block'; return; }
      if(!gradYear){ msg.textContent='Pilih tahun lulus.'; msg.style.display='block'; return; }
      if(!photo){ msg.textContent='Pilih pas foto.'; msg.style.display='block'; return; }
      if(photo.size>1024*1024){ msg.textContent='Ukuran pas foto maksimal 1MB.'; msg.style.display='block'; return; }

      try{
        showLoading('Menyimpan data sekolah & pas foto…');
        await api('/api/register-save-education', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            opportunityId: state.oppId,
            accountId: state.accId,
            masterSchoolId: manual ? null : (schoolId || null),
            draftSchoolName: manual ? manualName : null,
            draftNpsn: manual ? digits(manualNpsn) : null,
            graduationYear: gradYear
          })
        });

        await api('/api/register-upload-photo', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            opportunityId: state.oppId,
            accountId: state.accId,
            filename: photo.name,
            mime: photo.type || 'image/jpeg',
            data: await fileToBase64(photo)
          })
        });

        state.sekolah = {
          mode: manual ? 'manual' : 'auto',
          schoolName: manual ? manualName : ($('#schoolInput').value || ''),
          draftNpsn: manual ? digits(manualNpsn) : null,
          gradYear,
          photoName: photo.name
        };

        closeLoading(); toastOk('Data sekolah & pas foto tersimpan.'); buildReview(); setStep(5);
      } catch (err) { closeLoading(); showError(err.message); }
    });
  }

  // ===== STEP 5: Review & Submit =====
  $('#btnBack5')?.addEventListener('click', ()=> setStep(4));
  function buildReview(){
    const p=state.pemohon, s=state.sekolah;
    const sekolahLine = s.mode==='manual'
      ? `${s.schoolName} (NPSN ${s.draftNpsn||'-'}) — Manual`
      : s.schoolName || '(dipilih)';
    $('#reviewBox').innerHTML = `
      <div class="review-section"><h4>Data Pemohon</h4>
        <div><b>Nama:</b> ${p.firstName} ${p.lastName}</div>
        <div><b>Email:</b> ${p.email}</div>
        <div><b>Phone:</b> ${p.phone}</div>
      </div>
      <div class="review-section"><h4>Preferensi Studi</h4>
        <div><b>Campus:</b> (terpilih)</div>
        <div><b>Intake:</b> (terpilih)</div>
        <div><b>Study Program:</b> (terpilih)</div>
      </div>
      <div class="review-section"><h4>Data Sekolah</h4>
        <div><b>Sekolah Asal:</b> ${sekolahLine}</div>
        <div><b>Tahun Lulus:</b> ${s.gradYear}</div>
        <div><b>Pas Foto:</b> ${s.photoName}</div>
      </div>
      <div class="hint">Saat Submit: Stage Opportunity → <b>Registration</b> & credentials ditampilkan sekali.</div>
    `;
  }
  $('#btnSubmitFinal')?.addEventListener('click', async ()=>{
    try{
      showLoading('Menyelesaikan registrasi…');
      const j = await api('/api/register-finalize', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ opportunityId: state.oppId, accountId: state.accId })
      });
      closeLoading();
      Swal.fire({
        icon:'success', title:'Registrasi Berhasil',
        html:`<div style="text-align:left">
          <p><b>SIMPAN CREDENTIALS INI</b> (ditampilkan sekali):</p>
          <p>Username: <code>${j.username}</code></p>
          <p>Password: <code>${j.passwordPlain}</code></p>
        </div>`,
        confirmButtonText:'Selesai'
      }).then(()=> location.href='thankyou.html');
    }catch(err){ closeLoading(); showError(err.message); }
  });

  // init Step 3 saat masuk
  document.addEventListener('DOMContentLoaded', ()=> { /* Step handled per-submit */ });
})();
