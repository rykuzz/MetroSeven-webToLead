// js/promos.js
(function(){
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const grid = $("#grid");
  const qEl = $("#q");
  const statusEl = $("#status");
  const sortEl = $("#sort");
  const msgEl = $("#msg");
  const prevBtn = $("#prev");
  const nextBtn = $("#next");
  const pageInfo = $("#pageInfo");

  let state = { q:"", status:"active", sort:"startDateDesc", page:1, limit:12, total:0 };
  const rupiah = v => v==null ? null : new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(v);
  const fmtDate = d => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : null;

  function card(record){
    const { id, name, description, imageUrl, startDate, endDate, status, category, price, discountPercent } = record;
    const dateStr = [fmtDate(startDate), fmtDate(endDate)].filter(Boolean).join(' — ');
    const desc = (description || '').replace(/<[^>]+>/g,'').slice(0, 160) + ((description||'').length>160 ? '…':'');
    const priceStr = price!=null ? rupiah(price) : null;
    const discountStr = discountPercent!=null ? `${discountPercent}% OFF` : null;
    const img = imageUrl || 'assets/images/promo-placeholder.jpg';

    return `
      <article class="card" data-campaign="${id}">
        <div class="thumb">
          <img src="${img}" alt="${name}">
          ${discountStr ? `<span class="badge badge-sale">${discountStr}</span>` : ''}
          ${category ? `<span class="badge badge-cat">${category}</span>` : ''}
          <span class="badge badge-quota" data-quota-for="${id}" hidden>Kuota: …</span>
        </div>
        <div class="card-body">
          <h3 class="title">${name}</h3>
          ${dateStr ? `<div class="meta">${dateStr}</div>` : ''}
          <p class="desc">${desc || ''}</p>
          <div class="cta">
            <div class="pricing">
              ${priceStr ? `<span class="price">${priceStr}</span>` : ''}
              <span class="status ${status ? 'st-'+status.toLowerCase().replace(/\s+/g,'-'):''}">${status || ''}</span>
            </div>
            <div class="actions">
              <button class="btn btn-primary" type="button" data-register data-campaign="${id}" data-name="${name}">Daftar Promo</button>
              <a class="btn" href="register.html?cmp=${id}">Daftar Umum</a>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  async function load(){
    msgEl.textContent = "Memuat promo…";
    grid.innerHTML = "";
    prevBtn.disabled = true; nextBtn.disabled = true;

    const params = new URLSearchParams({
      q: state.q, status: state.status, sort: state.sort,
      page: String(state.page), limit: String(state.limit)
    });
    try {
      const r = await fetch(`/api/campaigns?${params}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Gagal mengambil data");

      state.total = j.total || 0;
      const items = j.records || [];
      grid.innerHTML = items.length ? items.map(card).join("") : `<div class="empty">Belum ada promo untuk filter ini.</div>`;

      const maxPage = Math.max(1, Math.ceil(state.total / state.limit));
      pageInfo.textContent = `Halaman ${state.page} dari ${maxPage}`;
      prevBtn.disabled = state.page <= 1;
      nextBtn.disabled = state.page >= maxPage || !j.hasMore;
      msgEl.textContent = "";

      // kuota realtime
      items.forEach(it => updateQuota(it.id));
      startQuotaAutoRefresh();
    } catch (e) {
      console.error(e); msgEl.textContent = e.message || "Terjadi kesalahan memuat promo.";
    }
  }

  async function updateQuota(campaignId){
    const badge = document.querySelector(`[data-quota-for="${campaignId}"]`);
    const card  = document.querySelector(`.card[data-campaign="${campaignId}"]`);
    const btn   = card?.querySelector('[data-register]');
    if (!badge) return;

    try {
      const r = await fetch(`/api/campaign-stats?campaignId=${encodeURIComponent(campaignId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Gagal ambil kuota");

      if (j.quota == null) {
        badge.hidden = true;
        return;
      }
      const txt = (j.remaining ?? null) != null
        ? (j.remaining > 0 ? `Kuota tersisa: ${j.remaining}` : `Kuota penuh`)
        : `Kuota: ${j.quota}`;

      badge.textContent = txt;
      badge.hidden = false;

      if (j.remaining !== null && j.remaining <= 0) {
        btn?.setAttribute('disabled','disabled');
        btn?.classList.add('is-disabled');
      } else {
        btn?.removeAttribute('disabled');
        btn?.classList.remove('is-disabled');
      }
    } catch (e) {
      console.warn('quota error', e.message);
    }
  }

  let quotaTimer = null;
  function startQuotaAutoRefresh(){
    if (quotaTimer) clearInterval(quotaTimer);
    quotaTimer = setInterval(()=>{
      $$('.card[data-campaign]').forEach(card=>{
        const id = card.getAttribute('data-campaign');
        updateQuota(id);
      });
    }, 30000); // 30s
  }

  // filters & paging
  let t;
  qEl.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(()=>{ state.q=qEl.value.trim(); state.page=1; load(); },300); });
  statusEl.addEventListener('change', ()=>{ state.status=statusEl.value; state.page=1; load(); });
  sortEl.addEventListener('change',   ()=>{ state.sort=sortEl.value;   state.page=1; load(); });
  prevBtn.addEventListener('click',   ()=>{ if(state.page>1){ state.page--; load(); }});
  nextBtn.addEventListener('click',   ()=>{ state.page++; load(); });

  // modal daftar promo (Lead)
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-register]');
    if (!btn) return;
    openRegisterModal({ campaignId: btn.dataset.campaign, campaignName: btn.dataset.name });
  });

  function openRegisterModal({ campaignId, campaignName }){
    const m = document.getElementById('interestModal');
    m.querySelector('[data-campaign-name]').textContent = campaignName || 'Campaign';
    m.querySelector('#interest_campaignId').value = campaignId;
    m.classList.add('show');
    m.querySelector('#interest_firstName').focus();
  }
  document.getElementById('interest_close').addEventListener('click', ()=> {
    document.getElementById('interestModal').classList.remove('show');
  });
  document.getElementById('interest_phone').addEventListener('input', (e)=> {
    e.target.value = e.target.value.replace(/\D/g,'');
  });

  document.getElementById('interest_form').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const msg = document.getElementById('interest_msg');
    msg.textContent = '';

    const firstName = document.getElementById('interest_firstName').value.trim();
    const lastName  = document.getElementById('interest_lastName').value.trim();
    const email     = document.getElementById('interest_email').value.trim();
    const phoneRaw  = document.getElementById('interest_phone').value.trim();
    const campaignId= document.getElementById('interest_campaignId').value;

    if (!firstName || !lastName || !email) { msg.textContent = 'Nama & email wajib diisi.'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase())) { msg.textContent = 'Format email tidak valid.'; return; }

    let s = phoneRaw.replace(/\D/g,''); if (s.startsWith('0')) s = s.slice(1);
    const phone = s ? `+62${s}` : null;

    const payload = { firstName, lastName, email, phone, campaignId, leadSource:'Promo Page', leadStatus:'Open - Not Contacted', campaignMemberStatus:'Responded' };

    try {
      const r = await fetch('/api/lead-interest', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || 'Gagal menyimpan pendaftaran');

      msg.style.color = '#16a34a';
      msg.textContent = 'Terima kasih! Pendaftaran promo Anda diterima.';
      updateQuota(campaignId); // refresh kuota setelah submit

      setTimeout(()=>{
        document.getElementById('interestModal').classList.remove('show');
        document.getElementById('interest_form').reset();
        msg.textContent=''; msg.style.color='';
      }, 1200);
    } catch (e) {
      console.error(e);
      msg.textContent = e.message || 'Terjadi kesalahan. Coba lagi.';
    }
  });

  // init
  load();
})();
