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

  // Safe API: parse JSON; kalau non-JSON tampilkan text-nya
  async function api(url, opts) {
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); }
    catch {
      const t = await res.text().catch(()=> '');
      throw new Error(t?.slice(0, 400) || 'Server mengembalikan respons non-JSON');
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
      wrap.innerHTML=''; recs.forEach((c,i)=>{ const id=`camp_${c.Id}`; const label=document.createElement('label'); label.className='radio-item'; label.htmlFor=id; label.innerHTML=`<input type="radio" id="${id}" name="campus" value="${c.Id}" ${i===0?'checked':''}><div><div class="radio-title">${c.Name}</div></div>`; wrap.appendChild(label); });
    }catch(e){ wrap.innerHTML=`<div class="field-error">Gagal memuat campus: ${e?.message||'server error'}</div>`; }
  }
  async function loadIntakes(campusId){
    const sel=$('#intakeSelect'); sel.innerHTML='<option value="">Memuat…</option>';
    const j=await api(`/api/register-options?type=intakes&campusId=${encodeURIComponent(campusId)}`); const recs=j.records||[];
    sel.innerHTML='<option value="">Pilih tahun ajaran</option>'; recs.forEach(x=> sel.innerHTML += `<option value="${x.Id}">${x.Name}</option>`);
  }
  async function loadPrograms(campusId,intakeId){
    const sel=$('#programSelect'); sel.innerHTML='<option value="">Memuat…</option>';
    const j=await api(`/api/register-options?type=programs&campusId=${encodeURIComponent(campusId)}&intakeId=${encodeURIComponent(intakeId)}`); const recs=j.records||[];
    sel.innerHTML='<option value="">Pilih program</option>'; recs.forEach(x=> sel.innerHTML+=`<option value="${x.Id}">${x.Name}</option>`);
  }
  async function loadStep3Options(){ await loadCampuses(); const campusId=$('input[name="campus"]:checked')?.value; if(campusId) await loadIntakes(campusId); }
  $('#campusRadios')?.addEventListener('change', async (e)=>{ if(e.target?.name==='campus') await loadIntakes(e.target.value); });
  $('#intakeSelect')?.addEventListener('change', async ()=>{ const campusId=$('input[name="campus"]:checked')?.value||''; const intakeId=$('#intakeSelect').value||''; if(campusId&&intakeId) await loadPrograms(campusId,intakeId); });
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
  // siapkan datalist jika belum ada (HTML bisa sudah menyertakan)
  if (!$('#schoolList')) {
    const dl = document.createElement('datalist'); dl.id = 'schoolList'; document.body.appendChild(dl);
    const input = $('#schoolInput'); if (input) input.setAttribute('list','schoolList');
  }
  // autocomplete sekolah
  let schoolTimer=null;
  $('#schoolInput')?.addEventListener('input', async (e)=>{
    const term = e.target.value.trim();
    $('#schoolId').value = ''; // clear id jika user mengetik
    if (schoolTimer) clearTimeout(schoolTimer);
    if (term.length < 2) return; // jangan spam
    schoolTimer = setTimeout(async ()=>{
      try{
        const j = await api(`/api/register-options?type=schools&term=${encodeURIComponent(term)}`);
        const list = $('#schoolList'); list.innerHTML = '';
        (j.records||[]).forEach(r=>{
          const opt = document.createElement('option');
          opt.value = r.Name;
          opt.dataset.id = r.Id;
          opt.dataset.npsn = r.NPSN || '';
          list.appendChild(opt);
        });
      }catch{}
    }, 250);
  });
  // set hidden id saat blur / change cocok dengan option
  $('#schoolInput')?.addEventListener('change', ()=>{
    const val = $('#schoolInput').value.trim();
    const match = Array.from($('#schoolList')?.options||[]).find(o=>o.value===val);
    if (match) { $('#schoolId').value = match.dataset.id || ''; $('#schoolNpsnManual')?.value = match.dataset.npsn || ''; }
  });

  function populateYears(){ const sel=$('#gradYearSelect'); const now=new Date().getFullYear(); sel.innerHTML='<option value="">Pilih tahun</option>'; for(let y=now+5;y>=now-30;y--) sel.innerHTML+=`<option value="${y}">${y}</option>`; }
  $('#btnBack4').addEventListener('click', ()=> setStep(3));
  $('#formStep4').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const oppId=S.opp, accId=S.acc;
    const gradYear=$('#gradYearSelect').value;
    const chosenId=$('#schoolId').value.trim();           // kalau dari autocomplete
    const schoolText=$('#schoolInput').value.trim();      // nama yang terlihat
    const npsnManual=$('#schoolNpsnManual')?.value?.trim?.() || ''; // tambahkan input ini di HTML jika mau isi NPSN manual
    const photo=$('#photoFile').files[0];
    const msg=$('#msgStep4'); msg.style.display='none';

    if(!schoolText){ msg.textContent='Isi sekolah asal.'; msg.style.display='block'; return; }
    if(!gradYear){ msg.textContent='Pilih tahun lulus.'; msg.style.display='block'; return; }
    if(!photo){ msg.textContent='Pilih pas foto.'; msg.style.display='block'; return; }
    if(photo.size>1024*1024){ msg.textContent='Ukuran pas foto maksimal 1MB.'; msg.style.display='block'; return; }

    try{
      showLoading('Menyimpan data sekolah & pas foto…');
      // kirim – bila ada chosenId → pakai Master_School__c, else → pakai draft
      const payloadEdu = {
        opportunityId: oppId,
        accountId: accId,
        graduationYear: gradYear,
      };
      if (chosenId) {
        payloadEdu.masterSchoolId = chosenId;
      } else {
        payloadEdu.draftSchoolName = schoolText;
        payloadEdu.draftNpsn = npsnManual || null;
      }
      await api('/api/register-save-education',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payloadEdu) });

      const payloadPhoto={ opportunityId:oppId, accountId:accId, filename:photo.name, mime:photo.type||'image/jpeg', data:await fileToBase64(photo) };
      await api('/api/register-upload-photo',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payloadPhoto) });

      S.sekolah={ schoolId: chosenId || '', schoolName: schoolText, gradYear, photoName:photo.name, npsn: npsnManual||'' };
      closeLoading(); toastOk('Data sekolah & pas foto tersimpan.'); buildReview(); setStep(5);
    }catch(err){ closeLoading(); showError(err.message); }
  });

  // === STEP 5
  $('#btnBack5').addEventListener('click', ()=> setStep(4));
  function buildReview(){
    const p=S.pemohon, r=S.reg, s=S.sekolah;
    $('#reviewBox').innerHTML = `
      <div class="review-section"><h4>Data Pemohon</h4><div><b>Nama:</b> ${p.firstName} ${p.lastName}</div><div><b>Email:</b> ${p.email}</div><div><b>Phone:</b> ${p.phone}</div></div>
      <div class="review-section"><h4>Preferensi Studi</h4><div><b>Campus:</b> ${r.campusId||'-'}</div><div><b>Intake:</b> ${r.intakeId||'-'}</div><div><b>Program:</b> ${r.programId||'-'}</div></div>
      <div class="review-section"><h4>Data Sekolah</h4><div><b>Sekolah Asal:</b> ${s.schoolName}</div><div><b>NPSN:</b> ${s.npsn||'-'}</div><div><b>Tahun Lulus:</b> ${s.gradYear}</div><div><b>Pas Foto:</b> ${s.photoName}</div></div>
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
  document.addEventListener('DOMContentLoaded', ()=>{ /* opsional init */ });
})();
