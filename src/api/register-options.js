// src/js/register-options.js
(function () {
  // Cari elemen dengan banyak kemungkinan ID/NAME agar tidak tergantung 1 ID saja
  function pickOne(selectors) {
    for (const s of selectors) {
      const n = document.querySelector(s);
      if (n) return n;
    }
    return null;
  }

  const NODE = {
    campus: () =>
      pickOne(['#campusSelect', '#campus', '#campus_id', 'select[name="campus"]']),
    intake: () =>
      pickOne(['#intakeSelect', '#intake', '#academicTerm', 'select[name="intake"]']),
    program: () =>
      pickOne(['#programSelect', '#studyProgram', '#study_program', 'select[name="program"]']),
    campusError: () =>
      pickOne(['#campusError', '.campus-error', '[data-error="campus"]']),
  };

  // PAKAI .js karena deploy kamu expose /api/*.js (lihat /api/ping.js)
  const API = {
    campus: '/api/salesforce-query.js?type=campus',
    intake: '/api/salesforce-query.js?type=intake',
    program: (campusId) =>
      `/api/salesforce-query.js?type=program&campusId=${encodeURIComponent(campusId)}`,
  };

  async function fetchJSON(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    let payload = null;
    try {
      payload = await r.clone().json();
    } catch (_) {}
    if (!r.ok) {
      const msg = payload && payload.message ? payload.message : `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return payload;
  }

  function renderSelect(node, placeholder, rows, map = (x) => x) {
    if (!node) return; // kalau node ga ada, jangan meledak
    node.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    node.appendChild(ph);
    (rows || []).map(map).forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r.value;
      opt.textContent = r.label;
      node.appendChild(opt);
    });
  }

  function setError(node, msg) {
    if (node) node.textContent = msg || '';
  }

  async function loadCampus() {
    const sel = NODE.campus();
    const err = NODE.campusError();
    try {
      if (!sel) throw new Error('Elemen <select> Campus tidak ditemukan (cek ID/NAME HTML).');
      const data = await fetchJSON(API.campus);
      renderSelect(sel, 'Pilih campus', data.records, (r) => ({ value: r.Id, label: r.Name }));
      setError(err, '');
      console.debug('[Campus] loaded:', data.records?.length || 0);
    } catch (e) {
      console.error('loadCampus error:', e);
      setError(err, `Gagal memuat campus: ${e.message}`);
      renderSelect(sel || document.createElement('select'), 'Pilih campus', []);
    }
  }

  async function loadIntakes() {
    const sel = NODE.intake();
    try {
      if (!sel) return; // optional
      const data = await fetchJSON(API.intake);
      renderSelect(sel, 'Pilih tahun ajaran', data.records, (r) => ({ value: r.Id, label: r.Name }));
      console.debug('[Intake] loaded:', data.records?.length || 0);
    } catch (e) {
      console.error('loadIntakes error:', e);
      renderSelect(sel, 'Pilih tahun ajaran', []);
    }
  }

  async function loadProgramsByCampus(campusId) {
    const sel = NODE.program();
    try {
      if (!sel) return; // optional
      if (!campusId) return renderSelect(sel, 'Pilih program', []);
      const data = await fetchJSON(API.program(campusId));
      renderSelect(sel, 'Pilih program', data.records, (r) => ({ value: r.Id, label: r.Name }));
      console.debug('[Program] loaded:', data.records?.length || 0);
    } catch (e) {
      console.error('loadProgramsByCampus error:', e);
      renderSelect(sel, 'Pilih program', []);
    }
  }

  async function initRegistrationOptions() {
    await Promise.all([loadCampus(), loadIntakes()]);
    const campusSel = NODE.campus();
    if (campusSel) {
      campusSel.addEventListener('change', (ev) => loadProgramsByCampus(ev.target.value));
    }
  }

  // Panggil otomatis saat DOM siap,
  // tetapi tetap expose ke window untuk dipanggil manual dari wizard.
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(initRegistrationOptions);
  window.__RegisterOptions = { initRegistrationOptions, loadProgramsByCampus };
})();
