// src/js/register-options.js
(function () {
  const SEL = {
    campus: '#campusSelect',
    intake: '#intakeSelect',
    program: '#programSelect',
    campusError: '#campusError'
  };

  // NOTE: gunakan .js karena di deploy kamu endpoint .js yang pasti hidup (lihat /api/ping.js)
  const API = {
    campus: '/api/salesforce-query.js?type=campus',
    intake: '/api/salesforce-query.js?type=intake',
    program: (campusId) => `/api/salesforce-query.js?type=program&campusId=${encodeURIComponent(campusId)}`
  };

  async function fetchJSON(url) {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    let payload = null;
    try { payload = await r.clone().json(); } catch (_) {}
    if (!r.ok) {
      const msg = payload && payload.message ? payload.message : `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return payload;
  }

  function el(q){ return document.querySelector(q); }
  function renderSelect(node, placeholder, rows, map = x => x){
    node.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = placeholder;
    node.appendChild(ph);
    (rows || []).map(map).forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.value; opt.textContent = r.label;
      node.appendChild(opt);
    });
  }
  function setError(q, msg){ const n = el(q); if (n) n.textContent = msg || ''; }

  async function loadCampus() {
    const node = el(SEL.campus);
    try {
      const data = await fetchJSON(API.campus);
      renderSelect(node, 'Pilih campus', data.records, r => ({ value: r.Id, label: r.Name }));
      setError(SEL.campusError, '');
    } catch (e) {
      console.error('loadCampus', e);
      setError(SEL.campusError, `Gagal memuat campus: ${e.message}`);
      renderSelect(node, 'Pilih campus', []);
    }
  }

  async function loadIntakes() {
    const node = el(SEL.intake);
    try {
      const data = await fetchJSON(API.intake);
      renderSelect(node, 'Pilih tahun ajaran', data.records, r => ({ value: r.Id, label: r.Name }));
    } catch (e) {
      console.error('loadIntakes', e);
      renderSelect(node, 'Pilih tahun ajaran', []);
    }
  }

  async function loadProgramsByCampus(campusId) {
    const node = el(SEL.program);
    try {
      if (!campusId) return renderSelect(node, 'Pilih program', []);
      const data = await fetchJSON(API.program(campusId));
      renderSelect(node, 'Pilih program', data.records, r => ({ value: r.Id, label: r.Name }));
    } catch (e) {
      console.error('loadProgramsByCampus', e);
      renderSelect(node, 'Pilih program', []);
    }
  }

  async function initRegistrationOptions() {
    await Promise.all([loadCampus(), loadIntakes()]);
    const campusSelect = el(SEL.campus);
    if (campusSelect) {
      campusSelect.addEventListener('change', (ev) => loadProgramsByCampus(ev.target.value));
    }
  }

  window.__RegisterOptions = { initRegistrationOptions, loadProgramsByCampus };
})();
