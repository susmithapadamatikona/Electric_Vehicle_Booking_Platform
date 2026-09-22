/* ==========================================================================
   EVRide — charge-session.js
   Controller for charging-dashboard.html: the live charging ring, telemetry,
   charge curve and session log.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { boot, fmt, $, $$, esc, icons, toast, openModal, closeModal, confirmDialog } from './main.js';
import mountChrome from './navbar.js';

boot();
mountChrome({ solidNav: true });

const RING_R = 120;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

// Samples for the live charge curve; seeded from the session so a page
// refresh mid-session still draws a sensible history.
let curve = [];

/* ------------------------------------------------------------------ */
/* Entry                                                               */
/* ------------------------------------------------------------------ */

let session = Store.getChargeSession();

if (!session) {
    renderIdle();
} else {
    renderSession(session);
    seedCurve(session);
}

/* ------------------------------------------------------------------ */
/* Idle state                                                          */
/* ------------------------------------------------------------------ */

function renderIdle() {
    const reservations = Store.getReservations().filter(r => r.status === 'confirmed');

    $('#chargeContent').innerHTML = `
    <div class="card">
        <div class="empty" style="padding:70px 20px">
            <div class="empty-icon"><i data-lucide="battery"></i></div>
            <h4>No charging session active</h4>
            <p>Plug in at any EVRide station and your live session will appear here with
               power draw, energy added and running cost.</p>
            <div class="flex gap-3 justify-center mt-6 flex-wrap">
                <button class="btn btn-primary" data-modal-open="startModal">
                    <i data-lucide="zap"></i> Start a session
                </button>
                <a href="charging-stations.html" class="btn btn-secondary">
                    <i data-lucide="map-pin"></i> Find a station
                </a>
            </div>
        </div>
    </div>

    ${reservations.length ? `
    <div class="mt-8">
        <h3 class="mb-5">Your upcoming reservations</h3>
        <div class="grid grid-3 gap-5">
            ${reservations.map(r => `
            <div class="card card-hover">
                <div class="card-head">
                    <div>
                        <div class="card-title" style="font-size:.95rem">${esc(r.stationName)}</div>
                        <div class="card-sub">${fmt.dateShort(r.date)} at ${esc(r.time)}</div>
                    </div>
                    <span class="badge badge-green">Confirmed</span>
                </div>
                <div class="meta-list">
                    <div class="meta-row">
                        <span class="meta-k">Vehicle</span>
                        <span class="meta-v" style="max-width:150px">${esc(r.vehicleName)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Duration</span>
                        <span class="meta-v">${fmt.duration(r.duration)}</span>
                    </div>
                </div>
                <button class="btn btn-primary btn-sm btn-block mt-5" data-start-res="${esc(r.id)}">
                    <i data-lucide="zap"></i> Start this session
                </button>
            </div>`).join('')}
        </div>
    </div>` : ''}

    <!-- Recent sessions -->
    <div class="mt-8">
        <h3 class="mb-5">How charging works here</h3>
        <div class="grid grid-3 gap-5">
            <div class="card">
                <div class="stat-icon mb-4"><i data-lucide="plug-zap"></i></div>
                <h5 class="mb-2">Plug in</h5>
                <p style="font-size:.87rem;color:var(--text-secondary);line-height:1.7">
                    Connect the cable and the bay recognises your vehicle automatically
                    from its charging handshake.
                </p>
            </div>
            <div class="card">
                <div class="stat-icon blue mb-4"><i data-lucide="activity"></i></div>
                <h5 class="mb-2">Watch it live</h5>
                <p style="font-size:.87rem;color:var(--text-secondary);line-height:1.7">
                    Power draw, energy delivered and running cost update every couple of
                    seconds, so there are never any surprises.
                </p>
            </div>
            <div class="card">
                <div class="stat-icon purple mb-4"><i data-lucide="receipt"></i></div>
                <h5 class="mb-2">Unplug and go</h5>
                <p style="font-size:.87rem;color:var(--text-secondary);line-height:1.7">
                    Billing stops the instant you unplug. The itemised receipt lands in
                    your invoices within a minute.
                </p>
            </div>
        </div>
    </div>`;

    icons();
    initStartModal();

    $$('[data-start-res]').forEach(btn => {
        btn.addEventListener('click', () => {
            const r = Store.getReservations().find(x => x.id === btn.dataset.startRes);
            if (!r) return;
            const s = Store.getStation(r.stationId);
            startSession(r.vehicleId, r.stationId, r.targetSoc, s?.speed, s?.price);
        });
    });
}

