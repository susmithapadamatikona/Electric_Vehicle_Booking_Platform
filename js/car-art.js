/* ==========================================================================
   EVRide — car-art.js
   Generated vehicle artwork.

   WHY THIS EXISTS
   ---------------
   The catalogue previously pointed at hardcoded Unsplash photo IDs. An audit
   of all 24 showed only ~5 were the right car: four 404'd outright, and the
   rest returned something unrelated (a Fiat 500 for the Tata Nexon, a Camaro
   for the Tiago, a coach for the BYD e6 van, a Porsche 911 for the Taycan).
   Stock search cannot reliably return a specific EV model, so the catalogue
   now draws its own artwork instead: always correct in silhouette, always
   on-brand, no network, no licensing, ~3 KB each.

   Each category gets its own profile — an electric hatchback does not share
   a roofline with an SUV or a van — and each vehicle gets a deterministic
   colourway from its own id, so a given car always looks the same.
   ========================================================================== */

/* ------------------------------------------------------------------ */
/* Body profiles                                                       */
/* ------------------------------------------------------------------ */

/**
 * Every profile is drawn in a 720 x 300 co-ordinate space sitting on a
 * ground line at y=250. `body` is the main silhouette, `glass` the cabin
 * glazing, and `wheels` the axle centres with their radius.
 */
