/* ==========================================================================
   EVRide — charts.js
   Chart.js theming and factory helpers.

   PALETTE PROVENANCE
   ------------------
   The categorical slots below are NOT hand-picked brand colours. The EVRide
   brand greens (#00E676) and blues (#00C8FF) sit at OKLCH L 0.81 and 0.78 —
   far above the 0.48–0.67 band a dark chart surface needs — so using them as
   chart marks would fail the lightness check and glare against #101F27.

   These are the validated dark-mode categorical steps, re-ordered so the aqua
   slot leads (keeping charts recognisably "EVRide green") while preserving the
   hue spacing that makes the set colourblind-safe. Verified with the dataviz
   validator against surface #101F27:

       Lightness band      PASS  all 8 inside L 0.48–0.67
       Chroma floor        PASS  all 8 >= 0.10
       CVD separation      PASS  worst adjacent dE 9.4 (deutan), tritan 8.7
       Normal-vision floor PASS  worst adjacent dE 19.3
       Contrast vs surface PASS  all 8 >= 3:1

   Adjacent-pair safe at 8 slots (bars, lines, stacked, doughnut). For marks
   compared non-adjacently — scatter, bubble, map dots — only the first THREE
   slots clear the all-pairs check, so SCATTER_SAFE caps at three.

   Brand colours remain in use for UI chrome (buttons, glows, status dots),
   where contrast requirements differ. Charts and chrome deliberately diverge.
   ========================================================================== */

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

export const SERIES = [
    '#199e70', // 1 aqua    — primary / revenue / "EVRide green"
    '#d95926', // 2 orange
    '#3987e5', // 3 blue    — secondary measure
    '#c98500', // 4 yellow
    '#d55181', // 5 magenta
    '#008300', // 6 green
    '#9085e9', // 7 violet
    '#e66767'  // 8 red
];

/** Only these three are safe where every pair may be compared directly. */
export const SCATTER_SAFE = SERIES.slice(0, 3);

/** Status colours are reserved — never reused as "series N". */
export const STATUS = {
    good:     '#0ca30c',
    warning:  '#fab219',
    serious:  '#ec835a',
    critical: '#d03b3b'
};

/** Fleet vehicle states. Mirrors the UI status dots so the two never disagree. */
export const FLEET_COLORS = {
    available:   '#199e70',
    on_trip:     '#3987e5',
    charging:    '#9085e9',
    reserved:    '#c98500',
    maintenance: '#e66767'
};

/** Single-hue sequential ramp (magnitude), light to dark. */
export const SEQUENTIAL = ['#cde2fb', '#86b6ef', '#3987e5', '#256abf', '#184f95'];

const INK = {
    primary:   '#F5F7F8',
    secondary: '#B6C3C9',
    muted:     '#71828B',
    grid:      'rgba(255,255,255,0.055)',
    surface:   '#101F27',
    border:    'rgba(255,255,255,0.10)'
};

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

/* ------------------------------------------------------------------ */
/* Global defaults                                                     */
/* ------------------------------------------------------------------ */

let themed = false;

