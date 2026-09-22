/* ==========================================================================
   EVRide — analytics.js
   Controller for analytics.html.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { LOCATIONS, CATEGORIES } from './data.js';
import { boot, fmt, $, $$, esc, icons, toast } from './main.js';
import mountDash, { statTile } from './dashboard.js';
import {
    SERIES, SEQUENTIAL, lineChart, barChart, doughnutChart, sparkline,
    trend, monthLabels, dayLabels, chartTable, resizeAll
} from './charts.js';

boot();
mountDash({ role: 'admin', active: 'analytics', searchPlaceholder: 'Search metrics…' });

let range = 12;

function rangeLabels() {
    return range === 7 ? dayLabels(7)
         : range === 30 ? Array.from({ length: 30 }, (_, i) => String(i + 1))
         : monthLabels(12);
}

/* ------------------------------------------------------------------ */
/* KPI strip                                                           */
/* ------------------------------------------------------------------ */

function renderKpis() {
    const f = RT.fleetStats();
    const s = RT.stationStats();

    const kpis = [
        { k: 'Total bookings',      v: fmt.compact(94_280),          icon: 'calendar-check', delta: '+14.2%', dir: 'up' },
        { k: 'Gross revenue',       v: '₹' + fmt.compact(78_400_000), icon: 'indian-rupee',   delta: '+18.7%', dir: 'up' },
        { k: 'Avg booking value',   v: fmt.money(8_420),             icon: 'receipt',        delta: '−2.1%',  dir: 'down' },
        { k: 'Avg trip duration',   v: '2.8 days',                   icon: 'clock',          delta: '+0.3',   dir: 'up' },
        { k: 'Fleet utilisation',   v: f.utilization + '%',          icon: 'activity',       delta: '+3.4%',  dir: 'up' },
        { k: 'Charging sessions',   v: fmt.compact(s.sessionsToday * 96), icon: 'zap',        delta: '+22.3%', dir: 'up' },
        { k: 'Repeat booking rate', v: '64%',                        icon: 'repeat',         delta: '+5.8%',  dir: 'up' },
        { k: 'Net promoter score',  v: '72',                         icon: 'smile',          delta: '+4',     dir: 'up' }
    ];

    $('#anKpi').innerHTML = kpis.map((k, i) => `
        <div class="kpi">
            <div class="kpi-k"><i data-lucide="${esc(k.icon)}"></i> ${esc(k.k)}</div>
            <div class="kpi-v">${esc(k.v)}</div>
            <div class="kpi-foot">
                <span class="stat-delta ${k.dir}">
                    <i data-lucide="trending-${k.dir}"></i> ${esc(k.delta)}
                </span>
                <span class="spark">${sparkline(trend('k' + i, 12, { base: 30 }), SERIES[i % SERIES.length])}</span>
            </div>
        </div>`).join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Growth charts                                                       */
/* ------------------------------------------------------------------ */

function renderGrowth() {
    const labels = rangeLabels();
    const n = labels.length;

    // Bookings.
    const bookings = trend('bg' + range, n, { base: range === 12 ? 4200 : 180, drift: 0.028, noise: 0.13 });
    const bookingSeries = [{ label: 'Bookings', data: bookings }];
    lineChart('bookingGrowthChart', labels, bookingSeries, { unit: '' });
    $('[data-table="bookingGrowth"]').innerHTML = chartTable(labels, bookingSeries);

    // Revenue — two related measures on one scale.
    const revenue = trend('rg' + range, n, { base: range === 12 ? 5_400_000 : 220_000, drift: 0.03, noise: 0.12 });
    const target = revenue.map((_, i) => Math.round(5_000_000 * Math.pow(1.03, i)));
    const revSeries = [
        { label: 'Actual revenue', data: revenue },
        { label: 'Target', data: target, color: SERIES[3], fill: false }
    ];
    lineChart('revenueGrowthChart', labels, revSeries, { money: true });
    $('[data-table="revenueGrowth"]').innerHTML = chartTable(labels, revSeries, { money: true });
}

/* ------------------------------------------------------------------ */
/* Utilisation & charging                                              */
/* ------------------------------------------------------------------ */

function renderOperational() {
    const labels = rangeLabels();
    const n = labels.length;

    // Utilisation, capped at a realistic ceiling.
    const util = trend('ut' + range, n, { base: 52, drift: 0.018, noise: 0.09 }).map(v => Math.min(92, v));
    lineChart('utilisationChart', labels, [
        { label: 'Fleet utilisation', data: util },
        { label: 'Target (75%)', data: labels.map(() => 75), color: SERIES[3], fill: false }
    ], { unit: '%' });

    // Charging: sessions and energy share one axis by indexing energy to
    // sessions × average kWh, rather than adding a second scale.
    const sessions = trend('cs' + range, n, { base: range === 12 ? 8200 : 340, drift: 0.035, noise: 0.14 });
    barChart('chargingChart', labels, [
        { label: 'Sessions', data: sessions },
        { label: 'Energy (kWh ÷ 40)', data: sessions.map(s => Math.round(s * 1.15)), color: SERIES[2] }
    ], { thickness: range === 12 ? 26 : 12 });
}

/* ------------------------------------------------------------------ */
/* Models & locations                                                  */
/* ------------------------------------------------------------------ */

function renderPopular() {
    const top = [...Store.getVehicles()].sort((a, b) => b.trips - a.trips).slice(0, 8);

    barChart('modelsChart',
        top.map(v => v.model),
        [{ label: 'Bookings', data: top.map(v => v.trips) }],
        { horizontal: true }
    );

    const locs = LOCATIONS.slice(0, 8);
    const counts = locs.map(l => {
        const at = Store.getVehicles().filter(v => v.locationId === l.id);
        return at.reduce((a, v) => a + v.trips, 0) || l.vehicles * 12;
    });

    barChart('locationsChart',
        locs.map(l => l.area),
        [{ label: 'Bookings', data: counts, color: SERIES[2] }],
        { horizontal: true }
    );
}

/* ------------------------------------------------------------------ */
/* Demand heatmap — sequential ramp, one hue                           */
/* ------------------------------------------------------------------ */

function renderHeatmap() {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const wrap = $('#demandHeatmap');
    if (!wrap) return;

    // Header row: blank corner + hour labels every 3 hours.
    let html = '<div class="heat-label"></div>';
    for (let h = 0; h < 24; h++) {
        html += `<div class="heat-label" style="justify-content:center;font-size:.62rem">
            ${h % 3 === 0 ? String(h).padStart(2, '0') : ''}
        </div>`;
    }

    // Deterministic demand surface: commuter peaks on weekdays, later and
    // flatter at weekends.
    const value = (d, h) => {
        const weekend = d >= 5;
        const morning = weekend ? 0 : Math.exp(-Math.pow(h - 8.5, 2) / 6);
        const evening = Math.exp(-Math.pow(h - (weekend ? 19 : 18), 2) / (weekend ? 14 : 8));
        const midday = weekend ? Math.exp(-Math.pow(h - 12.5, 2) / 18) * 0.8 : 0.16;
        const night = h < 6 ? 0.04 : 0;
        const wobble = ((d * 7 + h * 13) % 11) / 90;
        return Math.min(1, morning * 0.9 + evening + midday + night + wobble);
    };

    days.forEach((day, d) => {
        html += `<div class="heat-label">${day}</div>`;
        for (let h = 0; h < 24; h++) {
            const v = value(d, h);
            // Single-hue sequential ramp, light to dark, never a rainbow.
            const step = SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, Math.floor(v * SEQUENTIAL.length))];
            const alpha = 0.18 + v * 0.82;
            html += `<div class="heat-cell"
                style="background:${step};opacity:${alpha.toFixed(2)}"
                title="${day} ${String(h).padStart(2, '0')}:00 — ${Math.round(v * 100)}% of peak demand"></div>`;
        }
    });

    wrap.innerHTML = html;

    $('#heatScale').innerHTML = SEQUENTIAL.map((c, i) =>
        `<span style="background:${c};opacity:${(0.25 + i * 0.19).toFixed(2)}"></span>`).join('');
}

