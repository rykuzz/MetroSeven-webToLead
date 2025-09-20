(() => {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const grid     = $("#grid");
  const qEl      = $("#q");
  const statusEl = $("#status");
  const sortEl   = $("#sort");
  const msgEl    = $("#msg");
  const prevBtn  = $("#prev");
  const nextBtn  = $("#next");
  const pageInfo = $("#pageInfo");
  const submitBtn= $("#interest_submit");

  // featured carousel els
  const featWrap = $("#featured");
  const featTrack= $("#featTrack");
  const featDots = $("#featDots");
  const featPrev = $("#featPrev");
  const featNext = $("#featNext");

  let state = { q: "", status: "active", sort: "startDateDesc", page: 1, limit: 12, total: 0 };

  const rupiah  = v => v==null ? null : new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(v);
  const fmtDate = d => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : null;

  // ===== Featured Carousel =====
  let slides = [];
  let current = 0;
  let autoTimer = null;
  const AUTO_INTERVAL = 5000;

  function buildSlide(rec){
    const img = rec.imageUrl || 'assets/images/promo-placeholder.jpg';
    const dateStr = [fmtDate(rec.startDate), fmtDate(rec.endDate)].filter(Boolean).join(' — ');
    const priceStr = rec.price!=null ? rupiah(rec.price) : '';
    const discountStr = rec.discountPercent!=null ? `${rec.discountPercent}% OFF` : '';
    return `
    <div class="slide" data-campaign="${rec.id}" role="option" aria-label="${rec.name}">
      <img src="${img}" alt="${rec.name}">
      <div class="content">
        <h3 class="title">${rec.name}</h3>
        <div class="meta">${[dateStr, rec.category].filter(Boolean).join(' • ')}</div>
        <div class="meta">${[priceStr, discountStr].filter(Boolean).join(' · ')}</div>
        <div class="actions">
          <button class="btn btn-primary" type="button" data-register data-campaign="${rec.id}" data-name="${rec.name}">Daftar Promo</button>
          <span class="badge badge-quota" data-quota-for="${rec.id}" hidden>Kuota: …</span>
        </div>
      </div>
    </div>`;
  }

  async function loadFeatured(){
    try{
      // ambil promo aktif, prioritas oleh Web_Priority__c (sudah di-boost di backend), ambil 8 teratas
      const r = await fetch(`/api/campaigns?status=active&sort=startDateDesc&page=1&limit=12`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'Gagal ambil featured');

      // pilih 3–8 item yang punya gambar atau prioritas tinggi
      const recs = (j.records || [])
        .filter(x => x.imageUrl || x.priority != null)
        .slice(0, 8);

      if (!recs.length) { featWrap.hidden = true; return; }

      slides = recs;
      featTrack.innerHTML = recs.map(buildSlide).join('');
      featDots.innerHTML  = recs.map((_,i)=>`<span class="dot ${i===0?'active':''}" data-i="${i}"></span>`).join('');
      featWrap.hidden = false;

      // bind quota for slides
      recs.forEach(it => updateQuota(it.id));

      // nav
      featPrev.onclick = ()=> go(current-1);
      featNext.onclick = ()=> go(current+1);
      featDots.onclick = (e)=>{
        const t = e.target.closest('.dot'); if(!t) return;
        go(Number(t.dataset.i));
      };

      // drag/swipe
      enableDrag(featTrack);

      // autoplay
      startAuto();
    }catch(e){
      console.warn('featured error', e.message);
      featWrap.hidden = true;
    }
  }

  function go(n){
    if (!slides.length) return;
    current = (n + slides.length) % slides.length;
    featTrack.style.transform = `translateX(-${current*100}%)`;
    $$('.dot', featDots).forEach((d,i)=> d.classList.toggle('active', i===current));
    restartAuto();
  }

  function startAuto(){
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = setInterval(()=> go(current+1), AUTO_INTERVAL);
  }
  function restartAuto(){ startAuto(); }

  function enableDrag(track){
    let startX=0, delta=0, dragging=false;
    const onDown=(x)=>{ dragging=true; startX=x; delta=0; track.style.transition='none'; };
    const onMove=(x)=>{ if(!dragging) return; delta = x-startX; track.style.transform = `translateX(${ -current*100 + (delta/track.clientWidth)*100 }%)`; };
    const onUp=()=>{ if(!dragging) return; track.style.transition='transform .35s ease';
      if (Math.abs(delta) > track.clientWidth*0.2) go(delta<0?current+1:current-1); else go(current);
      dragging=false; delta=0;
    };
    track.addEventListener('mousedown', e=>onDown(e.clientX));
    window.addEventListener('mousemove', e=>onMove(e.clientX));
    window.addEventListener('mouseup', onUp);
    track.addEventListener('touchstart', e=>onDown(e.touches[0].clientX), {passive:true});
    window.addEventListener('touchmove', e=>onMove(e.touches[0].clientX), {passive:true});
    window.addEventListener('touchend', onUp);
  }

  // ===== List grid =====
  function card(record){
    const { id, name, description, imageUrl, startDate, endDate, status, category, price, discountPercent } = record;
    const dateStr   = [fmtDate(startDate), fmtDate(endDate)].filter(Boolean).join(' — ');
    const plainDesc = (description || '').replace(/<[^>]+>/g,'');
    const desc      = plainDesc.length > 160 ? (plainDesc.slice(0,160) + '…') : plainDesc;
    const priceStr  = price!=null ? rupiah(price) : null;
    const discountStr = discountPercent!=null ? `${discountPercent}% OFF` : null;
    const img       = imageUrl || 'assets/images/promo-placeholder.jpg';

    const showStatus = status && status.toLowerCase() !== 'planned';
    const statusHtml = showStatus
      ? `<span class="status ${'st-' + status.toLowerCase().replace(/\s+/g,'-')}">${status}</span>`
      : '';

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
            ${statusHtml}
          </div>
          <div class="actions">
            <button class="btn btn-primary" type="button" data-register data-campaign="${id}" data-name="${name}">Daftar Promo</button>
          </div>
        </div>
      </div>
    </article>`;
  }

  async function load(){
    msgEl.textContent = "Memuat promo…";
    grid.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
                      <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
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

      items.forEach(it => updateQuota(it.id));
      startQuotaAutoRefresh();
    } catch (e) {
      console.error(e);
      msgEl.textContent = e.message || "Terjadi kesalahan memuat promo.";
      grid.innerHTML = `<div class="empty">Gagal memuat data.</div>`;
    }
  }

  async function updateQuota(campaignId){
    const badge = document.querySelector(`[data-quota-for="${campaignId}"]`);
    const card  = document.querySelector(`.card[data-campaign="${campaignId}"]`) || document.querySelector(`.slide[data-campaign="${campaignId}"]`);
    const btn   = card?.querySelector('[data-register]');
    if (!badge) return;

    try {
      const r = await fetch(`/api/campaign-stats?campaignId=${encodeURIComponent(campaignId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Gagal ambil kuota");

      if (j.quota == null) { badge.hidden = true; return; }

      const txt = (j.remaining ?? null) != null
        ? (j.remaining > 0 ? `Kuota tersisa: ${j.remaining}` : `Kuota penuh`)
        : `Kuota: ${j.quota}`;

      badge.textContent = txt;
      badge.hidden = false;

      if (j.remaining !== null && j.remaining <= 0) {
        btn?.setAttribute('disabled','disabled'); btn?.classList.add('is-disabled');
      } else {
        btn?.removeAttribute('disabled'); btn?.classList.remove('is-disabled');
      }
    } catch (e) {
      console.warn('quota error', e.message);
    }
  }

  let quotaTimer = null;
  function startQuotaAutoRefresh(){
    if (quotaTimer) clearInterval(quotaTimer);
    quotaTimer = setInterval(()=>{
      $$('.card[data-campaign], .slide[data-campaign]').forEach(el=>{
        const id = el.getAttribute('data-campaign');
        updateQuota(id);
      });
    }, 30000);
  }

  // filters & paging
  let t;
  qEl.addEventListener('input', ()=>{
    clearTimeout(t);
    t = setTimeout(()=>{ state.q = qEl.value.trim(); state.page = 1; load(); }, 300);
  });
  statusEl.addEventListener('change', ()=>{ state.status = statusEl.value; state.page=1; load(); });
  sortEl.addEventListener('change',   ()=>{ state.sort   = sortEl.value;   state.page=1; load(); });
  prevBtn.addEventListener('click',   ()=>{ if (state.page>1){ state.page--; load(); }});
  nextBtn.addEventListener('click',   ()=>{ state.page++; load(); });

  // modal daftar promo (Lead)
  document.addEventListener('click', (e) => {
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

  $('#interest_close').addEventListener('click', ()=>{
    $('#interestModal').classList.remove('show');
  });

  $('#interest_phone').addEventListener('input', (e)=>{
    e.target.value = e.target.value.replace(/\D/g,'');
  });

  $('#interest_form').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const firstName = $('#interest_firstName').value.trim();
    const lastName  = $('#interest_lastName').value.trim();
    const email     = $('#interest_email').value.trim();
    const phoneRaw  = $('#interest_phone').value.trim();
    const campaignId= $('#interest_campaignId').value;

    if (!firstName || !lastName || !email){
      Swal.fire({icon:'warning', title:'Lengkapi data', text:'Nama & email wajib diisi.'});
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase())){
      Swal.fire({icon:'warning', title:'Email tidak valid', text:'Periksa kembali format email.'});
      return;
    }

    let s = phoneRaw.replace(/\D/g,'');
    if (s.startsWith('0')) s = s.slice(1);
    const phone = s ? `+62${s}` : null;

    const payload = {
      firstName, lastName, email, phone, campaignId,
      leadSource:'Promo Page', leadStatus:'Open - Not Contacted', campaignMemberStatus:'Responded'
    };

    try {
      submitBtn.disabled = true; submitBtn.textContent = 'Mengirim…';

      const r = await fetch('/api/lead-interest', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });

      const ct = r.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await r.json() : { message: await r.text() };

      if (!r.ok) throw new Error(data.message || 'Gagal menyimpan pendaftaran');

      if (data.alreadyRegistered) {
        await Swal.fire({icon:'info', title:'Anda sudah terdaftar', text:'Data Anda sudah tercatat pada promo ini.'});
      } else {
        await Swal.fire({icon:'success', title:'Pendaftaran berhasil', text:'Terima kasih! Pendaftaran promo Anda diterima.'});
      }

      updateQuota(campaignId);
      $('#interestModal').classList.remove('show');
      $('#interest_form').reset();

    } catch (e) {
      console.error(e);
      Swal.fire({icon:'error', title:'Gagal', text: e.message || 'Terjadi kesalahan. Coba lagi.'});
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = 'Kirim';
    }
  });

  // init
  loadFeatured();   // <<=== barisan baru
  load();
})();
