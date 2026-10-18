/* DeltaVision shared core
 * Simulated market data, account/portfolio state, options math and
 * cross-window sync. Loaded by both the web and the mobile app.
 */
(function () {
  'use strict';
  const DV = (window.DV = window.DV || {});

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function gauss(rnd) {
    let u = 0, v = 0;
    while (!u) u = rnd();
    while (!v) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const uid = () => Math.random().toString(36).slice(2, 10);

  // Monotone cubic spline through [[x, y], ...] (no overshoot between anchors)
  function makeSpline(pts) {
    const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return x => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0;
      while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] +
        (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }

  // Brownian bridge in log space from a to b over m points
  function bridge(rnd, a, b, m, sig) {
    const w = [0];
    for (let i = 1; i < m; i++) w[i] = w[i - 1] + sig * gauss(rnd);
    const la = Math.log(a), lb = Math.log(b);
    return w.map((x, i) => {
      const u = m > 1 ? i / (m - 1) : 1;
      return Math.exp(lerp(la, lb, u) + x - u * w[m - 1]);
    });
  }

  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const MONTHS_T = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  const fmt = {
    num(v, d = 2) {
      return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    },
    price(v) {
      const a = Math.abs(v);
      return fmt.num(v, a >= 1 ? 2 : 4);
    },
    money(v, d) {
      if (d == null) d = Math.abs(v) >= 10000 ? 0 : 2;
      const s = '$' + fmt.num(Math.abs(v), d);
      return v < 0 ? '-' + s : s;
    },
    smoney(v, d) { return (v >= 0 ? '+' : '-') + fmt.money(Math.abs(v), d); },
    pct(v, d = 2) { return fmt.num(Math.abs(v), d) + '%'; },
    spct(v, d = 2) { return (v >= 0 ? '+' : '-') + fmt.num(Math.abs(v), d) + '%'; },
    compact(v, d = 2) {
      const a = Math.abs(v);
      const trim = x => x.toFixed(d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      if (a >= 1e12) return trim(v / 1e12) + 'T';
      if (a >= 1e9) return trim(v / 1e9) + 'B';
      if (a >= 1e6) return trim(v / 1e6) + 'M';
      if (a >= 1e3) return trim(v / 1e3) + 'K';
      return trim(v);
    },
    qty(v) { return Number.isInteger(v) ? fmt.num(v, 0) : String(+v.toFixed(6)); },
    arrow(v) { return v >= 0 ? '▲' : '▼'; },
    cls(v) { return v >= 0 ? 'up' : 'down'; },
    dmy(t) {
      const d = new Date(t);
      return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear()).slice(2);
    },
    date(t) { const d = new Date(t); return MONTHS_T[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); },
    shortDate(t) { const d = new Date(t); return MONTHS_T[d.getMonth()] + ' ' + d.getDate(); },
    hm(t) {
      const d = new Date(t); let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
      const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + m + ' ' + ap;
    },
    clock(t) {
      const d = new Date(t); let h = d.getHours();
      const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
      return h + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0') + ' ' + ap;
    },
    ago(t) {
      const s = (Date.now() - t) / 1000;
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return Math.floor(s / 86400) + 'd ago';
    },
    // Axis label for a timestamp, depending on the timeframe being shown
    axis(t, tf) {
      const d = new Date(t);
      if (tf === '1D') { let h = d.getHours() % 12 || 12; return h + ':' + String(d.getMinutes()).padStart(2, '0'); }
      if (tf === '5D') return DAYS[d.getDay()];
      if (tf === '1M') return MONTHS[d.getMonth()] + ' ' + d.getDate();
      if (tf === '5Y' || tf === 'MAX') return String(d.getFullYear());
      return MONTHS[d.getMonth()];
    },
    tip(t, tf) {
      if (tf === '1D' || tf === '5D') return fmt.shortDate(t) + ' · ' + fmt.hm(t);
      return fmt.date(t);
    },
  };

  DV.util = { mulberry32, hashStr, gauss, clamp, lerp, uid, makeSpline, bridge, MONTHS, MONTHS_T };
  DV.fmt = fmt;

  /* ------------------------------------------------------------------ *
   * Event bus
   * ------------------------------------------------------------------ */
  const handlers = {};
  DV.on = (evt, fn) => { (handlers[evt] = handlers[evt] || []).push(fn); return () => DV.off(evt, fn); };
  DV.off = (evt, fn) => { handlers[evt] = (handlers[evt] || []).filter(f => f !== fn); };
  DV.emit = (evt, data) => { (handlers[evt] || []).slice().forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  DV.store = store;

  /* ------------------------------------------------------------------ *
   * Securities
   * ------------------------------------------------------------------ */
  const FX = { USD: 1, CAD: 0.73 };

  // shape: 1Y price path anchors [x 0..1, price]; scaled to the live price.
  const DEFS = [
    {
      sym: 'AAPL', name: 'Apple Inc.', short: 'Apple', type: 'stock', price: 214.37, chg: 1.42, vol: 0.018,
      sector: 'Consumer Electronics', shares: 14.94e9, float: 14.84e9, eps: 6.42, avgVol: 54.2e6, ai: 0.42, years: 10, g: 0.22,
      iv: [0.29, 0.17, 0.05], art: 'apple',
      desc: '<b>Apple</b> designs consumer electronics, software and services. The <b>iPhone</b> drives roughly half of revenue, while the <b>Services</b> segment (App Store, iCloud, Apple Music) is its fastest-growing, highest-margin business.',
      shape: [[0, 184], [0.03, 178], [0.06, 190], [0.08, 197], [0.1, 186], [0.13, 182], [0.16, 186], [0.19, 180], [0.22, 185], [0.26, 176], [0.29, 183], [0.32, 189], [0.34, 181], [0.37, 196], [0.4, 201], [0.43, 193], [0.46, 216], [0.5, 221], [0.53, 215], [0.56, 233], [0.6, 232], [0.63, 238], [0.67, 235], [0.7, 246], [0.73, 244], [0.76, 252], [0.78, 257], [0.8, 241], [0.83, 233], [0.86, 247], [0.88, 240], [0.9, 229], [0.93, 227], [0.945, 198], [0.955, 186], [0.97, 205], [0.985, 203], [1, 214.37]],
      news: ['Apple set to release earnings next month', 'iPhone 18 Pro shipments tracking ahead of last cycle', 'Apple expands on-device AI features to more regions'],
    },
    {
      sym: 'BTCCAD', name: 'Bitcoin', short: 'Bitcoin', type: 'crypto', cur: 'CAD', price: 151240, chg: 6.37, vol: 0.028,
      sector: 'Cryptocurrency', shares: 19.92e6, float: 19.92e6, eps: null, avgVol: 41.8e9, ai: 0.3, years: 8, g: 0.6,
      art: 'crypto', coin: '#f7931a',
      desc: '<b>Bitcoin</b> is a decentralized digital currency secured by <b>proof-of-work</b> mining. Supply is capped at 21 million coins, and new issuance halves roughly every four years.',
      shape: [[0, 135000], [0.1, 142000], [0.18, 131000], [0.25, 118000], [0.35, 128000], [0.45, 141000], [0.5, 150000], [0.6, 158000], [0.7, 160000], [0.8, 152000], [0.9, 146000], [0.96, 142000], [1, 151240]],
      news: ['Bitcoin crosses C$150,000 as ETF inflows accelerate', 'Hashrate hits a new all-time high', 'Bitcoin set to see record options expiry next month'],
    },
    {
      sym: 'ETHUSD', name: 'Ethereum', short: 'Ethereum', type: 'crypto', price: 3912.4, chg: 2.84, vol: 0.036,
      sector: 'Cryptocurrency', shares: 120.7e6, float: 120.7e6, eps: null, avgVol: 21.3e9, ai: 0.36, years: 8, g: 0.5,
      art: 'crypto', coin: '#8a92b2',
      desc: '<b>Ethereum</b> is a programmable blockchain that runs <b>smart contracts</b>. Since moving to proof-of-stake, validators secure the network by staking ETH.',
      shape: [[0, 3300], [0.1, 2700], [0.25, 1600], [0.35, 1800], [0.5, 2500], [0.6, 3600], [0.7, 4500], [0.8, 4300], [0.9, 3900], [0.96, 3800], [1, 3912.4]],
      news: ['Ethereum set to ship its next network upgrade next month', 'Staking deposits climb to a record 36M ETH', 'Layer-2 fees fall to all-time lows'],
    },
    {
      sym: 'GSAT', name: 'Globalstar, Inc.', short: 'Globalstar', type: 'stock', price: 21.47, chg: -16.4, vol: 0.042,
      sector: 'Satellite Communications', shares: 126.6e6, float: 52.1e6, eps: -0.31, avgVol: 2.4e6, ai: 0.62, years: 10, g: 0.05,
      iv: [0.68, 0.32, 0.08], art: 'satellite',
      desc: '<b>Globalstar</b> operates a low-earth-orbit <b>satellite constellation</b> providing voice, data and IoT connectivity, including emergency messaging for consumer smartphones.',
      shape: [[0, 31], [0.1, 28], [0.2, 24], [0.3, 26], [0.45, 22], [0.55, 27], [0.65, 29], [0.75, 26], [0.85, 27.5], [0.95, 25.6], [1, 21.47]],
      news: ['Globalstar slides 16% as spectrum deal is delayed', 'Globalstar set to release earnings next month', 'Next-gen satellite batch passes final testing'],
    },
    {
      sym: 'LUNR', name: 'Intuitive Machines, Inc.', short: 'Intuitive Machines', type: 'stock', price: 10.86, chg: -4.14, vol: 0.055,
      sector: 'Aerospace & Defense', shares: 178e6, float: 96.2e6, eps: -1.12, avgVol: 11.9e6, ai: 0.4, years: 3.5, g: 0.1,
      iv: [0.92, 0.35, 0.12], art: 'lander',
      desc: '<b>Intuitive Machines</b> builds lunar landers and space infrastructure. Its <b>Nova-C</b> lander made the first commercial soft landing on the Moon, and it holds a NASA contract for <b>lunar data relay</b> services.',
      shape: [[0, 8.5], [0.1, 12], [0.2, 9], [0.3, 7], [0.45, 10], [0.55, 11.5], [0.65, 9.8], [0.8, 12.5], [0.9, 11.8], [1, 10.86]],
      news: ['Intuitive Machines awarded NASA lunar data relay task order', 'Intuitive Machines set to release earnings next month', 'IM-3 mission enters final integration'],
    },
    {
      sym: 'RKLB', name: 'Rocket Lab USA Inc.', short: 'RocketLab', type: 'stock', price: 19.84, chg: 7.93, vol: 0.045,
      sector: 'Aerospace & Defense', shares: 504e6, float: 371.5e6, eps: -0.38, avgVol: 15.58e6, ai: 0.18, years: 4.5, g: 0.15,
      iv: [0.62, 0.25, 0.1], art: 'rocket',
      desc: '<b>Rocket Lab</b> is an aerospace manufacturer and launch service provider. Its <b>Electron</b> orbital rocket launches small satellites, and has launched 63 times as of April 2025. A sub-orbital <b>Electron</b> variant called HASTE serves other needs.',
      shape: [[0, 10.4], [0.05, 10.6], [0.12, 10.9], [0.2, 11.6], [0.27, 12.4], [0.31, 13.3], [0.34, 12.7], [0.4, 12.8], [0.45, 12.2], [0.5, 11.6], [0.53, 11.7], [0.58, 12.4], [0.62, 13.2], [0.66, 14.0], [0.7, 14.3], [0.73, 14.6], [0.77, 16.1], [0.79, 17.1], [0.81, 16.2], [0.84, 17.6], [0.86, 18.6], [0.88, 18.9], [0.9, 18.0], [0.92, 17.2], [0.94, 18.9], [0.96, 19.9], [0.97, 20.6], [0.985, 19.3], [1, 19.84]],
      news: ['Rocket Lab set to release earnings next month', 'Neutron completes full-duration static fire', 'Rocket Lab books 10-launch Electron contract'],
    },
    {
      sym: 'RCAT', name: 'Red Cat Holdings, Inc.', short: 'Red Cat Holdings', type: 'stock', price: 9.12, chg: 0.84, vol: 0.05,
      sector: 'Drones & Defense Tech', shares: 88.6e6, float: 72.4e6, eps: -0.74, avgVol: 6.1e6, ai: 0.45, years: 6, g: 0.2,
      iv: [0.88, 0.3, 0.1], art: 'drone',
      desc: '<b>Red Cat</b> builds drone technology for military and public-safety use. Its <b>Black Widow</b> short-range reconnaissance drone was selected for the U.S. Army SRR program.',
      shape: [[0, 10], [0.15, 7], [0.3, 5.6], [0.45, 6.2], [0.6, 8.4], [0.7, 10.5], [0.8, 9.0], [0.9, 9.6], [1, 9.12]],
      news: ['Red Cat set to release earnings next month', 'Army expands Black Widow SRR order', 'Red Cat opens second production facility'],
    },
    {
      sym: 'NVDA', name: 'NVIDIA Corporation', short: 'Nvidia Corporation', type: 'stock', price: 181.62, chg: 1.05, vol: 0.028,
      sector: 'Semiconductors', shares: 24.4e9, float: 23.4e9, eps: 3.1, avgVol: 192e6, ai: 0.28, years: 10, g: 0.55,
      iv: [0.42, 0.18, 0.06], art: 'chip',
      desc: '<b>NVIDIA</b> designs GPUs and accelerated-computing platforms. Its <b>data center</b> segment, powered by AI training and inference demand, now makes up most of revenue.',
      shape: [[0, 128], [0.1, 138], [0.2, 118], [0.28, 104], [0.32, 96], [0.38, 112], [0.45, 132], [0.55, 146], [0.62, 158], [0.7, 176], [0.75, 172], [0.82, 184], [0.88, 178], [0.94, 190], [1, 181.62]],
      news: ['NVIDIA set to release earnings next month', 'Hyperscalers raise AI capex guidance again', 'NVIDIA unveils next-gen rack-scale system'],
    },
    {
      sym: 'PTK', name: 'POET Technologies Inc.', short: 'Poet Technologies', type: 'stock', price: 6.84, chg: 32.3, vol: 0.06,
      sector: 'Photonics', shares: 78.2e6, float: 74.9e6, eps: -0.42, avgVol: 3.9e6, ai: 0.33, years: 7, g: 0.12,
      iv: [0.95, 0.45, 0.15], art: 'photonics',
      desc: '<b>POET Technologies</b> develops the <b>Optical Interposer</b>, a platform that integrates electronic and photonic devices on a single chip for high-speed data center and AI interconnects.',
      shape: [[0, 4.1], [0.2, 5.2], [0.3, 4.3], [0.45, 4.0], [0.6, 4.6], [0.75, 5.0], [0.9, 5.3], [0.97, 5.1], [1, 6.84]],
      news: ['POET surges 32% on 1.6T optical engine order', 'POET set to release earnings next month', 'POET opens Malaysia assembly line'],
    },
    { sym: 'TSLA', name: 'Tesla, Inc.', short: 'Tesla', type: 'stock', price: 338.2, chg: -1.12, vol: 0.035, sector: 'Automotive', shares: 3.22e9, float: 2.79e9, eps: 1.76, avgVol: 98e6, ai: 0.55, years: 10, g: 0.4, y1: 1.32, art: 'city' },
    { sym: 'MSFT', name: 'Microsoft Corporation', short: 'Microsoft', type: 'stock', price: 497.41, chg: 0.38, vol: 0.015, sector: 'Software', shares: 7.43e9, float: 7.43e9, eps: 13.2, avgVol: 19e6, ai: 0.3, years: 10, g: 0.25, y1: 1.18, art: 'city' },
    { sym: 'AMZN', name: 'Amazon.com, Inc.', short: 'Amazon', type: 'stock', price: 221.3, chg: 0.91, vol: 0.02, sector: 'E-Commerce & Cloud', shares: 10.6e9, float: 9.6e9, eps: 6.1, avgVol: 41e6, ai: 0.32, years: 10, g: 0.24, y1: 1.12, art: 'city' },
    { sym: 'GOOGL', name: 'Alphabet Inc.', short: 'Alphabet', type: 'stock', price: 196.52, chg: -0.44, vol: 0.019, sector: 'Internet Services', shares: 12.1e9, float: 10.8e9, eps: 9.4, avgVol: 31e6, ai: 0.34, years: 10, g: 0.2, y1: 1.15, art: 'city' },
    { sym: 'META', name: 'Meta Platforms, Inc.', short: 'Meta', type: 'stock', price: 712.84, chg: 1.73, vol: 0.022, sector: 'Internet Services', shares: 2.52e9, float: 2.18e9, eps: 25.6, avgVol: 14e6, ai: 0.31, years: 10, g: 0.28, y1: 1.29, art: 'city' },
    { sym: 'AMD', name: 'Advanced Micro Devices', short: 'AMD', type: 'stock', price: 162.33, chg: 2.21, vol: 0.031, sector: 'Semiconductors', shares: 1.62e9, float: 1.61e9, eps: 1.35, avgVol: 48e6, ai: 0.38, years: 10, g: 0.35, y1: 1.08, art: 'chip' },
    { sym: 'PLTR', name: 'Palantir Technologies', short: 'Palantir', type: 'stock', price: 154.9, chg: 3.08, vol: 0.038, sector: 'Software', shares: 2.36e9, float: 2.2e9, eps: 0.31, avgVol: 87e6, ai: 0.5, years: 5, g: 0.6, y1: 2.6, art: 'city' },
    { sym: 'ASTS', name: 'AST SpaceMobile, Inc.', short: 'AST SpaceMobile', type: 'stock', price: 48.12, chg: 4.47, vol: 0.06, sector: 'Satellite Communications', shares: 330e6, float: 210e6, eps: -1.4, avgVol: 14e6, ai: 0.41, years: 5, g: 0.3, y1: 2.1, art: 'satellite' },
    { sym: 'SOFI', name: 'SoFi Technologies', short: 'SoFi', type: 'stock', price: 21.05, chg: -0.62, vol: 0.034, sector: 'Fintech', shares: 1.1e9, float: 1.08e9, eps: 0.41, avgVol: 52e6, ai: 0.4, years: 5, g: 0.15, y1: 1.7, art: 'city' },
    { sym: 'SPY', name: 'SPDR S&P 500 ETF', short: 'S&P 500 ETF', type: 'stock', price: 637.2, chg: 0.27, vol: 0.009, sector: 'Index ETF', shares: 0.98e9, float: 0.98e9, eps: null, avgVol: 61e6, ai: 0.35, years: 10, g: 0.11, y1: 1.14, art: 'city' },
    { sym: 'SOLUSD', name: 'Solana', short: 'Solana', type: 'crypto', price: 186.4, chg: 4.12, vol: 0.05, sector: 'Cryptocurrency', shares: 540e6, float: 540e6, eps: null, avgVol: 3.8e9, ai: 0.42, years: 5, g: 0.6, y1: 1.24, art: 'crypto', coin: '#9945ff' },
  ];

  const tickers = {};
  DEFS.forEach(d => {
    const rnd = mulberry32(hashStr(d.sym));
    const tk = Object.assign({ cur: 'USD', years: 10, g: 0.15, y1: 1.1 }, d);
    tk.prev = tk.price / (1 + tk.chg / 100);
    tk.anchor = tk.price;
    tk.open = tk.prev * (1 + 0.004 * gauss(rnd));
    tk.dayHigh = Math.max(tk.open, tk.price) * (1 + Math.abs(gauss(rnd)) * tk.vol * 0.25);
    tk.dayLow = Math.min(tk.open, tk.price) * (1 - Math.abs(gauss(rnd)) * tk.vol * 0.25);
    if (!tk.iv) { const b = tk.vol * Math.sqrt(252) * 0.9; tk.iv = [b, b * 0.3, b * 0.12]; }
    if (!tk.desc) tk.desc = `<b>${tk.short}</b> (${tk.sym}) trades in the <b>${tk.sector}</b> sector. Figures shown in this demo are simulated.`;
    if (!tk.news) tk.news = [`${tk.short} set to release earnings next month`, `Analysts lift ${tk.sym} price target`, `${tk.short} sees unusual options activity`];
    tickers[tk.sym] = tk;
  });

  function dayTimes(n, crypto) {
    const out = new Array(n), now = Date.now();
    out[n - 1] = now;
    const d = new Date(now); d.setHours(16, 0, 0, 0);
    for (let i = n - 2; i >= 0; i--) {
      do { d.setDate(d.getDate() - 1); } while (!crypto && (d.getDay() === 0 || d.getDay() === 6));
      out[i] = d.getTime();
    }
    return out;
  }

  function ohlcFrom(rnd, c, vol, firstOpen) {
    const o = [], h = [], l = [];
    for (let i = 0; i < c.length; i++) {
      const pc = i ? c[i - 1] : (firstOpen || c[0]);
      const op = i ? pc * Math.exp(vol * 0.22 * gauss(rnd)) : pc;
      o[i] = op;
      h[i] = Math.max(op, c[i]) * Math.exp(Math.abs(gauss(rnd)) * vol * 0.42);
      l[i] = Math.min(op, c[i]) * Math.exp(-Math.abs(gauss(rnd)) * vol * 0.42);
    }
    return { o, h, l };
  }

  function getDaily(tk) {
    if (tk._d) return tk._d;
    const crypto = tk.type === 'crypto';
    const yr = crypto ? 365 : 252;
    const n = Math.round(tk.years * yr);
    const rnd = mulberry32(hashStr(tk.sym + '|daily'));
    const t = dayTimes(n, crypto);
    const c = new Array(n);
    const W = Math.min(yr, n - 1), i0 = n - 1 - W, vol = tk.vol;
    if (tk.shape) {
      const f = makeSpline(tk.shape), k = tk.price / tk.shape[tk.shape.length - 1][1];
      let x = 0;
      for (let i = i0; i < n; i++) {
        x = 0.8 * x + vol * 0.5 * gauss(rnd);
        c[i] = f((i - i0) / W) * k * Math.exp(x);
      }
    } else {
      const path = bridge(rnd, tk.price / tk.y1, tk.price, W + 1, vol * 0.9);
      for (let j = 0; j <= W; j++) c[i0 + j] = path[j];
    }
    // pin today's close and yesterday's close, easing the approach
    c[n - 1] = tk.price;
    const r = tk.prev / c[n - 2], blend = 6;
    for (let j = 1; j <= blend && n - 1 - j >= i0; j++) c[n - 1 - j] *= Math.pow(r, (blend - j + 1) / blend);
    const mu = Math.log(1 + tk.g) / yr;
    for (let i = i0 - 1; i >= 0; i--) c[i] = Math.max(c[i + 1] * Math.exp(-(mu + vol * 0.95 * gauss(rnd))), tk.price * 0.005);
    const { o, h, l } = ohlcFrom(rnd, c, vol);
    o[n - 1] = tk.open; h[n - 1] = tk.dayHigh; l[n - 1] = tk.dayLow;
    tk._d = { t, o, h, l, c };
    return tk._d;
  }

  function getIntra(tk, tf) {
    tk._i = tk._i || {};
    if (tk._i[tf]) return tk._i[tf];
    const crypto = tk.type === 'crypto';
    const rnd = mulberry32(hashStr(tk.sym + '|' + tf));
    const now = Date.now();
    let t = [], c = [], step;
    if (tf === '1D') {
      const bars = crypto ? 96 : 78; step = (crypto ? 15 : 5) * 60e3;
      c = bridge(rnd, tk.open, tk.price, bars, tk.vol / Math.sqrt(bars) * 1.2);
      for (let i = 0; i < bars; i++) t.push(now - (bars - 1 - i) * step);
    } else {
      const d = getDaily(tk), n = d.c.length;
      const per = crypto ? 24 : 13; step = (crypto ? 60 : 30) * 60e3;
      for (let k = 4; k >= 0; k--) {
        const from = d.c[n - 2 - k], to = k === 0 ? tk.price : d.c[n - 1 - k];
        const seg = bridge(rnd, from, to, per + 1, tk.vol / Math.sqrt(per) * 1.1).slice(1);
        const dayEnd = k === 0 ? now : d.t[n - 1 - k];
        for (let j = 0; j < per; j++) { t.push(dayEnd - (per - 1 - j) * step); c.push(seg[j]); }
      }
    }
    const { o, h, l } = ohlcFrom(rnd, c, tk.vol / 6, c[0]);
    tk._i[tf] = { t, o, h, l, c, step };
    return tk._i[tf];
  }

  const TF_DAYS = { '1M': 21, '3M': 63, '6M': 126, '1Y': 252, '5Y': 1260 };
  const MAX_POINTS = 420;

  // Slice/aggregate a {t,o,h,l,c} source into an array of points
  function slicePoints(src, count) {
    const n = src.c.length;
    count = Math.min(count, n);
    const start = n - count;
    const stride = Math.max(1, Math.ceil(count / MAX_POINTS));
    const ends = [];
    for (let e = n - 1; e >= start; e -= stride) ends.push(e);
    ends.reverse();
    return ends.map(e => {
      const s = Math.max(start, e - stride + 1);
      let h = -Infinity, l = Infinity;
      for (let i = s; i <= e; i++) { if (src.h[i] > h) h = src.h[i]; if (src.l[i] < l) l = src.l[i]; }
      return { t: src.t[e], o: src.o[s], h, l, c: src.c[e] };
    });
  }

  function countFor(tf, src, crypto) {
    const n = src.c.length;
    if (tf === 'MAX') return n;
    if (tf === 'YTD') {
      const jan1 = new Date(new Date().getFullYear(), 0, 1).getTime();
      let i = n - 1; while (i > 0 && src.t[i - 1] >= jan1) i--;
      return Math.max(2, n - i + 1);
    }
    const d = TF_DAYS[tf] || 252;
    return Math.round(crypto ? d * 365 / 252 : d) + 1;
  }

  const market = {
    tickers, FX,
    speed: store.get('dv.speed', 1),
    list() { return DEFS.map(d => tickers[d.sym]); },
    get(sym) { return tickers[sym]; },
    price(sym) { return tickers[sym].price; },
    change(sym) { const t = tickers[sym]; return t.price - t.prev; },
    changePct(sym) { const t = tickers[sym]; return (t.price / t.prev - 1) * 100; },
    fx(sym) { return FX[tickers[sym].cur] || 1; },
    series(sym, tf) {
      const tk = tickers[sym];
      if (tf === '1D' || tf === '5D') {
        const s = getIntra(tk, tf);
        return slicePoints(s, s.c.length);
      }
      const d = getDaily(tk);
      return slicePoints(d, countFor(tf, d, tk.type === 'crypto'));
    },
    stats(sym) {
      const tk = tickers[sym], d = getDaily(tk), n = d.c.length;
      const yr = tk.type === 'crypto' ? 365 : 252;
      let hi = -Infinity, lo = Infinity;
      for (let i = Math.max(0, n - yr); i < n; i++) { if (d.h[i] > hi) hi = d.h[i]; if (d.l[i] < lo) lo = d.l[i]; }
      const fx = FX[tk.cur] || 1;
      return {
        mcap: tk.price * tk.shares * fx,
        pe: tk.eps && tk.eps > 0 ? tk.price / tk.eps : null,
        hi52: hi, lo52: lo, avgVol: tk.avgVol, eps: tk.eps, float: tk.float,
        open: tk.open, dayHigh: tk.dayHigh, dayLow: tk.dayLow, prev: tk.prev,
        y1: d.c[n - 1] / d.c[Math.max(0, n - 1 - yr)] - 1,
      };
    },
    search(q) {
      q = (q || '').trim().toLowerCase().replace(/^\$/, '');
      const all = this.list();
      if (!q) return all;
      return all
        .map(t => {
          const s = t.sym.toLowerCase(), nm = t.name.toLowerCase();
          let score = 0;
          if (s === q) score = 100; else if (s.startsWith(q)) score = 80; else if (nm.startsWith(q)) score = 60;
          else if (s.includes(q)) score = 40; else if (nm.includes(q) || t.short.toLowerCase().includes(q)) score = 30;
          else if (t.sector.toLowerCase().includes(q)) score = 10;
          return { t, score };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.t);
    },
  };
  DV.market = market;

  /* ------------------------------------------------------------------ *
   * Options & volatility
   * ------------------------------------------------------------------ */
  function ncdf(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }
  function bs(kind, S, K, T, v, r = 0.04) {
    if (T <= 1e-6) {
      const intr = Math.max(0, kind === 'C' ? S - K : K - S);
      return { price: intr, delta: kind === 'C' ? (S > K ? 1 : 0) : (S < K ? -1 : 0) };
    }
    const sq = v * Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + v * v / 2) * T) / sq, d2 = d1 - sq;
    if (kind === 'C') return { price: S * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d2), delta: ncdf(d1) };
    return { price: K * Math.exp(-r * T) * ncdf(-d2) - S * ncdf(-d1), delta: ncdf(d1) - 1 };
  }

  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p;
    return (f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * p;
  }

  const TERM = [['1W', 7], ['2W', 14], ['1M', 30], ['2M', 60], ['3M', 91], ['6M', 182], ['9M', 273], ['1Y', 365]];

  const options = {
    ivAtm(sym, days) {
      const tk = tickers[sym], [base, evt, slow] = tk.iv;
      // a small, slowly drifting wiggle keeps the curves alive
      const w = 1 + 0.025 * Math.sin(Date.now() / 9000 + hashStr(sym) % 10) + 0.4 * Math.abs(Math.log(tk.price / tk.anchor));
      const d = Math.max(days, 1);
      return (base + evt * Math.exp(-(d - 7) / 6) + slow * Math.exp(-(d - 7) / 90)) * w;
    },
    iv(sym, K, days) {
      const tk = tickers[sym], atm = this.ivAtm(sym, days), m = Math.log(K / tk.price);
      const a = tk.type === 'crypto' ? 2 : 3.2, s = tk.type === 'crypto' ? -0.2 : 0.35;
      return Math.max(atm * 0.6, atm * (1 + a * m * m - s * m));
    },
    term(sym) { return TERM.map(([label, days]) => ({ label, days, iv: this.ivAtm(sym, days) })); },
    smile(sym, days = 30) {
      const S = tickers[sym].price, out = [];
      for (let i = 0; i <= 24; i++) { const K = S * (0.55 + 0.9 * i / 24); out.push({ k: K, iv: this.iv(sym, K, days) }); }
      return out;
    },
    expiries() {
      const out = [], d = new Date(); d.setHours(16, 0, 0, 0);
      const fri = new Date(d); fri.setDate(fri.getDate() + ((5 - fri.getDay() + 7) % 7 || 7));
      for (let i = 0; i < 4; i++) { const e = new Date(fri); e.setDate(e.getDate() + 7 * i); out.push(e.getTime()); }
      for (let m = 1; m <= 6; m++) {
        const e = new Date(d.getFullYear(), d.getMonth() + m, 1, 16);
        e.setDate(1 + ((5 - e.getDay() + 7) % 7) + 14);
        if (e.getTime() > out[out.length - 1]) out.push(e.getTime());
      }
      for (let y = 1; y <= 2; y++) { const e = new Date(d.getFullYear() + y, 0, 1, 16); e.setDate(1 + ((5 - e.getDay() + 7) % 7) + 14); out.push(e.getTime()); }
      return out.map(ts => ({ ts, days: Math.max(1, Math.round((ts - Date.now()) / 864e5)), label: fmt.shortDate(ts) + (new Date(ts).getFullYear() !== new Date().getFullYear() ? " '" + String(new Date(ts).getFullYear()).slice(2) : '') }));
    },
    strikes(sym) {
      const S = tickers[sym].price, step = niceStep(S * 0.025), out = [];
      const lo = Math.ceil(S * 0.78 / step) * step;
      for (let k = lo; k <= S * 1.22; k += step) out.push(+k.toFixed(6));
      return out;
    },
    quote(sym, kind, K, expTs) {
      const S = tickers[sym].price, days = Math.max(0, (expTs - Date.now()) / 864e5);
      const v = this.iv(sym, K, Math.max(days, 1));
      const r = bs(kind, S, K, days / 365, v);
      const mid = Math.max(0.01, r.price);
      const spr = Math.max(0.01, mid * 0.035);
      const rnd = mulberry32(hashStr(sym + kind + K + expTs));
      const near = Math.exp(-Math.pow(Math.log(K / S) * 8, 2));
      return {
        kind, K, exp: expTs, iv: v, delta: r.delta, mid,
        bid: Math.max(0.01, mid - spr), ask: mid + spr,
        vol: Math.round((50 + rnd() * 4000) * near), oi: Math.round((400 + rnd() * 20000) * (0.3 + near)),
      };
    },
    chain(sym, expTs) { return this.strikes(sym).map(K => ({ K, C: this.quote(sym, 'C', K, expTs), P: this.quote(sym, 'P', K, expTs) })); },
    label(o) { return `${o.sym} ${fmt.num(o.K, o.K % 1 ? 1 : 0)}${o.kind} ${fmt.shortDate(o.exp)}`; },
  };
  DV.options = options;

  /* ------------------------------------------------------------------ *
   * Account
   * ------------------------------------------------------------------ */
  const ACCT_KEY = 'dv.account.v3';
  const DAY = 864e5;

  function seedAlerts() {
    const now = Date.now();
    return [
      { id: uid(), title: 'US Federal Reserve announces 5 bps rate cuts', ts: now - 40 * 60e3, read: false, kind: 'macro' },
      { id: uid(), title: '$PTK surges 32% on 1.6T optical engine order', ts: now - 95 * 60e3, read: false, kind: 'move', sym: 'PTK' },
      { id: uid(), title: '$GSAT slides 16% as spectrum deal is delayed', ts: now - 3 * 3600e3, read: false, kind: 'move', sym: 'GSAT' },
      { id: uid(), title: '$RKLB Neutron completes full-duration static fire', ts: now - DAY, read: false, kind: 'news', sym: 'RKLB' },
      { id: uid(), title: '$BTCCAD crosses C$150,000 for the first time', ts: now - DAY - 5 * 3600e3, read: false, kind: 'move', sym: 'BTCCAD' },
      { id: uid(), title: '$NVDA to report Q3 earnings next month', ts: now - 2 * DAY, read: true, kind: 'news', sym: 'NVDA' },
      { id: uid(), title: '$LUNR awarded NASA lunar data relay task order', ts: now - 3 * DAY, read: true, kind: 'news', sym: 'LUNR' },
    ];
  }

  function defaultState() {
    return {
      cash: 12905.55, deposits: 110000, realized: 21832.55,
      positions: {
        BTCCAD: { qty: 0.92, avg: 61500 }, ETHUSD: { qty: 8.5, avg: 1780 },
        GSAT: { qty: 520, avg: 24.1 }, LUNR: { qty: 1500, avg: 7.2 }, RKLB: { qty: 300, avg: 16 },
        RCAT: { qty: 1200, avg: 4.85 }, NVDA: { qty: 200, avg: 92.4 }, PTK: { qty: 3000, avg: 3.1 },
        AAPL: { qty: 5, avg: 152.4 },
      },
      order: ['BTCCAD', 'ETHUSD', 'GSAT', 'LUNR', 'RKLB', 'RCAT', 'NVDA', 'PTK', 'AAPL'],
      options: [], orders: [], fills: [],
      alerts: seedAlerts(),
      watch: ['TSLA', 'PLTR', 'ASTS', 'AMD', 'SOFI'],
      dock: ['BTCCAD', 'GSAT', 'LUNR', 'RKLB', 'RCAT', 'NVDA', 'PTK'],
      drawings: {},
      rev: 0,
    };
  }

  const account = {
    state: null,
    load() {
      const s = store.get(ACCT_KEY, null);
      this.state = s && s.positions ? Object.assign(defaultState(), s) : defaultState();
    },
    save(silent) {
      this.state.rev = (this.state.rev || 0) + 1;
      this.state.savedBy = sync.id;
      store.set(ACCT_KEY, this.state);
      sync.post({ type: 'acct', state: this.state });
      if (!silent) DV.emit('account', this.state);
    },
    reset() { this.state = defaultState(); this.save(); },
    snapshot() { return JSON.parse(JSON.stringify(this.state)); },
    restore(snap) { this.state = snap; this.save(); },

    pos(sym) { const p = this.state.positions[sym]; return p && p.qty > 1e-9 ? p : null; },
    holdings() {
      const seen = new Set(), out = [];
      (this.state.order || []).concat(Object.keys(this.state.positions)).forEach(s => {
        if (!seen.has(s) && this.pos(s) && tickers[s]) { seen.add(s); out.push(s); }
      });
      return out;
    },
    value(sym) { const p = this.pos(sym); return p ? p.qty * tickers[sym].price * market.fx(sym) : 0; },
    cost(sym) { const p = this.pos(sym); return p ? p.qty * p.avg * market.fx(sym) : 0; },
    pnl(sym) {
      const p = this.pos(sym);
      if (!p) return { pnl: 0, pct: 0 };
      const v = this.value(sym), c = this.cost(sym);
      return { pnl: v - c, pct: c ? (v / c - 1) * 100 : 0 };
    },
    dayPnl(sym) {
      const p = this.pos(sym);
      if (!p) return { pnl: 0, pct: 0 };
      const tk = tickers[sym];
      return { pnl: p.qty * (tk.price - tk.prev) * market.fx(sym), pct: (tk.price / tk.prev - 1) * 100 };
    },
    optionValue(o) { return options.quote(o.sym, o.kind, o.K, o.exp).mid * 100 * o.qty; },
    optionsValue() { return this.state.options.reduce((a, o) => a + this.optionValue(o), 0); },
    invested() { return this.holdings().reduce((a, s) => a + this.value(s), 0); },
    equity() { return this.state.cash + this.invested() + this.optionsValue(); },
    allTime() { const e = this.equity(), d = this.state.deposits; return { pnl: e - d, pct: (e / d - 1) * 100 }; },
    dayTotal() {
      const pnl = this.holdings().reduce((a, s) => a + this.dayPnl(s).pnl, 0);
      const e = this.equity();
      return { pnl, pct: pnl / (e - pnl) * 100 };
    },
    buyingPower() { return this.state.cash; },

    addAlert(a, quiet) {
      const al = Object.assign({ id: uid(), ts: Date.now(), read: false, kind: 'info' }, a);
      this.state.alerts.unshift(al);
      this.state.alerts = this.state.alerts.slice(0, 60);
      if (!quiet) { this.save(); DV.emit('alert', al); }
      return al;
    },
    unread() { return this.state.alerts.filter(a => !a.read).length; },
    markRead(id) { this.state.alerts.forEach(a => { if (!id || a.id === id) a.read = true; }); this.save(); },
    dismissAlert(id) { this.state.alerts = this.state.alerts.filter(a => a.id !== id); this.save(); },

    toggleWatch(sym) {
      const w = this.state.watch, i = w.indexOf(sym);
      if (i >= 0) w.splice(i, 1); else w.unshift(sym);
      this.save();
      return i < 0;
    },

    // ---- trading ----
    _fill(sym, side, qty, px, note) {
      const st = this.state, fx = market.fx(sym), p = st.positions[sym] || { qty: 0, avg: 0 };
      if (side === 'buy') {
        p.avg = (p.qty * p.avg + qty * px) / (p.qty + qty);
        p.qty += qty;
        st.cash -= qty * px * fx;
        if (!st.order.includes(sym)) st.order.push(sym);
      } else {
        const realized = (px - p.avg) * qty * fx;
        st.realized += realized;
        p.qty -= qty;
        st.cash += qty * px * fx;
        if (p.qty < 1e-9) { p.qty = 0; p.avg = 0; }
      }
      st.positions[sym] = p;
      st.fills.unshift({ id: uid(), sym, side, qty, px, ts: Date.now(), note: note || '' });
      st.fills = st.fills.slice(0, 200);
      return { sym, side, qty, px };
    },
    placeOrder(o) {
      const tk = tickers[o.sym];
      const qty = +o.qty, type = o.type || 'market';
      if (!tk) return { ok: false, msg: 'Unknown symbol' };
      if (!(qty > 0)) return { ok: false, msg: 'Enter a quantity greater than zero' };
      if (tk.type !== 'crypto' && !Number.isInteger(qty)) return { ok: false, msg: 'Stocks trade in whole shares' };
      const held = this.pos(o.sym) ? this.pos(o.sym).qty : 0;
      if (o.side === 'sell' && qty > held + 1e-9) return { ok: false, msg: held ? `You only hold ${fmt.qty(held)} ${o.sym}` : `No ${o.sym} position to sell` };
      const refPx = type === 'market' ? tk.price : +o.price;
      if (!(refPx > 0)) return { ok: false, msg: 'Enter a valid price' };
      if (o.side === 'buy' && qty * refPx * market.fx(o.sym) > this.state.cash + 1e-6)
        return { ok: false, msg: 'Insufficient buying power (' + fmt.money(this.state.cash, 2) + ')' };
      if (type === 'market') {
        const f = this._fill(o.sym, o.side, qty, tk.price);
        this.addAlert({ title: `Order filled: ${o.side.toUpperCase()} ${fmt.qty(qty)} $${o.sym} @ ${fmt.price(tk.price)}`, kind: 'fill', sym: o.sym, read: true }, true);
        this.save();
        DV.emit('fill', f);
        return { ok: true, filled: true, fill: f, msg: `${o.side === 'buy' ? 'Bought' : 'Sold'} ${fmt.qty(qty)} ${o.sym} @ $${fmt.price(tk.price)}` };
      }
      const ord = { id: uid(), sym: o.sym, side: o.side, type, qty, price: refPx, ts: Date.now() };
      this.state.orders.push(ord);
      this.save();
      return { ok: true, filled: false, order: ord, msg: `${type === 'limit' ? 'Limit' : 'Stop'} ${o.side} ${fmt.qty(qty)} ${o.sym} @ $${fmt.price(refPx)} working` };
    },
    cancelOrder(id) { this.state.orders = this.state.orders.filter(o => o.id !== id); this.save(); },
    moveOrder(id, price) { const o = this.state.orders.find(x => x.id === id); if (o) { o.price = price; this.save(); } },
    checkOrders() {
      const st = this.state; let changed = false;
      st.orders = st.orders.filter(o => {
        const px = tickers[o.sym].price;
        const hit = o.type === 'limit' ? (o.side === 'buy' ? px <= o.price : px >= o.price)
          : (o.side === 'buy' ? px >= o.price : px <= o.price);
        if (!hit) return true;
        const held = this.pos(o.sym) ? this.pos(o.sym).qty : 0;
        if (o.side === 'sell' && o.qty > held + 1e-9) return false;
        if (o.side === 'buy' && o.qty * px * market.fx(o.sym) > st.cash) return false;
        const f = this._fill(o.sym, o.side, o.qty, px, o.type);
        this.addAlert({ title: `${o.type === 'limit' ? 'Limit' : 'Stop'} order filled: ${o.side.toUpperCase()} ${fmt.qty(o.qty)} $${o.sym} @ ${fmt.price(px)}`, kind: 'fill', sym: o.sym }, true);
        DV.emit('fill', f);
        changed = true;
        return false;
      });
      if (changed) this.save();
    },
    // mode: 'losing' | 'winning' | 'all'; sym limits it to one ticker
    previewClose(mode, sym) {
      return this.holdings()
        .filter(s => !sym || s === sym)
        .map(s => ({ sym: s, qty: this.pos(s).qty, ...this.pnl(s) }))
        .filter(x => mode === 'all' || (mode === 'losing' ? x.pnl < 0 : x.pnl > 0));
    },
    closePositions(mode, sym) {
      const list = this.previewClose(mode, sym);
      if (!list.length) return { count: 0, pnl: 0 };
      const snap = this.snapshot();
      let pnl = 0;
      list.forEach(x => { pnl += x.pnl; this._fill(x.sym, 'sell', x.qty, tickers[x.sym].price, 'close-' + mode); });
      this.addAlert({ title: `Closed ${list.length} ${mode === 'all' ? '' : mode + ' '}position${list.length > 1 ? 's' : ''} (${fmt.smoney(pnl, 2)})`, kind: 'fill', read: true }, true);
      this.save();
      return { count: list.length, pnl, snap, syms: list.map(x => x.sym) };
    },
    tradeOption(o) {
      // o: {sym, kind, K, exp, qty, side}
      const q = options.quote(o.sym, o.kind, o.K, o.exp);
      const st = this.state;
      if (o.side === 'buy') {
        const cost = q.ask * 100 * o.qty;
        if (cost > st.cash) return { ok: false, msg: 'Insufficient buying power (' + fmt.money(st.cash, 2) + ')' };
        st.cash -= cost;
        const ex = st.options.find(x => x.sym === o.sym && x.kind === o.kind && x.K === o.K && x.exp === o.exp);
        if (ex) { ex.avg = (ex.avg * ex.qty + q.ask * o.qty) / (ex.qty + o.qty); ex.qty += o.qty; }
        else st.options.push({ id: uid(), sym: o.sym, kind: o.kind, K: o.K, exp: o.exp, qty: o.qty, avg: q.ask });
        st.fills.unshift({ id: uid(), sym: o.sym, side: 'buy', qty: o.qty, px: q.ask, ts: Date.now(), note: options.label(o) });
        this.save();
        return { ok: true, msg: `Bought ${o.qty} ${options.label(o)} @ $${fmt.num(q.ask)}` };
      }
      const ex = st.options.find(x => x.id === o.id) || st.options.find(x => x.sym === o.sym && x.kind === o.kind && x.K === o.K && x.exp === o.exp);
      if (!ex) return { ok: false, msg: 'No contracts to sell' };
      const n = Math.min(o.qty, ex.qty);
      st.cash += q.bid * 100 * n;
      st.realized += (q.bid - ex.avg) * 100 * n;
      ex.qty -= n;
      if (ex.qty <= 0) st.options = st.options.filter(x => x !== ex);
      this.save();
      return { ok: true, msg: `Sold ${n} ${options.label(ex)} @ $${fmt.num(q.bid)}` };
    },
  };
  DV.account = account;

  /* ------------------------------------------------------------------ *
   * Portfolio value history (anchored to the live equity)
   * ------------------------------------------------------------------ */
  const PORT_SHAPE = [[0, 112], [0.1, 113], [0.2, 114.5], [0.3, 113.8], [0.4, 116], [0.5, 118], [0.55, 121], [0.6, 124], [0.66, 130], [0.7, 136], [0.73, 145], [0.76, 158], [0.78, 166], [0.8, 180], [0.815, 201], [0.83, 205], [0.85, 196], [0.86, 176], [0.875, 171], [0.89, 192], [0.9, 182], [0.92, 200], [0.94, 206], [0.96, 214], [0.975, 231], [0.99, 238], [1, 250]];
  const portfolio = {
    _d: null, _i: {},
    daily() {
      if (this._d) return this._d;
      const n = Math.round(3.4 * 252), W = 252, i0 = n - 1 - W;
      const rnd = mulberry32(4242), t = dayTimes(n, false), c = new Array(n);
      const f = makeSpline(PORT_SHAPE), k = account.equity() / 250;
      let x = 0;
      for (let i = i0; i < n; i++) { x = 0.75 * x + 0.006 * gauss(rnd); c[i] = f((i - i0) / W) * k * Math.exp(x); }
      for (let i = i0 - 1; i >= 0; i--) c[i] = c[i + 1] * Math.exp(-(0.0024 + 0.011 * gauss(rnd))) - (rnd() < 0.02 ? 1500 : 0);
      for (let i = 0; i < n; i++) c[i] = Math.max(c[i], 8000);
      const { o, h, l } = ohlcFrom(rnd, c, 0.008);
      this._d = { t, o, h, l, c };
      return this._d;
    },
    intra(tf) {
      if (this._i[tf]) return this._i[tf];
      const rnd = mulberry32(tf === '1D' ? 99 : 98), now = Date.now();
      const eq = account.equity(), day = account.dayTotal().pnl;
      let t = [], c;
      if (tf === '1D') {
        c = bridge(rnd, eq - day, eq, 78, 0.0012);
        for (let i = 0; i < 78; i++) t.push(now - (77 - i) * 5 * 60e3);
      } else {
        const d = this.daily(), n = d.c.length; c = [];
        for (let k = 4; k >= 0; k--) {
          const seg = bridge(rnd, d.c[n - 2 - k], k === 0 ? eq : d.c[n - 1 - k], 14, 0.003).slice(1);
          const end = k === 0 ? now : d.t[n - 1 - k];
          seg.forEach((v, j) => { t.push(end - (12 - j) * 30 * 60e3); c.push(v); });
        }
      }
      const { o, h, l } = ohlcFrom(rnd, c, 0.001, c[0]);
      this._i[tf] = { t, o, h, l, c, step: tf === '1D' ? 5 * 60e3 : 30 * 60e3 };
      return this._i[tf];
    },
    series(tf) {
      const eq = account.equity();
      const src = tf === '1D' || tf === '5D' ? this.intra(tf) : this.daily();
      const n = src.c.length;
      src.c[n - 1] = eq; src.h[n - 1] = Math.max(src.h[n - 1], eq); src.l[n - 1] = Math.min(src.l[n - 1], eq); src.t[n - 1] = Date.now();
      if (tf === '1D' || tf === '5D') return slicePoints(src, n);
      return slicePoints(src, countFor(tf, src, false));
    },
  };
  DV.portfolio = portfolio;

  /* ------------------------------------------------------------------ *
   * Cross-window sync (web + mobile share one market and account)
   * ------------------------------------------------------------------ */
  const sync = {
    id: uid(), started: Date.now(), followUntil: 0, leader: null,
    ch: typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('deltavision') : null,
    post(msg) { if (this.ch) { msg.from = this.id; msg.started = this.started; try { this.ch.postMessage(msg); } catch (e) { /* ignore */ } } },
    following() { return Date.now() < this.followUntil; },
  };
  DV.sync = sync;
  if (sync.ch) {
    sync.ch.onmessage = e => {
      const m = e.data || {};
      if (m.type === 'px') {
        const older = m.started < sync.started || (m.started === sync.started && m.from < sync.id);
        if (!older) return;
        sync.followUntil = Date.now() + 2500;
        Object.keys(m.prices).forEach(s => { if (tickers[s]) applyPrice(tickers[s], m.prices[s]); });
        DV.emit('tick', { follower: true });
      } else if (m.type === 'acct') {
        if (m.state && (m.state.rev !== account.state.rev || m.state.savedBy !== account.state.savedBy)) {
          account.state = Object.assign(defaultState(), m.state);
          DV.emit('account', account.state);
        }
      }
    };
  }
  window.addEventListener('storage', e => {
    if (e.key !== ACCT_KEY || !e.newValue) return;
    try {
      const s = JSON.parse(e.newValue);
      if (s.rev !== account.state.rev || s.savedBy !== account.state.savedBy) { account.state = Object.assign(defaultState(), s); DV.emit('account', account.state); }
    } catch (err) { /* ignore */ }
  });

  /* ------------------------------------------------------------------ *
   * Live simulation loop
   * ------------------------------------------------------------------ */
  function applyPrice(tk, px) {
    tk.price = px;
    tk.dayHigh = Math.max(tk.dayHigh, px);
    tk.dayLow = Math.min(tk.dayLow, px);
    const now = Date.now();
    if (tk._d) { const d = tk._d, n = d.c.length; d.c[n - 1] = px; d.h[n - 1] = tk.dayHigh; d.l[n - 1] = tk.dayLow; d.t[n - 1] = now; }
    if (tk._i) Object.keys(tk._i).forEach(tf => {
      const s = tk._i[tf], n = s.c.length;
      if (now - s.t[n - 1] >= s.step) {
        s.t.push(now); s.o.push(s.c[n - 1]); s.h.push(Math.max(px, s.c[n - 1])); s.l.push(Math.min(px, s.c[n - 1])); s.c.push(px);
        if (tf === '1D' && s.c.length > 400) ['t', 'o', 'h', 'l', 'c'].forEach(k => s[k].shift());
      } else {
        s.c[n - 1] = px; s.h[n - 1] = Math.max(s.h[n - 1], px); s.l[n - 1] = Math.min(s.l[n - 1], px); s.t[n - 1] = now;
      }
    });
  }

  let tickN = 0;
  const moveRef = {};
  function simulate() {
    tickN++;
    if (!sync.following()) {
      const sp = market.speed || 1, prices = {};
      market.list().forEach(tk => {
        const sig = tk.vol * Math.sqrt(30 * sp / 23400);
        const r = sig * gauss(Math.random) - 0.004 * sp * Math.log(tk.price / tk.anchor);
        applyPrice(tk, tk.price * Math.exp(r));
        prices[tk.sym] = tk.price;
      });
      sync.post({ type: 'px', prices });
      account.checkOrders();
      // movement alerts for holdings (leader only, rate limited)
      if (tickN % 5 === 0) {
        const now = Date.now();
        if (!moveRef.last || now - moveRef.last > 45000) {
          for (const s of account.holdings()) {
            const tk = tickers[s];
            const ref = moveRef[s] || (moveRef[s] = tk.price);
            const ch = (tk.price / ref - 1) * 100;
            if (Math.abs(ch) >= 1.5) {
              moveRef[s] = tk.price; moveRef.last = now;
              account.addAlert({ title: `$${s} ${ch > 0 ? 'up' : 'down'} ${fmt.pct(ch, 1)} in the last few minutes, now ${fmt.price(tk.price)}`, kind: 'move', sym: s });
              break;
            }
          }
        }
      }
    }
    DV.emit('tick', { n: tickN });
  }

  DV.setSpeed = sp => { market.speed = sp; store.set('dv.speed', sp); };

  DV.start = function () {
    if (DV._started) return;
    DV._started = true;
    setInterval(simulate, 1000);
    // heartbeat so launch.py knows a window is still open (ignored by other servers)
    if (/^https?:$/.test(location.protocol)) {
      const ping = () => fetch('/__ping', { cache: 'no-store' }).catch(() => {});
      ping(); setInterval(ping, 5000);
    }
  };

  account.load();

  /* ------------------------------------------------------------------ *
   * Toasts (shared tiny UI helper)
   * ------------------------------------------------------------------ */
  DV.toast = function (msg, opts = {}) {
    let host = document.querySelector('.dv-toasts');
    if (!host) {
      host = document.createElement('div');
      host.className = 'dv-toasts';
      (DV.toastRoot || document.body).appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'dv-toast ' + (opts.kind || '');
    el.innerHTML = `<span class="dv-toast-msg"></span>`;
    el.querySelector('.dv-toast-msg').textContent = msg;
    if (opts.action) {
      const b = document.createElement('button');
      b.textContent = opts.action.label;
      b.onclick = () => { opts.action.fn(); close(); };
      el.appendChild(b);
    }
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    let gone = false;
    function close() { if (gone) return; gone = true; el.classList.remove('in'); setTimeout(() => el.remove(), 300); }
    setTimeout(close, opts.ms || (opts.action ? 6000 : 3200));
    el.addEventListener('click', e => { if (e.target === el || e.target.classList.contains('dv-toast-msg')) close(); });
    return close;
  };

  // AI-style analysis text, generated from the simulated data
  DV.analysis = function (sym) {
    const tk = tickers[sym], st = market.stats(sym), iv = options.ivAtm(sym, 30);
    const score = clamp(tk.ai + (tk.price / tk.anchor - 1) * -2, 0.02, 0.98);
    const verdict = score < 0.34 ? 'BUY' : score < 0.62 ? 'HOLD' : 'SELL';
    const y1 = st.y1 * 100;
    const fromHi = (tk.price / st.hi52 - 1) * 100;
    const lines = [
      `${tk.short} is ${y1 >= 0 ? 'up' : 'down'} ${fmt.pct(y1, 1)} over the past year and trades ${fmt.pct(fromHi, 1)} ${fromHi >= 0 ? 'above' : 'below'} its 52-week high.`,
      `30-day implied volatility is ${fmt.num(iv * 100, 1)}%, ${iv > tk.iv[0] * 1.1 ? 'elevated versus its 1-year level — options are pricing a bigger move than usual' : 'close to its 1-year level'}.`,
      st.pe ? `At ${fmt.num(st.pe, 1)}× earnings, valuation looks ${st.pe > 40 ? 'stretched' : st.pe > 20 ? 'full but reasonable' : 'undemanding'} for the ${tk.sector.toLowerCase()} sector.` :
        tk.eps == null ? `As a ${tk.type === 'crypto' ? 'crypto asset' : 'fund'} it has no earnings, so momentum and flows dominate pricing.` :
          `The company is not yet profitable (EPS ${fmt.num(tk.eps)}), so the story rests on growth and backlog.`,
      `Today's move of ${fmt.spct(market.changePct(sym))} ${Math.abs(market.changePct(sym)) > 5 ? 'is unusually large; consider sizing down' : 'is within its normal range'}.`,
    ];
    return { score, verdict, lines };
  };
})();