/* ------------------------------------------------------------------ */
/* Users & categories                                                  */
/* ------------------------------------------------------------------ */

function renderUsers() {
    const months = monthLabels(12);

    barChart('userGrowthChart', months, [
        { label: 'New customers', data: trend('uc', 12, { base: 820, drift: 0.045 }) },
        { label: 'New owners',    data: trend('uo', 12, { base: 88, drift: 0.038 }), color: SERIES[2] },
        { label: 'New drivers',   data: trend('ud', 12, { base: 34, drift: 0.03 }),  color: SERIES[3] }
    ], { stacked: true, unit: ' users' });

    const vehicles = Store.getVehicles();
    const byCat = CATEGORIES.map(c => {
        const inCat = vehicles.filter(v => v.category === c.id);
        return inCat.reduce((a, v) => a + v.trips, 0);
    });

    // Cap the slice count: beyond 8 the doughnut stops being readable.
    const pairs = CATEGORIES.map((c, i) => ({ name: c.name.replace('Electric ', ''), value: byCat[i] }))
        .sort((a, b) => b.value - a.value);

    const shown = pairs.slice(0, 6);
    const otherTotal = pairs.slice(6).reduce((a, p) => a + p.value, 0);
    if (otherTotal) shown.push({ name: 'Other', value: otherTotal });

    doughnutChart('categoryChart',
        shown.map(p => p.name),
        shown.map(p => p.value),
        { unit: ' trips' }
    );
}

