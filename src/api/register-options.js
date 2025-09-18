// src/js/register-options.js
// Util untuk memuat dropdown di Step 3: Campus, Intake (Master Intake), Study Program (by Campus).

(function () {
  // ======= Konfigurasi selector (samakan dengan ID di register.html) =======
  const SEL = {
    campus: '#campusSelect',     // <select id="campusSelect">
    intake: '#intakeSelect',     // <select id="intakeSelect">
    program: '#programSelect',   // <select id="programSelect">
    campusError: '#campusError', // elemen kecil/label untuk pesan error campus (opsional)
  };

  // ======= Utils fetch =======
  async function fetchJSON(url) {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).message || ''; } catch (_) { /* ignore */ }
      throw new Error(msg || `HTTP ${r.status}`);
    }
    return r.json();
  }

  function el(q) { return document.querySelector(q); }

  function renderSelect(selectEl, placeholder, records, map = x => x) {
    const list = (records || []).map(map);
    selectEl.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    selectEl.appendChild(ph);
    for (const r of list) {
      const opt = document.createElement('option');
      opt.value = r.value;
      opt.textContent = r.label;
      selectEl.appendChild(opt);
    }
  }

  function showError(target, msg) {
    const e = el(target);
    if (e) e.textContent = msg || '';
  }
  function clearError(target) {
    const e = el(target);
    if (e) e.textContent = '';
  }

  // ======= Loaders =======
  async function loadCampus() {
    const select = el(SEL.campus);
    try {
      const data = await fetchJSON('/api/salesforce-query?type=campus');
      renderSelect(
        select,
        'Pilih campus',
        data.records,
        r => ({ value: r.Id, label: r.Name })
      );
      clearError(SEL.campusError);
    } catch (err) {
      console.error('loadCampus error:', err);
      showError(SEL.campusError, 'Gagal memuat campus.');
      // tetap render placeholder agar UI tidak kosong
      renderSelect(select, 'Pilih campus', []);
    }
  }

  async function loadIntakes() {
    const select = el(SEL.intake);
    try {
      const data = await fetchJSON('/api/salesforce-query?type=intake');
      renderSelect(
        select,
        'Pilih tahun ajaran',
        data.records,
        r => ({ value: r.Id, label: r.Name })
      );
    } catch (err) {
      console.error('loadIntakes error:', err);
      renderSelect(select, 'Pilih tahun ajaran', []);
    }
  }

  async function loadProgramsByCampus(campusId) {
    const select = el(SEL.program);
    if (!campusId) {
      renderSelect(select, 'Pilih program', []);
      return;
    }
    try {
      const url = `/api/salesforce-query?type=program&campusId=${encodeURIComponent(campusId)}`;
      const data = await fetchJSON(url);
      renderSelect(
        select,
        'Pilih program',
        data.records,
        r => ({ value: r.Id, label: r.Name })
      );
    } catch (err) {
      console.error('loadProgramsByCampus error:', err);
      renderSelect(select, 'Pilih program', []);
    }
  }

  // ======= Init (dipanggil saat Step 3 tampil / DOM siap) =======
  async function initRegistrationOptions() {
    await Promise.all([loadCampus(), loadIntakes()]);
    const campusSelect = el(SEL.campus);
    if (campusSelect) {
      campusSelect.addEventListener('change', (e) => {
        loadProgramsByCampus(e.target.value);
      });
    }
  }

  // Ekspor ke window agar bisa dipanggil dari register-wizard.js
  window.__RegisterOptions = { initRegistrationOptions, loadProgramsByCampus };
})();
