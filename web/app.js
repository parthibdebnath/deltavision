/* DeltaVision – web (desktop) app */
(function () {
  'use strict';
  const { market, account, options, fmt, store } = DV;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const TFS = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'];
  const COLORS = { amber: ['Amber', '#ffa31a'], mint: ['Mint', '#4dff9a'], ice: ['Ice', '#55c8ff'], rose: ['Rose', '#ff6b9a'], violet: ['Violet', '#a68bff'] };
  const SPEEDS = [[0.4, 'Calm'], [1, 'Normal'], [3, 'Turbo']];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isInteractive = el => !!(el && el.closest && el.closest('button, input, select, textarea, a, [data-nodrag], .tfs, .dots'));

  const S = {
    sym: store.get('dv.web.sym', 'RKLB'),
    tf: store.get('dv.web.tf', '1Y'),
    mode: store.get('dv.web.mode', 'line'),
    scope: store.get('dv.web.scope', 'ticker'),
    color: store.get('dv.web.color', 'amber'),
    bg: store.get('dv.web.bg', 'canyon'),
    tool: null,
    pfTf: '1Y', pfTab: 'holdings',
    orderType: 'market', pxEdited: false,
  };
  if (!market.get(S.sym)) S.sym = 'RKLB';
  if (!TFS.includes(S.tf)) S.tf = '1Y';
  const persist = () => ['sym', 'tf', 'mode', 'scope', 'color', 'bg'].forEach(k => store.set('dv.web.' + k, S[k]));
  const drawings = store.get('dv.web.drawings', {});

  const unitOf = sym => market.get(sym).type === 'crypto' ? sym.replace(/USD|CAD$/, '') : 'shares';
  const pnlHtml = (v, pct, d = 0) => `<span class="${fmt.cls(v)}">${fmt.arrow(v)} ${fmt.money(Math.abs(v), d)} (${fmt.pct(pct, Math.abs(pct) < 10 ? 1 : 0)})</span>`;

  /* ================================================================== *
   * Background + clock
   * ================================================================== */
  const scene = new DV.Scene($('#bg'), { parallax: true });
  function applyBg() {
    if (S.bg === 'custom') {
      const url = store.get('dv.web.bgimg', null) || sessionBg;
      if (url) { scene.setImage(url); return; }
      S.bg = 'canyon';
    }
    scene.set(S.bg);
  }
  let sessionBg = null;
  function loadBgFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    const rd = new FileReader();
    rd.onload = () => {
      sessionBg = rd.result;
      S.bg = 'custom';
      try { localStorage.setItem('dv.web.bgimg', JSON.stringify(rd.result)); } catch (e) { DV.toast('Image is too large to remember between sessions — using it for now'); }
      persist(); applyBg();
      DV.toast('Background updated', { kind: 'ok' });
    };
    rd.readAsDataURL(file);
  }
  function pickBgFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => loadBgFile(inp.files[0]);
    inp.click();
  }
  document.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) { e.preventDefault(); loadBgFile(f); } });
  applyBg();

  const clockEl = $('#clock');
  const tickClock = () => { clockEl.textContent = fmt.clock(Date.now()); };
  tickClock(); setInterval(tickClock, 1000);

  /* ================================================================== *
   * Window manager: drag, resize, snap, focus, min/max/close, persist
   * ================================================================== */
  const LAYOUT_KEY = 'dv.web.layout.v2';
  const TOP = 25;
  const WM = {
    wins: {}, z: 10, guides: [],
    init() {
      $$('.win').forEach(el => {
        const id = el.dataset.win;
        const w = { id, el, hidden: false, shaded: false, max: false, fixed: !!el.dataset.fixed, axis: el.dataset.axis || null, frac: null };
        this.wins[id] = w;
        const dots = $('.dots', el);
        if (dots) (el.dataset.dots || '').split(',').filter(Boolean).forEach(k => {
          const b = document.createElement('button');
          b.className = { max: 'g', min: 'y', close: 'r' }[k];
          b.title = { max: 'Maximize', min: 'Minimize', close: 'Close' }[k];
          b.addEventListener('click', e => { e.stopPropagation(); this[k](id); });
          dots.appendChild(b);
        });
        (el.dataset.resize || '').split(',').filter(Boolean).forEach(d => {
          const h = document.createElement('div');
          h.className = 'rs rs-' + d;
          h.addEventListener('pointerdown', e => this.startResize(e, id, d));
          el.appendChild(h);
        });
        el.addEventListener('pointerdown', () => this.focus(id), true);
        $$('.drag', el).forEach(h => h.addEventListener('pointerdown', e => this.startDrag(e, id)));
        $$('.win-head', el).forEach(h => h.addEventListener('dblclick', e => { if (!isInteractive(e.target) && el.dataset.dots && el.dataset.dots.includes('min')) this.min(id); }));
      });
      this.restore();
      window.addEventListener('resize', () => this.applyAll());
    },
    defaults(W, H) {
      const sx = W / 1920, sy = H / 1080;
      const info = { x: 7 * sx, y: Math.max(TOP + 8, 183 * sy), w: Math.max(268, 308 * sx), h: 700 * sy };
      info.h = Math.min(info.h, H - info.y - 110);
      const cx = info.x + info.w + 13 * sx;
      const cr = W - Math.max(322 * sx, 96);
      const chart = { x: cx, y: info.y, w: Math.max(520, cr - cx), h: info.h };
      return {
        info, chart,
        order: { x: W - 228 * Math.max(1, sx), y: Math.max(TOP + 10, 50 * sy), w: 218, h: 210 },
        dock: { x: W - 70, y: 415 * sy, w: 70, h: this.dockHeight() },
        toolbar: { x: chart.x - 3 * sx, y: chart.y + chart.h + 37 * sy, w: chart.w, h: 88 },
        portfolio: { x: W / 2 - 230, y: Math.max(TOP + 30, H * 0.12), w: 460, h: Math.min(680, H - 140) },
      };
    },
    dockHeight() { return 12 + account.state.dock.length * 40 + 36; },
    toFrac(r, w) {
      const W = innerWidth, H = innerHeight;
      return { x: r.x / W, y: r.y / H, w: w.fixed ? r.w : r.w / W, h: w.fixed ? r.h : r.h / H, right: r.x + r.w >= W - 2 };
    },
    fromFrac(f, w) {
      const W = innerWidth, H = innerHeight;
      const r = { w: w.fixed ? f.w : f.w * W, h: w.fixed ? f.h : f.h * H, y: f.y * H };
      r.x = f.right ? W - r.w : f.x * W;
      return r;
    },
    restore() {
      const saved = store.get(LAYOUT_KEY, null), d = this.defaults(innerWidth, innerHeight);
      Object.values(this.wins).forEach(w => {
        const s = saved && saved[w.id];
        w.frac = s && s.frac ? s.frac : this.toFrac(d[w.id], w);
        w.hidden = s ? !!s.hidden : w.id === 'portfolio';
        w.shaded = s ? !!s.shaded : false;
        w.max = s ? !!s.max : false;
      });
      if (this.wins.dock) this.wins.dock.frac.h = this.dockHeight();
      this.applyAll();
    },
    reset() {
      store.del(LAYOUT_KEY);
      const d = this.defaults(innerWidth, innerHeight);
      Object.values(this.wins).forEach(w => { w.frac = this.toFrac(d[w.id], w); w.hidden = w.id === 'portfolio'; w.shaded = false; w.max = false; });
      this.applyAll(); this.persist();
    },
    persist() {
      const out = {};
      Object.values(this.wins).forEach(w => { out[w.id] = { frac: w.frac, hidden: w.hidden, shaded: w.shaded, max: w.max }; });
      store.set(LAYOUT_KEY, out);
    },
    applyAll() { Object.keys(this.wins).forEach(id => this.apply(id)); },
    apply(id) {
      const w = this.wins[id], el = w.el, W = innerWidth, H = innerHeight;
      let r = this.fromFrac(w.frac, w);
      if (w.max) {
        const dockOn = !this.wins.dock.hidden;
        r = { x: 8, y: TOP + 8, w: W - 16 - (dockOn && id !== 'dock' ? 76 : 0), h: H - TOP - 16 };
      }
      const minW = +el.dataset.minw || (w.fixed ? 0 : 120);
      r.w = Math.min(Math.max(r.w, Math.min(minW, W - 16)), W);
      r.x = Math.min(Math.max(r.x, -r.w + 90), W - 60);
      r.y = Math.min(Math.max(r.y, TOP), H - 40);
      el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 'px';
      el.style.height = id === 'toolbar' ? 'auto' : r.h + 'px';
      el.classList.toggle('hidden', w.hidden);
      el.classList.toggle('shaded', w.shaded);
    },
    capture(id) {
      const w = this.wins[id], b = w.el.getBoundingClientRect();
      const h = w.shaded ? this.fromFrac(w.frac, w).h : b.height;
      w.frac = this.toFrac({ x: b.left, y: b.top, w: b.width, h }, w);
    },
    focus(id) {
      const w = this.wins[id];
      if (!w) return;
      if (w.el.classList.contains('focused') && +w.el.style.zIndex === this.z) return;
      $$('.win.focused').forEach(e => e.classList.remove('focused'));
      w.el.style.zIndex = id === 'toolbar' || id === 'dock' ? ++this.z : ++this.z;
      w.el.classList.add('focused');
    },
    show(id) {
      const w = this.wins[id];
      w.hidden = false; this.apply(id); this.focus(id); this.persist();
      w.el.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 160, easing: 'ease-out' });
      if (id === 'portfolio') renderPortfolio(true);
    },
    close(id, quiet) {
      const w = this.wins[id];
      w.el.classList.add('closing');
      setTimeout(() => { w.el.classList.remove('closing'); w.hidden = true; this.apply(id); this.persist(); }, 170);
      if (!quiet) DV.toast(`${winName(id)} closed`, { action: { label: 'Undo', fn: () => this.show(id) } });
    },
    toggle(id) { if (this.wins[id].hidden) this.show(id); else this.close(id, true); },
    min(id) { const w = this.wins[id]; w.shaded = !w.shaded; this.apply(id); this.persist(); },
    max(id) { const w = this.wins[id]; w.max = !w.max; w.shaded = false; this.apply(id); this.focus(id); this.persist(); },

    startDrag(e, id) {
      const w = this.wins[id];
      if (e.button !== 0 || isInteractive(e.target) || w.max) return;
      e.preventDefault();
      const el = w.el, r = el.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
      let moved = false;
      const mv = ev => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
        moved = true;
        el.classList.add('dragging');
        let x = r.left + ev.clientX - sx, y = r.top + ev.clientY - sy;
        if (w.axis === 'y') x = r.left;
        const s = ev.altKey ? { x, y } : this.snap(id, x, y, r.width, r.height);
        el.style.left = s.x + 'px'; el.style.top = Math.max(TOP, s.y) + 'px';
      };
      const up = () => {
        window.removeEventListener('pointermove', mv);
        el.classList.remove('dragging');
        this.clearGuides();
        if (moved) { this.capture(id); this.persist(); }
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up, { once: true });
    },
    startResize(e, id, dir) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const w = this.wins[id], el = w.el, r = el.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
      const minW = +el.dataset.minw || 150, minH = +el.dataset.minh || 100;
      w.max = false;
      el.classList.add('dragging');
      const mv = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        let { left: x, top: y, width: ww, height: hh } = r;
        if (dir.includes('e')) ww = Math.max(minW, r.width + dx);
        if (dir.includes('s')) hh = Math.max(minH, r.height + dy);
        if (dir.includes('w')) { ww = Math.max(minW, r.width - dx); x = r.right - ww; }
        if (dir.includes('n')) { hh = Math.max(minH, r.height - dy); y = Math.max(TOP, r.bottom - hh); hh = r.bottom - y; }
        el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = ww + 'px';
        if (id !== 'toolbar') el.style.height = hh + 'px';
      };
      const up = () => {
        window.removeEventListener('pointermove', mv);
        el.classList.remove('dragging');
        this.capture(id); this.persist();
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up, { once: true });
    },
    snap(id, x, y, ww, hh) {
      const T = 8, W = innerWidth, H = innerHeight, xs = [0, W - ww], ys = [TOP, H - hh];
      Object.values(this.wins).forEach(o => {
        if (o.id === id || o.hidden) return;
        const b = o.el.getBoundingClientRect();
        xs.push(b.left - ww - 8, b.right + 8, b.left, b.right - ww);
        ys.push(b.top - hh - 8, b.bottom + 8, b.top, b.bottom - hh);
      });
      let bx = null, by = null;
      xs.forEach(c => { if (Math.abs(c - x) < T && (bx === null || Math.abs(c - x) < Math.abs(bx - x))) bx = c; });
      ys.forEach(c => { if (Math.abs(c - y) < T && (by === null || Math.abs(c - y) < Math.abs(by - y))) by = c; });
      this.clearGuides();
      if (bx !== null) { x = bx; this.guide('v', bx === W - ww ? W - 2 : x); }
      if (by !== null) { y = by; this.guide('h', y); }
      return { x, y };
    },
    guide(kind, pos) {
      const g = document.createElement('div');
      g.className = 'snap-guide';
      Object.assign(g.style, kind === 'v' ? { left: pos + 'px', top: 0, bottom: 0, width: '1px' } : { top: pos + 'px', left: 0, right: 0, height: '1px' });
      document.body.appendChild(g);
      this.guides.push(g);
    },
    clearGuides() { this.guides.forEach(g => g.remove()); this.guides = []; },
  };
  const winName = id => ({ info: 'Stock Information', chart: 'Chart', order: 'New Order', dock: 'Ticker Dock', toolbar: 'Toolbar', portfolio: 'Portfolio' }[id]);

  /* ================================================================== *
   * Main chart
   * ================================================================== */
  const tfsEl = $('#tfs');
  tfsEl.innerHTML = TFS.map(t => `<button data-tf="${t}">${t}</button>`).join('');
  tfsEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTf(b.dataset.tf); });

  function priceLines() {
    const L = [], p = account.pos(S.sym);
    if (p) L.push({ id: 'avg', price: p.avg, label: 'AVG ' + fmt.qty(p.qty), color: '#9fdcff', draggable: false });
    account.state.orders.filter(o => o.sym === S.sym).forEach(o => L.push({
      id: o.id, price: o.price, draggable: true,
      label: `${o.side.toUpperCase()} ${o.type === 'limit' ? 'LMT' : 'STP'} ${fmt.qty(o.qty)}`,
      color: o.side === 'buy' ? '#3ee07a' : '#ff5d6c',
    }));
    return L;
  }

  const chart = new DV.Chart($('#mainChart'), {
    color: COLORS[S.color][1], lineWidth: 2, glow: 16,
    yAxis: 'nice', xAxis: 'spread', pad: { t: 40, r: 40, b: 34, l: 10 },
    font: '500 12.5px Inter, system-ui, sans-serif', labelColor: 'rgba(255,255,255,.95)',
    scrub: false, hover: true, tooltip: true, crossY: true, endMarker: true, zoom: true, tools: true,
    getDrawings: () => drawings[S.sym] || [],
    saveDrawings: arr => { drawings[S.sym] = arr; store.set('dv.web.drawings', drawings); },
    priceLines,
    onPriceLineMove: (line, price) => {
      account.moveOrder(line.id, +price.toFixed(price >= 1 ? 2 : 4));
      DV.toast(`Order moved to $${fmt.price(price)}`, { kind: 'ok' });
    },
    onContext: chartMenu,
    onToolDone: () => setTool(null),
    onView: v => { if (v) hint('Scroll to zoom · drag to pan · double-click to reset', 2200); },
  });
  chart.setMode(S.mode);

  function seriesChange(pts) {
    const price = market.price(S.sym);
    const base = S.tf === '1D' ? market.get(S.sym).prev : pts[0].c;
    return { ch: price - base, pct: (price / base - 1) * 100 };
  }
  function renderChartHead() {
    const tk = market.get(S.sym);
    $('#chLogo').innerHTML = DV.logo(S.sym, 26);
    $('#chSym').textContent = '$' + S.sym;
    $('#chName').textContent = tk.name;
    $$('.sym-text').forEach(e => { e.textContent = '$' + S.sym; });
    $$('button', tfsEl).forEach(b => b.classList.toggle('active', b.dataset.tf === S.tf));
    document.title = `$${S.sym} ${fmt.price(tk.price)} · DeltaVision`;
  }
  function renderQuote(pts) {
    const { ch, pct } = seriesChange(pts);
    $('#chQuote').innerHTML = `<span class="${fmt.cls(ch)}">$${fmt.price(market.price(S.sym))} ${fmt.arrow(ch)} ${fmt.pct(pct)} ($${fmt.num(Math.abs(ch), market.price(S.sym) >= 1 ? 2 : 4)})</span>`;
  }
  function updateChart(animate, reset) {
    const pts = market.series(S.sym, S.tf);
    chart.setData(pts, { animate, reset, tf: S.tf });
    renderQuote(pts);
  }
  function setTf(tf) {
    if (tf === S.tf) return;
    S.tf = tf; persist();
    renderChartHead();
    updateChart(true, true);
  }
  function setMode(m) {
    S.mode = m; persist();
    chart.setMode(m);
    $$('#tbChartType .tb-ico').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  }
  const TOOL_HINTS = { pen: 'Pen: drag on the chart to draw · Esc to exit', text: 'Text: click where the note should go', measure: 'Measure: drag between two points · Esc to exit' };
  function setTool(t) {
    S.tool = t === S.tool ? null : t;
    chart.setTool(S.tool);
    $$('#tbTools .tb-ico').forEach(b => b.classList.toggle('tool-on', b.dataset.tool === S.tool));
    if (S.tool) hint(TOOL_HINTS[S.tool]); else hint(null);
  }
  let hintT = 0;
  function hint(msg, ms) {
    const el = $('#chartHint');
    clearTimeout(hintT);
    if (!msg) { el.hidden = true; return; }
    el.textContent = msg; el.hidden = false;
    if (ms) hintT = setTimeout(() => { el.hidden = !S.tool; if (S.tool) el.textContent = TOOL_HINTS[S.tool]; }, ms);
  }

  function chartMenu(info) {
    const tk = market.get(S.sym), px = info.price, below = px < tk.price;
    const qty = parseQty();
    const items = [];
    if (info.drawing) items.push({ label: 'Delete drawing', kbd: 'Del', danger: true, fn: () => chart.deleteSelected() });
    if (info.line && info.line.id !== 'avg') items.push({ label: 'Cancel this order', danger: true, fn: () => { account.cancelOrder(info.line.id); DV.toast('Order cancelled'); } });
    if (items.length) items.push({ sep: true });
    const p = px >= 1 ? +px.toFixed(2) : +px.toFixed(4);
    if (px > 0) {
      items.push({ hd: `At $${fmt.price(p)} · ${fmt.qty(qty)} ${unitOf(S.sym)}` });
      if (below) {
        items.push({ label: `Buy limit @ ${fmt.price(p)}`, fn: () => place('buy', 'limit', p) });
        items.push({ label: `Sell stop @ ${fmt.price(p)}`, fn: () => place('sell', 'stop', p) });
      } else {
        items.push({ label: `Sell limit @ ${fmt.price(p)}`, fn: () => place('sell', 'limit', p) });
        items.push({ label: `Buy stop @ ${fmt.price(p)}`, fn: () => place('buy', 'stop', p) });
      }
      items.push({ sep: true });
    }
    const n = (drawings[S.sym] || []).length;
    items.push({ label: S.mode === 'line' ? 'Switch to candlesticks' : 'Switch to line', kbd: S.mode === 'line' ? 'C' : 'L', fn: () => setMode(S.mode === 'line' ? 'candle' : 'line') });
    items.push({ label: 'Reset zoom', kbd: 'dbl-click', fn: () => chart.resetView(), disabled: !chart.view });
    items.push({ label: `Clear drawings${n ? ' (' + n + ')' : ''}`, disabled: !n, fn: () => { const old = drawings[S.sym]; drawings[S.sym] = []; store.set('dv.web.drawings', drawings); chart.draw(); DV.toast('Drawings cleared', { action: { label: 'Undo', fn: () => { drawings[S.sym] = old; store.set('dv.web.drawings', drawings); chart.draw(); } } }); } });
    menu(info.clientX, info.clientY, items);
  }
  function place(side, type, price) {
    justPlaced = true;
    const r = account.placeOrder({ sym: S.sym, side, type, qty: parseQty(), price });
    justPlaced = false;
    DV.toast(r.msg, { kind: r.ok ? 'ok' : 'err' });
    flash('order', r.ok);
    return r;
  }

  /* ================================================================== *
   * Stock information
   * ================================================================== */
  let aiOpenFor = null, aiTimer = 0;
  function renderInfo() {
    const tk = market.get(S.sym);
    $('#infoArt').innerHTML = DV.art(S.sym);
    $('#infoDesc').innerHTML = tk.desc;
    const a = DV.analysis(S.sym);
    $('#ratingDot').style.left = (a.score * 100) + '%';
    $('#rating').title = `AI rating: ${a.verdict} (score ${a.score.toFixed(2)})`;
    if (aiOpenFor && aiOpenFor !== S.sym) closeAi();
    renderStats(true);
  }
  let lastStats = {};
  function renderStats(full) {
    const st = market.stats(S.sym);
    const rows = [
      ['Market Cap', fmt.compact(st.mcap) + ' USD', st.mcap],
      ['P/E Ratio', st.pe ? fmt.num(st.pe, 1) : '—', st.pe],
      ['52-week high', fmt.price(st.hi52), st.hi52],
      ['52-week Low', fmt.price(st.lo52), st.lo52],
      ['Average 30 Day Volume', fmt.compact(st.avgVol), st.avgVol],
      ['Basic EPS', st.eps == null ? '—' : fmt.num(st.eps), st.eps],
      ['Float', fmt.compact(st.float, 1), st.float],
    ];
    const dl = $('#stats');
    if (full || dl.children.length !== rows.length * 2) {
      dl.innerHTML = rows.map(r => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('');
    } else {
      const dds = $$('dd', dl);
      rows.forEach((r, i) => {
        if (dds[i].textContent !== r[1]) {
          const prev = lastStats[r[0]];
          dds[i].textContent = r[1];
          dds[i].classList.remove('flash-up', 'flash-down');
          void dds[i].offsetWidth;
          if (prev != null && r[2] != null) dds[i].classList.add(r[2] >= prev ? 'flash-up' : 'flash-down');
        }
      });
    }
    rows.forEach(r => { lastStats[r[0]] = r[2]; });
  }
  function closeAi() { aiOpenFor = null; clearTimeout(aiTimer); $('#aiPanel').hidden = true; $('#aiPill').classList.remove('loading'); }
  $('#aiPill').addEventListener('click', () => {
    if (aiOpenFor === S.sym) { closeAi(); return; }
    aiOpenFor = S.sym;
    const pill = $('#aiPill'), panel = $('#aiPanel');
    pill.classList.add('loading');
    panel.hidden = false;
    panel.innerHTML = '<span class="muted">Analyzing price action, volatility and fundamentals…</span>';
    clearTimeout(aiTimer);
    aiTimer = setTimeout(() => {
      pill.classList.remove('loading');
      const a = DV.analysis(S.sym);
      panel.innerHTML = `<span class="verdict ${a.verdict}">${a.verdict}</span><ul></ul><div class="disc">Simulated analysis for demo purposes — not financial advice.</div>`;
      const ul = $('ul', panel);
      let li = 0, ch = 0, cur = null;
      const type = () => {
        if (aiOpenFor !== S.sym) return;
        if (li >= a.lines.length) return;
        if (!cur) { cur = document.createElement('li'); ul.appendChild(cur); }
        ch += 3;
        cur.textContent = a.lines[li].slice(0, ch);
        if (ch >= a.lines[li].length) { li++; ch = 0; cur = null; }
        aiTimer = setTimeout(type, 12);
      };
      type();
      $('#ratingDot').style.left = (a.score * 100) + '%';
    }, 750);
  });

  /* ================================================================== *
   * New order
   * ================================================================== */
  const ordQty = $('#ordQty'), ordPx = $('#ordPx'), ordType = $('#ordType');
  const qtyStep = () => market.get(S.sym).type === 'crypto' ? (market.price(S.sym) > 10000 ? 0.01 : 0.1) : 1;
  function parseQty() { const v = parseFloat(String(ordQty.value).replace(/[^0-9.]/g, '')); return isFinite(v) ? v : 0; }
  function parsePx() { const v = parseFloat(String(ordPx.value).replace(/[^0-9.]/g, '')); return isFinite(v) ? v : 0; }
  function renderOrder(symChanged) {
    const tk = market.get(S.sym);
    if (symChanged) {
      const crypto = tk.type === 'crypto';
      if (crypto && parseQty() >= 1 && tk.price > 1000) ordQty.value = '0.05';
      if (!crypto && !Number.isInteger(parseQty())) ordQty.value = '100';
      S.pxEdited = false;
    }
    const mkt = S.orderType === 'market';
    ordPx.readOnly = mkt;
    if (mkt || !S.pxEdited) ordPx.value = (mkt ? '$' : '') + fmt.price(tk.price).replace(/,/g, mkt ? ',' : '');
    const px = mkt ? tk.price : parsePx();
    const est = parseQty() * px * market.fx(S.sym);
    $('#ordEst').textContent = `Est. ${fmt.money(est, 2)} · Buying power ${fmt.money(account.buyingPower(), 0)}`;
  }
  ordType.addEventListener('change', () => { S.orderType = ordType.value; S.pxEdited = false; renderOrder(); if (S.orderType !== 'market') { ordPx.focus(); ordPx.select(); } });
  ordPx.addEventListener('input', () => { S.pxEdited = true; renderOrder(); });
  ordQty.addEventListener('input', () => renderOrder());
  const stepQty = (dir, big) => {
    const st = qtyStep() * (big ? 10 : 1);
    const v = Math.max(st, +(parseQty() + dir * st).toFixed(4));
    ordQty.value = String(v);
    renderOrder();
  };
  $('#qtyUp').addEventListener('click', e => stepQty(1, e.shiftKey));
  $('#qtyDn').addEventListener('click', e => stepQty(-1, e.shiftKey));
  ordQty.addEventListener('wheel', e => { e.preventDefault(); stepQty(e.deltaY < 0 ? 1 : -1, e.shiftKey); }, { passive: false });
  ordQty.addEventListener('keydown', e => { if (e.key === 'ArrowUp') { e.preventDefault(); stepQty(1, e.shiftKey); } if (e.key === 'ArrowDown') { e.preventDefault(); stepQty(-1, e.shiftKey); } });
  [ordQty, ordPx].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') submitOrder('buy'); }));
  $('#btnBuy').addEventListener('click', () => submitOrder('buy'));
  $('#btnSell').addEventListener('click', () => submitOrder('sell'));
  let justPlaced = false;
  function submitOrder(side) {
    justPlaced = true;
    const r = account.placeOrder({ sym: S.sym, side, type: S.orderType, qty: parseQty(), price: parsePx() });
    justPlaced = false;
    flash('order', r.ok);
    DV.toast(r.msg, { kind: r.ok ? 'ok' : 'err' });
    if (r.ok && !r.filled) hint('Working orders show on the chart — drag the tag to modify', 3000);
  }
  function flash(id, ok) {
    const el = WM.wins[id].el, cls = ok ? 'flash-ok' : 'flash-err';
    el.classList.remove('flash-ok', 'flash-err');
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 700);
  }

  /* ================================================================== *
   * Ticker dock (magnification, reorder, drag-out to remove)
   * ================================================================== */
  const dockEl = $('#dockItems');
  let dockFocus = null;
  function renderDock() {
    dockEl.innerHTML = account.state.dock.map(s => `
      <div class="dock-item${s === S.sym ? ' active' : ''}" data-sym="${s}">
        <span class="ic">${DV.logo(s, 34)}</span>
        <span class="tip"></span>
      </div>`).join('');
    WM.wins.dock.frac.h = WM.dockHeight();
    WM.apply('dock');
    sizeDock(); updateDockTips();
  }
  function sizeDock() {
    const items = $$('.dock-item', dockEl);
    let f = dockFocus;
    if (f == null) f = account.state.dock.indexOf(S.sym);
    if (f < 0) f = (items.length - 1) / 2;
    items.forEach((el, i) => {
      const d = i - f, s = 10 + 24 * Math.exp(-(d * d) / 3);
      const ic = $('.ic', el); ic.style.width = s + 'px'; ic.style.height = s + 'px';
    });
  }
  function updateDockTips() {
    $$('.dock-item', dockEl).forEach(el => {
      const s = el.dataset.sym, c = market.changePct(s);
      $('.tip', el).innerHTML = `$${s} <span style="font-weight:500">${fmt.price(market.price(s))}</span> <span class="${fmt.cls(c)}">${fmt.arrow(c)}${fmt.pct(c)}</span>`;
    });
  }
  dockEl.addEventListener('pointermove', e => {
    if (dockDrag) return;
    const items = $$('.dock-item', dockEl);
    if (!items.length) return;
    const r0 = items[0].getBoundingClientRect(), r1 = items[items.length - 1].getBoundingClientRect();
    const span = (r1.top + r1.height / 2) - (r0.top + r0.height / 2) || 1;
    dockFocus = ((e.clientY - (r0.top + r0.height / 2)) / span) * (items.length - 1);
    sizeDock();
  });
  dockEl.addEventListener('pointerleave', () => { if (!dockDrag) { dockFocus = null; sizeDock(); } });
  let dockDrag = null;
  dockEl.addEventListener('pointerdown', e => {
    const it = e.target.closest('.dock-item');
    if (!it || e.button !== 0) return;
    e.preventDefault();
    const sym = it.dataset.sym, sx = e.clientX, sy = e.clientY;
    const items = $$('.dock-item', dockEl), from = items.indexOf(it), H = it.getBoundingClientRect().height + 4;
    dockDrag = null;
    const mv = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!dockDrag && Math.hypot(dx, dy) > 6) { dockDrag = { sym }; it.classList.add('dragging'); }
      if (!dockDrag) return;
      it.style.transform = `translate(${Math.min(0, dx)}px, ${dy}px)`;
      it.classList.toggle('remove-hint', dx < -80);
      const to = Math.max(0, Math.min(items.length - 1, from + Math.round(dy / H)));
      items.forEach((o, i) => {
        if (o === it) return;
        let sh = 0;
        if (from < to && i > from && i <= to) sh = -H;
        if (from > to && i < from && i >= to) sh = H;
        o.style.transform = sh ? `translateY(${sh}px)` : '';
        o.style.transition = 'transform .15s';
      });
      dockDrag.to = to; dockDrag.remove = dx < -80;
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      if (!dockDrag) { selectSym(sym); return; }
      const d = account.state.dock.slice();
      if (dockDrag.remove) {
        const old = d.slice();
        account.state.dock = d.filter(s => s !== sym);
        account.save();
        DV.toast(`$${sym} removed from dock`, { action: { label: 'Undo', fn: () => { account.state.dock = old; account.save(); } } });
      } else if (dockDrag.to !== from) {
        d.splice(from, 1); d.splice(dockDrag.to, 0, sym);
        account.state.dock = d; account.save();
      } else renderDock();
      dockDrag = null;
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up, { once: true });
  });
  $('#dockAdd').addEventListener('click', () => palette());

  /* ================================================================== *
   * Toolbar: chart type, tools, news, position, close buttons, scope
   * ================================================================== */
  $('#tbChartType').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  $('#tbTools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });

  let newsIdx = 0;
  function newsItems() {
    const tk = market.get(S.sym);
    const al = account.state.alerts.filter(a => a.sym === S.sym || a.kind === 'macro').map(a => ({ title: a.title.replace(/^\$\w+ /, tk.short + ' '), ts: a.ts, sym: a.sym }));
    return tk.news.map((t, i) => ({ title: t, ts: Date.now() - (i + 1) * 3.3 * 3600e3, sym: S.sym })).concat(al);
  }
  function rotateNews(reset) {
    const list = newsItems(), el = $('#tbNewsText');
    if (reset) newsIdx = 0; else newsIdx = (newsIdx + 1) % list.length;
    el.classList.add('out');
    setTimeout(() => { el.textContent = list[newsIdx] ? list[newsIdx].title : ''; el.classList.remove('out'); }, reset ? 0 : 280);
  }
  setInterval(() => { if (!document.hidden) rotateNews(false); }, 7000);
  $('#tbNews').addEventListener('click', e => {
    const list = newsItems().concat(account.state.alerts.filter(a => a.sym && a.sym !== S.sym).slice(0, 6));
    popover(e.currentTarget, `
      <h3>News & alerts</h3>
      <div class="list">${list.map((n, i) => `<div class="li" data-i="${i}"><span>${esc(n.title)}</span><span class="muted">${fmt.ago(n.ts)}</span></div>`).join('')}</div>`, 'news-pop', pop => {
      pop.addEventListener('click', ev => {
        const li = ev.target.closest('.li');
        if (!li) return;
        const n = list[+li.dataset.i];
        if (n.sym && n.sym !== S.sym) selectSym(n.sym);
        closeLayer();
      });
    });
  });

  function renderPos() {
    const el = $('#tbPos');
    if (S.scope === 'all') {
      const hs = account.holdings(), inv = account.invested();
      const cost = hs.reduce((a, s) => a + account.cost(s), 0), pnl = inv - cost;
      el.innerHTML = `<span>${hs.length} positions · ${fmt.money(inv, 0)}</span>${pnlHtml(pnl, cost ? pnl / cost * 100 : 0)}`;
    } else {
      const p = account.pos(S.sym);
      if (!p) { el.innerHTML = `<span style="opacity:.7">No open ${S.sym} position</span>`; return; }
      const r = account.pnl(S.sym);
      el.innerHTML = `<span>${fmt.qty(p.qty)} ${unitOf(S.sym)} @ ${fmt.price(p.avg)}</span>${pnlHtml(r.pnl, r.pct)}`;
    }
  }
  $('#tbPos').addEventListener('click', () => WM.show('portfolio'));
  function renderScope() { $$('#tbScope button').forEach(b => b.classList.toggle('on', b.dataset.scope === S.scope)); }
  $('#tbScope').addEventListener('click', e => {
    const b = e.target.closest('[data-scope]');
    if (!b) return;
    S.scope = b.dataset.scope; persist(); renderScope(); renderPos();
  });

  $('#tbInfo').addEventListener('click', e => {
    const tk = market.get(S.sym), p = account.pos(S.sym);
    const ords = account.state.orders.filter(o => o.sym === S.sym);
    const fills = account.state.fills.filter(f => f.sym === S.sym).slice(0, 5);
    let html = `<h3>$${S.sym} position</h3>`;
    if (p) {
      const r = account.pnl(S.sym), d = account.dayPnl(S.sym);
      html += `<div class="kv">
        <span>Quantity</span><span>${fmt.qty(p.qty)} ${unitOf(S.sym)}</span>
        <span>Average cost</span><span>${fmt.price(p.avg)} ${tk.cur}</span>
        <span>Market value</span><span>${fmt.money(account.value(S.sym), 2)}</span>
        <span>Today</span><span class="${fmt.cls(d.pnl)}">${fmt.smoney(d.pnl, 2)} (${fmt.spct(d.pct)})</span>
        <span>All time</span><span class="${fmt.cls(r.pnl)}">${fmt.smoney(r.pnl, 2)} (${fmt.spct(r.pct)})</span>
        <span>Portfolio weight</span><span>${fmt.num(account.value(S.sym) / account.equity() * 100, 1)}%</span>
      </div>`;
    } else html += `<div class="muted">You don't hold ${S.sym}. Use the New Order window to open a position.</div>`;
    if (ords.length) html += `<h3 style="margin-top:14px">Working orders</h3><div class="list">${ords.map(o => `<div class="li"><span>${o.side.toUpperCase()} ${o.type} ${fmt.qty(o.qty)} @ ${fmt.price(o.price)}</span><button data-cancel="${o.id}" class="muted">Cancel</button></div>`).join('')}</div>`;
    if (fills.length) html += `<h3 style="margin-top:14px">Recent fills</h3><div class="list">${fills.map(f => `<div class="li"><span class="${f.side === 'buy' ? 'up' : 'down'}">${f.side.toUpperCase()} ${fmt.qty(f.qty)} @ ${fmt.price(f.px)}</span><span class="muted">${fmt.ago(f.ts)}</span></div>`).join('')}</div>`;
    html += `<div class="acts"><button data-act="pf">Open portfolio</button>${p ? '<button class="danger" data-act="close">Close position</button>' : ''}</div>`;
    popover(e.currentTarget, html, '', pop => {
      pop.addEventListener('click', ev => {
        const c = ev.target.closest('[data-cancel]');
        if (c) { account.cancelOrder(c.dataset.cancel); closeLayer(); DV.toast('Order cancelled'); }
        const a = ev.target.closest('[data-act]');
        if (a && a.dataset.act === 'pf') { closeLayer(); WM.show('portfolio'); }
        if (a && a.dataset.act === 'close') { closeLayer(); doClose('all', S.sym); }
      });
    });
  });

  $$('.tb-close button').forEach(b => b.addEventListener('click', () => {
    const mode = b.dataset.close, sym = S.scope === 'ticker' ? S.sym : null;
    const list = account.previewClose(mode, sym);
    const label = { losing: 'losing', winning: 'winning', all: '' }[mode];
    if (!list.length) {
      popover(b, `<h3>Nothing to close</h3><div class="muted">No ${label ? label + ' ' : 'open '}positions ${sym ? 'in $' + sym : 'in your account'}.</div>`);
      return;
    }
    const tot = list.reduce((a, x) => a + x.pnl, 0);
    popover(b, `
      <h3>Close ${list.length} ${label} position${list.length > 1 ? 's' : ''}?</h3>
      <div class="list">${list.map(x => `<div class="li"><span>$${x.sym} · ${fmt.qty(x.qty)}</span><span class="${fmt.cls(x.pnl)}">${fmt.smoney(x.pnl, 2)}</span></div>`).join('')}</div>
      <div class="li" style="margin-top:6px"><b>Realized P/L</b><b class="${fmt.cls(tot)}">${fmt.smoney(tot, 2)}</b></div>
      <div class="acts"><button data-x>Cancel</button><button class="${mode === 'winning' ? 'primary' : 'danger'}" data-go>Close at market</button></div>`, '', pop => {
      $('[data-x]', pop).onclick = closeLayer;
      $('[data-go]', pop).onclick = () => { closeLayer(); doClose(mode, sym); };
    });
  }));
  function doClose(mode, sym) {
    const r = account.closePositions(mode, sym);
    if (!r.count) return;
    DV.toast(`Closed ${r.count} position${r.count > 1 ? 's' : ''} · ${fmt.smoney(r.pnl, 2)}`, { kind: 'ok', action: { label: 'Undo', fn: () => { account.restore(r.snap); DV.toast('Positions restored'); } } });
  }

  /* ================================================================== *
   * Portfolio window
   * ================================================================== */
  const pfTfs = $('#pfTfs');
  pfTfs.innerHTML = TFS.map(t => `<button data-tf="${t}">${t}</button>`).join('');
  pfTfs.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    S.pfTf = b.dataset.tf;
    $$('button', pfTfs).forEach(x => x.classList.toggle('active', x === b));
    pfChart.setData(DV.portfolio.series(S.pfTf), { animate: true, reset: true, tf: S.pfTf });
  });
  $$('button', pfTfs).forEach(x => x.classList.toggle('active', x.dataset.tf === S.pfTf));
  const pfChart = new DV.Chart($('#pfChart'), {
    color: '#55b8ff', lineWidth: 1.8, glow: 12, yAxis: 'minmax', xAxis: 'ends', pad: { t: 14, r: 4, b: 24, l: 2 },
    font: '600 11px Inter, system-ui, sans-serif', scrub: true, hover: true, tooltip: true,
    yFormat: v => fmt.compact(v, 0), format: v => fmt.num(v, 0),
  });
  $('#pfTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    S.pfTab = b.dataset.tab;
    $$('#pfTabs button').forEach(x => x.classList.toggle('active', x === b));
    renderPfList();
    if (S.pfTab === 'alerts') setTimeout(() => { if (S.pfTab === 'alerts' && account.unread()) account.markRead(); }, 1500);
  });
  function renderPortfolio(full) {
    if (WM.wins.portfolio.hidden) return;
    const eq = account.equity(), at = account.allTime(), day = account.dayTotal();
    $('#pfEq').textContent = fmt.money(eq, 2);
    $('#pfAt').innerHTML = `<span class="${fmt.cls(at.pnl)}">${fmt.arrow(at.pnl)} ${fmt.money(Math.abs(at.pnl), 0)} (${fmt.pct(at.pct)})</span> All Time`;
    $('#pfSide').innerHTML = `Today <b class="${fmt.cls(day.pnl)}">${fmt.smoney(day.pnl, 0)} (${fmt.spct(day.pct)})</b><br>Cash <b>${fmt.money(account.state.cash, 2)}</b>`;
    pfChart.setData(DV.portfolio.series(S.pfTf), { tf: S.pfTf });
    $('#pfAlertBadge').textContent = account.unread() || '';
    if (full) renderPfList(); else updatePfLive();
  }
  function renderPfList() {
    const el = $('#pfList');
    if (S.pfTab === 'holdings') {
      const hs = account.holdings();
      const crypto = hs.filter(s => market.get(s).type === 'crypto'), stocks = hs.filter(s => market.get(s).type !== 'crypto');
      const row = s => `<div class="pf-row" data-sym="${s}">${DV.logo(s, 26)}
          <div class="nm"><b>$${s}</b><small>${fmt.qty(account.pos(s).qty)} ${unitOf(s)} · ${esc(market.get(s).short)}</small></div>
          <div class="val" data-live="val:${s}"></div><div class="val" data-live="pnl:${s}"></div></div>`;
      el.innerHTML = (crypto.length ? `<div class="pf-section">Crypto</div>${crypto.map(row).join('')}` : '') +
        (stocks.length ? `<div class="pf-section">Stocks</div>${stocks.map(row).join('')}` : '') +
        (account.state.options.length ? `<div class="pf-section">Options</div>${account.state.options.map(o => `<div class="pf-row" data-sym="${o.sym}">${DV.logo(o.sym, 26)}<div class="nm"><b>${esc(options.label(o))}</b><small>${o.qty} contract${o.qty > 1 ? 's' : ''} @ ${fmt.num(o.avg)}</small></div><div class="val" data-live="opt:${o.id}"></div><div></div></div>`).join('')}` : '') +
        (hs.length ? '' : '<div class="pf-empty">No open positions</div>');
      updatePfLive();
    } else if (S.pfTab === 'orders') {
      const os = account.state.orders;
      el.innerHTML = os.length ? os.map(o => `<div class="pf-row" data-sym="${o.sym}">${DV.logo(o.sym, 26)}
        <div class="nm"><b>${o.side.toUpperCase()} ${o.type.toUpperCase()} ${fmt.qty(o.qty)} $${o.sym}</b><small>@ ${fmt.price(o.price)} · placed ${fmt.ago(o.ts)}</small></div>
        <div class="val" data-live="dist:${o.id}"></div><button class="x" data-cancel="${o.id}" title="Cancel order">✕</button></div>`).join('')
        : '<div class="pf-empty">No working orders.<br>Right-click the chart to place a limit or stop order.</div>';
      updatePfLive();
    } else if (S.pfTab === 'activity') {
      const fs = account.state.fills;
      el.innerHTML = fs.length ? fs.slice(0, 80).map(f => `<div class="pf-row" data-sym="${f.sym}">${DV.logo(f.sym, 26)}
        <div class="nm"><b class="${f.side === 'buy' ? 'up' : 'down'}">${f.side.toUpperCase()} ${fmt.qty(f.qty)} ${f.note && f.note.includes(' ') ? esc(f.note) : '$' + f.sym}</b><small>@ ${fmt.price(f.px)}${f.note && !f.note.includes(' ') ? ' · ' + f.note : ''}</small></div>
        <div class="val"><small style="color:rgba(255,255,255,.5)">${fmt.ago(f.ts)}</small></div><div></div></div>`).join('')
        : '<div class="pf-empty">No trades yet this session.</div>';
    } else {
      const al = account.state.alerts;
      el.innerHTML = `<div class="pf-section"><span>${account.unread()} unread</span><button data-readall>Mark all read</button></div>` +
        al.map(a => `<div class="pf-row${a.read ? '' : ' unread'}" data-sym="${a.sym || ''}"><span style="font-size:18px;text-align:center">${{ macro: '🏛', move: '📈', news: '📰', fill: '✅' }[a.kind] || '🔔'}</span>
          <div class="nm"><b style="font-weight:600">${esc(a.title)}</b><small>${fmt.dmy(a.ts)} · ${fmt.ago(a.ts)}</small></div><div></div>
          <button class="x" data-dismiss="${a.id}" title="Dismiss">✕</button></div>`).join('');
    }
  }
  function updatePfLive() {
    $$('[data-live]', $('#pfList')).forEach(el => {
      const [k, id] = el.dataset.live.split(':');
      if (k === 'val') el.innerHTML = `${fmt.money(account.value(id), 2)}<small class="${fmt.cls(market.changePct(id))}">${fmt.arrow(market.changePct(id))} ${fmt.pct(market.changePct(id))} today</small>`;
      if (k === 'pnl') { const r = account.pnl(id); el.innerHTML = `<span class="${fmt.cls(r.pnl)}">${fmt.smoney(r.pnl, 0)}</span><small class="${fmt.cls(r.pnl)}">${fmt.spct(r.pct, 1)}</small>`; }
      if (k === 'opt') { const o = account.state.options.find(x => x.id === id); if (o) { const v = account.optionValue(o), c = o.avg * 100 * o.qty; el.innerHTML = `${fmt.money(v, 2)}<small class="${fmt.cls(v - c)}">${fmt.smoney(v - c, 2)}</small>`; } }
      if (k === 'dist') { const o = account.state.orders.find(x => x.id === id); if (o) { const d = (o.price / market.price(o.sym) - 1) * 100; el.innerHTML = `<small>${fmt.spct(d, 2)} away</small>`; } }
    });
  }
  $('#pfList').addEventListener('click', e => {
    const c = e.target.closest('[data-cancel]');
    if (c) { account.cancelOrder(c.dataset.cancel); DV.toast('Order cancelled'); return; }
    const d = e.target.closest('[data-dismiss]');
    if (d) { account.dismissAlert(d.dataset.dismiss); return; }
    if (e.target.closest('[data-readall]')) { account.markRead(); return; }
    const row = e.target.closest('.pf-row');
    if (row && row.dataset.sym) selectSym(row.dataset.sym);
  });

  /* ================================================================== *
   * Floating layer: menus, popovers, palette, modals
   * ================================================================== */
  const layer = $('#layer');
  function closeLayer() { layer.innerHTML = ''; }
  document.addEventListener('pointerdown', e => { if (layer.children.length && !layer.contains(e.target) && !e.target.closest('#brand')) closeLayer(); }, true);

  function menu(x, y, items) {
    closeLayer();
    const m = document.createElement('div');
    m.className = 'menu scrollbar-thin';
    items.forEach(it => {
      if (it.sep) { m.insertAdjacentHTML('beforeend', '<div class="sep"></div>'); return; }
      if (it.hd) { m.insertAdjacentHTML('beforeend', `<div class="hd">${esc(it.hd)}</div>`); return; }
      const b = document.createElement('button');
      if (it.danger) b.className = 'danger';
      b.disabled = !!it.disabled;
      b.innerHTML = `<span class="chk">${it.check ? '✓' : ''}</span><span>${esc(it.label)}</span>${it.kbd ? `<span class="kbd">${esc(it.kbd)}</span>` : ''}`;
      b.onclick = () => { closeLayer(); it.fn(); };
      m.appendChild(b);
    });
    layer.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.maxHeight = (innerHeight - 40) + 'px';
    m.style.overflowY = 'auto';
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    m.style.top = Math.max(TOP + 4, Math.min(y, innerHeight - Math.min(r.height, innerHeight - 40) - 8)) + 'px';
  }
  function popover(anchor, html, cls, init) {
    closeLayer();
    const p = document.createElement('div');
    p.className = 'pop ' + (cls || '');
    p.innerHTML = html;
    layer.appendChild(p);
    const a = anchor.getBoundingClientRect(), r = p.getBoundingClientRect();
    let top = a.top - r.height - 10;
    if (top < TOP + 6) top = a.bottom + 10;
    p.style.top = top + 'px';
    p.style.left = Math.max(8, Math.min(a.left + a.width / 2 - r.width / 2, innerWidth - r.width - 8)) + 'px';
    if (init) init(p);
    return p;
  }
  function modal(html) {
    closeLayer();
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal">${html}<div class="acts"><button>Done</button></div></div>`;
    w.addEventListener('click', e => { if (e.target === w || e.target.closest('.acts button')) closeLayer(); });
    layer.appendChild(w);
  }

  function mainMenu() {
    const items = [{ hd: 'Windows' }];
    ['info', 'chart', 'order', 'toolbar', 'dock', 'portfolio'].forEach(id => items.push({ label: winName(id), check: !WM.wins[id].hidden, fn: () => WM.toggle(id) }));
    items.push({ label: 'Reset window layout', fn: () => { WM.reset(); DV.toast('Layout reset'); } });
    items.push({ sep: true }, { hd: 'Background' });
    Object.keys(DV.SCENE_NAMES).forEach(k => items.push({ label: DV.SCENE_NAMES[k], check: S.bg === k, fn: () => { S.bg = k; persist(); applyBg(); } }));
    items.push({ label: 'Custom image… (or drop one here)', check: S.bg === 'custom', fn: pickBgFile });
    items.push({ sep: true }, { hd: 'Chart color' });
    Object.keys(COLORS).forEach(k => items.push({ label: COLORS[k][0], check: S.color === k, fn: () => { S.color = k; persist(); chart.setColor(COLORS[k][1]); } }));
    items.push({ sep: true }, { hd: 'Market simulation' });
    SPEEDS.forEach(([v, l]) => items.push({ label: l, check: market.speed === v, fn: () => DV.setSpeed(v) }));
    items.push({ sep: true });
    items.push({ label: 'Search tickers', kbd: 'Ctrl K', fn: () => palette() });
    items.push({ label: 'Open mobile companion', fn: openMobile });
    items.push({ label: 'Keyboard shortcuts', kbd: '?', fn: shortcuts });
    items.push({ label: 'Reset demo account', danger: true, fn: () => { if (confirm('Reset the demo account to its starting positions? Drawings and layout are kept.')) { account.reset(); DV.toast('Demo account reset'); } } });
    const b = $('#brand').getBoundingClientRect();
    menu(b.left, b.bottom + 4, items);
  }
  $('#brand').addEventListener('click', e => { e.stopPropagation(); if (layer.children.length) closeLayer(); else mainMenu(); });

  function openMobile() {
    const w = window.open('../mobile/index.html', 'dv-mobile', 'popup=yes,width=460,height=980');
    if (!w) DV.toast('Pop-up blocked — open mobile/index.html directly', { kind: 'err' });
  }
  function shortcuts() {
    modal(`<h3>Keyboard shortcuts</h3><table>
      <tr><td>Search / switch ticker</td><td><span class="kbd-key">Ctrl</span> <span class="kbd-key">K</span> or <span class="kbd-key">/</span></td></tr>
      <tr><td>Timeframes 1D … MAX</td><td><span class="kbd-key">1</span> – <span class="kbd-key">9</span></td></tr>
      <tr><td>Previous / next ticker in dock</td><td><span class="kbd-key">↑</span> <span class="kbd-key">↓</span></td></tr>
      <tr><td>Line / candlestick chart</td><td><span class="kbd-key">L</span> <span class="kbd-key">C</span></td></tr>
      <tr><td>Pen / text / measure tool</td><td><span class="kbd-key">P</span> <span class="kbd-key">T</span> <span class="kbd-key">M</span></td></tr>
      <tr><td>Delete selected drawing</td><td><span class="kbd-key">Del</span></td></tr>
      <tr><td>Cancel tool, close menus</td><td><span class="kbd-key">Esc</span></td></tr>
      <tr><td>Toggle portfolio window</td><td><span class="kbd-key">F</span></td></tr>
      <tr><td>Zoom / pan chart</td><td>scroll · drag · double-click resets</td></tr>
      <tr><td>Move window without snapping</td><td>hold <span class="kbd-key">Alt</span> while dragging</td></tr>
      <tr><td>Chart actions (limit orders, clear)</td><td>right-click the chart</td></tr>
    </table>`);
  }

  function palette() {
    closeLayer();
    const wrap = document.createElement('div');
    wrap.className = 'palette-wrap';
    wrap.innerHTML = `<div class="palette"><input placeholder="Search tickers, e.g. NVDA, rocket, crypto…" spellcheck="false"><div class="res scrollbar-thin"></div>
      <div class="ft"><span><span class="kbd-key">↑↓</span> navigate</span><span><span class="kbd-key">Enter</span> open</span><span><span class="kbd-key">Shift</span>+<span class="kbd-key">Enter</span> add to dock</span><span><span class="kbd-key">Esc</span> close</span></div></div>`;
    layer.appendChild(wrap);
    const inp = $('input', wrap), res = $('.res', wrap);
    let list = [], sel = 0;
    const draw = () => {
      list = market.search(inp.value).slice(0, 30);
      sel = Math.min(sel, Math.max(0, list.length - 1));
      res.innerHTML = list.map((t, i) => {
        const c = market.changePct(t.sym), inDock = account.state.dock.includes(t.sym);
        return `<div class="it${i === sel ? ' sel' : ''}" data-i="${i}">${DV.logo(t.sym, 28)}<div><b>$${t.sym}</b> <small>${esc(t.name)}</small><br><small>${esc(t.sector)}${account.pos(t.sym) ? ' · held' : ''}</small></div>
          <div class="px">${fmt.price(t.price)}<br><small class="${fmt.cls(c)}">${fmt.arrow(c)} ${fmt.pct(c)}</small></div>
          <button class="add" data-dock="${t.sym}">${inDock ? 'In dock' : '+ Dock'}</button></div>`;
      }).join('') || '<div class="pf-empty">No matches</div>';
    };
    const addDock = sym => {
      if (account.state.dock.includes(sym)) { account.state.dock = account.state.dock.filter(s => s !== sym); DV.toast(`$${sym} removed from dock`); }
      else { account.state.dock.push(sym); DV.toast(`$${sym} added to dock`, { kind: 'ok' }); }
      account.save(); draw();
    };
    inp.addEventListener('input', () => { sel = 0; draw(); });
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'ArrowDown') { sel = Math.min(list.length - 1, sel + 1); draw(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      if (e.key === 'Escape') closeLayer();
      if (e.key === 'Enter' && list[sel]) { if (e.shiftKey) addDock(list[sel].sym); else { closeLayer(); selectSym(list[sel].sym); } }
    });
    res.addEventListener('click', e => {
      const a = e.target.closest('[data-dock]');
      if (a) { addDock(a.dataset.dock); return; }
      const it = e.target.closest('.it');
      if (it) { closeLayer(); selectSym(list[+it.dataset.i].sym); }
    });
    wrap.addEventListener('pointerdown', e => { if (e.target === wrap) closeLayer(); });
    draw();
    inp.focus();
  }

  /* ================================================================== *
   * Keyboard
   * ================================================================== */
  document.addEventListener('keydown', e => {
    const typing = !!(e.target.matches && e.target.matches('input, select, textarea'));
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); return; }
    if (e.key === 'Escape') { closeLayer(); if (S.tool) setTool(S.tool); chart.selected = null; chart.draw(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === '/') { e.preventDefault(); palette(); }
    else if (/^[1-9]$/.test(k)) setTf(TFS[+k - 1]);
    else if (k === 'l') setMode('line');
    else if (k === 'c') setMode('candle');
    else if (k === 'p') setTool('pen');
    else if (k === 't') setTool('text');
    else if (k === 'm') setTool('measure');
    else if (k === 'f') WM.toggle('portfolio');
    else if (k === '?') shortcuts();
    else if (k === 'delete' || k === 'backspace') { if (chart.deleteSelected()) DV.toast('Drawing deleted'); }
    else if (k === 'arrowup' || k === 'arrowdown') {
      const d = account.state.dock;
      if (!d.length) return;
      const i = d.indexOf(S.sym), n = k === 'arrowup' ? (i <= 0 ? d.length - 1 : i - 1) : (i + 1) % d.length;
      e.preventDefault(); selectSym(d[n]);
    }
  });

  /* ================================================================== *
   * Selection + live updates
   * ================================================================== */
  function selectSym(sym) {
    if (!market.get(sym)) return;
    const changed = sym !== S.sym;
    S.sym = sym; persist();
    renderChartHead();
    if (changed) { chart.selected = null; updateChart(true, true); } else updateChart(false);
    renderInfo();
    renderOrder(changed);
    renderPos();
    rotateNews(true);
    $$('.dock-item', dockEl).forEach(el => el.classList.toggle('active', el.dataset.sym === sym));
    if (!account.state.dock.includes(sym)) hint(`$${sym} isn't in your dock — press + to add it`, 2600);
    sizeDock();
  }

  let tickN = 0;
  DV.on('tick', () => {
    tickN++;
    updateChart(false);
    document.title = `$${S.sym} ${fmt.price(market.price(S.sym))} · DeltaVision`;
    renderStats(false);
    renderOrder();
    renderPos();
    updateDockTips();
    if (tickN % 2 === 0) renderPortfolio(false);
    if (aiOpenFor && tickN % 10 === 0) $('#ratingDot').style.left = (DV.analysis(S.sym).score * 100) + '%';
  });
  DV.on('account', () => {
    renderDock();
    renderPos();
    renderOrder();
    chart.draw();
    renderPortfolio(true);
  });
  DV.on('alert', a => {
    if (a.kind === 'fill') return;
    DV.toast('🔔 ' + a.title, { action: { label: 'View', fn: () => { WM.show('portfolio'); $('[data-tab="alerts"]').click(); } } });
  });
  DV.on('fill', f => {
    if (justPlaced) return;
    DV.toast(`Order filled: ${f.side.toUpperCase()} ${fmt.qty(f.qty)} $${f.sym} @ ${fmt.price(f.px)}`, { kind: 'ok' });
  });

  /* ================================================================== *
   * Boot
   * ================================================================== */
  WM.init();
  renderDock();
  renderChartHead();
  setMode(S.mode);
  updateChart(false, true);
  renderInfo();
  renderOrder(true);
  renderScope();
  renderPos();
  rotateNews(true);
  renderPortfolio(true);
  WM.focus('chart');
  DV.start();
  if (!store.get('dv.web.seenTip', false)) {
    setTimeout(() => DV.toast('Tip: drag windows by their title bars · Ctrl+K to search · right-click the chart for orders', { ms: 7000 }), 1200);
    store.set('dv.web.seenTip', true);
  }
})();