export function applyTheme() {
    if (themed || typeof window === 'undefined' || !window.Chart) return;
    themed = true;

    const C = window.Chart;

    C.defaults.font.family = FONT;
    C.defaults.font.size = 12;
    C.defaults.color = INK.muted;
    C.defaults.borderColor = INK.grid;
    C.defaults.maintainAspectRatio = false;
    C.defaults.responsive = true;

    // Text wears text tokens, never the series colour.
    C.defaults.plugins.legend.labels.color = INK.secondary;
    C.defaults.plugins.legend.labels.usePointStyle = true;
    C.defaults.plugins.legend.labels.pointStyle = 'circle';
    C.defaults.plugins.legend.labels.boxWidth = 8;
    C.defaults.plugins.legend.labels.boxHeight = 8;
    C.defaults.plugins.legend.labels.padding = 16;
    C.defaults.plugins.legend.position = 'bottom';
    C.defaults.plugins.legend.align = 'start';

    C.defaults.plugins.tooltip.backgroundColor = 'rgba(11,21,28,.97)';
    C.defaults.plugins.tooltip.titleColor = INK.primary;
    C.defaults.plugins.tooltip.bodyColor = INK.secondary;
    C.defaults.plugins.tooltip.borderColor = INK.border;
    C.defaults.plugins.tooltip.borderWidth = 1;
    C.defaults.plugins.tooltip.padding = 12;
    C.defaults.plugins.tooltip.cornerRadius = 10;
    C.defaults.plugins.tooltip.titleFont = { family: FONT, size: 12.5, weight: '600' };
    C.defaults.plugins.tooltip.bodyFont = { family: FONT, size: 12 };
    C.defaults.plugins.tooltip.displayColors = true;
    C.defaults.plugins.tooltip.boxWidth = 8;
    C.defaults.plugins.tooltip.boxHeight = 8;
    C.defaults.plugins.tooltip.boxPadding = 5;
    C.defaults.plugins.tooltip.usePointStyle = true;

    C.defaults.animation.duration = 700;
    C.defaults.animation.easing = 'easeOutQuart';
}

/* ------------------------------------------------------------------ */
/* Scale presets                                                       */
/* ------------------------------------------------------------------ */

const axisBase = {
    grid: { color: INK.grid, drawTicks: false, drawBorder: false },
    border: { display: false },
    ticks: { color: INK.muted, padding: 10, font: { size: 11 } }
};

function linearScale(opts = {}) {
    return {
        ...axisBase,
        beginAtZero: true,
        ...opts,
        ticks: { ...axisBase.ticks, ...(opts.ticks || {}) },
        grid: { ...axisBase.grid, ...(opts.grid || {}) }
    };
}

function categoryScale(opts = {}) {
    return {
        ...axisBase,
        grid: { display: false, drawBorder: false },
        ...opts,
        ticks: { ...axisBase.ticks, ...(opts.ticks || {}) }
    };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const registry = new Map();

/** Destroy any chart already bound to a canvas before re-creating it. */
function claim(canvasId) {
    const existing = registry.get(canvasId);
    if (existing) { try { existing.destroy(); } catch (_) {} }
    return document.getElementById(canvasId);
}

function remember(id, chart) {
    registry.set(id, chart);
    return chart;
}

export function getChart(id) { return registry.get(id); }

export function destroyAll() {
    registry.forEach(c => { try { c.destroy(); } catch (_) {} });
    registry.clear();
}

/** Charts inside hidden panels measure 0×0; call after the panel is shown. */
export function resizeAll() {
    registry.forEach(c => { try { c.resize(); } catch (_) {} });
}

function gradientFor(ctx, hex, height = 260) {
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, hex + '55');
    g.addColorStop(1, hex + '00');
    return g;
}

const money = n => '₹' + Math.round(n).toLocaleString('en-IN');
const compact = n => n >= 1e7 ? (n / 1e7).toFixed(1) + 'Cr'
                   : n >= 1e5 ? (n / 1e5).toFixed(1) + 'L'
                   : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K'
                   : String(Math.round(n));

/* ------------------------------------------------------------------ */
/* Chart factories                                                     */
/* ------------------------------------------------------------------ */

/**
 * Line / area chart. One y-axis only — never a second scale.
 * `series`: [{ label, data, color?, fill? }]
 */
