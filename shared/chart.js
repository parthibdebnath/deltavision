/* DeltaVision chart engine
 * DV.Chart  – glowing price chart: line/candles, scrubbing, zoom & pan,
 *             drawing tools (pen, text, measure) and draggable price lines.
 * DV.Curve  – small smoothed curve used for the volatility panels.
 */
(function () {
  'use strict';
  const DV = window.DV;
  const fmt = DV.fmt;

  const ease = t => 1 - Math.pow(1 - t, 3);

  function niceTicks(lo, hi, target) {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  function axisNum(v) {
    const a = Math.abs(v);
    if (a >= 1e5) return fmt.compact(v, 1);
    if (a >= 1000) return fmt.num(v, 0);
    if (a >= 100) return fmt.num(v, 0);
    if (a >= 10) return String(+v.toFixed(1));
    return String(+v.toFixed(2));
  }

  function distToSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  class Chart {
    constructor(canvas, opts) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = Object.assign({
        color: '#4dff88', lineWidth: 2, glow: 14,
        yAxis: 'minmax', xAxis: 'ends', pad: { t: 16, r: 8, b: 28, l: 8 },
        font: '600 12px Inter, system-ui, sans-serif', labelColor: 'rgba(255,255,255,.92)',
        scrub: true, hover: false, tooltip: false, endMarker: false, zoom: false, tools: false,
        up: '#3ee07a', down: '#ff4d5e', drawColor: '#ffd166', yPadTop: 0.1, yPadBottom: 0.08,
        format: v => fmt.price(v),
      }, opts || {});
      this.pts = [];
      this.tf = '1Y';
      this.mode = this.o.mode || 'line';
      this.view = null;
      this.hover = null;
      this.tool = null;
      this.selected = null;
      this.drag = null;
      this.anim = null;
      this._boxes = {};
      this.dpr = 1; this.w = 0; this.h = 0;
      this._raf = 0;
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(canvas);
      this._bind();
      this.resize();
      if (this.o.endMarker) this._pulse();
    }

    /* ---------- public API ---------- */
    setData(pts, opts = {}) {
      const old = this.pts, oldN = old.length;
      let from = null;
      if (opts.animate && oldN > 1 && this.mode === 'line' && this.w) from = { vals: this._sample(64), range: this._range() };
      this.pts = pts || [];
      if (opts.tf) this.tf = opts.tf;
      const n = this.pts.length;
      if (opts.reset || !this.view || !oldN) this.view = null;
      else if (this.view) {
        const full = this.view.a <= 0.001 && this.view.b >= oldN - 1.001;
        if (full) this.view = null;
        else if (this.view.b >= oldN - 1.001) { const dn = n - oldN; this.view = { a: this.view.a + dn, b: n - 1 }; }
      }
      if (from) {
        this.anim = { from, to: { vals: this._sample(64), range: this._range() }, t0: performance.now(), dur: 520 };
      }
      if (this.hover && this.hover.i >= n) this.hover = null;
      this.draw();
    }
    setMode(m) { this.mode = m; this.anim = null; this.draw(); }
    setTool(t) {
      this.tool = t;
      this.cv.style.cursor = t ? (t === 'text' ? 'text' : 'crosshair') : '';
      this.draw();
    }
    setColor(c) { this.o.color = c; this.draw(); }
    resetView() { this.view = null; this.draw(); }
    deleteSelected() {
      if (!this.selected || !this.o.getDrawings) return false;
      const arr = this.o.getDrawings().filter(d => d.id !== this.selected);
      this.selected = null;
      this.o.saveDrawings(arr);
      this.draw();
      return true;
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = r.width; this.h = r.height;
      this.cv.width = Math.round(r.width * this.dpr);
      this.cv.height = Math.round(r.height * this.dpr);
      this.draw();
    }
    destroy() { this._ro.disconnect(); cancelAnimationFrame(this._raf); this._dead = true; }

    /* ---------- geometry ---------- */
    _vw() { const n = this.pts.length; return this.view || { a: 0, b: Math.max(1, n - 1) }; }
    _plot() { const p = this.o.pad; return { l: p.l, t: p.t, r: this.w - p.r, b: this.h - p.b, w: this.w - p.l - p.r, h: this.h - p.t - p.b }; }
    _x(i) { const v = this._vw(), P = this._plot(); return P.l + (i - v.a) / (v.b - v.a || 1) * P.w; }
    _i(x) { const v = this._vw(), P = this._plot(); return v.a + (x - P.l) / P.w * (v.b - v.a); }
    _y(p, rg) { const P = this._plot(); rg = rg || this._rg; return P.b - (p - rg[0]) / (rg[1] - rg[0] || 1) * P.h; }
    _p(y) { const P = this._plot(), rg = this._rg; return rg[0] + (P.b - y) / P.h * (rg[1] - rg[0]); }
    _visIdx() {
      const v = this._vw(), n = this.pts.length;
      return [Math.max(0, Math.floor(v.a)), Math.min(n - 1, Math.ceil(v.b))];
    }
    _range() {
      const n = this.pts.length;
      if (!n) return [0, 1];
      const [a, b] = this._visIdx();
      let lo = Infinity, hi = -Infinity;
      for (let i = a; i <= b; i++) {
        const p = this.pts[i];
        const l = this.mode === 'candle' ? p.l : p.c, h = this.mode === 'candle' ? p.h : p.c;
        if (l < lo) lo = l; if (h > hi) hi = h;
      }
      const span = hi - lo || Math.abs(hi) * 0.02 || 1;
      return [lo - span * this.o.yPadBottom, hi + span * this.o.yPadTop];
    }
    _sample(N) {
      const out = new Float64Array(N), v = this._vw(), n = this.pts.length;
      for (let k = 0; k < N; k++) {
        const f = v.a + (v.b - v.a) * k / (N - 1), i = Math.max(0, Math.min(n - 1, Math.floor(f))), j = Math.min(n - 1, i + 1);
        out[k] = this.pts[i].c + (this.pts[j].c - this.pts[i].c) * (f - i);
      }
      return out;
    }
    _tToIdx(t) {
      const p = this.pts, n = p.length;
      if (n < 2) return 0;
      if (t <= p[0].t) return (t - p[0].t) / ((p[1].t - p[0].t) || 1);
      if (t >= p[n - 1].t) return n - 1 + (t - p[n - 1].t) / ((p[n - 1].t - p[n - 2].t) || 1);
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].t <= t) lo = m; else hi = m; }
      return lo + (t - p[lo].t) / ((p[hi].t - p[lo].t) || 1);
    }
    _idxToT(f) {
      const p = this.pts, n = p.length;
      if (n < 2) return Date.now();
      const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
      return p[i].t + (p[i + 1].t - p[i].t) * (f - i);
    }
    _toData(pt) { return { t: this._idxToT(this._i(pt.x)), p: this._p(pt.y) }; }
    _toPx(d) { return { x: this._x(this._tToIdx(d.t)), y: this._y(d.p) }; }
    _pos(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    /* ---------- interaction ---------- */
    _bind() {
      const cv = this.cv;
      cv.style.touchAction = this.o.touchAction || 'none';
      cv.addEventListener('pointerdown', e => this._down(e));
      cv.addEventListener('pointermove', e => this._move(e));
      cv.addEventListener('pointerup', e => this._up(e));
      cv.addEventListener('pointercancel', e => this._up(e));
      cv.addEventListener('pointerleave', () => {
        if (this.drag) return;
        if (this.hover) { this.hover = null; this.o.onScrub && this.o.onScrub(null); this.draw(); }
      });
      cv.addEventListener('wheel', e => {
        if (!this.o.zoom || this.pts.length < 3) return;
        e.preventDefault();
        const v = this._vw(), n = this.pts.length, p = this._pos(e);
        const at = this._i(p.x), k = Math.exp(e.deltaY * 0.0015);
        let a = at - (at - v.a) * k, b = at + (v.b - at) * k;
        if (b - a < 8) { const m = (a + b) / 2; a = m - 4; b = m + 4; }
        if (b - a >= n - 1) { this.view = null; } else {
          if (a < 0) { b -= a; a = 0; }
          if (b > n - 1) { a -= b - (n - 1); b = n - 1; }
          this.view = { a: Math.max(0, a), b };
        }
        this.anim = null;
        this._setHover(p);
        this.draw();
        this.o.onView && this.o.onView(this.view);
      }, { passive: false });
      cv.addEventListener('dblclick', () => { if (this.o.zoom) { this.view = null; this.draw(); this.o.onView && this.o.onView(null); } });
      cv.addEventListener('contextmenu', e => {
        if (!this.o.onContext) return;
        e.preventDefault();
        const p = this._pos(e), hit = this._hitDrawing(p), pl = this._hitPriceLine(p);
        if (hit) { this.selected = hit.id; this.draw(); }
        this.o.onContext({ clientX: e.clientX, clientY: e.clientY, price: this._p(p.y), time: this._idxToT(this._i(p.x)), drawing: hit, line: pl });
      });
    }
    _setHover(p) {
      const n = this.pts.length;
      if (!n) return;
      const P = this._plot();
      if (p.x < P.l - 4 || p.x > P.r + 4) { this.hover = null; return; }
      const i = Math.max(0, Math.min(n - 1, Math.round(this._i(p.x))));
      const [a, b] = this._visIdx();
      const ii = Math.max(a, Math.min(b, i));
      this.hover = { i: ii, x: p.x, y: p.y };
      if (this.o.onScrub) this.o.onScrub({ pt: this.pts[ii], i: ii, first: this.pts[a] });
    }
    _down(e) {
      if (e.button === 2) return;
      const p = this._pos(e);
      try { this.cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (this.o.tools && this.tool) {
        if (this.tool === 'text') { this._placeText(p); return; }
        const d = this._toData(p);
        if (this.tool === 'pen') this.drag = { kind: 'pen', d: { id: DV.util.uid(), type: 'pen', pts: [[d.t, d.p]], color: this.o.drawColor } };
        if (this.tool === 'measure') this.drag = { kind: 'measure', d: { id: DV.util.uid(), type: 'measure', a: [d.t, d.p], b: [d.t, d.p] } };
        this.draw();
        return;
      }
      const pl = this._hitPriceLine(p);
      if (pl && pl.draggable) { this.drag = { kind: 'pline', line: pl, price: pl.price }; return; }
      if (this.o.tools) {
        const hit = this._hitDrawing(p);
        const prev = this.selected;
        this.selected = hit ? hit.id : null;
        if (hit) { this.drag = { kind: 'move', d: hit, start: this._toData(p), orig: JSON.parse(JSON.stringify(hit)) }; this.draw(); return; }
        if (prev) this.draw();
      }
      if (this.o.zoom && this.view) this.drag = { kind: 'pan', x0: p.x, view0: Object.assign({}, this.view) };
      if (this.o.scrub) { this.scrubbing = true; this._setHover(p); this.draw(); }
    }
    _move(e) {
      const p = this._pos(e), dr = this.drag;
      if (dr) {
        if (dr.kind === 'pen') {
          const d = this._toData(p), last = dr.d.pts[dr.d.pts.length - 1];
          const lp = this._toPx({ t: last[0], p: last[1] });
          if (Math.hypot(lp.x - p.x, lp.y - p.y) > 2) dr.d.pts.push([d.t, d.p]);
        } else if (dr.kind === 'measure') {
          const d = this._toData(p); dr.d.b = [d.t, d.p];
        } else if (dr.kind === 'pline') {
          dr.price = this._p(p.y);
        } else if (dr.kind === 'move') {
          const d = this._toData(p), dt = d.t - dr.start.t, dp = d.p - dr.start.p, o = dr.orig, m = dr.d;
          if (o.type === 'pen') m.pts = o.pts.map(q => [q[0] + dt, q[1] + dp]);
          else if (o.type === 'text') { m.t = o.t + dt; m.p = o.p + dp; }
          else if (o.type === 'measure') { m.a = [o.a[0] + dt, o.a[1] + dp]; m.b = [o.b[0] + dt, o.b[1] + dp]; }
          dr.moved = true;
        } else if (dr.kind === 'pan') {
          const v = dr.view0, n = this.pts.length, P = this._plot();
          const di = -(p.x - dr.x0) / P.w * (v.b - v.a);
          let a = v.a + di, b = v.b + di;
          if (a < 0) { b -= a; a = 0; }
          if (b > n - 1) { a -= b - (n - 1); b = n - 1; }
          this.view = { a, b };
          this.cv.style.cursor = 'grabbing';
        }
        if (this.o.hover || this.scrubbing) this._setHover(p);
        this.draw();
        return;
      }
      if (this.o.hover || this.scrubbing) { this._setHover(p); this.draw(); }
      if (!this.tool) {
        const pl = this._hitPriceLine(p);
        this.cv.style.cursor = pl && pl.draggable ? 'ns-resize' : (this.o.tools && this._hitDrawing(p) ? 'move' : (this.o.zoom && this.view ? 'grab' : ''));
      }
    }
    _up(e) {
      const dr = this.drag;
      this.drag = null;
      if (dr) {
        if (dr.kind === 'pen' && dr.d.pts.length > 1) this._addDrawing(dr.d);
        else if (dr.kind === 'measure') {
          const a = this._toPx({ t: dr.d.a[0], p: dr.d.a[1] }), b = this._toPx({ t: dr.d.b[0], p: dr.d.b[1] });
          if (Math.hypot(a.x - b.x, a.y - b.y) > 6) { this._addDrawing(dr.d); this.selected = dr.d.id; }
        } else if (dr.kind === 'pline') {
          if (Math.abs(dr.price - dr.line.price) > 1e-9 && this.o.onPriceLineMove) this.o.onPriceLineMove(dr.line, dr.price);
        } else if (dr.kind === 'move' && dr.moved) {
          this.o.saveDrawings(this.o.getDrawings());
        } else if (dr.kind === 'pan') this.cv.style.cursor = '';
      }
      if (this.scrubbing) {
        this.scrubbing = false;
        if (!this.o.hover || e.pointerType === 'touch') { this.hover = null; this.o.onScrub && this.o.onScrub(null); }
      }
      this.draw();
    }
    _addDrawing(d) {
      if (!this.o.getDrawings) return;
      const arr = this.o.getDrawings().slice();
      arr.push(d);
      this.o.saveDrawings(arr);
    }
    _placeText(p) {
      const host = this.cv.parentElement;
      const inp = document.createElement('input');
      inp.className = 'dv-chart-input';
      inp.placeholder = 'Type a note…';
      const cr = this.cv.getBoundingClientRect(), hr = host.getBoundingClientRect();
      inp.style.left = (cr.left - hr.left + p.x) + 'px';
      inp.style.top = (cr.top - hr.top + p.y - 14) + 'px';
      host.appendChild(inp);
      const d = this._toData(p);
      let done = false;
      const commit = ok => {
        if (done) return; done = true;
        const txt = inp.value.trim();
        inp.remove();
        if (ok && txt) this._addDrawing({ id: DV.util.uid(), type: 'text', t: d.t, p: d.p, text: txt, color: '#ffffff' });
        this.draw();
        this.o.onToolDone && this.o.onToolDone('text');
      };
      inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') commit(true); if (ev.key === 'Escape') commit(false); });
      inp.addEventListener('blur', () => commit(true));
      setTimeout(() => inp.focus(), 0);
    }
    _hitPriceLine(p) {
      if (!this.o.priceLines || !this._rg) return null;
      const P = this._plot();
      if (p.x < P.l || p.x > this.w) return null;
      const lines = this.o.priceLines() || [];
      for (const l of lines) if (Math.abs(this._y(l.price) - p.y) < 6) return l;
      return null;
    }
    _hitDrawing(p) {
      if (!this.o.getDrawings || !this._rg) return null;
      const arr = this.o.getDrawings();
      for (let k = arr.length - 1; k >= 0; k--) {
        const d = arr[k];
        if (d.type === 'pen') {
          const px = d.pts.map(q => this._toPx({ t: q[0], p: q[1] }));
          for (let i = 1; i < px.length; i++) if (distToSeg(p, px[i - 1], px[i]) < 6) return d;
        } else if (d.type === 'text') {
          const b = this._boxes[d.id];
          if (b && p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && p.y >= b.y - 4 && p.y <= b.y + b.h + 4) return d;
        } else if (d.type === 'measure') {
          const a = this._toPx({ t: d.a[0], p: d.a[1] }), b = this._toPx({ t: d.b[0], p: d.b[1] });
          if (p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)) return d;
        }
      }
      return null;
    }

    /* ---------- rendering ---------- */
    _pulse() {
      let last = 0;
      const loop = ts => {
        if (this._dead) return;
        this._raf = requestAnimationFrame(loop);
        if (ts - last > 50) { last = ts; this.draw(); }
      };
      this._raf = requestAnimationFrame(loop);
    }
    draw() {
      if (this._drawQueued) return;
      this._drawQueued = true;
      requestAnimationFrame(() => { this._drawQueued = false; this._render(); });
    }
    _render() {
      const ctx = this.ctx, o = this.o, dpr = this.dpr;
      if (!this.w) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      const n = this.pts.length;
      if (n < 2) return;
      const P = this._plot();
      let rg = this._range();
      let animT = 1;
      if (this.anim) {
        animT = Math.min(1, (performance.now() - this.anim.t0) / this.anim.dur);
        if (animT >= 1) this.anim = null;
        else {
          const e = ease(animT), A = this.anim;
          rg = [A.from.range[0] + (A.to.range[0] - A.from.range[0]) * e, A.from.range[1] + (A.to.range[1] - A.from.range[1]) * e];
        }
      }
      this._rg = rg;
      ctx.font = o.font;

      // axis labels
      this._yLabels(ctx, P, rg);
      this._xLabels(ctx, P);

      ctx.save();
      ctx.beginPath();
      ctx.rect(P.l - 2, 0, P.w + 4 + o.pad.r, this.h);
      ctx.clip();

      if (this.anim) this._drawMorph(ctx, P, rg, ease(animT));
      else if (this.mode === 'candle') this._drawCandles(ctx, P);
      else this._drawLine(ctx, P);

      this._drawPriceLines(ctx, P);
      if (o.tools) this._drawDrawings(ctx, P);
      ctx.restore();

      if (!this.anim && this.hover) this._drawHover(ctx, P);
      if (!this.anim && o.endMarker) this._drawEnd(ctx, P);
      if (this.anim) requestAnimationFrame(() => this._render());
    }
    _yLabels(ctx, P, rg) {
      const o = this.o;
      ctx.fillStyle = o.labelColor;
      ctx.textBaseline = 'middle';
      if (o.yAxis === 'minmax') {
        const [a, b] = this._visIdx();
        let lo = Infinity, hi = -Infinity;
        for (let i = a; i <= b; i++) { const v = this.pts[i].c; if (v < lo) lo = v; if (v > hi) hi = v; }
        ctx.textAlign = 'right';
        const fmtv = o.yFormat || axisNum;
        ctx.fillText(fmtv(hi), this.w - 2, Math.max(10, this._y(hi, rg) + 6));
        ctx.fillText(fmtv(lo), this.w - 2, Math.min(P.b - 4, this._y(lo, rg) + 2));
      } else if (o.yAxis === 'nice') {
        const ticks = niceTicks(rg[0], rg[1], 3);
        ctx.textAlign = 'left';
        ticks.forEach(v => {
          const y = this._y(v, rg);
          if (y < P.t - 2 || y > P.b + 2) return;
          if (o.grid) { ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.r, y); ctx.stroke(); }
          ctx.fillText((o.yFormat || axisNum)(v), P.r + 8, y);
        });
      }
    }
    _xLabels(ctx, P) {
      const o = this.o, [a, b] = this._visIdx();
      ctx.fillStyle = o.labelColor;
      ctx.textBaseline = 'alphabetic';
      const yy = this.h - Math.max(4, o.pad.b - 18);
      if (o.xAxis === 'ends') {
        ctx.textAlign = 'left';
        ctx.fillText(fmt.axis(this.pts[a].t, this.tf), P.l, yy);
        ctx.textAlign = 'right';
        ctx.fillText(fmt.axis(this.pts[b].t, this.tf), P.r - 10, yy);
      } else if (o.xAxis === 'spread') {
        ctx.textAlign = 'center';
        const k = o.xCount || 5;
        for (let j = 0; j < k; j++) {
          const f = j / (k - 1), idx = Math.round(a + (b - a) * f);
          let x = this._x(idx);
          x = Math.max(P.l + 16, Math.min(P.r - 16, x));
          ctx.fillText(fmt.axis(this.pts[idx].t, this.tf), x, yy);
        }
      }
    }
    _glowStroke(ctx, path, color, lw, glow) {
      const dpr = this.dpr;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.globalAlpha = 0.45; ctx.lineWidth = lw * 2.2; ctx.shadowBlur = glow * dpr;
      ctx.stroke(path);
      ctx.globalAlpha = 1; ctx.lineWidth = lw; ctx.shadowBlur = glow * 0.45 * dpr;
      ctx.stroke(path);
      ctx.shadowBlur = 0; ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(0.6, lw * 0.4); ctx.strokeStyle = '#ffffff';
      ctx.stroke(path);
      ctx.restore();
    }
    _drawLine(ctx, P) {
      const [a, b] = this._visIdx(), path = new Path2D();
      for (let i = a; i <= b; i++) {
        const x = this._x(i), y = this._y(this.pts[i].c);
        if (i === a) path.moveTo(x, y); else path.lineTo(x, y);
      }
      if (this.o.fill) {
        const f = new Path2D(path);
        f.lineTo(this._x(b), P.b); f.lineTo(this._x(a), P.b); f.closePath();
        const g = ctx.createLinearGradient(0, P.t, 0, P.b);
        g.addColorStop(0, hexA(this.o.color, 0.22)); g.addColorStop(1, hexA(this.o.color, 0));
        ctx.fillStyle = g; ctx.fill(f);
      }
      this._glowStroke(ctx, path, this.o.color, this.o.lineWidth, this.o.glow);
    }
    _drawMorph(ctx, P, rg, e) {
      const A = this.anim, N = A.to.vals.length, path = new Path2D();
      for (let k = 0; k < N; k++) {
        const v = A.from.vals[k] + (A.to.vals[k] - A.from.vals[k]) * e;
        const x = P.l + P.w * k / (N - 1), y = this._y(v, rg);
        if (!k) path.moveTo(x, y); else path.lineTo(x, y);
      }
      this._glowStroke(ctx, path, this.o.color, this.o.lineWidth, this.o.glow);
    }
    _drawCandles(ctx, P) {
      const [a, b] = this._visIdx(), v = this._vw();
      const bw = Math.max(1, P.w / (v.b - v.a + 1) * 0.62);
      ctx.save();
      for (let i = a; i <= b; i++) {
        const p = this.pts[i], up = p.c >= p.o, col = up ? this.o.up : this.o.down;
        const x = this._x(i), yo = this._y(p.o), yc = this._y(p.c), yh = this._y(p.h), yl = this._y(p.l);
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 6 * this.dpr;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, yh); ctx.lineTo(x, yl); ctx.stroke();
        const top = Math.min(yo, yc), hgt = Math.max(1, Math.abs(yc - yo));
        if (up && bw > 3) { ctx.fillStyle = 'rgba(10,10,10,.65)'; ctx.fillRect(x - bw / 2, top, bw, hgt); ctx.strokeRect(x - bw / 2 + 0.5, top + 0.5, bw - 1, hgt - 1); }
        else ctx.fillRect(x - bw / 2, top, bw, hgt);
      }
      ctx.restore();
    }
    _drawPriceLines(ctx, P) {
      if (!this.o.priceLines) return;
      const lines = this.o.priceLines() || [];
      ctx.save();
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      lines.forEach(l => {
        const price = this.drag && this.drag.kind === 'pline' && this.drag.line.id === l.id ? this.drag.price : l.price;
        const y = this._y(price);
        if (y < P.t - 1 || y > P.b + 1) return;
        ctx.strokeStyle = l.color; ctx.globalAlpha = 0.85; ctx.lineWidth = 1;
        ctx.setLineDash(l.dash === false ? [] : [6, 5]);
        ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.r, y); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        const txt = (l.label || '') + ' ' + this.o.format(price);
        const w = ctx.measureText(txt).width + 14, x = P.r - w - 40;
        ctx.fillStyle = l.color;
        roundRect(ctx, x, y - 9, w, 18, 4); ctx.fill();
        ctx.fillStyle = l.textColor || '#0b0b0b'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, x + 7, y + 0.5);
        if (l.draggable) { ctx.fillStyle = l.color; ctx.fillRect(x - 10, y - 4, 6, 1.5); ctx.fillRect(x - 10, y, 6, 1.5); ctx.fillRect(x - 10, y + 4, 6, 1.5); }
      });
      ctx.restore();
    }
    _drawDrawings(ctx, P) {
      const arr = (this.o.getDrawings && this.o.getDrawings()) || [];
      const all = this.drag && (this.drag.kind === 'pen' || this.drag.kind === 'measure') ? arr.concat([this.drag.d]) : arr;
      all.forEach(d => {
        const sel = d.id === this.selected;
        if (d.type === 'pen') {
          const path = new Path2D();
          d.pts.forEach((q, i) => { const p = this._toPx({ t: q[0], p: q[1] }); if (!i) path.moveTo(p.x, p.y); else path.lineTo(p.x, p.y); });
          ctx.save();
          ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.strokeStyle = d.color || this.o.drawColor; ctx.lineWidth = sel ? 3 : 2;
          ctx.shadowColor = d.color || this.o.drawColor; ctx.shadowBlur = (sel ? 10 : 5) * this.dpr;
          ctx.stroke(path);
          ctx.restore();
        } else if (d.type === 'text') {
          const p = this._toPx(d);
          ctx.save();
          ctx.font = '600 14px Inter, system-ui, sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          const w = ctx.measureText(d.text).width;
          ctx.fillStyle = 'rgba(0,0,0,.45)';
          roundRect(ctx, p.x - 6, p.y - 12, w + 12, 24, 5); ctx.fill();
          if (sel) { ctx.strokeStyle = '#fff'; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); }
          ctx.fillStyle = d.color || '#fff';
          ctx.fillText(d.text, p.x, p.y + 0.5);
          ctx.restore();
          this._boxes[d.id] = { x: p.x - 6, y: p.y - 12, w: w + 12, h: 24 };
        } else if (d.type === 'measure') {
          const a = this._toPx({ t: d.a[0], p: d.a[1] }), b = this._toPx({ t: d.b[0], p: d.b[1] });
          const dp = d.b[1] - d.a[1], pct = dp / d.a[1] * 100, up = dp >= 0;
          const col = up ? this.o.up : this.o.down;
          ctx.save();
          ctx.fillStyle = hexA(col, 0.14); ctx.strokeStyle = hexA(col, sel ? 0.95 : 0.6); ctx.lineWidth = 1;
          ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
          ctx.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.setLineDash([]);
          const bars = Math.round(Math.abs(this._tToIdx(d.b[0]) - this._tToIdx(d.a[0])));
          const days = Math.abs(d.b[0] - d.a[0]) / 864e5;
          const span = days >= 1 ? Math.round(days) + 'd' : Math.round(days * 24 * 60) + 'm';
          const l1 = `${dp >= 0 ? '+' : ''}${this.o.format(dp)} (${fmt.spct(pct)})`, l2 = `${bars} bars · ${span}`;
          ctx.font = '600 12px Inter, system-ui, sans-serif';
          const w = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 16;
          const cx = (a.x + b.x) / 2, cy = up ? Math.min(a.y, b.y) - 26 : Math.max(a.y, b.y) + 26;
          ctx.fillStyle = col;
          roundRect(ctx, cx - w / 2, cy - 19, w, 38, 6); ctx.fill();
          ctx.fillStyle = '#081008'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(l1, cx, cy - 7); ctx.font = '500 11px Inter, system-ui, sans-serif'; ctx.fillText(l2, cx, cy + 8);
          ctx.restore();
        }
      });
    }
    _drawHover(ctx, P) {
      const h = this.hover, p = this.pts[h.i];
      if (!p) return;
      const x = this._x(h.i), y = this._y(p.c), o = this.o;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(x, P.t - 6); ctx.lineTo(x, P.b); ctx.stroke();
      if (o.crossY && h.y >= P.t && h.y <= P.b) {
        ctx.beginPath(); ctx.moveTo(P.l, h.y); ctx.lineTo(P.r, h.y); ctx.stroke();
        ctx.setLineDash([]);
        const txt = this.o.format(this._p(h.y));
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        const w = ctx.measureText(txt).width + 12;
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        roundRect(ctx, P.r + 2, h.y - 9, w, 18, 4); ctx.fill();
        ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, P.r + 8, h.y + 0.5);
      }
      ctx.setLineDash([]);
      if (this.mode === 'line') {
        ctx.fillStyle = o.color; ctx.shadowColor = o.color; ctx.shadowBlur = 12 * this.dpr;
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (o.tooltip) {
        const first = this.pts[this._visIdx()[0]];
        const ch = p.c - first.c, pct = ch / first.c * 100;
        const lines = this.mode === 'candle'
          ? [fmt.tip(p.t, this.tf), `O ${o.format(p.o)}  H ${o.format(p.h)}`, `L ${o.format(p.l)}  C ${o.format(p.c)}`]
          : [fmt.tip(p.t, this.tf), '$' + o.format(p.c), `${fmt.arrow(ch)} ${o.format(Math.abs(ch))} (${fmt.pct(pct)})`];
        ctx.font = '600 12px Inter, system-ui, sans-serif';
        const w = Math.max(...lines.map(s => ctx.measureText(s).width)) + 20, hh = 62;
        let bx = x + 14, by = Math.max(P.t, Math.min(P.b - hh, (this.mode === 'line' ? y : h.y) - hh - 10));
        if (bx + w > P.r) bx = x - w - 14;
        ctx.fillStyle = 'rgba(12,12,14,.86)'; ctx.strokeStyle = 'rgba(255,255,255,.14)';
        roundRect(ctx, bx, by, w, hh, 8); ctx.fill(); ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '500 11px Inter, system-ui, sans-serif';
        ctx.fillText(lines[0], bx + 10, by + 8);
        ctx.font = '700 14px Inter, system-ui, sans-serif'; ctx.fillStyle = '#fff';
        ctx.fillText(lines[1], bx + 10, by + 23);
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = this.mode === 'candle' ? '#fff' : (ch >= 0 ? o.up : o.down);
        ctx.fillText(lines[2], bx + 10, by + 43);
      }
      ctx.restore();
    }
    _drawEnd(ctx, P) {
      const n = this.pts.length, [, b] = this._visIdx();
      if (b !== n - 1) return;
      const p = this.pts[n - 1], x = this._x(n - 1), y = this._y(p.c);
      const t = (performance.now() % 1600) / 1600;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - t)) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 5 + t * 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#7d6bff'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ------------------------------------------------------------------ *
   * Small smoothed curve (volatility term structure / smile)
   * ------------------------------------------------------------------ */
  const TICK_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100];
  function fiveTicks(min, max) {
    for (const s of TICK_STEPS) {
      const lo = Math.floor(min / s) * s;
      if (lo + 4 * s >= max) return [0, 1, 2, 3, 4].map(k => lo + k * s);
    }
    const s = Math.ceil((max - min) / 4);
    return [0, 1, 2, 3, 4].map(k => Math.floor(min) + k * s);
  }

  class Curve {
    constructor(canvas, opts) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = Object.assign({ color: '#57e897', pad: { t: 12, r: 78, b: 34, l: 14 }, suffix: '%', font: '600 13px Inter, system-ui, sans-serif' }, opts);
      this.pts = []; this.labels = []; this.hover = null;
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(canvas);
      canvas.style.touchAction = 'pan-y';
      const mv = e => { const r = canvas.getBoundingClientRect(); this.hover = e.clientX - r.left; this.draw(); };
      canvas.addEventListener('pointermove', mv);
      canvas.addEventListener('pointerdown', mv);
      canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
      this.resize();
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      if (!r.width) return;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = r.width; this.h = r.height;
      this.cv.width = Math.round(r.width * this.dpr); this.cv.height = Math.round(r.height * this.dpr);
      this.draw();
    }
    // pts: [{x, y, tip}], labels: [{x, text}], xDomain: [min, max]
    setData(pts, labels, xDomain) {
      const anim = this.pts.length === pts.length && this.w;
      this.prev = anim ? this.pts.map(p => p.y) : null;
      this.pts = pts; this.labels = labels; this.dom = xDomain;
      this.t0 = performance.now();
      this.draw();
    }
    draw() {
      if (this._q) return;
      this._q = true;
      requestAnimationFrame(() => { this._q = false; this._render(); });
    }
    _render() {
      const ctx = this.ctx, o = this.o;
      if (!this.w || this.pts.length < 2) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      const P = { l: o.pad.l, t: o.pad.t, r: this.w - o.pad.r, b: this.h - o.pad.b };
      const at = this.prev ? Math.min(1, (performance.now() - this.t0) / 400) : 1;
      const ys = this.pts.map((p, i) => this.prev ? this.prev[i] + (p.y - this.prev[i]) * ease(at) : p.y);
      const ticks = fiveTicks(Math.min(...ys), Math.max(...ys));
      const y0 = ticks[0], y1 = ticks[4];
      const [d0, d1] = this.dom;
      const X = x => P.l + (x - d0) / (d1 - d0) * (P.r - P.l);
      const Y = v => P.b - (v - y0) / (y1 - y0) * (P.b - P.t);
      ctx.font = o.font;
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ticks.slice().reverse().forEach(v => ctx.fillText(v + o.suffix, this.w - o.pad.r + 34, Y(v)));
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      this.labels.forEach(l => ctx.fillText(l.text, X(l.x), this.h - 8));
      // smooth path (Catmull-Rom -> Bezier)
      const pp = this.pts.map((p, i) => ({ x: X(p.x), y: Y(ys[i]) }));
      const path = new Path2D();
      path.moveTo(pp[0].x, pp[0].y);
      for (let i = 0; i < pp.length - 1; i++) {
        const p0 = pp[i - 1] || pp[i], p1 = pp[i], p2 = pp[i + 1], p3 = pp[i + 2] || p2;
        path.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
      }
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = o.color; ctx.shadowColor = o.color;
      ctx.globalAlpha = 0.35; ctx.lineWidth = 4; ctx.shadowBlur = 10 * this.dpr; ctx.stroke(path);
      ctx.globalAlpha = 0.9; ctx.lineWidth = 1.8; ctx.shadowBlur = 4 * this.dpr; ctx.stroke(path);
      ctx.restore();
      if (this.hover != null && this.hover >= P.l - 10 && this.hover <= P.r + 10) {
        let best = 0;
        pp.forEach((p, i) => { if (Math.abs(p.x - this.hover) < Math.abs(pp[best].x - this.hover)) best = i; });
        const p = pp[best], src = this.pts[best];
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(p.x, P.t - 6); ctx.lineTo(p.x, P.b + 4); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        const txt = src.tip || (fmt.num(ys[best], 1) + o.suffix);
        ctx.font = '600 12px Inter, system-ui, sans-serif';
        const w = ctx.measureText(txt).width + 14;
        let bx = p.x - w / 2; bx = Math.max(2, Math.min(this.w - w - 2, bx));
        const by = p.y - 34 < 0 ? p.y + 12 : p.y - 32;
        ctx.fillStyle = 'rgba(10,12,12,.88)'; roundRect(ctx, bx, by, w, 22, 6); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + w / 2, by + 11.5);
        ctx.restore();
      }
      if (at < 1) requestAnimationFrame(() => this._render());
    }
  }

  DV.Chart = Chart;
  DV.Curve = Curve;
  DV.roundRect = roundRect;
})();
