// js/register-script.js
document.addEventListener("DOMContentLoaded", () => {
  const $  = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const el = {
    btnNext: $("btnNext"),
    btnPrev: $("btnPrev"),
    progressBar: $("progressBar"),
    panels: $$(".wizard-panel"),
    steps: $$(".wizard-step"),
    formMsg: $("formMsg"),
  };
  if (!el.btnNext || !el.btnPrev) return;

  // utils
  async function getJSON(url){ const r=await fetch(url); if(!r.ok) throw new Error(await r.text()); return r.json(); }
  function validateEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).toLowerCase()); }
  function formatPhone(num){ if(!num) return ""; let s=num.replace(/\D/g,""); if(s.startsWith("0")) s=s.slice(1); return s; }

  // keep digits only while typing phone
  $("phone")?.addEventListener("input", () => {
    $("phone").value = $("phone").value.replace(/\D/g,"");
  });

  // wizard state
  let currentStep = 1; const maxStep = 4;
  function updateProgress(){
    el.progressBar.style.width = (currentStep/maxStep*100) + "%";
    el.steps.forEach(s=>{
      const n=+s.dataset.step;
      s.classList.toggle("is-active", n===currentStep);
      s.classList.toggle("is-done",   n< currentStep);
    });
  }
  function showStep(n){
    currentStep = Math.max(1, Math.min(maxStep, n));
    el.panels.forEach(p=> p.hidden = (+p.dataset.step!==currentStep));
    el.btnPrev.disabled = currentStep===1;
    el.btnNext.textContent = currentStep===maxStep ? "Kirim" : "Lanjut";
    updateProgress();
    if (currentStep===4) renderReview();
  }

  // validations
  function validStep1(){
    const first=$("firstName").value.trim();
    const last =$("lastName").value.trim();
    const email=$("email").value.trim();
    const phone=$("phone").value.trim();
    if(!first||!last||!email||!phone){ el.formMsg.textContent="Nama, email, dan no. HP wajib diisi."; return false; }
    if(!validateEmail(email)){ el.formMsg.textContent="Format email tidak valid."; return false; }
    if(formatPhone(phone).length<9){ el.formMsg.textContent="Nomor HP minimal 9 digit setelah +62."; return false; }
    el.formMsg.textContent=""; return true;
  }
  function validStep2(){
    if(!$("programId").value){ el.formMsg.textContent="Pilih Study Program dari daftar."; return false; }
    if(!$("intakeId").value){ el.formMsg.textContent="Pilih Tahun Ajaran dari daftar."; return false; }
    el.formMsg.textContent=""; return true;
  }
  function validStep3(){
    if($("manualSchool")?.checked && !$("manualSchoolInput").value.trim()){
      el.formMsg.textContent="Isi Nama Sekolah (input manual)."; return false;
    }
    el.formMsg.textContent=""; return true;
  }
  function validStep4(){
    if(!$("consentCheck").checked){ el.formMsg.textContent="Mohon setujui kebijakan privasi."; return false; }
    el.formMsg.textContent=""; return true;
  }

  // review
  function renderReview(){
    const data = collectPayload(false);
    const rows = [
      ["Nama", `${data.firstName||""} ${data.lastName||""}`.trim()],
      ["Email", data.email||"-"],
      ["No. HP", data.phone||"-"],
      ["Study Program", data.studyProgramName||"-"],
      ["Campus", $("campus").value||"-"],
      ["Tahun Ajaran", $("intake").value||"-"],
      ["Sekolah", $("manualSchool")?.checked ? $("manualSchoolInput").value : ($("schoolName").value || $("school").value) || "-"],
      ["Tahun Lulus", data.graduationYear||"-"]
    ];
    $("reviewContent").innerHTML = rows.map(([k,v]) =>
      `<div class="review-row"><div class="review-key">${k}</div><div class="review-val">${v}</div></div>`
    ).join("");
  }

  // autocomplete
  function buildMenu(inputEl, listEl, items, onChoose){
    listEl.innerHTML="";
    const list = items.records||items;
    if(!list||!list.length){ listEl.hidden=true; return; }
    list.forEach(it=>{
      const li=document.createElement("li");
      li.textContent = it.Name || it.name;
      li.onclick = ()=>{ inputEl.value = it.Name||it.name; onChoose(it); listEl.hidden=true; };
      listEl.appendChild(li);
    });
    listEl.hidden=false;
  }
  function wireAutocomplete(inputId, listId, type, onPicked){
    const input=$(inputId); const list=$(listId);
    if(!input||!list) return;
    let t;
    input.addEventListener("input", ()=>{
      const q=input.value.trim(); if(q.length<2){ list.hidden=true; return; }
      clearTimeout(t);
      t=setTimeout(async ()=>{
        try{
          const data = await getJSON(`/api/salesforce-query?type=${encodeURIComponent(type)}&term=${encodeURIComponent(q)}`);
          buildMenu(input, list, data, onPicked);
        }catch(e){ console.error(e); list.hidden=true; }
      }, 250);
    });
    document.addEventListener("click",(e)=>{ if(!list.contains(e.target)&&e.target!==input) list.hidden=true; });
  }

  // wiring lookups
  wireAutocomplete("program","programList","jurusan",(it)=>{ $("programId").value=it.Id; $("programName").value=it.Name; });
  wireAutocomplete("campus","campusList","campus",(it)=>{ $("campusId").value=it.Id; });
  wireAutocomplete("intake","intakeList","intake",(it)=>{ $("intakeId").value=it.Id; });
  wireAutocomplete("school","schoolList","sekolah",(it)=>{ $("schoolId").value=it.Id; $("schoolName").value=it.Name; $("school").value=it.Name; });

  // manual school toggle
  $("manualSchool")?.addEventListener("change",(e)=>{
    $("manualSchoolBox").hidden = !e.target.checked;
    if(e.target.checked){
      $("school").value=""; $("schoolId").value=""; $("schoolName").value=""; $("manualSchoolInput").focus();
    }
  });

  // campaign from URL (?cmp=701xxx)
  (()=>{ const u=new URLSearchParams(location.search); const cmp=u.get("cmp"); if(cmp) $("campaignId").value=cmp; })();

  // payload
  function collectPayload(){
    const phone = $("phone").value.trim();
    const normalized = formatPhone(phone);
    return {
      firstName: $("firstName").value.trim(),
      lastName : $("lastName").value.trim() || "-",
      email    : $("email").value.trim(),
      phone    : normalized ? `+62${normalized}` : null,
      studyProgramId: $("programId").value || null,
      studyProgramName: $("programName").value || null,
      campusId: $("campusId").value || null,
      masterIntakeId: $("intakeId").value || null,
      schoolId: $("schoolId").value || null, // untuk Account.MasterSchool__c
      schoolName: $("manualSchool")?.checked ? $("manualSchoolInput").value.trim()
                 : ($("schoolName").value || $("school").value.trim() || null),
      graduationYear: $("graduationYear").value ? Number($("graduationYear").value) : null,
      campaignId: $("campaignId").value || null
    };
  }

  // nav & submit
  el.btnPrev.addEventListener("click", ()=> showStep(currentStep-1));
  el.btnNext.addEventListener("click", async ()=>{
    if(currentStep===1 && !validStep1()) return;
    if(currentStep===2 && !validStep2()) return;
    if(currentStep===3 && !validStep3()) return;

    if(currentStep<4){ showStep(currentStep+1); return; }
    if(!validStep4()) return;

    el.btnNext.disabled=true; el.btnNext.textContent="Mengirim…"; el.formMsg.textContent="";
    try{
      const payload = collectPayload();
      const r = await fetch("/api/register", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if(j.success){ window.location.href="thankyou.html"; }
      else{ el.formMsg.textContent = "Gagal: " + (j.message || j.error || "Unknown"); el.btnNext.disabled=false; el.btnNext.textContent="Kirim"; }
    }catch(e){
      console.error(e); el.formMsg.textContent="Terjadi kesalahan jaringan. Coba lagi.";
      el.btnNext.disabled=false; el.btnNext.textContent="Kirim";
    }
  });

  // init
  showStep(1);
});
