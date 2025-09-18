// src/js/contact.js
(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').toLowerCase());
  const digits  = (s) => String(s || '').replace(/\D/g, '');

  // ===== Campus radios =====
  async function loadCampuses() {
    const wrap = $('#campusRadios');
    try {
      const r = await fetch('/api/salesforce-query?type=campus');
      const j = await r.json();
      const recs = j.records || [];
      if (!recs.length) { wrap.innerHTML = '<div class="field-error">Data campus tidak tersedia.</div>'; return; }
      wrap.innerHTML = '';
      recs.forEach((c, i) => {
        const id = `camp_${c.Id}`;
        const label = document.createElement('label');
        label.className = 'radio-item';
        label.htmlFor = id;
        label.innerHTML = `
          <input type="radio" id="${id}" name="campus" value="${c.Id}" ${i===0 ? 'checked' : ''}>
          <div>
            <div class="radio-title">${c.Name}</div>
          </div>
        `;
        wrap.appendChild(label);
      });
    } catch (e) {
      wrap.innerHTML = '<div class="field-error">Gagal memuat data Campus.</div>';
    }
  }

  function normalizePhone(raw) {
    let p = digits(raw || '');
    if (!p) return null;
    if (p.startsWith('0')) p = p.slice(1);
    if (!p.startsWith('62')) p = '62' + p;
    return '+' + p;
  }

  // ===== SweetAlert helper =====
  function confirmSubmitPreview(data) {
    const html = `
      <div style="text-align:left">
        <div><strong>Nama:</strong> ${data.firstName} ${data.lastName || ''}</div>
        <div><strong>Email:</strong> ${data.email}</div>
        <div><strong>Phone:</strong> ${data.phone}</div>
        <div><strong>Campus:</strong> ${data.campusName || '(terpilih)'}</div>
        <div><strong>Jurusan (opsional):</strong> ${data.description || '-'}</div>
      </div>
    `;
    return Swal.fire({
      title: 'Kirim data ini?',
      html,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Ya, kirim',
      cancelButtonText: 'Periksa lagi',
      focusConfirm: false
    });
  }

  function showLoading(title='Mengirim…') {
    Swal.fire({
      title,
      didOpen: () => Swal.showLoading(),
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false
    });
  }

  function showError(msg) {
    Swal.fire({ icon: 'error', title: 'Gagal', text: msg || 'Terjadi kesalahan.' });
  }

  async function submitContact(e) {
    e.preventDefault();

    // Ambil nilai dari "nama field custom" supaya tidak ditangkap autofill Chrome
    const first = $('#first_name')?.value.trim();
    const last  = $('#last_name')?.value.trim() || '';
    const email = $('#email')?.value.trim();
    const rawPhone = $('#phone')?.value;
    const campusId = $('input[name="campus"]:checked')?.value || '';
    const major = $('#major_interest')?.value.trim() || '';

    const phone = normalizePhone(rawPhone);

    // Validasi
    let err = '';
    if (!first) err = 'First name wajib diisi.';
    else if (!emailOk(email)) err = 'Format email tidak valid.';
    else if (!phone) err = 'Phone wajib diisi.';
    else if (!campusId) err = 'Pilih salah satu campus.';

    const msgBox = $('#contactMsg');
    if (err) {
      msgBox.textContent = err;
      msgBox.style.display = 'block';
      msgBox.style.color = '#e11d48';
      return;
    } else {
      msgBox.style.display = 'none';
    }

    // Tampilkan konfirmasi
    // (ambil nama kampus dari label yang terpilih)
    let campusName = '';
    const selected = $('input[name="campus"]:checked');
    if (selected) {
      const label = selected.closest('label');
      campusName = label ? (label.querySelector('.radio-title')?.textContent || '') : '';
    }

    const payload = {
      firstName: first,
      lastName : last,
      email,
      phone,                // sudah +62-normalized
      campusId,
      description: major || null,
      campusName            // hanya untuk preview
    };

    const confirm = await confirmSubmitPreview(payload);
    if (!confirm.isConfirmed) return;

    try {
      showLoading();

      const r = await fetch('/api/webtolead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await r.json();

      if (!r.ok || !j.success) throw new Error(j.message || 'Gagal mengirim data.');

      // Sukses
      Swal.close();
      location.href = 'thankyou.html';
    } catch (e2) {
      Swal.close();
      showError(e2.message);
    }
  }

  // Matikan autofill agresif di Chromium
  function hardenAutocomplete() {
    // setAttribute ulang setelah load (beberapa browser override)
    ['first_name','last_name','email','phone','major_interest'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.setAttribute('autocomplete', 'off');
        el.setAttribute('autocapitalize', 'off');
        el.setAttribute('spellcheck', 'false');
      }
    });
    const form = $('#contactForm');
    form?.setAttribute('autocomplete', 'off');
  }

  document.addEventListener('DOMContentLoaded', () => {
    hardenAutocomplete();
    loadCampuses();
    $('#contactForm')?.addEventListener('submit', submitContact);
  });
})();
