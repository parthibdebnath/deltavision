/* DeltaVision – mobile app */
(function () {
  'use strict';
  const { market, account, options, fmt, store } = DV;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const TFS = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const screen = $('#screen'), device = $('#device');
  DV.toastRoot = screen;

  const S = {
    page: store.get('dv.m.page', 'port'),
    sym: store.get('dv.m.sym', 'AAPL'),
    tf: store.get('dv.m.tf', '1Y'),
    pfTf: store.get('dv.m.pftf', '1Y'),
    bdMode: store.get('dv.m.bd', 'today'),
    pfHead: store.get('dv.m.pfhead', 'all'),
    frame: store.get('dv.m.frame', 'auto'),
    bgT: store.get('dv.m.bgT', 'aurora'),
    bgP: store.get('dv.m.bgP', 'frost'),
    recent: store.get('dv.m.recent', ['NVDA', 'TSLA', 'PLTR']),
    scale: 1, dragLock: false, scrubbing: false,
  };
  const qs = new URLSearchParams(location.search);
  if (qs.get('sym') && market.get(qs.get('sym').toUpperCase())) S.sym = qs.get('sym').toUpperCase();
  if (qs.get('page') === 'ticker' || qs.get('page') === 'port') S.page = qs.get('page');
  if (!market.get(S.sym)) S.sym = 'AAPL';
  const save = () => {
    store.set('dv.m.page', S.page); store.set('dv.m.sym', S.sym); store.set('dv.m.tf', S.tf); store.set('dv.m.pftf', S.pfTf);
    store.set('dv.m.bd', S.bdMode); store.set('dv.m.pfhead', S.pfHead); store.set('dv.m.frame', S.frame);
    store.set('dv.m.bgT', S.bgT); store.set('dv.m.bgP', S.bgP); store.set('dv.m.recent', S.recent);
  };
  const unitOf = sym => market.get(sym).type === 'crypto' ? sym.replace(/USD|CAD$/, '') : 'shares';
  const chg = (v, pct, d) => `${fmt.arrow(v)} ${v < 0 ? '-' : ''}${fmt.money(Math.abs(v), d)} (${fmt.pct(pct, Math.abs(pct) >= 100 ? 2 : Math.abs(pct) < 10 ? 2 : 1)})`;

  if (/[?&]fit=1/.test(location.search)) { try { window.resizeTo(470, Math.min(1010, screen.availHeight || 1010)); } catch (e) { /* not allowed */ } }

  /* ================================================================== *
   * Device frame + scaling
   * ================================================================== */
  const charts = [];
  function layout() {
    const W = innerWidth, H = innerHeight;
    const framed = S.frame === 'on' || (S.frame === 'auto' && W > 560);
    device.classList.toggle('framed', framed);
    if (framed) {
      S.scale = Math.min((W - 30) / 466, (H - 30) / 982, 1.3);
      device.style.transform = `scale(${S.scale})`;
    } else { S.scale = 1; device.style.transform = ''; }
    requestAnimationFrame(() => charts.forEach(c => c.resize()));
  }
  window.addEventListener('resize', layout);

  /* ================================================================== *
   * Backgrounds
   * ================================================================== */
  const sceneT = new DV.Scene($('#bgTicker')), sceneP = new DV.Scene($('#bgPort'));
  function setScene(sc, name, key, fallback) {
    if (name === 'custom') {
      const url = store.get('dv.m.bgimg' + key, null);
      if (url) { sc.setImage(url); return; }
      name = fallback;
    }
    sc.set(name);
  }
  function applyBgs() { setScene(sceneT, S.bgT, 'T', 'aurora'); setScene(sceneP, S.bgP, 'P', 'frost'); }
  function sceneActivity() { sceneT.setActive(S.page === 'ticker'); sceneP.setActive(S.page === 'port'); }

  /* ================================================================== *
   * Navigation
   * ================================================================== */
  function go(page) {
    S.page = page; save();
    screen.dataset.page = page;
    $('#pgTicker').style.transform = ''; $('#pgPort').style.transform = ''; $('#pgPort').style.opacity = '';
    sceneT.setActive(true); sceneP.setActive(true);
    setTimeout(sceneActivity, 700);
    $('#btnLeft').title = page === 'ticker' ? 'Portfolio' : `Back to $${S.sym}`;
    if (page === 'ticker') renderTicker(true); else renderPortfolio(true);
  }
  function openTicker(sym) {
    const changed = sym !== S.sym;
    S.sym = sym;
    S.recent = [sym].concat(S.recent.filter(s => s !== sym)).slice(0, 6);
    save();
    if (changed) { closeAi(); $('#pgTicker .scroll').scrollTop = 0; }
    renderTicker(true, changed);
    go('ticker');
  }
  $('#btnLeft').addEventListener('click', () => { if (S.page === 'ticker') go('port'); else openTicker(S.sym); });
  $('#btnSearch').addEventListener('click', openSearch);

  // home indicator: tap or flick up goes home
  (function () {
    const el = $('#homeInd');
    el.addEventListener('pointerdown', e => {
      const sy = e.clientY;
      let done = false;
      const mv = ev => { if (!done && sy - ev.clientY > 40) { done = true; home(); } };
      const up = () => { window.removeEventListener('pointermove', mv); if (!done) home(); };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up, { once: true });
    });
    function home() {
      closeAllSheets();
      if (S.page === 'ticker') go('port');
      else $('#pgPort .scroll').scrollTo({ top: 0, behavior: 'smooth' });
    }
  })();

  // swipe from the left edge to go back
  (function () {
    const edge = $('#edge'), pg = $('#pgTicker'), back = $('#pgPort');
    edge.addEventListener('pointerdown', e => {
      e.preventDefault();
      const sx = e.clientX, W = screen.clientWidth;
      pg.classList.add('dragging'); back.classList.add('dragging');
      const mv = ev => {
        const dx = Math.max(0, (ev.clientX - sx) / S.scale), f = dx / W;
        pg.style.transform = `translateX(${dx}px)`;
        back.style.transform = `translateX(${-28 * (1 - f)}%)`;
        back.style.opacity = String(f);
      };
      const up = ev => {
        window.removeEventListener('pointermove', mv);
        pg.classList.remove('dragging'); back.classList.remove('dragging');
        const dx = (ev.clientX - sx) / S.scale;
        if (dx > W * 0.3) go('port');
        else { pg.style.transform = ''; back.style.transform = ''; back.style.opacity = ''; }
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up, { once: true });
    });
  })();

  // mouse drag-to-scroll with momentum, so the app feels like a phone under a mouse
  let suppressNextClick = false;
  window.addEventListener('click', e => { if (suppressNextClick) { e.stopPropagation(); e.preventDefault(); suppressNextClick = false; } }, true);
  function dragScroll(el, axis = 'y') {
    el.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (e.target.closest('canvas, input, .swipe, .grab, .edge')) return;
      const start = axis === 'y' ? e.clientY : e.clientX, st = axis === 'y' ? el.scrollTop : el.scrollLeft;
      let active = false, last = start, lt = performance.now(), v = 0;
      const mv = ev => {
        if (S.dragLock) return;
        const p = axis === 'y' ? ev.clientY : ev.clientX, d = p - start;
        if (!active && Math.abs(d) > 6) active = true;
        if (!active) return;
        if (axis === 'y') el.scrollTop = st - d / S.scale; else el.scrollLeft = st - d / S.scale;
        const now = performance.now();
        v = (p - last) / Math.max(1, now - lt); last = p; lt = now;
      };
      const up = () => {
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
        if (!active) return;
        suppressNextClick = true;
        setTimeout(() => { suppressNextClick = false; }, 60);
        let vel = -v / S.scale * 16;
        const step = () => {
          if (Math.abs(vel) < 0.4) return;
          if (axis === 'y') el.scrollTop += vel; else el.scrollLeft += vel;
          vel *= 0.94;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    });
  }
  $$('.scroll').forEach(el => dragScroll(el));

  /* ================================================================== *
   * Bottom sheets
   * ================================================================== */
  const sheets = [];
  function sheet({ title, right, html, cls, raw, onClose }) {
    const ov = $('#overlay');
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    const el = document.createElement('div');
    el.className = 'sheet ' + (cls || '');
    el.innerHTML = raw ? html : `<div class="grab"><i></i></div><div class="sh-head"><h3>${title}</h3><div class="sh-right">${right || '<button class="x" data-close>✕</button>'}</div></div><div class="sh-body">${html}</div>`;
    ov.appendChild(scrim); ov.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => { scrim.classList.add('in'); el.classList.add('in'); }));
    const api = { el, body: $('.sh-body', el), closed: false, onClose, subs: [] };
    api.close = () => {
      if (api.closed) return;
      api.closed = true;
      api.subs.forEach(off => off());
      scrim.classList.remove('in'); el.classList.remove('in');
      setTimeout(() => { scrim.remove(); el.remove(); }, 380);
      sheets.splice(sheets.indexOf(api), 1);
      if (onClose) onClose();
    };
    api.on = (evt, fn) => api.subs.push(DV.on(evt, fn));
    scrim.addEventListener('click', api.close);
    el.addEventListener('click', e => { if (e.target.closest('[data-close]')) api.close(); });
    const grab = $('.grab', el);
    if (grab) grab.addEventListener('pointerdown', e => {
      e.preventDefault();
      const sy = e.clientY;
      el.classList.add('dragging');
      const mv = ev => { el.style.transform = `translateY(${Math.max(0, (ev.clientY - sy) / S.scale)}px)`; };
      const up = ev => {
        window.removeEventListener('pointermove', mv);
        el.classList.remove('dragging');
        el.style.transform = '';
        if ((ev.clientY - sy) / S.scale > 110) api.close();
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up, { once: true });
    });
    if (api.body) dragScroll(api.body);
    sheets.push(api);
    return api;
  }
  function closeAllSheets() { sheets.slice().forEach(s => s.close()); }
  function shake(el) { el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 320 }); }

  function swipeConfirm(el, label, onDone) {
    el.innerHTML = `<div class="fill"></div><div class="lbl"><span>${label}</span></div><div class="thumb">›</div>`;
    const thumb = $('.thumb', el), fill = $('.fill', el);
    const set = x => { thumb.style.left = (4 + x) + 'px'; fill.style.width = (x + 54) + 'px'; };
    set(0);
    const reset = () => { el.classList.add('snap'); set(0); setTimeout(() => el.classList.remove('snap'), 260); };
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      const max = el.clientWidth - 58, sx = e.clientX;
      const r = thumb.getBoundingClientRect();
      const grabOffset = e.target === thumb ? 0 : null;
      if (grabOffset === null && e.clientX > r.right + 4) { thumb.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(14px)' }, { transform: 'translateX(0)' }], { duration: 380 }); return; }
      let x = 0;
      const mv = ev => { x = Math.max(0, Math.min(max, (ev.clientX - sx) / S.scale)); set(x); };
      const up = () => {
        window.removeEventListener('pointermove', mv);
        if (x > max * 0.86) { el.classList.add('snap'); set(max); setTimeout(() => onDone(reset), 180); }
        else reset();
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up, { once: true });
    });
    return reset;
  }

  /* ================================================================== *
   * Ticker page
   * ================================================================== */
  const tkTfs = $('#tkTfs'), pfTfs = $('#pfTfs');
  tkTfs.innerHTML = pfTfs.innerHTML = TFS.map(t => `<button data-tf="${t}">${t}</button>`).join('');
  tkTfs.addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.tf !== S.tf) { S.tf = b.dataset.tf; save(); renderTickerChart(true, true); } });

  const tkChart = new DV.Chart($('#tkChart'), {
    color: '#46f08a', lineWidth: 2, glow: 14, yAxis: 'minmax', xAxis: 'ends', pad: { t: 18, r: 40, b: 26, l: 2 },
    font: '600 12.5px Inter, system-ui, sans-serif', labelColor: '#fff', scrub: true, hover: true, touchAction: 'pan-y',
    onScrub: p => scrubTicker(p),
  });
  const ivTerm = new DV.Curve($('#ivTerm'), { color: '#5ef0a0', pad: { t: 14, r: 82, b: 30, l: 40 } });
  const ivSmile = new DV.Curve($('#ivSmile'), { color: '#5ef0a0', pad: { t: 14, r: 82, b: 32, l: 40 } });
  charts.push(tkChart, ivTerm, ivSmile);

  let lastTkPts = null;
  function tkChange(pts) {
    const tk = market.get(S.sym), base = S.tf === '1D' ? tk.prev : pts[0].c;
    return { ch: tk.price - base, pct: (tk.price / base - 1) * 100 };
  }
  function quoteHtml(price, ch, pct) {
    return `<span class="${fmt.cls(ch)}">$${fmt.price(price)} ${fmt.arrow(ch)} ${fmt.pct(pct)}<span class="abs"> ($${fmt.num(Math.abs(ch), price >= 1 ? 2 : 4)})</span></span>`;
  }
  // shrink the header text until the quote line fits on one row
  function fitHead(head) {
    const parts = $$('.qtitle, .qprice', head), nm = $('.qname', head);
    const over = () => head.scrollWidth > head.clientWidth + 1 || (nm && nm.scrollWidth > nm.clientWidth + 1);
    head.classList.remove('no-abs');
    parts.forEach(e => { e.style.fontSize = ''; });
    for (const step of [15.5, 15, 14.5, 'abs', 14, 13.5, 13]) {
      if (!over()) break;
      if (step === 'abs') head.classList.add('no-abs'); else parts.forEach(e => { e.style.fontSize = step + 'px'; });
    }
  }
  function renderTickerChart(animate, reset) {
    const pts = market.series(S.sym, S.tf);
    lastTkPts = pts;
    tkChart.setData(pts, { animate, reset, tf: S.tf });
    $$('button', tkTfs).forEach(b => b.classList.toggle('on', b.dataset.tf === S.tf));
    if (!S.scrubbing) { const c = tkChange(pts); $('#tkQuote').innerHTML = quoteHtml(market.price(S.sym), c.ch, c.pct); fitHead($('#pgTicker .qhead')); }
  }
  function scrubTicker(p) {
    const d = $('#tkScrub');
    if (!p) {
      S.scrubbing = false; d.classList.remove('on');
      if (lastTkPts) { const c = tkChange(lastTkPts); $('#tkQuote').innerHTML = quoteHtml(market.price(S.sym), c.ch, c.pct); }
      return;
    }
    S.scrubbing = true;
    const ch = p.pt.c - p.first.c;
    $('#tkQuote').innerHTML = quoteHtml(p.pt.c, ch, ch / p.first.c * 100);
    d.textContent = fmt.tip(p.pt.t, S.tf);
    d.classList.add('on');
  }
  function renderPosCard() {
    const p = account.pos(S.sym), el = $('#posCard'), opts = account.state.options.filter(o => o.sym === S.sym);
    let html = '';
    if (p) {
      const d = account.dayPnl(S.sym), a = account.pnl(S.sym);
      html = `<div class="pos-row"><b>$${S.sym} Live Position</b><span class="sh">${fmt.qty(p.qty)} ${unitOf(S.sym)} @ ${fmt.price(p.avg)}</span></div>
        <div class="pos-row"><span class="small"><span class="lbl">Past Day:</span>&nbsp; <span class="${fmt.cls(d.pnl)}">${chg(d.pnl, d.pct)}</span></span>
        <span class="small ${fmt.cls(a.pnl)}">All Time: ${chg(a.pnl, a.pct)}</span></div>`;
    } else {
      html = `<div class="pos-row"><b>$${S.sym} Live Position</b><span class="sh">No position</span></div><div class="pos-empty">Tap BUY to open a position${tradeableOptions() ? ' or browse the options chain' : ''}.</div>`;
    }
    if (opts.length) html += `<div class="pos-opts">${opts.map(o => { const v = account.optionValue(o), c = o.avg * 100 * o.qty; return `<div><span>${o.qty}× ${esc(options.label(o))}</span><span class="${fmt.cls(v - c)}">${fmt.money(v, 2)} (${fmt.spct((v / c - 1) * 100, 1)})</span></div>`; }).join('')}</div>`;
    el.innerHTML = html;
  }
  const tradeableOptions = () => market.get(S.sym).type !== 'crypto';
  function renderVol() {
    const term = options.term(S.sym);
    const pts = term.map((t, i) => ({ x: i, y: t.iv * 100, tip: `${t.label} · ${fmt.num(t.iv * 100, 1)}%` }));
    pts.push({ x: 7.75, y: term[7].iv * 100, tip: `1Y+ · ${fmt.num(term[7].iv * 100, 1)}%` });
    ivTerm.setData(pts, term.map((t, i) => ({ x: i, text: t.label })), [0, 8]);
    const sm = options.smile(S.sym);
    const k0 = sm[0].k, k1 = sm[sm.length - 1].k;
    const lab = v => (v >= 1000 ? fmt.compact(v, 0) : v >= 100 ? Math.round(v) : +v.toFixed(v >= 10 ? 0 : 1));
    ivSmile.setData(sm.map(p => ({ x: p.k, y: p.iv * 100, tip: `Strike ${lab(p.k)} · ${fmt.num(p.iv * 100, 1)}%` })),
      [2, 9, 15, 21].map(i => ({ x: sm[i].k, text: String(lab(sm[i].k)) })), [k0 - (k1 - k0) * 0.04, k1 + (k1 - k0) * 0.12]);
  }
  function renderStatsGrid() {
    const st = market.stats(S.sym), tk = market.get(S.sym);
    const cells = [['Open', fmt.price(st.open)], ['Prev close', fmt.price(st.prev)], ['High', fmt.price(st.dayHigh)], ['Low', fmt.price(st.dayLow)],
      ['52w high', fmt.price(st.hi52)], ['52w low', fmt.price(st.lo52)], ['Mkt cap', fmt.compact(st.mcap)], ['P/E', st.pe ? fmt.num(st.pe, 1) : '—'],
      ['Avg vol', fmt.compact(st.avgVol)], ['EPS', st.eps == null ? '—' : fmt.num(st.eps)], ['Float', fmt.compact(st.float, 1)], ['IV 30d', fmt.num(options.ivAtm(S.sym, 30) * 100, 1) + '%']];
    $('#statsGrid').innerHTML = cells.map(c => `<div><span>${c[0]}</span><b>${c[1]}</b></div>`).join('');
    void tk;
  }
  function renderAbout() {
    const tk = market.get(S.sym);
    $('#aboutSym').textContent = '$' + S.sym;
    $('#aboutArt').innerHTML = DV.art(S.sym);
    $('#aboutDesc').innerHTML = tk.desc;
    $('#ratingDot').style.left = (DV.analysis(S.sym).score * 100) + '%';
    const al = account.state.alerts.filter(a => a.sym === S.sym);
    const items = tk.news.map((t, i) => ({ t, ts: Date.now() - (i + 1) * 3.3 * 3600e3 })).concat(al.map(a => ({ t: a.title, ts: a.ts })));
    $('#newsList').innerHTML = items.map(n => `<div class="news-item">${esc(n.t)}<small>${fmt.ago(n.ts)}</small></div>`).join('');
  }
  function renderTicker(full, symChanged) {
    const tk = market.get(S.sym);
    $('#tkLogo').innerHTML = DV.logo(S.sym, 36);
    $('#tkSym').textContent = '$' + S.sym;
    $('#tkName').textContent = tk.name;
    $('#tkOptions').style.visibility = tradeableOptions() ? '' : 'hidden';
    renderTickerChart(!!symChanged, !!symChanged);
    renderPosCard();
    renderVol();
    if (full) { renderStatsGrid(); renderAbout(); }
  }

  $('#tkLogo').addEventListener('click', () => {
    const on = account.toggleWatch(S.sym);
    DV.toast(on ? `★ $${S.sym} added to your watchlist` : `$${S.sym} removed from your watchlist`, { kind: on ? 'ok' : '' });
  });
  $('#tkBuy').addEventListener('click', () => openOrder('buy'));
  $('#tkSell').addEventListener('click', () => openOrder('sell'));
  $('#tkOptions').addEventListener('click', openOptions);
  $('#posCard').addEventListener('click', openPosition);

  let aiOpen = false, aiT = 0;
  function closeAi() { aiOpen = false; clearTimeout(aiT); $('#aiPanel').hidden = true; $('#aiPill').classList.remove('loading'); }
  $('#aiPill').addEventListener('click', () => {
    if (aiOpen) { closeAi(); return; }
    aiOpen = true;
    const panel = $('#aiPanel'), pill = $('#aiPill');
    pill.classList.add('loading'); panel.hidden = false;
    panel.innerHTML = '<span style="opacity:.7">Analyzing price action, volatility and fundamentals…</span>';
    aiT = setTimeout(() => {
      pill.classList.remove('loading');
      const a = DV.analysis(S.sym);
      panel.innerHTML = `<span class="verdict ${a.verdict}">${a.verdict}</span><ul></ul><div class="disc">Simulated analysis for demo purposes — not financial advice.</div>`;
      const ul = $('ul', panel);
      let li = 0, ch = 0, cur = null;
      const type = () => {
        if (!aiOpen || li >= a.lines.length) return;
        if (!cur) { cur = document.createElement('li'); ul.appendChild(cur); }
        ch += 3; cur.textContent = a.lines[li].slice(0, ch);
        if (ch >= a.lines[li].length) { li++; ch = 0; cur = null; }
        aiT = setTimeout(type, 12);
      };
      type();
    }, 700);
  });

  /* ================================================================== *
   * Portfolio page
   * ================================================================== */
  pfTfs.addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.tf !== S.pfTf) { S.pfTf = b.dataset.tf; save(); renderPfChart(true, true); } });
  const pfChart = new DV.Chart($('#pfChart'), {
    color: '#4cb4ff', lineWidth: 2, glow: 14, yAxis: 'minmax', xAxis: 'ends', pad: { t: 18, r: 40, b: 26, l: 2 },
    font: '600 12.5px Inter, system-ui, sans-serif', labelColor: '#fff', scrub: true, hover: true, touchAction: 'pan-y',
    yFormat: v => fmt.compact(v, 0), format: v => fmt.num(v, 0),
    onScrub: p => scrubPort(p),
  });
  charts.push(pfChart);
  let lastPfPts = null, pfScrubbing = false;
  function pfHeadHtml() {
    if (S.pfHead === 'today') { const d = account.dayTotal(); return `<span class="${fmt.cls(d.pnl)}">${chg(d.pnl, d.pct, 0)}</span> <span class="lbl">Today</span>`; }
    if (S.pfHead === 'value') { return `<span class="up">${fmt.money(account.equity(), 0)}</span> <span class="lbl">Value</span>`; }
    const a = account.allTime();
    return `<span class="${fmt.cls(a.pnl)}">${chg(a.pnl, a.pct, 0)}</span> <span class="lbl">All Time</span>`;
  }
  function renderPfChart(animate, reset) {
    const pts = DV.portfolio.series(S.pfTf);
    lastPfPts = pts;
    pfChart.setData(pts, { animate, reset, tf: S.pfTf });
    $$('button', pfTfs).forEach(b => b.classList.toggle('on', b.dataset.tf === S.pfTf));
  }
  function scrubPort(p) {
    const d = $('#pfScrub');
    if (!p) { pfScrubbing = false; d.classList.remove('on'); $('#pfQuote').innerHTML = pfHeadHtml(); return; }
    pfScrubbing = true;
    const ch = p.pt.c - p.first.c;
    $('#pfQuote').innerHTML = `<span class="${fmt.cls(ch)}">${fmt.money(p.pt.c, 0)} ${fmt.arrow(ch)} ${fmt.pct(ch / p.first.c * 100)}</span>`;
    d.textContent = fmt.tip(p.pt.t, S.pfTf);
    d.classList.add('on');
  }
  $('#pfQuote').addEventListener('click', () => {
    S.pfHead = { all: 'today', today: 'value', value: 'all' }[S.pfHead];
    save();
    $('#pfQuote').innerHTML = pfHeadHtml();
  });
  $('#pfLogo').addEventListener('click', openSettings);
  $('#alertsCard').addEventListener('click', openAlerts);
  $('#bdMode').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    S.bdMode = b.dataset.mode; save();
    $$('#bdMode button').forEach(x => x.classList.toggle('on', x === b));
    updateRows();
  });

  function renderAlertsCard() {
    const n = account.unread(), a = account.state.alerts[0];
    $('#alertBadge').textContent = n ? '+' + n : '';
    $('#alertTitle').textContent = a ? a.title : 'No alerts';
    $('#alertDate').textContent = a ? fmt.dmy(a.ts) : '';
  }
  function renderRows() {
    const hs = account.holdings();
    const crypto = hs.filter(s => market.get(s).type === 'crypto'), stocks = hs.filter(s => market.get(s).type !== 'crypto');
    const row = s => `<button class="bd-row" data-sym="${s}">${DV.logo(s, 26)}<span class="nm"><b>$${s}</b> ${esc(market.get(s).short)}</span><span class="pc"></span></button>`;
    $('#bdList').innerHTML =
      (crypto.length ? `<div class="bd-sec">Crypto</div><div class="bd-group">${crypto.map(row).join('')}</div>` : '') +
      (stocks.length ? `<div class="bd-sec">Stocks</div><div class="bd-group">${stocks.map(row).join('')}</div>` : '') +
      (hs.length ? '' : '<div class="pos-empty" style="padding:16px 0">No open positions — search for a ticker to start.</div>');
    updateRows();
  }
  function updateRows() {
    $$('#bdList .bd-row').forEach(r => {
      const s = r.dataset.sym;
      if (!account.pos(s)) return;
      const v = S.bdMode === 'today' ? market.changePct(s) : account.pnl(s).pct;
      const pc = $('.pc', r);
      pc.className = 'pc ' + fmt.cls(v);
      pc.textContent = `${fmt.arrow(v)} ${fmt.pct(v, Math.abs(v) >= 10 ? 1 : 2)}`;
    });
  }
  function renderPortfolio(full) {
    renderPfChart(false, false);
    if (!pfScrubbing) { $('#pfQuote').innerHTML = pfHeadHtml(); fitHead($('#pgPort .qhead')); }
    renderAlertsCard();
    if (full) renderRows(); else updateRows();
  }

  // tap a row to open it; long-press then drag to reorder within its section
  $('#bdList').addEventListener('pointerdown', e => {
    const row = e.target.closest('.bd-row');
    if (!row || e.button !== 0) return;
    const group = row.parentElement, rows = $$('.bd-row', group), from = rows.indexOf(row);
    const sy = e.clientY, H = row.offsetHeight;
    let lifted = false, cancelled = false, to = from;
    const timer = setTimeout(() => {
      if (cancelled) return;
      lifted = true; S.dragLock = true;
      row.classList.add('lifted');
      if (navigator.vibrate) navigator.vibrate(12);
    }, 380);
    const mv = ev => {
      const dy = (ev.clientY - sy) / S.scale;
      if (!lifted) { if (Math.abs(dy) > 8) { cancelled = true; clearTimeout(timer); } return; }
      ev.preventDefault();
      row.style.transform = `translateY(${dy}px) scale(1.03)`;
      to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / H)));
      rows.forEach((o, i) => {
        if (o === row) return;
        o.classList.add('shift');
        let sh = 0;
        if (from < to && i > from && i <= to) sh = -H;
        if (from > to && i < from && i >= to) sh = H;
        o.style.transform = sh ? `translateY(${sh}px)` : '';
      });
    };
    const up = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', mv);
      S.dragLock = false;
      if (!lifted) return;
      suppressNextClick = true;
      setTimeout(() => { suppressNextClick = false; }, 60);
      const syms = rows.map(r => r.dataset.sym);
      syms.splice(from, 1); syms.splice(to, 0, row.dataset.sym);
      const others = account.state.order.filter(s => !syms.includes(s));
      const isCrypto = market.get(row.dataset.sym).type === 'crypto';
      account.state.order = isCrypto ? syms.concat(others) : others.concat(syms);
      account.save(true);
      renderRows();
    };
    window.addEventListener('pointermove', mv, { passive: false });
    window.addEventListener('pointerup', up, { once: true });
  });
  $('#bdList').addEventListener('click', e => { const r = e.target.closest('.bd-row'); if (r) openTicker(r.dataset.sym); });

  /* ================================================================== *
   * Sheets: order, options, position, search, alerts, settings
   * ================================================================== */
  function openOrder(side, presetQty) {
    const sym = S.sym, tk = market.get(sym), crypto = tk.type === 'crypto';
    const held = account.pos(sym) ? account.pos(sym).qty : 0;
    let type = 'market', qty = presetQty || (side === 'sell' && held ? Math.min(held, crypto ? held : Math.max(1, Math.floor(held / 2))) : crypto ? (tk.price > 10000 ? 0.01 : tk.price > 1000 ? 0.1 : 1) : 1);
    const step = crypto ? (tk.price > 10000 ? 0.01 : tk.price > 1000 ? 0.1 : 1) : 1;
    const sh = sheet({
      title: `${DV.logo(sym, 28)} ${side === 'buy' ? 'Buy' : 'Sell'} $${sym}`,
      right: `<div class="live" id="oLive"></div>`,
      html: `
        <div class="segmented" id="oType"><button data-t="market" class="on">Market</button><button data-t="limit">Limit</button><button data-t="stop">Stop</button></div>
        <div class="field"><span>${crypto ? 'Amount' : 'Shares'}</span><div class="stepper"><button data-d="-1">−</button><input id="oQty" inputmode="decimal" value="${qty}"><button data-d="1">+</button></div></div>
        <div class="field" id="oPxRow" hidden><span id="oPxLbl">Limit price</span><input class="num" id="oPx" inputmode="decimal"></div>
        <div class="field"><span class="muted">${side === 'buy' ? 'Estimated cost' : 'Estimated credit'}</span><b id="oEst"></b></div>
        <div class="field"><span class="muted">${side === 'buy' ? 'Buying power' : 'You own'}</span><span id="oBp"></span></div>
        <div class="quick" id="oQuick">${side === 'buy' ? '<button data-usd="500">$500</button><button data-usd="1000">$1,000</button><button data-usd="5000">$5,000</button><button data-usd="max">Max</button>' : '<button data-f=".25">25%</button><button data-f=".5">50%</button><button data-f=".75">75%</button><button data-f="1">All</button>'}</div>
        <div class="err-line" id="oErr"></div>
        <div class="swipe ${side}" id="oSwipe"></div>
        <div class="sheet-note">Simulated order · fills instantly at the live price</div>`,
    });
    const b = sh.el, q = $('#oQty', b), px = $('#oPx', b);
    const getQty = () => { const v = parseFloat(q.value); return isFinite(v) ? v : 0; };
    const refresh = () => {
      const p = type === 'market' ? market.price(sym) : (parseFloat(px.value) || 0);
      $('#oLive', b).innerHTML = `<span class="${fmt.cls(market.changePct(sym))}">$${fmt.price(market.price(sym))}</span>`;
      $('#oEst', b).textContent = fmt.money(getQty() * p * market.fx(sym), 2);
      $('#oBp', b).textContent = side === 'buy' ? fmt.money(account.buyingPower(), 2) : `${fmt.qty(account.pos(sym) ? account.pos(sym).qty : 0)} ${unitOf(sym)}`;
      $('.sheet-note', b).textContent = type === 'market' ? 'Simulated order · fills instantly at the live price' : `Works until the price ${(type === 'limit') === (side === 'buy') ? 'falls to' : 'rises to'} your ${type} price`;
    };
    $('#oType', b).addEventListener('click', e => {
      const t = e.target.closest('[data-t]');
      if (!t) return;
      type = t.dataset.t;
      $$('#oType button', b).forEach(x => x.classList.toggle('on', x === t));
      $('#oPxRow', b).hidden = type === 'market';
      $('#oPxLbl', b).textContent = type === 'limit' ? 'Limit price' : 'Stop price';
      if (type !== 'market' && !px.value) px.value = fmt.price(market.price(sym)).replace(/,/g, '');
      refresh();
    });
    b.addEventListener('click', e => {
      const d = e.target.closest('[data-d]');
      if (d) { q.value = String(Math.max(step, +(getQty() + (+d.dataset.d) * step).toFixed(4))); refresh(); }
      const u = e.target.closest('[data-usd]');
      if (u) {
        const p = type === 'market' ? market.price(sym) : (parseFloat(px.value) || market.price(sym));
        const usd = u.dataset.usd === 'max' ? account.buyingPower() * 0.999 : +u.dataset.usd;
        const raw = usd / (p * market.fx(sym));
        q.value = String(crypto ? Math.max(step, Math.floor(raw / step) * step).toFixed(4).replace(/\.?0+$/, '') : Math.max(1, Math.floor(raw)));
        refresh();
      }
      const f = e.target.closest('[data-f]');
      if (f) { const h = account.pos(sym) ? account.pos(sym).qty : 0; const v = h * +f.dataset.f; q.value = String(crypto ? +v.toFixed(6) : Math.max(h ? 1 : 0, Math.floor(v))); refresh(); }
    });
    q.addEventListener('input', refresh); px.addEventListener('input', refresh);
    swipeConfirm($('#oSwipe', b), `Swipe to ${side}`, reset => {
      const r = account.placeOrder({ sym, side, type, qty: getQty(), price: parseFloat(px.value) });
      if (!r.ok) { $('#oErr', b).textContent = r.msg; shake($('#oSwipe', b)); reset(); return; }
      if (navigator.vibrate) navigator.vibrate([10, 40, 10]);
      DV.toast(r.msg, { kind: 'ok' });
      sh.close();
    });
    sh.on('tick', refresh);
    refresh();
  }

  function openOptions() {
    const sym = S.sym, exps = options.expiries();
    let ei = Math.min(2, exps.length - 1), kind = 'C', selK = null, qty = 1;
    const sh = sheet({
      title: `${DV.logo(sym, 28)} Options · $${sym}`,
      right: `<div class="live" id="ocLive"></div>`,
      html: `<div class="chips" id="ocExp"></div>
        <div class="segmented" id="ocKind"><button data-k="C" class="on">Calls</button><button data-k="P">Puts</button></div>
        <div id="ocHeld"></div>
        <div class="oc-head"><span>Strike</span><span>Bid</span><span>Ask</span><span>IV</span><span>Δ</span></div>
        <div id="ocRows"></div>`,
      cls: 'tall',
    });
    const b = sh.el;
    sh.el.style.height = '88%';
    const chips = $('#ocExp', b);
    chips.innerHTML = exps.map((e, i) => `<button class="chip${i === ei ? ' on' : ''}" data-i="${i}">${e.label}<small>${e.days}d</small></button>`).join('');
    dragScroll(chips, 'x');
    chips.addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; ei = +c.dataset.i; selK = null; $$('.chip', chips).forEach(x => x.classList.toggle('on', x === c)); rows(true); });
    $('#ocKind', b).addEventListener('click', e => { const t = e.target.closest('[data-k]'); if (!t) return; kind = t.dataset.k; selK = null; $$('#ocKind button', b).forEach(x => x.classList.toggle('on', x === t)); rows(true); });
    function held() {
      const hs = account.state.options.filter(o => o.sym === sym);
      $('#ocHeld', b).innerHTML = hs.length ? `<div class="oc-held"><b>Your contracts</b>${hs.map(o => { const qv = options.quote(o.sym, o.kind, o.K, o.exp); const pl = (qv.bid - o.avg) * 100 * o.qty; return `<div class="row"><span>${o.qty}× ${esc(options.label(o))} <small class="${fmt.cls(pl)}">${fmt.smoney(pl, 0)}</small></span><button data-sell="${o.id}">Sell</button></div>`; }).join('')}</div>` : '';
    }
    function rows(scrollToSpot) {
      const S0 = market.price(sym), exp = exps[ei].ts, ch = options.chain(sym, exp);
      let html = '', spotDone = false;
      ch.forEach(r => {
        if (!spotDone && r.K > S0) { html += `<div class="oc-spot">Share price $${fmt.price(S0)}</div>`; spotDone = true; }
        const qv = r[kind], itm = kind === 'C' ? r.K < S0 : r.K > S0;
        html += `<button class="oc-row${itm ? ' itm' : ''}${selK === r.K ? ' sel' : ''}" data-k="${r.K}"><span><b>${fmt.num(r.K, r.K % 1 ? 2 : 0)}</b></span><span>${fmt.num(qv.bid)}</span><span>${fmt.num(qv.ask)}</span><span>${fmt.num(qv.iv * 100, 1)}%</span><span>${qv.delta.toFixed(2)}</span></button>`;
        if (selK === r.K) {
          const cost = qv.ask * 100 * qty;
          html += `<div class="oc-ticket"><div class="row"><b>Buy to open · ${sym} ${fmt.num(r.K, r.K % 1 ? 2 : 0)}${kind} ${exps[ei].label}</b></div>
            <div class="row"><span>Contracts</span><div class="stepper"><button data-q="-1">−</button><input value="${qty}" readonly><button data-q="1">+</button></div></div>
            <div class="row"><span class="muted">Premium ${fmt.num(qv.ask)} × 100 × ${qty}</span><b>${fmt.money(cost, 2)}</b></div>
            <div class="row"><span class="muted">Breakeven ${fmt.price(kind === 'C' ? r.K + qv.ask : r.K - qv.ask)}</span><button class="go" data-buyopt="${r.K}">Buy ${qty} contract${qty > 1 ? 's' : ''}</button></div></div>`;
        }
      });
      const body = sh.body, st = body.scrollTop;
      $('#ocRows', b).innerHTML = html;
      body.scrollTop = st;
      $('#ocLive', b).innerHTML = `<span class="${fmt.cls(market.changePct(sym))}">$${fmt.price(S0)}</span><br><small style="color:rgba(255,255,255,.5);font-weight:500">IV ${fmt.num(options.ivAtm(sym, exps[ei].days) * 100, 1)}%</small>`;
      held();
      if (scrollToSpot) requestAnimationFrame(() => { const sp = $('.oc-spot', b); if (sp) body.scrollTop = sp.offsetTop - body.clientHeight / 2; });
    }
    b.addEventListener('click', e => {
      const r = e.target.closest('.oc-row');
      if (r) { const k = +r.dataset.k; selK = selK === k ? null : k; qty = 1; rows(); return; }
      const qb = e.target.closest('[data-q]');
      if (qb) { qty = Math.max(1, qty + (+qb.dataset.q)); rows(); return; }
      const bo = e.target.closest('[data-buyopt]');
      if (bo) {
        const res = account.tradeOption({ sym, kind, K: +bo.dataset.buyopt, exp: exps[ei].ts, qty, side: 'buy' });
        DV.toast(res.msg, { kind: res.ok ? 'ok' : 'err' });
        if (res.ok) { selK = null; rows(); renderPosCard(); }
        return;
      }
      const sb = e.target.closest('[data-sell]');
      if (sb) {
        const o = account.state.options.find(x => x.id === sb.dataset.sell);
        if (o) { const res = account.tradeOption({ id: o.id, sym: o.sym, kind: o.kind, K: o.K, exp: o.exp, qty: o.qty, side: 'sell' }); DV.toast(res.msg, { kind: res.ok ? 'ok' : 'err' }); rows(); renderPosCard(); }
      }
    });
    let n = 0;
    sh.on('tick', () => { if (++n % 2 === 0) rows(); });
    rows(true);
  }

  function openPosition() {
    const sym = S.sym, p = account.pos(sym), tk = market.get(sym);
    if (!p && !account.state.options.some(o => o.sym === sym)) { openOrder('buy'); return; }
    const fills = account.state.fills.filter(f => f.sym === sym).slice(0, 6);
    const orders = account.state.orders.filter(o => o.sym === sym);
    const sh = sheet({
      title: `${DV.logo(sym, 28)} $${sym} position`,
      html: `<div class="kv" id="pKv"></div>
        ${orders.length ? `<div class="s-sec">Working orders</div>${orders.map(o => `<div class="field"><span>${o.side.toUpperCase()} ${o.type} ${fmt.qty(o.qty)} @ ${fmt.price(o.price)}</span><button class="link" data-cancel="${o.id}">Cancel</button></div>`).join('')}` : ''}
        ${fills.length ? `<div class="s-sec">Recent activity</div>${fills.map(f => `<div class="field"><span class="${f.side === 'buy' ? 'up' : 'down'}">${f.side.toUpperCase()} ${fmt.qty(f.qty)} @ ${fmt.price(f.px)}</span><span class="muted">${fmt.ago(f.ts)}</span></div>`).join('')}` : ''}
        ${p ? `<button class="wide-btn sell" data-sellall>Sell all ${fmt.qty(p.qty)} ${unitOf(sym)}</button>` : ''}
        <button class="wide-btn ghost" data-close>Done</button>`,
    });
    const kv = () => {
      const pp = account.pos(sym);
      if (!pp) { $('#pKv', sh.el).innerHTML = '<span>Shares</span><span>0</span>'; return; }
      const d = account.dayPnl(sym), a = account.pnl(sym);
      $('#pKv', sh.el).innerHTML = `
        <span>Quantity</span><span>${fmt.qty(pp.qty)} ${unitOf(sym)}</span>
        <span>Average cost</span><span>${fmt.price(pp.avg)} ${tk.cur}</span>
        <span>Market value</span><span>${fmt.money(account.value(sym), 2)}</span>
        <span>Past day</span><span class="${fmt.cls(d.pnl)}">${fmt.smoney(d.pnl, 2)} (${fmt.spct(d.pct)})</span>
        <span>All time</span><span class="${fmt.cls(a.pnl)}">${fmt.smoney(a.pnl, 2)} (${fmt.spct(a.pct)})</span>
        <span>Portfolio weight</span><span>${fmt.num(account.value(sym) / account.equity() * 100, 1)}%</span>`;
    };
    kv();
    sh.on('tick', kv);
    sh.el.addEventListener('click', e => {
      const c = e.target.closest('[data-cancel]');
      if (c) { account.cancelOrder(c.dataset.cancel); c.closest('.field').remove(); DV.toast('Order cancelled'); }
      if (e.target.closest('[data-sellall]')) { sh.close(); setTimeout(() => openOrder('sell', account.pos(sym) ? account.pos(sym).qty : 0), 250); }
    });
  }

  function openSearch() {
    const sh = sheet({
      raw: true, cls: 'search-sheet',
      html: `<div class="search-bar"><div class="box"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="2.4" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6"/></svg><input placeholder="Search stocks & crypto" spellcheck="false" autocomplete="off"></div><button class="cancel" data-close>Cancel</button></div><div class="sh-body"></div>`,
    });
    const inp = $('input', sh.el), body = $('.sh-body', sh.el);
    sh.body = body;
    dragScroll(body);
    const row = t => {
      const c = market.changePct(t.sym), w = account.state.watch.includes(t.sym);
      return `<button class="s-row" data-sym="${t.sym}">${DV.logo(t.sym, 34)}<span class="nm"><b>$${t.sym}</b><small>${esc(t.name)}${account.pos(t.sym) ? ' · held' : ''}</small></span>
        <span class="px">${fmt.price(t.price)}<small class="${fmt.cls(c)}">${fmt.arrow(c)} ${fmt.pct(c)}</small></span><span class="star${w ? ' on' : ''}" data-star="${t.sym}">${w ? '★' : '☆'}</span></button>`;
    };
    const draw = () => {
      const q = inp.value.trim();
      if (q) {
        const res = market.search(q);
        body.innerHTML = `<div class="s-sec">Results</div>` + (res.length ? res.map(row).join('') : '<div class="pos-empty">No matches for “' + esc(q) + '”</div>');
        return;
      }
      const movers = market.list().slice().sort((a, b) => Math.abs(market.changePct(b.sym)) - Math.abs(market.changePct(a.sym))).slice(0, 5);
      body.innerHTML =
        (S.recent.length ? `<div class="s-sec">Recent</div><div class="s-chips">${S.recent.map(s => `<button data-sym="${s}">$${s}</button>`).join('')}</div>` : '') +
        (account.state.watch.length ? `<div class="s-sec">Watchlist</div>${account.state.watch.map(s => market.get(s)).filter(Boolean).map(row).join('')}` : '') +
        `<div class="s-sec">Top movers today</div>${movers.map(row).join('')}`;
    };
    inp.addEventListener('input', draw);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const f = market.search(inp.value)[0]; if (f) { sh.close(); openTicker(f.sym); } }
      if (e.key === 'Escape') sh.close();
    });
    body.addEventListener('click', e => {
      const st = e.target.closest('[data-star]');
      if (st) { e.stopPropagation(); account.toggleWatch(st.dataset.star); draw(); return; }
      const r = e.target.closest('[data-sym]');
      if (r) { sh.close(); openTicker(r.dataset.sym); }
    });
    let n = 0;
    sh.on('tick', () => { if (++n % 3 === 0) draw(); });
    draw();
    setTimeout(() => inp.focus(), 250);
  }

  const ALERT_ICON = { macro: '🏛', move: '📈', news: '📰', fill: '✅' };
  function openAlerts() {
    const sh = sheet({ title: 'Alerts', right: '<button class="link" data-readall style="font-size:14px">Mark all read</button>', html: '<div id="alList"></div><div class="sheet-note">Swipe an alert left to dismiss</div>' });
    const list = $('#alList', sh.el);
    const draw = () => {
      const al = account.state.alerts;
      list.innerHTML = al.length ? al.map(a => `<div class="al-row${a.read ? '' : ' unread'}" data-id="${a.id}"><span class="del">Dismiss</span><div class="in"><span class="ico">${ALERT_ICON[a.kind] || '🔔'}</span><div class="tx"><b>${esc(a.title)}</b><small>${fmt.dmy(a.ts)} · ${fmt.ago(a.ts)}</small></div></div></div>`).join('') : '<div class="pos-empty" style="text-align:center;padding:30px 0">You\'re all caught up</div>';
    };
    draw();
    list.addEventListener('pointerdown', e => {
      const r = e.target.closest('.al-row');
      if (!r || e.button !== 0) return;
      const inner = $('.in', r), sx = e.clientX, sy = e.clientY;
      let dx = 0, horiz = null;
      const mv = ev => {
        const x = (ev.clientX - sx) / S.scale, y = (ev.clientY - sy) / S.scale;
        if (horiz === null && Math.hypot(x, y) > 6) { horiz = Math.abs(x) > Math.abs(y); if (horiz) { S.dragLock = true; r.classList.add('dragging'); } }
        if (!horiz) return;
        dx = Math.min(0, x);
        inner.style.transform = `translateX(${dx}px)`;
      };
      const up = () => {
        window.removeEventListener('pointermove', mv);
        S.dragLock = false;
        r.classList.remove('dragging');
        if (!horiz) {
          if (horiz === null) { const a = account.state.alerts.find(x => x.id === r.dataset.id); if (a && a.sym && market.get(a.sym)) { sh.close(); openTicker(a.sym); } }
          return;
        }
        suppressNextClick = true; setTimeout(() => { suppressNextClick = false; }, 60);
        if (dx < -90) {
          inner.style.transform = 'translateX(-110%)';
          r.animate([{ height: r.offsetHeight + 'px' }, { height: '0px', marginBottom: '0px' }], { duration: 220, delay: 160, fill: 'forwards' });
          setTimeout(() => account.dismissAlert(r.dataset.id), 400);
        } else inner.style.transform = '';
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up, { once: true });
    });
    sh.el.addEventListener('click', e => { if (e.target.closest('[data-readall]')) { account.markRead(); draw(); } });
    sh.on('account', draw);
    setTimeout(() => { if (!sh.closed && account.unread()) account.markRead(); }, 1500);
  }

  function openSettings() {
    const opt = (group, val, label, cur) => `<button data-g="${group}" data-v="${val}" class="${String(cur) === String(val) ? 'on' : ''}">${label}</button>`;
    const bgOpts = (g, cur) => Object.keys(DV.SCENE_NAMES).map(k => opt(g, k, DV.SCENE_NAMES[k], cur)).join('') + opt(g, 'custom', 'Custom photo…', cur);
    const sh = sheet({
      title: `${DV.portfolioIcon(28)} Settings`,
      html: `
        <div class="set-group"><h4>Portfolio background</h4><div class="set-opts">${bgOpts('bgP', S.bgP)}</div></div>
        <div class="set-group"><h4>Ticker background</h4><div class="set-opts">${bgOpts('bgT', S.bgT)}</div></div>
        <div class="set-group"><h4>Phone frame</h4><div class="set-opts">${opt('frame', 'auto', 'Auto', S.frame)}${opt('frame', 'on', 'Always', S.frame)}${opt('frame', 'off', 'Never', S.frame)}</div></div>
        <div class="set-group"><h4>Market simulation</h4><div class="set-opts">${[[0.4, 'Calm'], [1, 'Normal'], [3, 'Turbo']].map(([v, l]) => opt('speed', v, l, market.speed)).join('')}</div></div>
        <div class="set-group"><h4>Account</h4><div class="kv"><span>Equity</span><span id="setEq"></span><span>Cash</span><span>${fmt.money(account.state.cash, 2)}</span><span>Net deposits</span><span>${fmt.money(account.state.deposits, 0)}</span></div></div>
        <button class="set-danger" data-reset>Reset demo account</button>
        <div class="sheet-note">Runs on simulated data. When the desktop app is open in the same browser, both share one market and account.</div>`,
    });
    const eq = () => { const e = $('#setEq', sh.el); if (e) e.textContent = fmt.money(account.equity(), 2); };
    eq(); sh.on('tick', eq);
    sh.el.addEventListener('click', e => {
      const b = e.target.closest('[data-g]');
      if (b) {
        const g = b.dataset.g, v = b.dataset.v;
        if ((g === 'bgP' || g === 'bgT') && v === 'custom') { pickImage(g === 'bgP' ? 'P' : 'T', () => { S[g] = 'custom'; save(); applyBgs(); mark(); }); return; }
        if (g === 'speed') DV.setSpeed(+v); else { S[g] = v; save(); }
        if (g === 'frame') layout();
        if (g === 'bgP' || g === 'bgT') applyBgs();
        mark();
        function mark() { $$(`[data-g="${g}"]`, sh.el).forEach(x => x.classList.toggle('on', x.dataset.v === (g === 'speed' ? v : S[g]))); }
        return;
      }
      if (e.target.closest('[data-reset]')) {
        if (confirm('Reset the demo account to its starting positions?')) { account.reset(); sh.close(); DV.toast('Demo account reset'); }
      }
    });
  }
  function pickImage(key, done) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try { localStorage.setItem('dv.m.bgimg' + key, JSON.stringify(rd.result)); done(); }
        catch (e) { (key === 'P' ? sceneP : sceneT).setImage(rd.result); DV.toast('Photo too large to remember — using it for this session'); }
      };
      rd.readAsDataURL(f);
    };
    inp.click();
  }

  /* ================================================================== *
   * Keyboard, clock, live updates, boot
   * ================================================================== */
  document.addEventListener('keydown', e => {
    if (e.target.matches && e.target.matches('input')) return;
    if (e.key === 'Escape') { if (sheets.length) sheets[sheets.length - 1].close(); else if (S.page === 'ticker') go('port'); }
    else if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); if (!sheets.length) openSearch(); }
    else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && S.page === 'ticker' && !sheets.length) go('port');
  });
  const sbTime = $('#sbTime');
  const clock = () => { const d = new Date(); sbTime.textContent = (d.getHours() % 12 || 12) + ':' + String(d.getMinutes()).padStart(2, '0'); };
  clock(); setInterval(clock, 5000);

  let tickN = 0;
  DV.on('tick', () => {
    tickN++;
    if (S.page === 'ticker') {
      renderTickerChart(false, false);
      renderPosCard();
      if (tickN % 3 === 0) renderVol();
      if (tickN % 5 === 0) renderStatsGrid();
    } else {
      renderPortfolio(false);
    }
    document.title = S.page === 'ticker' ? `$${S.sym} ${fmt.price(market.price(S.sym))} · DeltaVision` : 'DeltaVision Mobile';
  });
  DV.on('account', () => {
    if (!S.dragLock) renderRows();
    renderAlertsCard();
    renderPosCard();
  });
  DV.on('alert', a => {
    if (a.kind === 'fill') return;
    DV.toast('🔔 ' + a.title, { action: { label: 'View', fn: openAlerts } });
  });
  DV.on('fill', f => { if (sheets.length === 0) DV.toast(`Order filled: ${f.side.toUpperCase()} ${fmt.qty(f.qty)} $${f.sym} @ ${fmt.price(f.px)}`, { kind: 'ok' }); });

  $('#pfLogo').innerHTML = DV.portfolioIcon(36);
  screen.classList.add('boot');
  setTimeout(() => screen.classList.remove('boot'), 120);
  layout();
  applyBgs();
  screen.dataset.page = S.page;
  $$('#bdMode button').forEach(x => x.classList.toggle('on', x.dataset.mode === S.bdMode));
  renderTicker(true, false);
  renderPortfolio(true);
  sceneActivity();
  $('#btnLeft').title = S.page === 'ticker' ? 'Portfolio' : `Back to $${S.sym}`;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitHead($('#pgTicker .qhead')); fitHead($('#pgPort .qhead')); });
  DV.start();
})();