export function lineChart(canvasId, labels, series, opts = {}) {
    applyTheme();
    const canvas = claim(canvasId);
    if (!canvas || !window.Chart) return null;

    const ctx = canvas.getContext('2d');

    const datasets = series.map((s, i) => {
        const color = s.color || SERIES[i % SERIES.length];
        return {
            label: s.label,
            data: s.data,
            borderColor: color,
            backgroundColor: s.fill !== false ? gradientFor(ctx, color, canvas.height || 260) : 'transparent',
            fill: s.fill !== false,
            tension: 0.38,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointBackgroundColor: color,
            // 2px surface ring keeps overlapping points legible.
            pointHoverBorderColor: INK.surface,
            pointHoverBorderWidth: 2,
            pointHitRadius: 18
        };
    });

    return remember(canvasId, new window.Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            interaction: { mode: 'index', intersect: false },
            plugins: {
                // One series needs no legend — the panel title names it.
                legend: { display: series.length > 1 },
                tooltip: {
                    callbacks: {
                        label: c => ` ${c.dataset.label}: ${opts.money ? money(c.parsed.y) : c.parsed.y.toLocaleString('en-IN')}${opts.unit || ''}`
                    }
                }
            },
            scales: {
                x: categoryScale(),
                y: linearScale({
                    ticks: {
                        callback: v => opts.money ? '₹' + compact(v) : compact(v)
                    }
                })
            },
            ...opts.chartOptions
        }
    }));
}

/** Vertical or horizontal bar chart. */
export function barChart(canvasId, labels, series, opts = {}) {
    applyTheme();
    const canvas = claim(canvasId);
    if (!canvas || !window.Chart) return null;

    const datasets = series.map((s, i) => ({
        label: s.label,
        data: s.data,
        backgroundColor: s.color || SERIES[i % SERIES.length],
        // 4px rounded data-end anchored to the baseline.
        borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
        borderSkipped: false,
        maxBarThickness: opts.thickness || 34,
        // 2px surface gap between stacked segments.
        borderColor: opts.stacked ? INK.surface : 'transparent',
        borderWidth: opts.stacked ? { top: 2, right: 0, bottom: 0, left: 0 } : 0
    }));

    const horizontal = opts.horizontal;

    return remember(canvasId, new window.Chart(canvas, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            indexAxis: horizontal ? 'y' : 'x',
            plugins: {
                legend: { display: series.length > 1 },
                tooltip: {
                    callbacks: {
                        label: c => {
                            const v = horizontal ? c.parsed.x : c.parsed.y;
                            return ` ${c.dataset.label}: ${opts.money ? money(v) : v.toLocaleString('en-IN')}${opts.unit || ''}`;
                        }
                    }
                }
            },
            scales: horizontal ? {
                x: linearScale({ stacked: !!opts.stacked, ticks: { callback: v => opts.money ? '₹' + compact(v) : compact(v) } }),
                y: categoryScale({ stacked: !!opts.stacked })
            } : {
                x: categoryScale({ stacked: !!opts.stacked }),
                y: linearScale({ stacked: !!opts.stacked, ticks: { callback: v => opts.money ? '₹' + compact(v) : compact(v) } })
            },
            ...opts.chartOptions
        }
    }));
}

/**
 * Doughnut. Used for part-to-whole with a small number of slices;
 * `colors` should come from FLEET_COLORS when showing vehicle state so the
 * chart and the status dots elsewhere agree.
 */
export function doughnutChart(canvasId, labels, data, opts = {}) {
    applyTheme();
    const canvas = claim(canvasId);
    if (!canvas || !window.Chart) return null;

    const colors = opts.colors || labels.map((_, i) => SERIES[i % SERIES.length]);

    return remember(canvasId, new window.Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                // 2px surface gap between segments.
                borderColor: INK.surface,
                borderWidth: 2,
                hoverOffset: 6,
                hoverBorderColor: INK.surface
            }]
        },
        options: {
            cutout: opts.cutout || '68%',
            plugins: {
                legend: { display: opts.legend !== false, position: opts.legendPosition || 'bottom' },
                tooltip: {
                    callbacks: {
                        label: c => {
                            const total = c.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total ? Math.round(c.parsed / total * 100) : 0;
                            return ` ${c.label}: ${c.parsed.toLocaleString('en-IN')}${opts.unit || ''} (${pct}%)`;
                        }
                    }
                }
            },
            ...opts.chartOptions
        }
    }));
}