/* ------------------------------------------------------------------ */
/* Start modal                                                         */
/* ------------------------------------------------------------------ */

function initStartModal() {
    const vSel = $('#startVehicle');
    const sSel = $('#startStation');
    if (!vSel) return;

    // Vehicles that could plausibly need a charge first.
    const vehicles = [...Store.getVehicles()].sort((a, b) => a.battery - b.battery);

    vSel.innerHTML = vehicles.map(v => `
        <option value="${esc(v.id)}">${esc(v.name)} — ${Math.round(v.battery)}% · ${v.batteryCapacity} kWh</option>`).join('');

    sSel.innerHTML = Store.getStations().map(s => `
        <option value="${esc(s.id)}">${esc(s.name)} — ${s.speed} kW · ₹${s.price}/kWh</option>`).join('');

    $('#startSoc').addEventListener('input', e => {
        $('#startSocLabel').textContent = e.target.value + '%';
    });

    $('#confirmStart').addEventListener('click', () => {
        const vId = vSel.value;
        const sId = sSel.value;
        const target = +$('#startSoc').value;
        const st = Store.getStation(sId);

        const v = Store.getVehicle(vId);
        if (v && v.battery >= target) {
            toast(`${v.name} is already at ${Math.round(v.battery)}% — pick a higher target.`, 'warning');
            return;
        }

        closeModal('startModal');
        startSession(vId, sId, target, st?.speed, st?.price);
    });
}

function startSession(vehicleId, stationId, targetSoc, maxPower, price) {
    session = RT.startCharging({ vehicleId, stationId, targetSoc, maxPower, pricePerKwh: price });
    if (!session) { toast('Could not start the session', 'error'); return; }
    curve = [];
    renderSession(session);
    toast('Charging started', 'success', session.stationName);
}

/* ------------------------------------------------------------------ */
/* Active session                                                      */
/* ------------------------------------------------------------------ */

