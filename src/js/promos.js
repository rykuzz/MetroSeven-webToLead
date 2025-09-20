(() => {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // elements
  const grid     = $("#grid");
  const qEl      = $("#q");
  const statusEl = $("#status");
  const sortEl   = $("#sort");
  const shareBtn = $("#share");
  const msgEl    = $("#msg");
  const prevBtn  = $("#prev");
  const nextBtn  = $("#next");
  const pageInfo = $("#pageInfo");
  const submitBtn= $("#interest_submit");

  // featured
  const featWrap = $("#featured");
  const featTrack= $("#featTrack");
  const featDots = $("#featDots");
  const featPrev = $("#featPrev");
  const featNext = $("#featNext");

  // state (hydrate from URL)
  let state = { q:"", status:"active", sort:"startDateDesc", page:1, limit:12, total:0 };
  try {
    const usp = new URLSearchParams(location.search);
    if (usp.has('q')) state.q = qEl.value = usp.get('q') || "";
    if (usp.has('status')) state.status = statusEl.value = usp.get('status') || "active";
    if (usp.has('sort')) state.sort = sortEl.value = usp.get('sort') || "startDateDesc";
    if (usp.has('page')) state.page = Math.max(1, parseInt(usp.get('page')||'1',10));
  } catch {}

  const rupiah  = v => v==null ? null : new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(v);
  const fmtDate = d => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : null;

  // ===== helpers =====
  function setUrlFromState(){
    const usp = new URLSearchParams({
      ...(state.q ? {q:state.q} : {}),
      status: state.status,
      sort: state.sort,
      page: String(state.page)
    });
    history.replaceState(null, "", `${location.pathname}?${usp.toString()}`);
  }
  function copyCurrentUrl(){
    navigator.clipboard.writeText(location.href)
      .then(() => Swal.fire({icon:'success', title:'Tautan disalin', text:'Filter saat ini siap dibagikan.'}))
      .catch(() => Swal.fire({icon:'error', title:'Gagal menyalin'}));
  }

  // email validation (strict)
  function validateEmailStrict(email) {
    const e = String(email || '').trim();
    const basic = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!basic.test(e)) return 'Format email tidak valid.';
    if (e.includes('..')) return 'Email tidak boleh mengandung dua titik berurutan.';
    const [_, domain] = e.split('@');
    if (!domain || domain.startsWith('.') || domain.endsWith('.') || domain.startsWith('-') || domain.endsWith('-')) return 'Domain email tidak valid.';
    if (!domain.includes('.')) return 'Domain email tidak valid.';
    const tld = domain.split('.').pop();
    if (!tld || tld.length < 2) return 'TLD domain terlalu pendek.';
    const disposable = new Set(['mailinator.com','yopmail.com','10minutemail.com','guerrillamail.com','temp-mail.org','tempmail.com','trashmail.com','sharklasers.com']);
    if (disposable.has(domain.toLowerCase())) return 'Gunakan email aktif (bukan email sementara/disposable).';
    return null;
  }

  // ===== Featured Carousel =====
  let slides = [];
  let current = 0;
  let autoTimer = null;
  const AUTO_INTERVAL = 5000;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function buildSlide(rec){
    const img = rec.imageUrl || 'assets/images/promo-placeholder.jpg';
    const dateStr = [fmtDate(rec.startDate), fmtDate(rec.endDate)].filter(Boolean).join(' — ');
    const priceStr = rec.price!=null ? rupiah(rec.price) : '';
    const discountStr = rec.discountPercent!=null ? `${rec.discountPercent}% OFF` : '';

    return `
    <div class="slide" data-campaign="${rec.id}" role="option" aria-label="${rec.name}" tabindex="0">
      <img src="${img}" alt="${rec.name}"
           loading="lazy" decoding="async" width="1280" height="720"
           srcset="${img} 1280w" sizes="100vw">
      <div class="badges-left">
        ${discountStr ? `<span class="badge badge-sale">${discountStr}</span>` : ''}
        ${rec.category ? `<span class="badge badge-cat">${rec.category}</span>` : ''}
      </div>
      <div class="badges-right">
        <span class="badge badge-quota" data-quota-for="${rec.id}" hidden aria-live="polite">Kuota: …</span>
      </div>
      <div class="content">
        <h3 class="title">${rec.name}</h3>
        <div class="meta">${[dateStr, rec.category].filter(Boolean).join(' • ')}</div>
        <div class="meta">${[priceStr].filter(Boolean).join(' · ')}</div>
        <div class="actions">
          <button class="btn btn-primary" type="button" data-register data-campaign="${rec.id}" data-name="${rec.name}">
            Daftar Promo
          </button>
        </div>
      </div>
    </div>`;
  }

  async function loadFeatured(){
    try{
      const r = await fetch(`/api/campaigns?status=active&sort=startDateDesc&page=1&limit=12`, { cache:'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'Gagal ambil featured');

      const recs = (j.records || [])
        .filter(x => x.imageUrl || x.priority != null)
        .slice(0, 8);

      if (!recs.length) { featWrap.hidden = true; return; }

      slides = recs;
      featTrack.innerHTML = recs.map(buildSlide).join('');
      featDots.innerHTML  = recs.map((_,i)=>`<button class="dot ${i===0?'active':''}" data-i="${i}" aria-label="Slide ${i+1}"></button>`).join('');
      featWrap.hidden = false;

      // observe quota for visible slides
      recs.forEach(it => observeQuotaForId(it.id));

      // nav
      featPrev.onclick = ()=> go(current-1);
      featNext.onclick = ()=> go(current+1);
      featDots.onclick = (e)=>{ const t = e.target.closest('.dot'); if(!t) return; go(Number(t.dataset.i)); };

      // keyboard navigation
      featTrack.addEventListener('keydown', (e)=>{
        if (e.key === 'ArrowLeft') go(current-1);
        if (e.key === 'ArrowRight') go(current+1);
      });

      // autoplay
      if (!reduceMotion) startAuto();

      // pause on hover/focus
      featTrack.addEventListener('mouseenter', stopAuto);
      featTrack.addEventListener('mouseleave', startAuto);
      featTrack.addEventListener('focusin', stopAuto);
      featTrack.addEventListener('focusout', startAuto);

      // drag/swipe
      enableDrag(featTrack);
    }catch(e){ console.warn('featured error', e.message); featWrap.hidden = true; }
  }
  function go(n){
    if (!slides.length) return;
    current = (n + slides.length) % slides.length;
    featTrack.style.transform = `translateX(-${current*100}%)`;
    $$('.dot', featDots).forEach((d,i)=> d.classList.toggle('active', i===current));
    restartAuto();
  }
  function startAuto(){ stopAuto(); autoTimer = setInterval(()=> go(current+1), AUTO_INTERVAL); }
  function stopAuto(){ if (autoTimer) clearInterval(autoTimer); autoTimer = null; }
  function restartAuto(){ if (!reduceMotion) startAuto(); }
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

  // ===== Grid list =====
  function priceBlock(price, discountPercent){
    if (price == null) return '';
    if (discountPercent == null) return `<span class="price price-final">${rupiah(price)}</span>`;
    const final = Math.max(0, Math.round(price * (100 - discountPercent) / 100));
    const hemat = price - final;
    return `
      <span class="price"><s>${rupiah(price)}</s> <span class="price-final">${rupiah(final)}</span></span>
      <span class="status">Hemat ${rupiah(hemat)}</span>
    `;
  }

  function card(record){
    const { id, name, description, imageUrl, startDate, endDate, status, category, price, discountPercent } = record;
    const dateStr   = [fmtDate(startDate), fmtDate(endDate)].filter(Boolean).join(' — ');
    const plainDesc = (description || '').replace(/<[^>]+>/g,'');
    const desc      = plainDesc.length > 160 ? (plainDesc.slice(0,160) + '…') : plainDesc;
    const img       = imageUrl || 'assets/images/promo-placeholder.jpg';

    const showStatus = status && status.toLowerCase() !== 'planned';
    const statusHtml = showStatus ? `<span class="status ${'st-'+status.toLowerCase().replace(/\s+/g,'-')}">${status}</span>` : '';

    return `
    <article class="card" data-campaign="${id}">
      <div class="thumb">
        <img src="${img}" alt="${name}" loading="lazy" decoding="async" width="640" height="360"
             srcset="${img} 640w, ${img} 960w, ${img} 1280w"
             sizes="(max-width:640px) 100vw, (max-width:980px) 50vw, 33vw">
        <div class="badges-left">
          ${discountPercent!=null ? `<span class="badge badge-sale">${discountPercent}% OFF</span>` : ''}
          ${category ? `<span class="badge badge-cat">${category}</span>` : ''}
        </div>
        <div class="badges-right">
          <span class="badge badge-quota" data-quota-for="${id}" hidden aria-live="polite">Kuota: …</span>
        </div>
      </div>
      <div class="card-body">
        <h3 class="title">${name}</h3>
        ${dateStr ? `<div class="meta">${dateStr}</div>` : ''}
        <p class="desc">${desc || ''}</p>
        <div class="cta">
          <div class="pricing">
            ${priceBlock(price, discountPercent)}
            ${statusHtml}
          </div>
          <div class="actions">
            <button class="btn btn-primary" type="button" data-register data-campaign="${id}" data-name="${name}">
              Daftar Promo
            </button>
          </div>
        </div>
      </div>
    </article>`;
  }

  // Abortable list fetch
  let listAbort;
  async function load(){
    setUrlFromState();
    msgEl.textContent = "Memuat promo…";
    grid.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
                      <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
    prevBtn.disabled = true; nextBtn.disabled = true;

    const params = new URLSearchParams({
      q: state.q, status: state.status, sort: state.sort,
      page: String(state.page), limit: String(state.limit)
    });

    try {
      listAbort?.abort(); listAbort = new AbortController();
      const r = await fetch(`/api/campaigns?${params}`, { signal:listAbort.signal, cache:'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Gagal mengambil data");

      state.total = j.total || 0;
      const items = j.records || [];
      grid.innerHTML = items.length
        ? items.map(card).join("")
        : `<div class="empty">Belum ada promo untuk filter ini.
             <div class="tips">Coba ubah kata kunci, ganti status, atau
               <button id="resetFilters" class="btn" type="button">Reset filter</button>
             </div>
           </div>`;

      if (!items.length) {
        const btnReset = $("#resetFilters");
        if (btnReset) btnReset.onclick = () => {
          qEl.value=''; statusEl.value='active'; sortEl.value='startDateDesc';
          state = { q:"", status:"active", sort:"startDateDesc", page:1, limit:12, total:0 };
          load();
        };
      }

      const maxPage = Math.max(1, Math.ceil(state.total / state.limit));
      pageInfo.textContent = `Halaman ${state.page} dari ${maxPage}`;
      prevBtn.disabled = state.page <= 1;
      nextBtn.disabled = state.page >= maxPage || !j.hasMore;

      msgEl.textContent = "";

      // observe quota only for visible elements
      items.forEach(it => observeQuotaForId(it.id));

    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error(e);
      msgEl.textContent = e.message || "Terjadi kesalahan memuat promo.";
      grid.innerHTML = `<div class="empty">Gagal memuat data.</div>`;
    }
  }

  // IntersectionObserver for quota
  const visibleIds = new Set();
  const io = new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      const el = e.target;
      if (e.isIntersecting) {
        visibleIds.add(el.dataset.campaign);
        updateQuota(el.dataset.campaign);
      } else {
        visibleIds.delete(el.dataset.campaign);
      }
    });
  }, { root:null, rootMargin:'0px', threshold:0.1 });

  function observeQuotaForId(id){
    const el = document.querySelector(`.card[data-campaign="${id}"]`) ||
               document.querySelector(`.slide[data-campaign="${id}"]`);
    if (el) io.observe(el);
  }

  // periodic refresh only for visible
  setInterval(()=>{ visibleIds.forEach(id => updateQuota(id)); }, 30000);

  async function updateQuota(campaignId){
    const badge = document.querySelector(`[data-quota-for="${campaignId}"]`);
    const holder= document.querySelector(`.card[data-campaign="${campaignId}"]`) || document.querySelector(`.slide[data-campaign="${campaignId}"]`);
    const btn   = holder?.querySelector('[data-register]');
    if (!badge) return;

    try {
      const r = await fetch(`/api/campaign-stats?campaignId=${encodeURIComponent(campaignId)}`, { cache:'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Gagal ambil kuota");

      if (j.quota == null) { badge.hidden = true; return; }

      const txt = (j.remaining ?? null) != null
        ? (j.remaining > 0 ? `Kuota tersisa: ${j.remaining}` : `Kuota penuh`)
        : `Kuota: ${j.quota}`;

      badge.textContent = txt;
      badge.hidden = false;

      if (j.remaining !== null && j.remaining <= 0) {
        btn?.setAttribute('disabled','disabled'); btn?.classList.add('is-disabled'); btn.textContent = 'Kuota Penuh';
      } else {
        btn?.removeAttribute('disabled'); btn?.classList.remove('is-disabled'); btn.textContent = 'Daftar Promo';
      }
    } catch (e) { console.warn('quota error', e.message); }
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
  shareBtn.addEventListener('click',  copyCurrentUrl);

  // modal daftar promo
  let lastFocus = null;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-register]');
    if (!btn) return;
    lastFocus = btn;
    openRegisterModal({ campaignId: btn.dataset.campaign, campaignName: btn.dataset.name });
  });

  function openRegisterModal({ campaignId, campaignName }){
    const m = $('#interestModal');
    m.querySelector('[data-campaign-name]').textContent = campaignName || 'Campaign';
    m.querySelector('#interest_campaignId').value = campaignId;
    m.classList.add('show');
    trapFocus(m);
    $('#interest_firstName').focus();
    stopAuto(); // pause carousel autoplay
  }

  $('#interest_close').addEventListener('click', closeModal);
  function closeModal(){
    const m = $('#interestModal');
    m.classList.remove('show');
    releaseFocus();
    if (lastFocus) lastFocus.focus();
    restartAuto();
  }

  // ESC close
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape' && $('#interestModal').classList.contains('show')) closeModal();
  });

  // digits-only phone
  $('#interest_phone').addEventListener('input', (e)=>{
    e.target.value = e.target.value.replace(/\D/g,'');
  });

  // a11y: toggle aria-invalid
  function setInvalid(input, msg){
    const err = $('#email_error');
    if (msg) {
      input.setAttribute('aria-invalid','true');
      err.hidden = false; err.textContent = msg;
    } else {
      input.removeAttribute('aria-invalid');
      err.hidden = true; err.textContent = '';
    }
  }

  $('#interest_form').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const firstName = $('#interest_firstName').value.trim();
    const lastName  = $('#interest_lastName').value.trim();
    const email     = $('#interest_email').value.trim();
    const company   = $('#interest_company').value.trim();
    const phoneRaw  = $('#interest_phone').value.trim();
    const campaignId= $('#interest_campaignId').value;

    if (!firstName || !lastName || !email){
      Swal.fire({icon:'warning', title:'Lengkapi data', text:'Nama & email wajib diisi.'}); return;
    }
    const emailErr = validateEmailStrict(email);
    setInvalid($('#interest_email'), emailErr);
    if (emailErr){ Swal.fire({icon:'warning', title:'Email tidak valid', text: emailErr}); return; }

    let s = phoneRaw.replace(/\D/g,'');
    if (s.startsWith('0')) s = s.slice(1);
    const phone = s ? `+62${s}` : null;

    const payload = {
      firstName, lastName, email, phone, company, campaignId,
      leadSource:'Promo Page', leadStatus:'Open - Not Contacted', campaignMemberStatus:'Responded'
    };

    try {
      submitBtn.disabled = true; submitBtn.textContent = 'Mengirim…';
      const r = await fetch('/api/lead-interest', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
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
      closeModal();
      $('#interest_form').reset();

    } catch (e) {
      console.error(e);
      Swal.fire({icon:'error', title:'Gagal', text: e.message || 'Terjadi kesalahan. Coba lagi.'});
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = 'Kirim';
    }
  });

  // focus trap modal
  let focusTrapRemovers = [];
  function trapFocus(container){
    const focusable = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
    function handler(e){
      if (!container.classList.contains('show')) return;
      const nodes = Array.from(container.querySelectorAll(focusable)).filter(el=>!el.disabled && el.offsetParent!==null);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length-1];
      if (e.key === 'Tab'){
        if (e.shiftKey && document.activeElement === first){ last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last){ first.focus(); e.preventDefault(); }
      }
    }
    document.addEventListener('keydown', handler);
    focusTrapRemovers.push(()=>document.removeEventListener('keydown', handler));
  }
  function releaseFocus(){ focusTrapRemovers.forEach(fn=>fn()); focusTrapRemovers=[]; }

  // init
  (async function init(){
    await loadFeatured();
    await load();
  })();
})();