/* ------------------------------------------------------------------ */
/* Metrics table                                                       */
/* ------------------------------------------------------------------ */

function renderMetrics() {
    const f = RT.fleetStats();

    const metrics = [
        { k: 'Average booking value',   now: '₹8,420',   prev: '₹8,600',   change: -2.1, target: '₹9,000',  ok: false },
        { k: 'Average trip duration',   now: '2.8 days', prev: '2.5 days', change: 12.0, target: '3.0 days', ok: true },
        { k: 'Fleet utilisation',       now: f.utilization + '%', prev: '54%', change: 3.4, target: '75%', ok: f.utilization >= 60 },
        { k: 'Booking conversion',      now: '11.4%',    prev: '10.2%',    change: 11.8, target: '12%',    ok: true },
        { k: 'Cancellation rate',       now: '3.2%',     prev: '3.8%',     change: -15.8, target: '<4%',   ok: true },
        { k: 'Avg charging session',    now: '38 min',   prev: '42 min',   change: -9.5, target: '<40 min', ok: true },
        { k: 'Support first response',  now: '8 min',    prev: '11 min',   change: -27.3, target: '<10 min', ok: true },
        { k: 'Repeat booking rate',     now: '64%',      prev: '60%',      change: 6.7,  target: '65%',    ok: true },
        { k: 'Vehicle downtime',        now: '4.1%',     prev: '5.4%',     change: -24.1, target: '<5%',   ok: true },
        { k: 'Net promoter score',      now: '72',       prev: '68',       change: 5.9,  target: '70',     ok: true }
    ];

    $('#metricsTable').innerHTML = metrics.map(m => {
        // A falling cancellation rate is good; a falling booking value is not.
        const lowerIsBetter = /rate|duration|downtime|response|session/i.test(m.k) &&
                              !/repeat|conversion/i.test(m.k);
        const improving = lowerIsBetter ? m.change < 0 : m.change > 0;

        return `
        <tr>
            <td class="cell-strong">${esc(m.k)}</td>
            <td><strong style="color:var(--text-primary)">${esc(m.now)}</strong></td>
            <td class="text-muted">${esc(m.prev)}</td>
            <td>
                <span class="stat-delta ${improving ? 'up' : 'down'}">
                    <i data-lucide="trending-${m.change > 0 ? 'up' : 'down'}"></i>
                    ${Math.abs(m.change).toFixed(1)}%
                </span>
            </td>
            <td class="text-muted">${esc(m.target)}</td>
            <td>
                <span class="health ${m.ok ? 'good' : 'fair'}">
                    <span class="health-dot"></span>${m.ok ? 'On track' : 'Below target'}
                </span>
            </td>
        </tr>`;
    }).join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Impact                                                              */
/* ------------------------------------------------------------------ */

function renderImpact() {
    $('#impactStats').innerHTML = [
        statTile({ label: 'CO₂ avoided', value: '1.8M <small style="font-size:1rem;color:var(--text-muted)">kg</small>', icon: 'cloud-off', delta: '+18%', deltaDir: 'up', meta: 'vs. petrol equivalent' }),
        statTile({ label: 'Fuel avoided', value: '620K <small style="font-size:1rem;color:var(--text-muted)">L</small>', icon: 'fuel', tone: 'blue', delta: '+16%', deltaDir: 'up' }),
        statTile({ label: 'Electric trips', value: '245K', icon: 'route', tone: 'purple', delta: '+22%', deltaDir: 'up', meta: 'across 14 cities' }),
        statTile({ label: 'Renewable energy', value: '72%', icon: 'sun', tone: 'warn', delta: '+9%', deltaDir: 'up', meta: 'of network supply' })
    ].join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Table toggles — every chart has a non-visual path to its data       */
/* ------------------------------------------------------------------ */

$$('[data-table-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
        const key = btn.dataset.tableToggle;
        const table = $(`[data-table="${key}"]`);
        const chart = btn.closest('.panel').querySelector('.chart-box');
        if (!table || !chart) return;

        const showTable = table.hidden;
        table.hidden = !showTable;
        chart.hidden = showTable;
        btn.innerHTML = showTable
            ? '<i data-lucide="bar-chart-3"></i> Chart'
            : '<i data-lucide="table"></i> Table';
        icons();
    });
});

