// src/js/contact.js
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').toLowerCase());
  const digits = (s) => String(s || '').replace(/\D/g, '');

  // Render campus radios
  async function loadCampuses() {
    const wrap = $('#campusRadios');
    try {
      const r = await fetch('/api/salesforce-query?type=campus');
      const j = await r.json();
      const recs = j.records || [];
      if (!recs.length) {
        wrap.innerHTML = '<div class="field-error">Data campus tidak tersedia.</div>';
        return;
      }
      wrap.innerHTML = '';
      recs.forEach((c, i) => {
        const id = `camp_${c.Id}`;
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '8px';
        label.style.padding = '8px 0';
        label.innerHTML = `<input type="radio" name="campus" id="${id}" value="${c.Id}" ${i === 0 ? 'checked' : ''}> <span>${c.Name}</span>`;
        wrap.appendChild(label);
      });
    } catch (e) {
      wrap.innerHTML = '<div class="field-error">Gagal memuat data Campus.</div>';
    }
  }

  function normalizePhone(id) {
    let p = digits($(id).value || '');
    if (!p) return null;
    if (p.startsWith('0')) p = p.slice(1);
    if (!p.startsWith('62')) p = '62' + p;
    return '+' + p;
  }

  async function submitContact(e) {
    e.preventDefault();

    const first = $('#first_name')?.value.trim();
    const last = $('#last_name')?.value.trim() || '';
    const email = $('#email')?.value.trim();
    const campus = $('input[name="campus"]:checked')?.value || '';
    const jurusan = $('#major_interest')?.value.trim() || '';

    const phone = normalizePhone('#phone');

    // basic validation
    let err = '';
    if (!first) err = 'First name wajib diisi.';
    else if (!emailOk(email)) err = 'Format email tidak valid.';
    else if (!phone) err = 'Phone wajib diisi.';
    else if (!campus) err = 'Pilih salah satu campus.';
    if (err) {
      const box = $('#contactMsg');
      box.textContent = err;
      box.style.display = 'block';
      box.style.color = '#e11d48';
      return;
    }

    try {
      const btn = $('#contactForm input[type="submit"]');
      btn.disabled = true; btn.value = 'Mengirim…';

      const payload = {
        firstName: first,
        lastName: last,
        email,
        phone,                 // sudah dinormalisasi +62...
        campusId: campus,
        description: jurusan || null
      };

      const r = await fetch('/api/webtolead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || 'Gagal mengirim data.');

      // redirect success
      location.href = 'thankyou.html';
    } catch (e) {
      const box = $('#contactMsg');
      box.textContent = e.message || 'Terjadi kesalahan.';
      box.style.display = 'block';
      box.style.color = '#e11d48';
    } finally {
      const btn = $('#contactForm input[type="submit"]');
      btn.disabled = false; btn.value = 'Kirim Pesan';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadCampuses();
    $('#contactForm')?.addEventListener('submit', submitContact);
  });
})();
