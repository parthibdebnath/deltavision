/* DeltaVision artwork: ticker logos (round badges) and company illustrations,
 * all inline SVG so the apps work fully offline. */
(function () {
  'use strict';
  const DV = window.DV;

  const LOGOS = {
    AAPL: `<circle cx="20" cy="20" r="20" fill="#111"/><path fill="#fff" d="M25.9 21.1c0-2.8 2.3-4.1 2.4-4.2-1.3-1.9-3.3-2.2-4-2.2-1.7-.2-3.3 1-4.2 1-.9 0-2.2-1-3.6-.9-1.9 0-3.6 1.1-4.5 2.7-1.9 3.4-.5 8.4 1.4 11.1.9 1.3 2 2.8 3.4 2.8 1.4-.1 1.9-.9 3.6-.9 1.7 0 2.1.9 3.6.9s2.4-1.4 3.300-2.700c1-1.500 1.500-3 1.500-3.100 0 0-2.900-1.100-2.900-4.500zM23.200 12.800c.8-.9 1.300-2.200 1.100-3.400-1.100.1-2.400.7-3.200 1.700-.7.800-1.300 2.100-1.200 3.300 1.200.1 2.500-.6 3.300-1.600z"/>`,
    BTCCAD: `<circle cx="20" cy="20" r="20" fill="#f7931a"/><g transform="rotate(14 20 20)"><text x="20" y="27.5" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="22" fill="#fff">₿</text></g>`,
    ETHUSD: `<circle cx="20" cy="20" r="20" fill="#d6dbf3"/><path fill="#343434" d="M20 6.5l-.2.6v17.4l.2.2 8-4.7z"/><path fill="#8c8c8c" d="M20 6.5l-8 13.5 8 4.7z"/><path fill="#3c3c3b" d="M20 26.3l-.1.1v6.1l.1.3 8-11.3z"/><path fill="#8c8c8c" d="M20 32.8v-6.5l-8-4.8z"/><path fill="#141414" d="M20 24.7l8-4.7-8-3.6z"/><path fill="#393939" d="M12 20l8 4.7v-8.3z"/>`,
    SOLUSD: `<circle cx="20" cy="20" r="20" fill="#111"/><g fill="#14f195"><path d="M13 25.5h13.5l-3 3H10z"/><path d="M13 18.5h13.5l-3 3H10z" transform="translate(0 0) scale(1 1)"/><path d="M16 11.5h13.5l-3 3H13z"/></g>`,
    GSAT: `<circle cx="20" cy="20" r="20" fill="#1677d6"/><circle cx="16" cy="14" r="12" fill="#5ab4ff" opacity=".35"/><path d="M27 13.5a9.5 9.5 0 1 0 1.8 8.5H20" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/><ellipse cx="20" cy="20" rx="16" ry="5.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" transform="rotate(-25 20 20)"/>`,
    LUNR: `<circle cx="20" cy="20" r="20" fill="#1f63d6"/><rect x="16.5" y="8" width="7" height="17" rx="3.5" fill="#fff"/><path d="M15 24l-4 8M25 24l4 8M20 25v7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="20" cy="14" r="1.6" fill="#1f63d6"/>`,
    RKLB: `<circle cx="20" cy="20" r="20" fill="#0d0d0d"/><g fill="none" stroke="#fff" stroke-width="1.6"><ellipse cx="20" cy="20" rx="13" ry="5"/><ellipse cx="20" cy="20" rx="13" ry="5" transform="rotate(60 20 20)"/><ellipse cx="20" cy="20" rx="13" ry="5" transform="rotate(-60 20 20)"/></g><circle cx="20" cy="20" r="2.6" fill="#fff"/>`,
    RCAT: `<circle cx="20" cy="20" r="20" fill="#fff"/><path fill="#e0262b" d="M9 10l7 5h8l7-5-1.5 12c0 6-4.5 10-9.5 10S10.5 28 10.5 22z"/><path fill="#fff" d="M13.5 20.5l5 2-4.2 1.4zM26.5 20.5l-5 2 4.2 1.4z"/><path fill="#7a0d10" d="M18.5 27h3l-1.5 1.6z"/>`,
    NVDA: `<circle cx="20" cy="20" r="20" fill="#0b0b0b"/><path fill="#76b900" d="M16.2 14.6v-2.2c.2 0 .5 0 .7 0 6.200-.2 10.300 5.300 10.300 5.300s-4.400 6.100-9.100 6.100c-.7 0-1.300-.1-1.900-.3v-6.700c2.400.3 2.900 1.300 4.300 3.700l3.200-2.700s-2.300-3.100-6.300-3.100c-.4 0-.8 0-1.200.1zm0-7.300v3.300l.7-.1c8.600-.3 14.200 7.100 14.200 7.100s-6.400 7.800-13.100 7.800c-.6 0-1.200-.1-1.800-.2v2.100c.5.1 1 .1 1.500.1 6.200 0 10.700-3.200 15.100-6.900.7.600 3.700 2 4.300 2.600-4.100 3.500-13.800 6.300-19.300 6.300-.5 0-1 0-1.500-.1v2.900H40V7.300zm0 16.200v1.800c-5.800-1-7.400-7.100-7.400-7.100s2.800-3.100 7.400-3.600v2c-2.400-.3-4.300 2-4.300 2s1.100 3.900 4.300 4.900zM6 17.900s3.400-5 10.200-5.500v-1.800C8.700 11.200 2.200 17.600 2.200 17.600s3.700 10.700 14 11.700v-2c-7.600-1-10.200-9.400-10.200-9.400z" transform="translate(2 1) scale(.86)"/>`,
    PTK: `<circle cx="20" cy="20" r="20" fill="#fff"/><path fill="#2c8de0" d="M9 13l11 9 11-9v14H9z"/><path fill="#7cc4ff" d="M9 13h22l-11 9z"/><path d="M12 25l5-4M28 25l-5-4" stroke="#fff" stroke-width="1.2"/>`,
    TSLA: `<circle cx="20" cy="20" r="20" fill="#cc0000"/><path fill="#fff" d="M20 31l3.200-17.700c3 0 4 .300 4.100 3.100 0 0 2-.700 3-2.300-4-1.800-8-1.900-8-1.900L20 15.300l-2.300-3.100s-4 .100-8 1.900c1 1.600 3 2.300 3 2.300.1-2.800 1.100-3.100 4.100-3.100zM20 11.100c3.200 0 6.900.5 10.700 2.100.5-.9.6-1.300.6-1.300-4.100-1.600-8-2.200-11.300-2.200s-7.200.6-11.300 2.200c0 0 .2.500.6 1.300 3.800-1.600 7.500-2.100 10.700-2.100z"/>`,
    MSFT: `<circle cx="20" cy="20" r="20" fill="#f3f3f3"/><rect x="10.5" y="10.5" width="8.8" height="8.8" fill="#f25022"/><rect x="20.7" y="10.5" width="8.8" height="8.8" fill="#7fba00"/><rect x="10.5" y="20.7" width="8.8" height="8.8" fill="#00a4ef"/><rect x="20.7" y="20.7" width="8.8" height="8.8" fill="#ffb900"/>`,
    AMD: `<circle cx="20" cy="20" r="20" fill="#000"/><path fill="#fff" d="M12 12h16v16l-5-5V17h-6zM12 17l5 5v6h-5z"/>`,
    PLTR: `<circle cx="20" cy="20" r="20" fill="#101113"/><circle cx="20" cy="17" r="6.5" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M11 26l9 4 9-4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>`,
  };
  const GENERIC = { AMZN: '#ff9900', GOOGL: '#4285f4', META: '#0866ff', ASTS: '#1b2a4a', SOFI: '#00a2c7', SPY: '#9b1c31' };

  DV.logo = function (sym, size = 36) {
    let body = LOGOS[sym];
    if (!body) {
      const bg = GENERIC[sym] || '#333';
      const txt = sym.replace(/USD|CAD/, '').slice(0, sym.length > 3 ? 2 : 3);
      body = `<circle cx="20" cy="20" r="20" fill="${bg}"/><text x="20" y="25" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="${txt.length > 2 ? 11 : 13}" fill="#fff">${txt}</text>`;
    }
    return `<svg class="dv-logo" width="${size}" height="${size}" viewBox="0 0 40 40" aria-label="${sym}">${body}</svg>`;
  };

  DV.portfolioIcon = function (size = 36) {
    return `<svg class="dv-logo" width="${size}" height="${size}" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#1b1b1b"/><g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 29h20"/><path d="M12 25l5-6 4 3 7-9"/><path d="M24 13h4v4"/></g><g fill="#fff" opacity=".85"><rect x="12" y="26" width="2" height="2"/><rect x="17" y="24" width="2" height="4"/><rect x="22" y="25" width="2" height="3"/></g></svg>`;
  };

  /* ---------- illustrations (viewBox 0 0 280 186) ---------- */
  const ART = {
    rocket: () => `
      <defs>
        <linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f5fae"/><stop offset=".6" stop-color="#5d9bd6"/><stop offset="1" stop-color="#b9d8f2"/></linearGradient>
        <radialGradient id="rf" cx=".5" cy=".2" r=".8"><stop offset="0" stop-color="#fff7d6"/><stop offset=".4" stop-color="#ffb347"/><stop offset="1" stop-color="#ff6a00" stop-opacity="0"/></radialGradient>
        <filter id="rb"><feGaussianBlur stdDeviation="3"/></filter>
        <filter id="rb2"><feGaussianBlur stdDeviation="1.2"/></filter>
      </defs>
      <rect width="280" height="186" fill="url(#rs)"/>
      <g fill="#fff" opacity=".55" filter="url(#rb)"><path d="M170 60c20-10 50-6 70 4 10 5 25 2 40 6v20c-30-6-60 2-90-6-12-3-26-10-20-24z"/><path d="M190 40c15 0 30 8 40 18-14-4-30-2-42-8z"/></g>
      <g filter="url(#rb2)" fill="#fff"><path d="M120 150c10-12 22-10 26-30 6 22 16 20 26 30 18 0 34 10 40 36H70c4-22 26-36 50-36z"/><ellipse cx="62" cy="176" rx="60" ry="22"/><ellipse cx="230" cy="178" rx="70" ry="24"/><ellipse cx="146" cy="168" rx="50" ry="22" fill="#f4f8fc"/></g>
      <path d="M146 124c-3 10-6 22-4 40h8c2-18-1-30-4-40z" fill="url(#rf)"/>
      <ellipse cx="146" cy="128" rx="5" ry="9" fill="url(#rf)"/>
      <g>
        <path d="M141 40c0-14 2.500-24 5-30 2.500 6 5 16 5 30v82h-10z" fill="#f4f4f4"/>
        <rect x="141" y="40" width="10" height="10" fill="#141414"/>
        <rect x="141" y="66" width="10" height="34" fill="#151515"/>
        <rect x="141" y="104" width="10" height="18" fill="#1d1d1d"/>
        <path d="M141 112l-5 12h5zM151 112l5 12h-5z" fill="#141414"/>
        <rect x="143" y="70" width="2" height="26" fill="#fff" opacity=".18"/>
      </g>
      <g stroke="#2a2a2a" stroke-width="1.4" opacity=".75"><path d="M222 186v-36h8v36M222 158h8M222 168h8M222 178h8M222 150l8 8M230 150l-8 8"/></g>`,
    apple: () => `
      <defs><linearGradient id="ag" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a1d24"/><stop offset="1" stop-color="#3a3f4b"/></linearGradient>
      <linearGradient id="as" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b7cff"/><stop offset=".5" stop-color="#c26bff"/><stop offset="1" stop-color="#ff8a6b"/></linearGradient></defs>
      <rect width="280" height="186" fill="url(#ag)"/>
      <circle cx="210" cy="40" r="80" fill="#6b7cff" opacity=".12"/>
      <g transform="translate(96 18) rotate(-8)"><rect width="78" height="156" rx="16" fill="#0d0e12" stroke="#8a8f9c" stroke-width="2"/><rect x="6" y="6" width="66" height="144" rx="11" fill="url(#as)"/><rect x="28" y="12" width="22" height="7" rx="3.5" fill="#000"/></g>
      <g transform="translate(176 46) rotate(10)"><rect width="66" height="132" rx="14" fill="#c9ccd3"/><rect x="8" y="8" width="26" height="26" rx="8" fill="#26282e"/><circle cx="16" cy="16" r="5" fill="#0b0c10" stroke="#555" /><circle cx="26" cy="26" r="5" fill="#0b0c10" stroke="#555"/></g>`,
    chip: () => `
      <defs><radialGradient id="cg" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#16300a"/><stop offset="1" stop-color="#050805"/></radialGradient></defs>
      <rect width="280" height="186" fill="url(#cg)"/>
      <g stroke="#76b900" stroke-width="1.2" opacity=".55" fill="none">
        <path d="M0 40h70l20 20h20M0 140h60l20-20h30M280 50h-60l-20 20h-30M280 150h-70l-15-15h-25M140 0v40M120 0v30l10 10M160 186v-40M180 186v-30l-10-10"/>
      </g>
      <g fill="#76b900"><circle cx="110" cy="60" r="2.5"/><circle cx="110" cy="120" r="2.5"/><circle cx="170" cy="70" r="2.5"/><circle cx="170" cy="135" r="2.5"/></g>
      <g transform="translate(100 53)">
        <rect width="80" height="80" rx="6" fill="#1b1f1b" stroke="#76b900" stroke-width="1.5"/>
        <rect x="14" y="14" width="52" height="52" rx="4" fill="#0e110e"/>
        <rect x="14" y="14" width="52" height="52" rx="4" fill="none" stroke="#9bff3a" stroke-opacity=".7"/>
        <text x="40" y="45" text-anchor="middle" font-family="Inter, Arial" font-weight="800" font-size="11" fill="#9bff3a">GPU</text>
        <g fill="#8a8f86">${Array.from({ length: 7 }, (_, i) => `<rect x="${8 + i * 10}" y="-6" width="4" height="6"/><rect x="${8 + i * 10}" y="80" width="4" height="6"/><rect x="-6" y="${8 + i * 10}" width="6" height="4"/><rect x="80" y="${8 + i * 10}" width="6" height="4"/>`).join('')}</g>
      </g>`,
    satellite: () => `
      <defs><radialGradient id="eg" cx=".5" cy="1.6" r="1.7"><stop offset=".55" stop-color="#1b5fa8"/><stop offset=".62" stop-color="#5fb0ff"/><stop offset=".66" stop-color="#9fd4ff" stop-opacity=".6"/><stop offset=".72" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
      <rect width="280" height="186" fill="#03050d"/>
      ${stars(40, 7)}
      <rect width="280" height="186" fill="url(#eg)"/>
      <g transform="translate(140 74) rotate(-18)">
        <rect x="-74" y="-9" width="52" height="18" fill="#1d3f8a" stroke="#9cc4ff" stroke-width=".8"/>
        <rect x="22" y="-9" width="52" height="18" fill="#1d3f8a" stroke="#9cc4ff" stroke-width=".8"/>
        <g stroke="#9cc4ff" stroke-width=".5" opacity=".6"><path d="M-61-9v18M-48-9v18M-35-9v18M35-9v18M48-9v18M61-9v18"/></g>
        <rect x="-22" y="-2" width="44" height="4" fill="#bbb"/>
        <rect x="-12" y="-14" width="24" height="28" rx="3" fill="#d9a441"/>
        <path d="M0 14v10M-8 28h16" stroke="#ddd" stroke-width="2"/>
      </g>`,
    lander: () => `
      <rect width="280" height="186" fill="#05060a"/>
      ${stars(50, 11)}
      <circle cx="226" cy="40" r="20" fill="#3b7bd8"/><path d="M212 34c6-4 10 2 16-2 4 4-2 10 6 14-6 6-14 2-22-4z" fill="#5fae5f" opacity=".85"/><circle cx="226" cy="40" r="20" fill="none" stroke="#9fd0ff" stroke-opacity=".6"/>
      <path d="M0 140c40-10 80-6 120-12s100 4 160 0v58H0z" fill="#8d8f96"/>
      <path d="M0 156c60-8 120 0 180-6s70 4 100 2v34H0z" fill="#a7a9b0"/>
      <g fill="#7c7e85"><ellipse cx="50" cy="164" rx="16" ry="4"/><ellipse cx="210" cy="170" rx="22" ry="5"/><ellipse cx="130" cy="176" rx="10" ry="3"/></g>
      <g transform="translate(118 78)">
        <path d="M6 44L-6 66M38 44l12 22M22 46v20" stroke="#cfd2d8" stroke-width="2.5"/>
        <path d="M-10 66h8M46 66h8M18 66h8" stroke="#cfd2d8" stroke-width="3"/>
        <polygon points="4,4 40,4 46,24 40,46 4,46 -2,24" fill="#e8e3d6" stroke="#9a9488"/>
        <rect x="10" y="12" width="24" height="12" fill="#1f63d6"/>
        <rect x="10" y="28" width="24" height="10" fill="#c9a34a"/>
        <path d="M22 4v-12M18-8h8" stroke="#ccc" stroke-width="1.6"/>
      </g>`,
    drone: () => `
      <defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c1b3d"/><stop offset=".55" stop-color="#d0643a"/><stop offset="1" stop-color="#f5b26b"/></linearGradient></defs>
      <rect width="280" height="186" fill="url(#dg)"/>
      <circle cx="200" cy="120" r="26" fill="#ffd38a" opacity=".85"/>
      <path d="M0 150l40-26 30 14 40-30 50 34 40-20 50 26 30-10v48H0z" fill="#3a1f1c"/>
      <path d="M0 168l60-14 50 10 60-12 60 12 50-6v28H0z" fill="#1f1212"/>
      <g transform="translate(122 62)">
        <g stroke="#111" stroke-width="3" stroke-linecap="round"><path d="M0 0l-30-16M36 0l30-16M0 18l-30 16M36 18l30 16"/></g>
        <g fill="#111" opacity=".85"><ellipse cx="-34" cy="-18" rx="18" ry="2.5"/><ellipse cx="70" cy="-18" rx="18" ry="2.5"/><ellipse cx="-34" cy="36" rx="18" ry="2.5"/><ellipse cx="70" cy="36" rx="18" ry="2.5"/></g>
        <rect x="-4" y="-4" width="44" height="26" rx="8" fill="#1a1a1a"/>
        <circle cx="18" cy="26" r="6" fill="#0a0a0a" stroke="#e0262b" stroke-width="1.5"/>
        <circle cx="30" cy="4" r="1.6" fill="#e0262b"/>
      </g>`,
    photonics: () => `
      <defs><radialGradient id="pg" cx=".5" cy=".5" r=".75"><stop offset="0" stop-color="#1b2f6b"/><stop offset="1" stop-color="#070a1a"/></radialGradient>
      <linearGradient id="pb" x1="0" x2="1"><stop offset="0" stop-color="#7cc4ff" stop-opacity="0"/><stop offset=".5" stop-color="#bfe6ff"/><stop offset="1" stop-color="#7cc4ff" stop-opacity="0"/></linearGradient></defs>
      <rect width="280" height="186" fill="url(#pg)"/>
      <circle cx="140" cy="93" r="72" fill="#1d2a52" stroke="#7aa8ff" stroke-opacity=".6"/>
      <g stroke="#7aa8ff" stroke-opacity=".25">${Array.from({ length: 11 }, (_, i) => `<path d="M${76 + i * 12.8} 30v126M76 ${30 + i * 12.6}h128"/>`).join('')}</g>
      <rect x="114" y="68" width="52" height="50" rx="4" fill="#2c8de0" opacity=".85"/>
      <rect x="0" y="88" width="280" height="3" fill="url(#pb)"/><rect x="0" y="100" width="280" height="2" fill="url(#pb)" opacity=".7"/><rect x="0" y="78" width="280" height="1.5" fill="url(#pb)" opacity=".5"/>`,
    crypto: (tk) => {
      const c = tk.coin || '#f7931a';
      return `
      <defs><radialGradient id="kg" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".25" stop-color="${c}"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient></defs>
      <rect width="280" height="186" fill="#090b12"/>
      <g stroke="${c}" stroke-opacity=".35">${net(15)}</g>
      <circle cx="140" cy="93" r="58" fill="${c}"/><circle cx="140" cy="93" r="58" fill="url(#kg)"/>
      <circle cx="140" cy="93" r="48" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
      <g transform="translate(120 73) scale(1)">${(LOGOS[tk.sym] || '').replace(/<circle[^>]*\/>/, '')}</g>`;
    },
    city: (tk) => `
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1b2e"/><stop offset="1" stop-color="#3a4f74"/></linearGradient></defs>
      <rect width="280" height="186" fill="url(#sg)"/>
      ${stars(25, hash(tk.sym))}
      <g fill="#0a1020">${skyline(hash(tk.sym))}</g>
      <g transform="translate(116 30)">${DV.logo(tk.sym, 48).replace(/^<svg[^>]*>/, '<svg width="48" height="48" viewBox="0 0 40 40">')}</g>`,
  };

  function hash(s) { return DV.util.hashStr(s) % 1000; }
  function stars(n, seed) {
    const r = DV.util.mulberry32(seed);
    let s = '';
    for (let i = 0; i < n; i++) s += `<circle cx="${(r() * 280).toFixed(1)}" cy="${(r() * 120).toFixed(1)}" r="${(r() * 1.1 + 0.2).toFixed(2)}" fill="#fff" opacity="${(r() * 0.7 + 0.2).toFixed(2)}"/>`;
    return s;
  }
  function net(seed) {
    const r = DV.util.mulberry32(seed), p = Array.from({ length: 14 }, () => [r() * 280, r() * 186]);
    let s = '';
    p.forEach((a, i) => p.slice(i + 1).forEach(b => { if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 90) s += `<path d="M${a[0].toFixed(0)} ${a[1].toFixed(0)}L${b[0].toFixed(0)} ${b[1].toFixed(0)}"/>`; }));
    return s;
  }
  function skyline(seed) {
    const r = DV.util.mulberry32(seed);
    let s = '', x = 0;
    while (x < 280) {
      const w = 14 + r() * 26, h = 40 + r() * 90;
      s += `<rect x="${x.toFixed(0)}" y="${(186 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}"/>`;
      for (let k = 0; k < 6; k++) if (r() < 0.5) s += `<rect x="${(x + 3 + r() * (w - 6)).toFixed(0)}" y="${(186 - h + 6 + r() * (h - 12)).toFixed(0)}" width="2" height="3" fill="#ffd27a" opacity=".7"/>`;
      x += w + 2;
    }
    return s;
  }

  DV.art = function (sym) {
    const tk = DV.market.get(sym);
    const fn = ART[tk.art] || ART.city;
    return `<svg viewBox="0 0 280 186" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">${fn(tk)}</svg>`;
  };
})();