const PROFILES = {
    sedan: {
        body: 'M70 232 L74 196 Q78 172 104 164 L196 140 Q250 116 318 114 L416 114 Q486 116 540 140 L628 168 Q664 178 668 200 L670 232 Z',
        roof: 'M212 142 Q258 120 320 118 L412 118 Q472 120 520 142 L500 150 Q456 132 404 130 L326 130 Q272 132 232 150 Z',
        glass: [
            'M238 150 Q276 132 322 130 L352 130 L348 168 L228 168 Z',
            'M366 130 L404 130 Q454 132 494 150 L512 168 L370 168 Z'
        ],
        wheels: [{ x: 188, y: 232, r: 44 }, { x: 542, y: 232, r: 44 }],
        accentLine: 'M96 196 Q300 178 664 196',
        light: { x: 648, y: 190, w: 34, h: 16 }
    },

    suv: {
        body: 'M62 228 L64 176 Q66 150 96 142 L184 118 Q244 96 316 94 L428 94 Q498 96 552 118 L640 148 Q672 158 674 182 L676 228 Z',
        roof: 'M200 120 Q250 98 318 96 L424 96 Q488 98 536 120 L516 128 Q468 110 412 108 L328 108 Q268 110 220 128 Z',
        glass: [
            'M226 130 Q268 110 320 108 L354 108 L350 156 L214 156 Z',
            'M368 108 L410 108 Q464 110 508 130 L528 156 L372 156 Z'
        ],
        wheels: [{ x: 184, y: 228, r: 52 }, { x: 548, y: 228, r: 52 }],
        accentLine: 'M90 178 Q300 158 670 178',
        light: { x: 652, y: 168, w: 32, h: 18 }
    },

    hatchback: {
        body: 'M96 232 L98 194 Q100 170 124 162 L208 138 Q258 118 320 116 L400 116 Q452 120 492 148 L588 182 Q622 192 626 212 L628 232 Z',
        roof: 'M222 140 Q266 120 322 118 L396 118 Q444 122 480 148 L460 156 Q424 134 382 132 L332 132 Q282 134 242 152 Z',
        glass: [
            'M246 152 Q282 134 326 132 L354 132 L350 170 L238 170 Z',
            'M368 132 L390 132 Q432 136 466 158 L484 170 L372 170 Z'
        ],
        wheels: [{ x: 200, y: 232, r: 44 }, { x: 524, y: 232, r: 44 }],
        accentLine: 'M120 194 Q300 178 622 196',
        light: { x: 606, y: 190, w: 30, h: 15 }
    },

    compact: {
        body: 'M112 234 L114 198 Q116 176 138 168 L212 146 Q256 128 310 126 L378 126 Q424 130 458 154 L546 186 Q576 194 580 214 L582 234 Z',
        roof: 'M226 148 Q264 130 312 128 L374 128 Q416 132 448 154 L430 162 Q398 142 362 140 L320 140 Q278 142 244 158 Z',
        glass: [
            'M250 158 Q282 142 318 140 L344 140 L340 174 L242 174 Z',
            'M356 140 L370 140 Q406 144 436 162 L452 174 L358 174 Z'
        ],
        wheels: [{ x: 208, y: 234, r: 40 }, { x: 490, y: 234, r: 40 }],
        accentLine: 'M134 198 Q300 184 576 214',
        light: { x: 562, y: 194, w: 28, h: 14 }
    },

    luxury: {
        body: 'M58 234 L62 194 Q66 168 96 160 L192 132 Q252 106 326 104 L432 104 Q508 106 566 132 L656 164 Q690 176 694 200 L696 234 Z',
        roof: 'M208 134 Q258 110 328 108 L428 108 Q494 110 546 134 L524 142 Q476 122 420 120 L336 120 Q278 122 230 142 Z',
        glass: [
            'M234 142 Q276 122 328 120 L360 120 L356 162 L222 162 Z',
            'M374 120 L418 120 Q472 122 518 142 L540 162 L378 162 Z'
        ],
        wheels: [{ x: 182, y: 234, r: 48 }, { x: 566, y: 234, r: 48 }],
        accentLine: 'M88 192 Q300 170 690 194',
        light: { x: 670, y: 184, w: 38, h: 16 }
    },

    performance: {
        body: 'M54 236 L58 206 Q62 186 88 178 L186 152 Q248 124 324 122 L436 122 Q512 126 568 152 L664 182 Q696 192 700 210 L702 236 Z',
        roof: 'M206 154 Q256 128 326 126 L432 126 Q498 130 550 154 L528 162 Q478 142 420 140 L338 140 Q280 142 228 162 Z',
        glass: [
            'M230 162 Q274 142 326 140 L358 140 L354 180 L218 180 Z',
            'M372 140 L418 140 Q474 142 520 162 L544 180 L376 180 Z'
        ],
        wheels: [{ x: 178, y: 236, r: 46 }, { x: 572, y: 236, r: 46 }],
        accentLine: 'M84 206 Q300 186 696 208',
        light: { x: 676, y: 198, w: 36, h: 14 }
    },

    van: {
        body: 'M56 224 L56 128 Q56 104 84 98 L200 76 Q262 66 336 66 L520 66 Q588 68 622 96 L664 134 Q680 148 680 172 L680 224 Z',
        roof: 'M180 80 Q248 68 336 68 L516 68 Q580 70 614 96 L594 102 Q556 82 500 80 L344 80 Q268 82 204 94 Z',
        glass: [
            'M196 96 Q252 84 330 82 L360 82 L356 144 L184 144 Z',
            'M374 82 L470 82 L470 144 L374 144 Z',
            'M488 84 Q552 88 590 108 L614 144 L488 144 Z'
        ],
        wheels: [{ x: 168, y: 224, r: 48 }, { x: 566, y: 224, r: 48 }],
        accentLine: 'M78 168 Q300 156 676 172',
        light: { x: 656, y: 152, w: 28, h: 20 }
    },

    premium: {
        body: 'M62 230 L66 186 Q70 162 98 154 L190 128 Q250 104 322 102 L428 102 Q500 104 556 128 L646 158 Q680 170 684 194 L686 230 Z',
        roof: 'M206 130 Q256 106 324 104 L424 104 Q488 106 538 130 L516 138 Q470 118 414 116 L332 116 Q276 118 228 138 Z',
        glass: [
            'M232 138 Q274 118 324 116 L356 116 L352 158 L220 158 Z',
            'M370 116 L412 116 Q466 118 510 138 L532 158 L374 158 Z'
        ],
        wheels: [{ x: 182, y: 230, r: 47 }, { x: 556, y: 230, r: 47 }],
        accentLine: 'M90 186 Q300 166 680 188',
        light: { x: 662, y: 178, w: 36, h: 16 }
    }
};

/* ------------------------------------------------------------------ */
/* Colourways                                                          */
/* ------------------------------------------------------------------ */

/** Paint options, chosen to sit well on the dark UI. */
const PAINTS = [
    { name: 'Pearl White',   top: '#F2F5F7', bot: '#BFC9D0', trim: '#8E9AA3' },
    { name: 'Midnight',      top: '#33424E', bot: '#131E27', trim: '#4C5F6D' },
    { name: 'Storm Grey',    top: '#8E9CA7', bot: '#4E5C68', trim: '#65737F' },
    { name: 'Deep Teal',     top: '#2E7D74', bot: '#12403E', trim: '#3E9A8E' },
    { name: 'Electric Blue', top: '#3D7FC1', bot: '#183E68', trim: '#5296D8' },
    { name: 'Graphite',      top: '#5A636C', bot: '#282E35', trim: '#727C86' },
    { name: 'Signal Red',    top: '#C0453E', bot: '#6D1F1D', trim: '#D85F55' },
    { name: 'Sand',          top: '#C6B18C', bot: '#7A6849', trim: '#D8C6A5' }
];

/** Stable hash so a given vehicle always gets the same paint. */
function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/* ------------------------------------------------------------------ */
/* Renderer                                                            */
/* ------------------------------------------------------------------ */