function renderSession(s) {
    const v = Store.getVehicle(s.vehicleId);
    const pct = Math.round(s.battery);
    const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;

    $('#chargeContent').innerHTML = `
    <div class="charge-dash">
        <!-- ============ MAIN ============ -->
        <div>
            <div class="charge-hero mb-6">
                <div class="charge-ring-wrap">
                    <svg class="charge-ring-svg" viewBox="0 0 280 280">
                        <defs>
                            <linearGradient id="chargeGradient" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stop-color="#00E676"/>
                                <stop offset="100%" stop-color="#00C8FF"/>
                            </linearGradient>
                        </defs>
                        <circle class="charge-ring-track" cx="140" cy="140" r="${RING_R}"/>
                        <circle class="charge-ring-fill" id="ringFill" cx="140" cy="140" r="${RING_R}"
                                stroke-dasharray="${CIRCUMFERENCE}"
                                stroke-dashoffset="${offset}"/>
                    </svg>
                    <div class="charge-ring-center">
                        <span class="charge-ring-bolt ${s.status === 'charging' ? 'bolt-pulse' : ''}" id="ringBolt">
                            <i data-lucide="zap"></i>
                        </span>
                        <div class="charge-ring-val" id="ringVal">${pct}<small>%</small></div>
                        <div class="charge-ring-label">Battery</div>
                    </div>
                </div>

                <div class="charge-status-pill ${s.status === 'complete' ? 'complete' : s.status === 'stopped' ? 'stopped' : ''}" id="statusPill">
                    <span class="status-dot ${s.status === 'charging' ? 'charging' : 'available'}"></span>
                    <span id="statusText">${statusLabel(s)}</span>
                </div>

                <div class="energy-flow">
                    <div class="flow-node source"><i data-lucide="zap"></i></div>
                    <div class="flow-line">
                        <div class="flow-pulse" id="flowPulse" ${s.status !== 'charging' ? 'style="display:none"' : ''}></div>
                    </div>
                    <div class="flow-node target"><i data-lucide="car"></i></div>
                </div>

                <p class="text-secondary" style="font-size:.92rem">
                    <strong class="text-primary">${esc(s.vehicleName)}</strong> ·
                    ${esc(s.bay)} at ${esc(s.stationName)}
                </p>
            </div>

            <!-- Live stats -->
            <div class="charge-stats mb-6">
                <div class="charge-stat">
                    <div class="charge-stat-k"><i data-lucide="zap"></i> Power</div>
                    <div class="charge-stat-v green" data-c="power">${s.powerKw}<small>kW</small></div>
                </div>
                <div class="charge-stat">
                    <div class="charge-stat-k"><i data-lucide="battery-charging"></i> Energy added</div>
                    <div class="charge-stat-v" data-c="energy">${s.energyAdded.toFixed(1)}<small>kWh</small></div>
                </div>
                <div class="charge-stat">
                    <div class="charge-stat-k"><i data-lucide="clock"></i> Time left</div>
                    <div class="charge-stat-v blue" data-c="eta">${s.etaMin || 0}<small>min</small></div>
                </div>
                <div class="charge-stat">
                    <div class="charge-stat-k"><i data-lucide="indian-rupee"></i> Cost</div>
                    <div class="charge-stat-v" data-c="cost">${fmt.money(s.cost)}</div>
                </div>
            </div>

            <!-- Charge curve -->
            <div class="card mb-6">
                <div class="card-head">
                    <div>
                        <div class="card-title">Charging curve</div>
                        <div class="card-sub">Power delivered against state of charge</div>
                    </div>
                    <span class="text-muted" style="font-size:.8rem">Peak ${s.maxPower} kW</span>
                </div>
                <div class="curve-chart" id="curveChart"></div>
                <p class="text-muted" style="font-size:.79rem;margin-top:12px;line-height:1.6">
                    Charging slows above 80% — that's the battery management system
                    protecting cell life, not a fault with the charger.
                </p>
            </div>

            <!-- Session log -->
            <div class="card">
                <div class="card-head">
                    <div class="card-title">Session log</div>
                    <span class="live-tag">Live</span>
                </div>
                <div class="session-log" id="sessionLog"></div>
            </div>
        </div>

        <!-- ============ SIDEBAR ============ -->
        <aside class="book-panel">
            <div class="book-panel-head">
                <div class="cost-readout" style="border:none;background:none;padding:0">
                    <div class="cost-val" data-c="costBig">${fmt.money(s.cost)}</div>
                    <div class="cost-label">Running total · ₹${s.pricePerKwh}/kWh</div>
                </div>
            </div>

            <div class="book-panel-body">
                <div class="meta-list">
                    <div class="meta-row">
                        <span class="meta-k">Vehicle</span>
                        <span class="meta-v" style="max-width:160px">${esc(s.vehicleName)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Station</span>
                        <span class="meta-v" style="max-width:160px">${esc(s.stationName)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Bay</span>
                        <span class="meta-v">${esc(s.bay)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Connector</span>
                        <span class="meta-v">${esc(s.connector)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Started at</span>
                        <span class="meta-v">${fmt.time(s.startedAt)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Elapsed</span>
                        <span class="meta-v" data-c="elapsed">${fmt.duration(s.elapsedMin)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Start charge</span>
                        <span class="meta-v">${Math.round(s.startSoc)}%</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Target</span>
                        <span class="meta-v">${s.targetSoc}%</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Range now</span>
                        <span class="meta-v" data-c="range">${s.range} km</span>
                    </div>
                </div>

                <div class="divider" style="margin:4px 0"></div>

                <div>
                    <div class="flex justify-between mb-2" style="font-size:.82rem">
                        <span class="text-muted">Progress to ${s.targetSoc}%</span>
                        <span class="text-primary" data-c="progressPct">
                            ${Math.round((s.battery - s.startSoc) / Math.max(1, s.targetSoc - s.startSoc) * 100)}%
                        </span>
                    </div>
                    <div class="bar">
                        <div class="bar-fill animated" data-c="progressBar"
                             style="width:${Math.min(100, (s.battery - s.startSoc) / Math.max(1, s.targetSoc - s.startSoc) * 100)}%"></div>
                    </div>
                </div>

                ${s.status === 'charging' ? `
                <button class="btn btn-danger btn-block" id="stopBtn">
                    <i data-lucide="square"></i> Stop Charging
                </button>` : `
                <button class="btn btn-primary btn-block" data-modal-open="startModal">
                    <i data-lucide="zap"></i> Start New Session
                </button>
                <a href="invoices.html" class="btn btn-secondary btn-block">
                    <i data-lucide="receipt"></i> View Receipt
                </a>`}

                <a href="charging-details.html?id=${esc(s.stationId || '')}" class="btn btn-secondary btn-block">
                    <i data-lucide="map-pin"></i> Station Details
                </a>
            </div>

            <div class="trust-strip">
                <div class="trust-row"><i data-lucide="shield-check"></i> Billed on energy delivered, not time</div>
                <div class="trust-row"><i data-lucide="bell"></i> Alert before idle fees begin</div>
                <div class="trust-row"><i data-lucide="headset"></i> Remote support on every bay</div>
            </div>
        </aside>
    </div>`;

    icons();
    initStartModal();
    bindSessionActions();
    renderCurve();
    renderLog(s);
}

