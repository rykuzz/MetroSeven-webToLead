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
  const max = now + 5;
  sel.innerHTML = '<option value="">Pilih tahun</option>';
  for (let y = now; y <= max; y++) {
    sel.innerHTML += `<option value="${y}">${y}</option>`;
  }
}

// — Autocomplete sekolah
function attachSchoolAutocomplete(){
  const input = $('#schoolInput');
  const hidden = $('#schoolId');

  // container dropdown
  let box = document.createElement('div');
  box.id = 'schoolSuggestBox';
  box.style.position = 'absolute';
  box.style.zIndex = '9999';
  box.style.background = '#fff';
  box.style.border = '1px solid #ddd';
  box.style.borderRadius = '8px';
  box.style.boxShadow = '0 8px 24px rgba(0,0,0,.12)';
  box.style.padding = '4px 0';
  box.style.display = 'none';
  document.body.appendChild(box);

  function placeBox() {
    const r = input.getBoundingClientRect();
    box.style.left = `${window.scrollX + r.left}px`;
    box.style.top = `${window.scrollY + r.bottom + 4}px`;
    box.style.width = `${r.width}px`;
  }

  function show(items){
    if (!items || !items.length) { box.style.display = 'none'; return; }
    placeBox();
    box.innerHTML = '';
    items.forEach(it => {
      const div = document.createElement('div');
      div.style.padding = '8px 12px';
      div.style.cursor = 'pointer';
      div.onmouseenter = () => div.style.background = '#f6f6f6';
      div.onmouseleave = () => div.style.background = 'transparent';
      const label = it.NPSN ? `${it.Name} (${it.NPSN})` : it.Name;
      div.textContent = label;
      div.addEventListener('click', () => {
        input.value = label;
        hidden.value = it.Id;
        box.style.display = 'none';
      });
      box.appendChild(div);
    });
    box.style.display = 'block';
  }

  let timer = null;
  async function search(term){
    if (!term || term.length < 2) { show([]); return; }
    try{
      const res = await fetch(`/api/register-options?type=schools&term=${encodeURIComponent(term)}`);
      const data = await res.json();
      show((data.records || []).map(r => ({ Id:r.Id, Name:r.Name, NPSN:r.NPSN || null })));
    }catch{ show([]); }
  }

  input.addEventListener('input', () => {
    hidden.value = '';
    clearTimeout(timer);
    timer = setTimeout(() => search(input.value.trim()), 250);
  });

  window.addEventListener('resize', placeBox);
  window.addEventListener('scroll', placeBox, true);
  input.addEventListener('focus', placeBox);
  document.addEventListener('click', (e)=>{
    if (e.target !== input && !box.contains(e.target)) box.style.display = 'none';
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  // panggil ini saat masuk Step 4
  if (document.querySelector('[data-step="4"]')) {
    populateYears();
    attachSchoolAutocomplete();
  }
});

