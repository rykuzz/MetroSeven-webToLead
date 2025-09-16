document.addEventListener("DOMContentLoaded", () => {
  // ---------- Helpers ----------
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

  // Safety guard: kalau tombol tidak ada, log & hentikan biar tidak error
  if (!el.btnNext || !el.btnPrev) {
    console.error("Elemen tombol tidak ditemukan. Pastikan id='btnNext' & id='btnPrev' ada di HTML.");
    return;
  }

  async function getJSON(url){
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
  }
  function formatPhone(num) {
    if (!num) return "";
    let clean = num.replace(/\D/g, "");
    if (clean.startsWith("0")) clean = clean.slice(1);
    return clean;
  }

  // ---------- Wizard State ----------
  let currentStep = 1;
  const maxStep = 4;

  function updateProgress() {
    const pct = (currentStep / maxStep) * 100;
    el.progressBar.style.width = pct + "%";
    el.steps.forEach(s => {
      const step = Number(s.dataset.step);
      s.classList.toggle("is-active", step === currentStep);
      s.classList.toggle("is-done", step < currentStep);
    });
  }
  function showStep(step) {
    currentStep = Math.max(1, Math.min(maxStep, step));
    el.panels.forEach(p => { p.hidden = Number(p.dataset.step) !== currentStep; });
    el.btnPrev.disabled = currentStep === 1;
    el.btnNext.textContent = currentStep === maxStep ? "Kirim" : "Lanjut";
    updateProgress();
    if (currentStep === 4) renderReview();
  }

  // ---------- Validation ----------
  function validStep1() {
    const first = $("firstName").value.trim();
    const last  = $("lastName").value.trim();
    const email = $("email").value.trim();
    const phoneRaw = $("phone").value.trim();

    if (!first || !last || !email || !phoneRaw) {
      el.formMsg.textContent = "Nama depan, nama belakang, email, dan no. HP wajib diisi.";
      return false;
    }
    if (!validateEmail(email)) {
      el.formMsg.textContent = "Format email tidak valid.";
      return false;
    }
    const formatted = formatPhone(phoneRaw);
    if (formatted.length < 9) {
      el.formMsg.textContent = "Nomor HP minimal 9 digit setelah +62.";
      return false;
    }
    el.formMsg.textContent = "";
    return true;
  }
  function validStep2() {
    if (!$("programId").value) {
      el.formMsg.textContent = "Pilih Study Program dari daftar.";
      return false;
    }
    if (!$("intakeId").value) {
      el.formMsg.textContent = "Pilih Tahun Ajaran dari daftar.";
      return false;
    }
    el.formMsg.textContent = "";
    return true;
  }
  function validStep3() {
    if ($("manualSchool").checked && !$("manualSchoolInput").value.trim()) {
      el.formMsg.textContent = "Isi Nama Sekolah (input manual).";
      return false;
    }
    el.formMsg.textContent = "";
    return true;
  }
  function validStep4() {
    if (!$("consentCheck").checked) {
      el.formMsg.textContent = "Mohon setujui kebijakan privasi.";
      return false;
    }
    el.formMsg.textContent = "";
    return true;
  }

  // ---------- Review ----------
  function renderReview() {
    const data = collectPayload(false);
    const rows = [
      ["Nama", `${data.firstName || ""} ${data.lastName || ""}`.trim()],
      ["Email", data.email || "-"],
      ["No. HP", data.phone || "-"],
      ["Study Program", data.studyProgramName || "-"],
      ["Campus", $("campus").value || "-"],
      ["Tahun Ajaran", $("intake").value || "-"],
      ["Sekolah", data.schoolName || "-"],
      ["Tahun Lulus", data.graduationYear || "-"]
    ];
    $("reviewContent").innerHTML = rows.map(([k,v]) =>
      `<div class="review-row"><div class="review-key">${k}</div><div class="review-val">${v}</div></div>`
    ).join("");
  }

  // ---------- Autocomplete ----------
  function buildMenu(inputEl, listEl, items, onChoose) {
    listEl.innerHTML = "";
    const list = items.records || items;
    if (!list || list.length === 0) { listEl.hidden = true; return; }
    list.forEach(it => {
      const li = document.createElement("li");
      li.textContent = it.Name || it.name;
      li.onclick = () => { inputEl.value = it.Name || it.name; onChoose(it); listEl.hidden = true; };
      listEl.appendChild(li);
    });
    listEl.hidden = false;
  }
  function wireAutocomplete(inputId, listId, type, onPicked){
    const input=document.getElementById(inputId);
    const list =document.getElementById(listId);
    if (!input || !list) return; // guard: kalau id-nya belum ada
    let t;
    input.addEventListener("input", ()=>{
      const q=input.value.trim(); if(q.length<2){ list.hidden=true; return;}
      clearTimeout(t);
      t=setTimeout(async()=>{
        try {
          const data = await getJSON(`/api/salesforce-query?type=${encodeURIComponent(type)}&term=${encodeURIComponent(q)}`);
          buildMenu(input, list, data, (it)=> onPicked(it));
        } catch (e) {
          console.error(e);
          list.hidden = true;
        }
      }, 250);
    });
    document.addEventListener("click",(e)=>{ if(!list.contains(e.target) && e.target!==input) list.hidden=true; });
  }

  // Wire lookups
  wireAutocomplete("program","programList","jurusan",(it)=>{ $("programId").value=it.Id; $("programName").value=it.Name; });
  wireAutocomplete("campus","campusList","campus",(it)=>{ $("campusId").value=it.Id; });
  wireAutocomplete("intake","intakeList","intake",(it)=>{ $("intakeId").value=it.Id; });
  wireAutocomplete("school","schoolList","sekolah",(it)=>{ $("schoolName").value=it.Name; });

  // Manual school toggle
  const manualSchool = $("manualSchool");
  if (manualSchool) {
    manualSchool.addEventListener("change",(e)=>{
      $("manualSchoolBox").hidden = !e.target.checked;
      if (e.target.checked) {
        $("school").value = "";
        $("schoolName").value = "";
        $("manualSchoolInput").focus();
      }
    });
  }

  // Campaign from URL (?cmp=701xxx)
  (()=>{ const u=new URLSearchParams(location.search); const cmp=u.get("cmp"); if(cmp) $("campaignId").value=cmp; })();

  // ---------- Payload ----------
  function collectPayload(forSubmit=true){
    const rawPhone = $("phone").value.trim();
    const formattedPhone = rawPhone ? formatPhone(rawPhone) : null;

    return {
      firstName: $("firstName").value.trim(),
      lastName : $("lastName").value.trim() || "-",
      email    : $("email").value.trim(),
      phone    : formattedPhone ? `+62${formattedPhone}` : null,
      studyProgramId: $("programId").value || null,
      studyProgramName: $("programName").value || null,
      campusId: $("campusId").value || null,
      masterIntakeId: $("intakeId").value || null,
      schoolName: $("manualSchool")?.checked
        ? $("manualSchoolInput").value.trim()
        : ($("schoolName").value || $("school").value.trim() || null),
      graduationYear: $("graduationYear").value ? Number($("graduationYear").value) : null,
      campaignId: $("campaignId").value || null
    };
  }

  // ---------- Nav & Submit ----------
  el.btnPrev.addEventListener("click",()=> showStep(currentStep-1));
  el.btnNext.addEventListener("click", async ()=>{
    if (currentStep===1 && !validStep1()) return;
    if (currentStep===2 && !validStep2()) return;
    if (currentStep===3 && !validStep3()) return;

    if (currentStep < 4) { showStep(currentStep + 1); return; }
    if (!validStep4()) return;

    el.btnNext.disabled = true; el.btnNext.textContent = "Mengirim…";
    el.formMsg.textContent = "";

    try {
      const payload = collectPayload(true);
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        window.location.href = "thankyou.html";
      } else {
        el.formMsg.textContent = "Gagal: " + (json.error || json.message || "Unknown");
        el.btnNext.disabled = false; el.btnNext.textContent = "Kirim";
      }
    } catch (e) {
      console.error(e);
      el.formMsg.textContent = "Terjadi kesalahan jaringan. Coba lagi.";
      el.btnNext.disabled = false; el.btnNext.textContent = "Kirim";
    }
  });

  // Init
  showStep(1);
});
