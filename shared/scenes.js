/* DeltaVision scenes: procedurally painted, lightly animated backgrounds.
 *   aurora – starry night with drifting aurora curtains
 *   frost  – snowy forest standing in a blue pond, falling snow
 *   canyon – desert canyon with river, drifting clouds, mouse parallax
 * Any scene can be replaced with a custom image (scene.setImage(url)).
 */
(function () {
  'use strict';
  const DV = window.DV;
  const { mulberry32 } = DV.util;

  function vnoise(seed) {
    const r = mulberry32(seed), v = Array.from({ length: 1024 }, () => r());
    return x => {
      const i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f);
      const a = v[((i % 1024) + 1024) % 1024], b = v[(((i + 1) % 1024) + 1024) % 1024];
      return a + (b - a) * t;
    };
  }
  function fbm(n, x, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * n(x * f); a *= 0.5; f *= 2.03; } return s / (1 - Math.pow(0.5, oct)); }
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function off(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function vgrad(ctx, y0, y1, stops) { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
  function grain(ctx, w, h, amt, seed) {
    const r = mulberry32(seed), img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
  }

  /* ---------------- AURORA ---------------- */
  const aurora = {
    build(w, h) {
      const S = off(w, h), c = S.getContext('2d'), r = mulberry32(7);
      c.fillStyle = vgrad(c, 0, h, [[0, '#020309'], [0.4, '#050915'], [0.7, '#081619'], [1, '#0b271f']]);
      c.fillRect(0, 0, w, h);
      // faint purple wash high in the sky
      let g = c.createRadialGradient(w * 0.7, h * 0.35, 0, w * 0.7, h * 0.35, w * 0.9);
      g.addColorStop(0, 'rgba(90,40,140,.16)'); g.addColorStop(1, 'rgba(90,40,140,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const n = Math.round(w * h / 700);
      for (let i = 0; i < n; i++) {
        const x = r() * w, y = Math.pow(r(), 1.3) * h, s = r();
        c.globalAlpha = 0.25 + r() * 0.75 * (1 - y / h * 0.6);
        c.fillStyle = s < 0.1 ? '#cfe0ff' : s < 0.15 ? '#ffe9c4' : '#fff';
        c.fillRect(x, y, s < 0.04 ? 1.6 : s < 0.3 ? 1.1 : 0.7, s < 0.04 ? 1.6 : s < 0.3 ? 1.1 : 0.7);
      }
      for (let i = 0; i < 14; i++) {
        const x = r() * w, y = r() * h * 0.7;
        g = c.createRadialGradient(x, y, 0, x, y, 6);
        g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.2, 'rgba(200,220,255,.35)'); g.addColorStop(1, 'rgba(200,220,255,0)');
        c.globalAlpha = 0.7; c.fillStyle = g; c.fillRect(x - 6, y - 6, 12, 12);
      }
      c.globalAlpha = 1;
      // ray texture: one vertical gradient strip reused for every curtain ray
      const R = off(1, 256), rc = R.getContext('2d');
      rc.fillStyle = vgrad(rc, 0, 256, [[0, 'rgba(150,70,255,0)'], [0.3, 'rgba(130,80,255,.18)'], [0.62, 'rgba(70,255,160,.42)'], [0.93, 'rgba(180,255,215,.9)'], [1, 'rgba(70,255,160,0)']]);
      rc.fillRect(0, 0, 1, 256);
      const twinkle = Array.from({ length: 60 }, () => ({ x: r() * w, y: r() * h * 0.8, p: r() * 6.28, s: 0.6 + r() * 1.6 }));
      return { S, R, A: off(w / 2, h / 2), twinkle, w, h };
    },
    frame(ctx, st, t) {
      const { w, h, A } = st, a = A.getContext('2d'), aw = A.width, ah = A.height;
      ctx.drawImage(st.S, 0, 0);
      a.clearRect(0, 0, aw, ah);
      a.globalCompositeOperation = 'lighter';
      const bands = [
        { y: 0.6, hh: 0.26, amp: 0.05, f: 0.012, s: 0.18, al: 0.42, ph: 0 },
        { y: 0.74, hh: 0.3, amp: 0.04, f: 0.017, s: -0.14, al: 0.36, ph: 2 },
        { y: 0.9, hh: 0.3, amp: 0.03, f: 0.01, s: 0.1, al: 0.3, ph: 4 },
      ];
      for (const b of bands) {
        for (let x = -4; x < aw + 4; x += 2) {
          const xx = x / aw * 440;
          const by = ah * b.y + ah * b.amp * Math.sin(xx * b.f + t * b.s + b.ph) + ah * 0.02 * Math.sin(xx * b.f * 3.1 - t * b.s * 1.7);
          const k = 0.5 + 0.5 * Math.sin(xx * 0.045 + t * 0.6 + b.ph) * Math.sin(xx * 0.013 - t * 0.23 + b.ph * 2);
          const rh = ah * b.hh * (0.55 + 0.45 * k);
          a.globalAlpha = b.al * (0.25 + 0.75 * k * k);
          a.drawImage(st.R, x, by - rh, 2.6, rh * 1.02);
        }
      }
      a.globalCompositeOperation = 'source-over';
      a.globalAlpha = 1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = 'blur(3px)';
      ctx.drawImage(A, 0, 0, w, h);
      ctx.restore();
      const g = ctx.createLinearGradient(0, h * 0.7, 0, h);
      g.addColorStop(0, 'rgba(40,170,110,0)'); g.addColorStop(1, 'rgba(40,170,110,.14)');
      ctx.fillStyle = g; ctx.fillRect(0, h * 0.7, w, h * 0.3);
      for (const s of st.twinkle) {
        ctx.globalAlpha = Math.max(0, Math.sin(t * s.s + s.p)) * 0.9;
        ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, 1.4, 1.4);
      }
      ctx.globalAlpha = 1;
    },
  };

  /* ---------------- FROST ---------------- */
  function drawTree(c, r, x, top, bottom, wid, col, snow, scale) {
    const lean = (r() - 0.5) * 0.06;
    const xb = x, xt = x + lean * (bottom - top);
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(xb - wid / 2, bottom); c.lineTo(xt - wid * 0.25, top); c.lineTo(xt + wid * 0.25, top); c.lineTo(xb + wid / 2, bottom);
    c.closePath(); c.fill();
    // snow streak on one side of the trunk
    if (snow > 0) {
      c.fillStyle = `rgba(245,248,250,${snow * 0.55})`;
      c.beginPath();
      c.moveTo(xb - wid / 2, bottom - (bottom - top) * 0.3); c.lineTo(xt - wid * 0.25, top); c.lineTo(xt - wid * 0.05, top); c.lineTo(xb - wid * 0.15, bottom - (bottom - top) * 0.3);
      c.closePath(); c.fill();
    }
    const nb = Math.round(10 + r() * 14);
    c.lineCap = 'round';
    for (let i = 0; i < nb; i++) {
      const u = 0.04 + Math.pow(r(), 0.8) * 0.62, by = top + (bottom - top) * u, bx = xb + (xt - xb) * (1 - (by - top) / (bottom - top));
      const dir = r() < 0.5 ? -1 : 1, len = (12 + r() * 46) * scale * (1 - u * 0.6), ang = (-0.35 - r() * 0.9);
      const ex = bx + dir * Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
      c.strokeStyle = col; c.lineWidth = Math.max(0.5, wid * 0.22 * (1 - u * 0.5));
      c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo((bx + ex) / 2, by + (ey - by) * 0.2, ex, ey); c.stroke();
      for (let k = 0; k < 3; k++) {
        const f = 0.4 + r() * 0.5, tx = bx + (ex - bx) * f, ty = by + (ey - by) * f, l2 = len * (0.2 + r() * 0.3);
        c.lineWidth = Math.max(0.35, c.lineWidth * 0.5);
        c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + dir * l2 * 0.6, ty - l2 * (0.5 + r() * 0.5)); c.stroke();
      }
      if (snow > 0) {
        c.strokeStyle = `rgba(250,252,253,${snow * 0.8})`; c.lineWidth = Math.max(0.6, wid * 0.16);
        c.beginPath(); c.moveTo(bx, by - 1); c.quadraticCurveTo((bx + ex) / 2, by - 1 + (ey - by) * 0.2, ex, ey - 1); c.stroke();
      }
    }
  }
  const frost = {
    build(w, h) {
      const S = off(w, h), c = S.getContext('2d'), r = mulberry32(31), wl = h * 0.58, sc = Math.max(0.6, Math.min(2, w / 440));
      c.fillStyle = vgrad(c, 0, h, [[0, '#8f989c'], [0.25, '#b9c0c2'], [0.5, '#d4d9d9'], [0.58, '#c9d3d5'], [0.6, '#6fa8bf'], [0.8, '#2f7896'], [1, '#124c6a']]);
      c.fillRect(0, 0, w, h);
      const layers = [
        { n: 70, wid: [1, 2.2], col: '#9aa3a7', bot: wl + h * 0.02, snow: 0.3 },
        { n: 44, wid: [2, 3.5], col: '#788287', bot: wl + h * 0.07, snow: 0.45 },
        { n: 24, wid: [3.5, 6], col: '#4d575c', bot: wl + h * 0.16, snow: 0.6 },
        { n: 11, wid: [6, 11], col: '#2b3236', bot: wl + h * 0.3, snow: 0.8 },
      ];
      layers.forEach((L, li) => {
        const cnt = Math.round(L.n * w / 440 * (li < 2 ? 1 : 0.85));
        for (let i = 0; i < cnt; i++) {
          const x = r() * w, wid = (L.wid[0] + r() * (L.wid[1] - L.wid[0])) * sc;
          drawTree(c, r, x, -20, L.bot + (r() - 0.5) * h * 0.04, wid, L.col, L.snow, sc * (0.5 + li * 0.25));
        }
        // mist between layers
        c.fillStyle = vgrad(c, 0, wl + 20, [[0, 'rgba(200,206,208,.18)'], [0.75, 'rgba(225,230,230,.32)'], [1, 'rgba(225,230,230,0)']]);
        if (li < 3) c.fillRect(0, 0, w, wl + 20);
      });
      // water tint over the submerged trunks + reflections
      c.fillStyle = vgrad(c, wl - 6, h, [[0, 'rgba(110,170,195,0)'], [0.05, 'rgba(90,160,190,.55)'], [0.5, 'rgba(32,110,145,.62)'], [1, 'rgba(14,70,100,.75)']]);
      c.fillRect(0, wl - 6, w, h - wl + 6);
      c.globalAlpha = 0.18;
      for (let y = wl; y < h; y += 3) { c.fillStyle = r() < 0.5 ? '#bfe6f2' : '#0d3d55'; c.fillRect(0, y, w, 1); }
      c.globalAlpha = 1;
      // snow on the water's edge
      c.fillStyle = vgrad(c, wl - 10, wl + 18, [[0, 'rgba(240,244,245,0)'], [0.5, 'rgba(240,244,245,.55)'], [1, 'rgba(240,244,245,0)']]);
      c.fillRect(0, wl - 10, w, 28);
      grain(c, S.width, S.height, 10, 3);
      const flakes = Array.from({ length: Math.round(140 * w / 440) }, () => ({ x: r() * w, y: r() * h, s: 0.6 + r() * 2.2, v: 12 + r() * 30, d: r() * 6.28 }));
      return { S, flakes, w, h };
    },
    frame(ctx, st, t, dt) {
      ctx.drawImage(st.S, 0, 0);
      ctx.fillStyle = '#fff';
      for (const f of st.flakes) {
        f.y += f.v * f.s * 0.5 * dt; f.x += Math.sin(t * 0.8 + f.d) * 8 * dt;
        if (f.y > st.h + 4) { f.y = -4; f.x = Math.random() * st.w; }
        ctx.globalAlpha = 0.35 + f.s * 0.2;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.s * 0.8, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };

  /* ---------------- CANYON ---------------- */
  const mixc = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function shrubCluster(c, r, x, y, s) {
    for (let k = 0; k < 5; k++) {
      c.fillStyle = ['#34472a', '#435a2f', '#2a3a22', '#56703a'][Math.floor(r() * 4)];
      c.beginPath(); c.ellipse(x + (r() - 0.5) * s * 1.6, y - r() * s * 0.6, s * (0.4 + r() * 0.4), s * (0.3 + r() * 0.3), 0, 0, 6.283); c.fill();
    }
  }
  function pine(c, x, y, s, col) {
    c.fillStyle = col;
    c.fillRect(x - s * 0.06, y - s * 0.25, s * 0.12, s * 0.25);
    for (let i = 0; i < 4; i++) {
      const w = s * (0.42 - i * 0.08), yy = y - s * 0.15 - i * s * 0.2;
      c.beginPath(); c.moveTo(x - w, yy); c.lineTo(x, yy - s * 0.38); c.lineTo(x + w, yy); c.closePath(); c.fill();
    }
  }
  const CANYON_PAL = [[186, 182, 204], [196, 168, 172], [207, 156, 132], [210, 140, 102], [198, 116, 76], [176, 94, 60], [146, 72, 46], [114, 54, 35], [84, 39, 26], [60, 28, 19]];
  const canyon = {
    build(w, h) {
      const W = Math.round(w * 1.04), H = Math.round(h * 1.04);
      const F = off(W, H), f = F.getContext('2d'), N = off(W, H), c = N.getContext('2d');
      const r = mulberry32(5);
      f.fillStyle = vgrad(f, 0, H * 0.32, [[0, '#4f7bab'], [0.45, '#94b4cf'], [0.85, '#e6d6c2'], [1, '#f0d2b0']]);
      f.fillRect(0, 0, W, H);
      const sun = f.createRadialGradient(W * 0.82, H * 0.02, 0, W * 0.82, H * 0.02, W * 0.5);
      sun.addColorStop(0, 'rgba(255,240,214,.55)'); sun.addColorStop(1, 'rgba(255,240,214,0)');
      f.fillStyle = sun; f.fillRect(0, 0, W, H * 0.5);
      const L = CANYON_PAL.length;
      const cxAt = d => W * (0.6 + 0.06 * Math.sin(d * 6.5) - 0.03 * d);
      for (let k = 0; k < L; k++) {
        const d = k / (L - 1), ctx = k < 5 ? f : c, n = vnoise(300 + k * 17), n2 = vnoise(700 + k * 5);
        const baseY = H * (0.12 + 0.72 * Math.pow(d, 1.3));
        const amp = H * (0.018 + 0.1 * d);
        const freq = (2.2 + (1 - d) * 6) / W;
        const cx = cxAt(d), fw = W * (0.004 + 0.035 * d), vw = W * (0.03 + 0.2 * d), vd = k >= 2 ? H * (0.02 + 0.3 * d * d) : 0;
        const pts = [];
        let top = Infinity;
        for (let x = -12; x <= W + 12; x += 3) {
          const q = fbm(n, x * freq + k * 9, 4) * 3.4, fl = Math.floor(q);
          let y = baseY - amp * (fl + sstep(0.78, 1, q - fl)) / 3.4 * 2;
          const ax = Math.abs(x - cx);
          if (vd) {
            const wq = (1 - sstep(fw, fw + vw, ax + (n2(x * 0.03) - 0.5) * vw * 0.25)) * 3;
            y += vd * (Math.floor(wq) + sstep(0.6, 1, wq - Math.floor(wq))) / 3;
          }
          pts.push([x, y]);
          if (y < top) top = y;
        }
        const col = CANYON_PAL[k], lit = mixc(col, [255, 226, 190], 0.22), dark = mixc(col, [30, 14, 10], 0.28);
        ctx.beginPath(); ctx.moveTo(-12, H + 2); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(W + 12, H + 2); ctx.closePath();
        ctx.fillStyle = vgrad(ctx, top, Math.min(H, baseY + vd + H * 0.15), [[0, rgb(lit)], [0.3, rgb(col)], [1, rgb(dark)]]);
        ctx.fill();
        // gorge walls in shadow
        if (vd && k >= 4) {
          ctx.save(); ctx.clip();
          const g = ctx.createLinearGradient(cx - fw - vw, 0, cx + fw + vw, 0);
          g.addColorStop(0, 'rgba(40,18,24,0)'); g.addColorStop(0.42, 'rgba(40,18,24,.16)'); g.addColorStop(0.58, 'rgba(40,18,24,.26)'); g.addColorStop(1, 'rgba(40,18,24,0)');
          ctx.fillStyle = g; ctx.fillRect(cx - fw - vw, top, (fw + vw) * 2, baseY + vd - top + H * 0.06);
          ctx.restore();
        }
        // rim light + strata echoing the ridge line
        const offs = [0, 5, 12, 22, 36].map(o => o * (0.4 + d * 1.6));
        offs.forEach((o, i) => {
          ctx.strokeStyle = i === 0 ? rgb([255, 230, 200], 0.35 + 0.2 * d) : rgb(i % 2 ? dark : lit, 0.22);
          ctx.lineWidth = i === 0 ? 1.2 : 1 + d;
          ctx.beginPath();
          pts.forEach((p, j) => { const y = p[1] + o; j ? ctx.lineTo(p[0], y) : ctx.moveTo(p[0], y); });
          ctx.stroke();
        });
      }
      // foreground frame: shadowed rock on the left, ledge along the bottom, outcrop with pines top-left
      const fgc = [44, 24, 16], fgl = [92, 52, 32];
      const n1 = vnoise(77);
      c.beginPath(); c.moveTo(-10, H + 2);
      for (let x = -10; x <= W * 0.46; x += 4) c.lineTo(x, H * (0.3 + 0.05 * Math.sin(x / W * 9) + (x / W) * 0.05) + (fbm(n1, x * 0.01, 5) - 0.5) * H * 0.07);
      for (let y = H * 0.36; y <= H + 2; y += 6) c.lineTo(W * (0.47 + 0.02 * Math.sin(y * 0.012)) + (fbm(n1, y * 0.02 + 40, 4) - 0.5) * W * 0.05, y);
      c.closePath();
      c.fillStyle = vgrad(c, H * 0.26, H, [[0, rgb(fgl)], [0.2, rgb(mixc(fgl, fgc, 0.6))], [1, rgb([30, 16, 11])]]);
      c.fill();
      const n3 = vnoise(55), ledge = [];
      for (let x = -10; x <= W + 10; x += 4) ledge.push([x, H * (0.88 - 0.07 * Math.exp(-Math.pow((x / W - 0.1) * 4, 2)) + 0.025 * Math.sin(x / W * 5)) + (fbm(n3, x * 0.008, 5) - 0.5) * H * 0.05]);
      c.beginPath(); c.moveTo(-10, H + 2); ledge.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(W + 10, H + 2); c.closePath();
      c.fillStyle = vgrad(c, H * 0.78, H, [[0, '#b8653a'], [0.35, '#8a4428'], [1, '#4a2216']]);
      c.fill();
      c.strokeStyle = 'rgba(255,214,170,.45)'; c.lineWidth = 1.5;
      c.beginPath(); ledge.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
      for (let i = 0; i < 7; i++) { const p = ledge[Math.floor(r() * ledge.length * 0.35)]; pine(c, p[0], p[1] + 3, H * (0.025 + r() * 0.035), '#1f2a1a'); }
      const n4 = vnoise(91), oc = [];
      for (let x = -10; x <= W * 0.25; x += 4) oc.push([x, H * (0.17 + Math.pow(Math.max(0, x) / (W * 0.25), 2.2) * 0.05) - (W * 0.25 - x) / W * H * 0.3 + (fbm(n4, x * 0.02, 4) - 0.5) * H * 0.02]);
      c.beginPath(); c.moveTo(-10, H * 0.28); oc.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(W * 0.25, H * 0.22); c.lineTo(W * 0.19, H * 0.27); c.lineTo(-10, H * 0.31); c.closePath();
      c.fillStyle = vgrad(c, 0, H * 0.3, [[0, '#c87a4a'], [1, '#7c3e24']]);
      c.fill();
      c.strokeStyle = 'rgba(255,214,170,.5)'; c.beginPath(); oc.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
      for (let i = 0; i < 8; i++) { const p = oc[Math.floor(r() * oc.length * 0.8)]; pine(c, p[0], p[1] + 2, H * (0.03 + r() * 0.05), r() < 0.5 ? '#26331f' : '#1c2617'); }
      grain(c, W, H, 9, 4);
      const v = c.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.3)');
      c.fillStyle = v; c.fillRect(0, 0, W, H);
      const clouds = Array.from({ length: 6 }, () => ({ x: r() * w, y: h * (0.015 + r() * 0.07), s: 60 + r() * 140, v: 2 + r() * 5 }));
      return { F, N, clouds, w, h };
    },
    frame(ctx, st, t, dt, mx, my) {
      const { w, h } = st, ox = -w * 0.02, oy = -h * 0.02;
      ctx.drawImage(st.F, ox - mx * 4, oy - my * 3);
      for (const cl of st.clouds) {
        cl.x += cl.v * dt; if (cl.x - cl.s * 2 > w) cl.x = -cl.s * 2;
        ctx.save();
        ctx.translate(cl.x, cl.y); ctx.scale(1, 0.28);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, cl.s);
        g.addColorStop(0, 'rgba(255,255,255,.32)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, cl.s, 0, 6.283); ctx.fill();
        ctx.restore();
      }
      ctx.drawImage(st.N, ox - mx * 10, oy - my * 7);
    },
  };

  const SCENES = { aurora, frost, canyon };

  class Scene {
    constructor(canvas, opts = {}) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = opts;
      this.name = null; this.st = null; this.img = null;
      this.mx = 0; this.my = 0; this.tmx = 0; this.tmy = 0;
      this.t = 0; this.last = 0; this.active = true;
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(canvas);
      if (opts.parallax) window.addEventListener('pointermove', e => {
        this.tmx = e.clientX / window.innerWidth - 0.5; this.tmy = e.clientY / window.innerHeight - 0.5;
      });
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }
    set(name) {
      if (name === this.name && !this.img) return;
      this.name = name; this.img = null;
      this._build();
    }
    setImage(url) {
      const im = new Image();
      im.onload = () => { this.img = im; this.name = 'custom'; this.st = null; this._dirty = true; };
      im.src = url;
    }
    setActive(on) { this.active = on; if (on) this._dirty = true; }
    _resize() {
      const r = this.cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const w = Math.round(r.width), h = Math.round(r.height);
      if (w === this.cv.width && h === this.cv.height) return;
      this.cv.width = w; this.cv.height = h;
      this._build();
    }
    _build() {
      const w = this.cv.width, h = this.cv.height;
      if (!w || !h || this.img) { this._dirty = true; return; }
      const S = SCENES[this.name] || aurora;
      this.st = S.build(w, h);
      this._dirty = true;
    }
    _loop(ts) {
      requestAnimationFrame(this._loop);
      if (!this.active || document.hidden) return;
      const fps = this.name === 'canyon' || this.img ? 30 : 30;
      if (ts - this.last < 1000 / fps && !this._dirty) return;
      const dt = Math.min(0.1, (ts - (this.last || ts)) / 1000);
      this.last = ts; this.t += dt; this._dirty = false;
      this.mx += (this.tmx - this.mx) * 0.06; this.my += (this.tmy - this.my) * 0.06;
      const ctx = this.ctx, w = this.cv.width, h = this.cv.height;
      if (this.img) {
        const im = this.img, s = Math.max(w / im.width, h / im.height) * 1.04;
        const iw = im.width * s, ih = im.height * s;
        ctx.drawImage(im, (w - iw) / 2 - this.mx * 10, (h - ih) / 2 - this.my * 7, iw, ih);
        return;
      }
      if (!this.st) return;
      (SCENES[this.name] || aurora).frame(ctx, this.st, this.t, dt, this.mx, this.my);
    }
  }

  DV.Scene = Scene;
  DV.SCENE_NAMES = { aurora: 'Aurora', frost: 'Frozen Forest', canyon: 'Canyon' };
})();