function statusLabel(s) {
    if (s.status === 'complete') return 'Charging complete';
    if (s.status === 'stopped') return 'Session stopped';
    if (s.battery >= 80) return 'Charging — tapering above 80%';
    return 'Charging in progress';
}

function bindSessionActions() {
    $('#stopBtn')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
            title: 'Stop charging?',
            message: 'Billing stops immediately and the bay is released. You can start a new session at any time.',
            confirmText: 'Stop charging',
            cancelText: 'Keep charging',
            danger: true
        });
        if (!ok) return;
        RT.stopCharging();
    });
}

/* ------------------------------------------------------------------ */
/* Charge curve                                                        */
/* ------------------------------------------------------------------ */

function seedCurve(s) {
    // Reconstruct the earlier part of the curve so a reload doesn't show
    // an empty chart mid-session.
    curve = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
        const soc = s.startSoc + (s.battery - s.startSoc) * (i / steps);
        curve.push({ soc, kw: powerAt(soc, s.maxPower) });
    }
}

function powerAt(soc, maxPower) {
    const factor = soc < 55 ? 1 : soc < 80 ? 0.82 : soc < 92 ? 0.42 : 0.18;
    return maxPower * factor;
}

function renderCurve() {
    const el = $('#curveChart');
    if (!el || !session) return;

    const w = 100, h = 100;
    const maxKw = session.maxPower || 100;

    // Reference curve across the whole SoC range.
    const ref = Array.from({ length: 51 }, (_, i) => {
        const soc = i * 2;
        return { x: soc, y: powerAt(soc, maxKw) };
    });

    const toPoint = p => `${(p.x / 100) * w},${h - (p.y / maxKw) * h}`;
    const refPath = 'M' + ref.map(toPoint).join(' L');

    // Actual samples so far.
    const actual = curve.filter(c => c.soc >= session.startSoc);
    const actualPath = actual.length > 1
        ? 'M' + actual.map(c => `${(c.soc / 100) * w},${h - (c.kw / maxKw) * h}`).join(' L')
        : '';

    const nowX = (session.battery / 100) * w;
    const nowY = h - (session.powerKw / maxKw) * h;

    el.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img"
         aria-label="Charging power curve against state of charge">
        <defs>
            <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#00E676" stop-opacity=".28"/>
                <stop offset="100%" stop-color="#00E676" stop-opacity="0"/>
            </linearGradient>
        </defs>

        <!-- Gridlines -->
        ${[25, 50, 75].map(p => `
        <line x1="0" y1="${h - p}" x2="${w}" y2="${h - p}"
              stroke="rgba(255,255,255,.05)" stroke-width="0.4" vector-effect="non-scaling-stroke"/>`).join('')}
        <line x1="80" y1="0" x2="80" y2="${h}"
              stroke="rgba(245,158,11,.3)" stroke-width="0.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>

        <!-- Reference curve -->
        <path d="${refPath}" fill="none" stroke="rgba(255,255,255,.14)"
              stroke-width="1.2" vector-effect="non-scaling-stroke"/>

        <!-- Achieved curve -->
        ${actualPath ? `
        <path d="${actualPath} L${nowX},${h} L${(session.startSoc / 100) * w},${h} Z"
              fill="url(#curveFill)" stroke="none"/>
        <path d="${actualPath}" fill="none" stroke="#00E676"
              stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` : ''}

        <!-- Current point -->
        <circle cx="${nowX}" cy="${nowY}" r="2.6" fill="#00E676" vector-effect="non-scaling-stroke"/>
        <circle cx="${nowX}" cy="${nowY}" r="5" fill="none" stroke="#00E676"
                stroke-width="1" opacity=".4" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="occ-labels" style="margin-top:8px">
        <span>0%</span><span>25%</span><span>50%</span>
        <span style="color:var(--warning)">80%</span><span>100%</span>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Session log                                                         */
/* ------------------------------------------------------------------ */

const logEntries = [];

function addLog(text, value) {
    logEntries.unshift({ time: Date.now(), text, value });
    if (logEntries.length > 20) logEntries.pop();
    paintLog();
}

function renderLog(s) {
    if (!logEntries.length) {
        logEntries.push(
            { time: s.startedAt, text: `Session started at ${s.stationName}`, value: `${Math.round(s.startSoc)}%` },
            { time: s.startedAt + 1000, text: `Handshake complete — ${s.connector} on ${s.bay}`, value: `${s.maxPower} kW` }
        );
    }
    paintLog();
}

function paintLog() {
    const el = $('#sessionLog');
    if (!el) return;
    el.innerHTML = logEntries.map(l => `
        <div class="log-row">
            <span class="log-time">${fmt.time(l.time)}</span>
            <span class="log-text">${esc(l.text)}</span>
            ${l.value ? `<span class="log-val">${esc(l.value)}</span>` : ''}
        </div>`).join('');
}

/* ------------------------------------------------------------------ */
/* Live updates                                                        */
/* ------------------------------------------------------------------ */

let lastLoggedSoc = null;

RT.on('charging', s => {
    const statusChanged = session && session.status !== s.status;
    session = s;

    // Ring.
    const pct = Math.round(s.battery);
    const ring = $('#ringFill');
    if (ring) ring.style.strokeDashoffset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;

    patch('ringVal', `${pct}<small>%</small>`, true);
    patch('power', `${s.powerKw}<small>kW</small>`);
    patch('energy', `${s.energyAdded.toFixed(1)}<small>kWh</small>`);
    patch('eta', `${s.etaMin || 0}<small>min</small>`);
    patch('cost', fmt.money(s.cost));
    patch('costBig', fmt.money(s.cost));
    patch('elapsed', fmt.duration(s.elapsedMin));
    patch('range', `${s.range} km`);

    const progress = Math.min(100, (s.battery - s.startSoc) / Math.max(1, s.targetSoc - s.startSoc) * 100);
    const bar = $('[data-c="progressBar"]');
    if (bar) bar.style.width = progress + '%';
    patch('progressPct', Math.round(progress) + '%');

    // Curve sample.
    curve.push({ soc: s.battery, kw: s.powerKw });
    if (curve.length > 200) curve.shift();
    renderCurve();

    // Log milestones rather than every tick.
    const milestone = Math.floor(s.battery / 10) * 10;
    if (lastLoggedSoc === null) lastLoggedSoc = milestone;
    if (milestone > lastLoggedSoc) {
        lastLoggedSoc = milestone;
        addLog(`Reached ${milestone}% — ${s.energyAdded.toFixed(1)} kWh added`, fmt.money(s.cost));
    }

    // Status change → full re-render so the controls match.
    if (statusChanged) {
        if (s.status === 'complete') {
            addLog(`Target ${s.targetSoc}% reached — session complete`, fmt.money(s.cost));
        } else if (s.status === 'stopped') {
            addLog('Session stopped by user', fmt.money(s.cost));
        }
        renderSession(s);
        return;
    }

    // Status text nuance (tapering past 80%).
    const text = $('#statusText');
    if (text) text.textContent = statusLabel(s);
});

function patch(key, html, isId = false) {
    const node = isId ? $('#' + key) : $(`[data-c="${key}"]`);
    if (!node || node.innerHTML === html) return;
    node.innerHTML = html;
    node.classList.add('value-flash');
    setTimeout(() => node.classList.remove('value-flash'), 700);
}

// Elapsed time ticks even between engine updates.
setInterval(() => {
    if (!session || session.status !== 'charging') return;
    const mins = (Date.now() - session.startedAt) / 60000;
    const node = $('[data-c="elapsed"]');
    if (node) node.textContent = fmt.duration(mins);
}, 5000);