/* ------------------------------------------------------------------ */
/* Range switching                                                     */
/* ------------------------------------------------------------------ */

$$('#anRange button').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('#anRange button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        range = +btn.dataset.range;
        renderGrowth();
        renderOperational();
    });
});

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

$('#anExport')?.addEventListener('click', () => {
    const labels = rangeLabels();
    const bookings = trend('bg' + range, labels.length, { base: range === 12 ? 4200 : 180, drift: 0.028, noise: 0.13 });
    const revenue = trend('rg' + range, labels.length, { base: range === 12 ? 5_400_000 : 220_000, drift: 0.03, noise: 0.12 });

    const rows = labels.map((l, i) => [l, bookings[i], revenue[i]]);
    const csv = [['Period', 'Bookings', 'Revenue'], ...rows]
        .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evride-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Analytics exported (${rows.length} periods)`, 'success');
});

/* ------------------------------------------------------------------ */
/* Live                                                                */
/* ------------------------------------------------------------------ */

RT.on('vehicles', () => {
    // Only the utilisation KPI is genuinely live; leave the rest stable so
    // the page doesn't flicker while someone is reading it.
    const kpi = $$('.kpi')[4];
    if (kpi) {
        const v = kpi.querySelector('.kpi-v');
        const util = RT.fleetStats().utilization + '%';
        if (v && v.textContent !== util) v.textContent = util;
    }
});

document.addEventListener('dash:section', () => resizeAll());
window.addEventListener('resize', () => resizeAll());

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

renderKpis();
renderGrowth();
renderOperational();
renderPopular();
renderHeatmap();
renderUsers();
renderMetrics();
renderImpact();