/** Grouped/stacked area for cumulative measures over time. */
export function areaChart(canvasId, labels, series, opts = {}) {
    return lineChart(canvasId, labels, series.map(s => ({ ...s, fill: true })), {
        ...opts,
        chartOptions: {
            scales: {
                x: categoryScale(),
                y: linearScale({ stacked: true, ticks: { callback: v => opts.money ? '₹' + compact(v) : compact(v) } })
            },
            ...opts.chartOptions
        }
    });
}

/**
 * Inline SVG sparkline — no library, no axes, for KPI tiles.
 * Deliberately not a Chart.js instance: 70×26px canvases are wasteful.
 */
export function sparkline(values, color = SERIES[0], w = 72, h = 26) {
    if (!values || values.length < 2) return '';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;

    const pts = values.map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - ((v - min) / span) * (h - 4) - 2;
        return [x, y];
    });

    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${line} L${w},${h} L0,${h} Z`;
    const [lastX, lastY] = pts[pts.length - 1];
    const gid = 'sg' + Math.random().toString(36).slice(2, 8);

    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity=".32"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient></defs>
        <path d="${area}" fill="url(#${gid})"/>
        <path d="${line}" fill="none" stroke="${color}" stroke-width="1.6"
              stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2" fill="${color}"/>
    </svg>`;
}

/* ------------------------------------------------------------------ */
/* Series generators (deterministic mock history)                      */
/* ------------------------------------------------------------------ */

/**
 * Seeded pseudo-random walk so a chart shows the same history on every
 * reload instead of jumping around between renders.
 */
export function trend(seedStr, points, { base = 100, drift = 0.04, noise = 0.12, min = 0 } = {}) {
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
    const rand = () => {
        seed ^= seed << 13; seed >>>= 0;
        seed ^= seed >> 17;
        seed ^= seed << 5;  seed >>>= 0;
        return seed / 4294967296;
    };

    const out = [];
    let v = base;
    for (let i = 0; i < points; i++) {
        v = v * (1 + drift) * (1 + (rand() - 0.5) * noise);
        out.push(Math.max(min, Math.round(v)));
    }
    return out;
}

export function monthLabels(n = 12) {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date().getMonth();
    return Array.from({ length: n }, (_, i) => names[(now - n + 1 + i + 12 * 2) % 12]);
}

export function dayLabels(n = 7) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        out.push(d.toLocaleDateString('en-IN', { weekday: 'short' }));
    }
    return out;
}

export function hourLabels() {
    return Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0') + ':00');
}

/* ------------------------------------------------------------------ */
/* Accessible table fallback                                           */
/* ------------------------------------------------------------------ */

/**
 * Every chart should have a data path that isn't pixels. Renders the same
 * series as a table for screen readers and for anyone who'd rather read it.
 */
export function chartTable(labels, series, { money: isMoney = false, unit = '' } = {}) {
    return `
    <div class="table-wrap" style="border:none;max-height:280px;overflow-y:auto">
        <table class="table" style="min-width:0">
            <thead>
                <tr>
                    <th>Period</th>
                    ${series.map(s => `<th style="text-align:right">${s.label}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${labels.map((l, i) => `
                <tr>
                    <td class="cell-strong">${l}</td>
                    ${series.map(s => `
                    <td style="text-align:right">
                        ${isMoney ? money(s.data[i] || 0) : (s.data[i] || 0).toLocaleString('en-IN')}${unit}
                    </td>`).join('')}
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

export default {
    SERIES, SCATTER_SAFE, STATUS, FLEET_COLORS, SEQUENTIAL,
    applyTheme, lineChart, barChart, doughnutChart, areaChart,
    sparkline, trend, monthLabels, dayLabels, hourLabels,
    chartTable, resizeAll, destroyAll, getChart
};