const CACHE = new Map();

function escXml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Build an SVG data URI for one vehicle.
 * @param {object} v         vehicle record (needs id, category, brand, name)
 * @param {object} [opts]    { width, showLabel }
 */
export function carArt(v, opts = {}) {
    const category = PROFILES[v.category] ? v.category : 'sedan';
    const key = `${v.id}|${category}|${opts.showLabel !== false}`;
    if (CACHE.has(key)) return CACHE.get(key);

    const p = PROFILES[category];
    const seed = hash(v.id || v.name || 'ev');
    const paint = PAINTS[seed % PAINTS.length];
    const uid = 'c' + (seed % 100000).toString(36);

    // Wheels: dark tyre, brand-green caliper hint, spoked rim.
    const wheels = p.wheels.map(w => `
        <g>
          <circle cx="${w.x}" cy="${w.y}" r="${w.r}" fill="#0A1015"/>
          <circle cx="${w.x}" cy="${w.y}" r="${w.r - 9}" fill="#1A242C"/>
          <circle cx="${w.x}" cy="${w.y}" r="${w.r - 18}" fill="#2B3A45"/>
          ${Array.from({ length: 6 }, (_, i) => {
              const a = (i * 60) * Math.PI / 180;
              const r1 = w.r - 20, r2 = w.r - 11;
              return `<line x1="${(w.x + Math.cos(a) * 4).toFixed(1)}" y1="${(w.y + Math.sin(a) * 4).toFixed(1)}"
                            x2="${(w.x + Math.cos(a) * r2).toFixed(1)}" y2="${(w.y + Math.sin(a) * r2).toFixed(1)}"
                            stroke="#465765" stroke-width="5" stroke-linecap="round"/>`;
          }).join('')}
          <circle cx="${w.x}" cy="${w.y}" r="5" fill="#60727F"/>
        </g>`).join('');

    const glass = p.glass.map(g =>
        `<path d="${g}" fill="url(#g${uid})" opacity=".92"/>`).join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 300" width="720" height="300" role="img" aria-label="${escXml(v.brand + ' ' + v.name)}">
  <defs>
    <linearGradient id="bg${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#13232C"/><stop offset="1" stop-color="#0A141B"/>
    </linearGradient>
    <linearGradient id="p${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${paint.top}"/>
      <stop offset=".55" stop-color="${paint.top}"/>
      <stop offset="1" stop-color="${paint.bot}"/>
    </linearGradient>
    <linearGradient id="g${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#20313C"/><stop offset="1" stop-color="#0E1A22"/>
    </linearGradient>
    <radialGradient id="glow${uid}" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#00E676" stop-opacity=".22"/>
      <stop offset="1" stop-color="#00E676" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="lamp${uid}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#EAFBF2"/><stop offset="1" stop-color="#7FE9C0"/>
    </linearGradient>
  </defs>

  <rect width="720" height="300" fill="url(#bg${uid})"/>

  <g opacity=".06" stroke="#00E676" stroke-width="1">
    ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 44}" x2="720" y2="${i * 44}"/>`).join('')}
    ${Array.from({ length: 13 }, (_, i) => `<line x1="${i * 60}" y1="0" x2="${i * 60}" y2="300"/>`).join('')}
  </g>

  <ellipse cx="370" cy="250" rx="300" ry="70" fill="url(#glow${uid})"/>

  <!-- body -->
  <path d="${p.body}" fill="url(#p${uid})"/>
  <path d="${p.roof}" fill="${paint.trim}" opacity=".5"/>
  ${glass}
  <path d="${p.accentLine}" fill="none" stroke="${paint.trim}" stroke-width="2" opacity=".55"/>

  <!-- headlight -->
  <rect x="${p.light.x}" y="${p.light.y}" width="${p.light.w}" height="${p.light.h}"
        rx="${p.light.h / 2}" fill="url(#lamp${uid})" opacity=".95"/>

  ${wheels}

  <!-- ground line + reflection -->
  <rect x="40" y="272" width="640" height="2" rx="1" fill="#00E676" opacity=".16"/>
  <ellipse cx="370" cy="276" rx="250" ry="10" fill="#00E676" opacity=".07"/>

  ${opts.showLabel === false ? '' : `
  <text x="36" y="44" font-family="Inter, system-ui, sans-serif" font-size="17"
        font-weight="700" fill="#EAF2F6" opacity=".92">${escXml(v.brand)}</text>
  <text x="36" y="66" font-family="Inter, system-ui, sans-serif" font-size="13"
        fill="#8FA2AD" opacity=".9">${escXml(v.model || v.name)}</text>`}
</svg>`;

    const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' '));
    CACHE.set(key, uri);
    return uri;
}

export default carArt;
