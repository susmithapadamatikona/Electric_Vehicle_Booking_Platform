/* ==========================================================================
   EVRide — reservation.js
   Controller for charging-reservation.html.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { boot, fmt, $, $$, esc, icons, toast, confirmDialog } from './main.js';
import mountChrome from './navbar.js';

boot();
mountChrome({ solidNav: true });

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const params = new URLSearchParams(location.search);

const state = {
    stationId: params.get('station') || Store.getStations()[0]?.id,
    vehicleId: params.get('vehicle') || null,
    connector: null,
    date: new Date().toISOString().split('T')[0],
    slot: null,
    duration: 45,
    targetSoc: 80
};

const RESERVATION_FEE = 40;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function station() { return Store.getStation(state.stationId); }
function vehicle()  { return state.vehicleId ? Store.getVehicle(state.vehicleId) : null; }

/**
 * Slot availability is deterministic per station+date+time so the grid
 * doesn't reshuffle on every re-render.
 */
function slotTaken(stationId, date, time) {
    const key = `${stationId}|${date}|${time}`;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;

    const hour = parseInt(time.split(':')[0], 10);
    // Peak hours are busier.
    const peak = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20);
    const threshold = peak ? 0.55 : 0.22;
    return (h % 100) / 100 < threshold;
}

/* ------------------------------------------------------------------ */
/* Populate selects                                                    */
/* ------------------------------------------------------------------ */

function initStations() {
    const sel = $('#resStation');
    sel.innerHTML = Store.getStations().map(s => `
        <option value="${esc(s.id)}" ${s.id === state.stationId ? 'selected' : ''}>
            ${esc(s.name)} — ${s.available}/${s.total} free · ${s.speed} kW
        </option>`).join('');

    sel.addEventListener('change', e => {
        state.stationId = e.target.value;
        state.connector = null;
        renderStationPreview();
        renderConnectors();
        renderSlots();
        renderSummary();
    });
}

function initVehicles() {
    const sel = $('#resVehicle');
    const vehicles = Store.getVehicles();

    // Default to the most recently viewed vehicle if we have one.
    if (!state.vehicleId) {
        const recent = Store.getRecentlyViewed()[0];
        state.vehicleId = (recent && Store.getVehicle(recent)) ? recent : vehicles[0]?.id;
    }

    sel.innerHTML = vehicles.map(v => `
        <option value="${esc(v.id)}" ${v.id === state.vehicleId ? 'selected' : ''}>
            ${esc(v.name)} — ${Math.round(v.battery)}% · ${esc(v.plate)}
        </option>`).join('');

    sel.addEventListener('change', e => {
        state.vehicleId = e.target.value;
        renderVehiclePreview();
        renderSummary();
    });
}

/* ------------------------------------------------------------------ */
/* Previews                                                            */
/* ------------------------------------------------------------------ */

function renderStationPreview() {
    const s = station();
    if (!s) return;

    $('#stationPreview').innerHTML = `
    <div class="flex items-center gap-4 flex-wrap">
        <span class="cs-icon ${s.status === 'busy' ? 'busy' : s.status === 'offline' ? 'offline' : ''}">
            <i data-lucide="zap"></i>
        </span>
        <div style="flex:1;min-width:180px">
            <strong style="display:block;font-size:.92rem;color:var(--text-primary)">${esc(s.name)}</strong>
            <span style="font-size:.79rem;color:var(--text-muted)">${esc(s.address)}</span>
        </div>
        <div style="text-align:right">
            <strong style="display:block;font-family:var(--font-display);font-size:1.2rem;color:var(--primary)"
                    data-live="prevAvail">${s.available}</strong>
            <span style="font-size:.72rem;color:var(--text-muted)">of ${s.total} free now</span>
        </div>
    </div>
    <div class="cs-meta mt-4" style="margin-bottom:0">
        <span><i data-lucide="gauge"></i> <strong>${s.speed}</strong> kW max</span>
        <span><i data-lucide="indian-rupee"></i> <strong>${s.price}</strong>/kWh</span>
        <span><i data-lucide="clock"></i> ${esc(s.hours)}</span>
        <span><i data-lucide="map-pin"></i> ${s.distance} km</span>
    </div>`;

    icons();
}

function renderVehiclePreview() {
    const v = vehicle();
    if (!v) { $('#vehiclePreview').innerHTML = ''; return; }

    $('#vehiclePreview').innerHTML = `
        <img src="${esc(v.image)}" alt="${esc(v.name)}" data-fallback="${esc(v.brand)}"
             style="width:88px;height:62px;object-fit:cover;border-radius:10px;background:var(--card-light)">
        <div style="flex:1;min-width:160px">
            <strong style="display:block;font-size:.9rem;color:var(--text-primary)">${esc(v.name)}</strong>
            <span style="font-size:.78rem;color:var(--text-muted)">
                ${v.batteryCapacity} kWh · ${esc(v.connector)} · max ${v.peakCharge || 'AC'} kW
            </span>
            <div class="bar bar-sm mt-2" style="max-width:180px">
                <div class="bar-fill ${fmt.batteryClass(v.battery) === 'low' ? 'danger' : fmt.batteryClass(v.battery) === 'mid' ? 'warn' : 'green'}"
                     style="width:${Math.round(v.battery)}%"></div>
            </div>
        </div>
        <div style="text-align:right">
            <strong style="display:block;font-family:var(--font-display);font-size:1.3rem;color:var(--text-primary)">
                ${Math.round(v.battery)}%
            </strong>
            <span style="font-size:.72rem;color:var(--text-muted)">${v.range} km range</span>
        </div>`;

    icons();
    updateSocLabels();
}

/* ------------------------------------------------------------------ */
/* Connectors                                                          */
/* ------------------------------------------------------------------ */

function renderConnectors() {
    const s = station();
    if (!s) return;

    if (!state.connector || !s.connectors.includes(state.connector)) {
        // Prefer the connector the chosen vehicle actually uses.
        const v = vehicle();
        state.connector = (v && s.connectors.includes(v.connector)) ? v.connector : s.connectors[0];
    }

    $('#chargerTypes').innerHTML = s.connectors.map(c => {
        const v = vehicle();
        const compatible = !v || v.connector === c;
        return `
        <button class="chip ${c === state.connector ? 'active' : ''}" data-conn="${esc(c)}">
            <i data-lucide="plug"></i> ${esc(c)}
            ${compatible ? '' : '<span style="opacity:.6;font-size:.72rem">(adapter)</span>'}
        </button>`;
    }).join('');

    icons();

    $$('[data-conn]').forEach(chip => {
        chip.addEventListener('click', () => {
            $$('[data-conn]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.connector = chip.dataset.conn;
            renderSummary();
        });
    });
}

/* ------------------------------------------------------------------ */
/* Date strip                                                          */
/* ------------------------------------------------------------------ */

function renderDates() {
    const days = Array.from({ length: 7 }, (_, i) => new Date(Date.now() + i * 86400000));

    $('#dateStrip').innerHTML = days.map((d, i) => {
        const iso = d.toISOString().split('T')[0];
        const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
            : d.toLocaleDateString('en-IN', { weekday: 'short' });
        return `
        <button class="date-pill ${iso === state.date ? 'selected' : ''}" data-date="${iso}">
            <small>${esc(label)}</small>
            <strong>${d.getDate()}</strong>
            <small>${d.toLocaleDateString('en-IN', { month: 'short' })}</small>
        </button>`;
    }).join('');

    $$('[data-date]').forEach(pill => {
        pill.addEventListener('click', () => {
            $$('.date-pill').forEach(p => p.classList.remove('selected'));
            pill.classList.add('selected');
            state.date = pill.dataset.date;
            state.slot = null;
            renderSlots();
            renderSummary();
        });
    });
}

/* ------------------------------------------------------------------ */
/* Time slots                                                          */
/* ------------------------------------------------------------------ */

function renderSlots() {
    const s = station();
    if (!s) return;

    // Respect the station's opening hours.
    let startHour = 6, endHour = 23;
    if (s.hours !== '24/7') {
        const m = s.hours.match(/(\d{2}):\d{2}\s*[–-]\s*(\d{2}):\d{2}/);
        if (m) { startHour = +m[1]; endHour = +m[2]; }
    } else {
        startHour = 0; endHour = 23;
    }

    const isToday = state.date === new Date().toISOString().split('T')[0];
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

    const slots = [];
    for (let h = startHour; h <= endHour; h++) {
        for (const m of [0, 30]) {
            if (h === endHour && m === 30) continue;
            slots.push({ h, m, label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` });
        }
    }

    $('#slotGrid').innerHTML = slots.map(slot => {
        const past = isToday && (slot.h * 60 + slot.m) < nowMinutes + 20;
        const taken = slotTaken(s.id, state.date, slot.label);
        const disabled = past || taken;
        return `
        <button class="slot ${state.slot === slot.label ? 'selected' : ''}"
                data-slot="${slot.label}" ${disabled ? 'disabled' : ''}
                title="${past ? 'Time has passed' : taken ? 'Fully booked' : 'Available'}">
            ${slot.label}
        </button>`;
    }).join('');

    $$('[data-slot]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            $$('.slot').forEach(s2 => s2.classList.remove('selected'));
            btn.classList.add('selected');
            state.slot = btn.dataset.slot;
            renderSummary();
        });
    });
}

/* ------------------------------------------------------------------ */
/* Cost estimate                                                       */
/* ------------------------------------------------------------------ */

function estimate() {
    const s = station();
    const v = vehicle();
    if (!s || !v) return null;

    const startSoc = v.battery;
    const target = Math.max(state.targetSoc, Math.ceil(startSoc));
    const socGain = Math.max(0, target - startSoc);

    // Energy needed for that SoC swing.
    const energyNeeded = socGain / 100 * v.batteryCapacity;

    // Effective rate: limited by the lower of station output and car acceptance,
    // then derated because charging tapers above 80%.
    const peak = Math.min(s.speed, v.peakCharge || s.speed);
    const taperFactor = target > 80 ? 0.62 : 0.85;
    const effectiveKw = peak * taperFactor;

    const minutesNeeded = effectiveKw > 0 ? Math.ceil(energyNeeded / effectiveKw * 60) : 0;

    // Energy actually delivered within the reserved window.
    const minutesBooked = state.duration;
    const energyDelivered = Math.min(energyNeeded, effectiveKw * minutesBooked / 60);

    const energyCost = Math.round(energyDelivered * s.price);
    const total = energyCost + RESERVATION_FEE;

    const socReached = Math.min(target, startSoc + (energyDelivered / v.batteryCapacity * 100));

    return {
        startSoc, target, socGain, energyNeeded, energyDelivered,
        effectiveKw, minutesNeeded, minutesBooked, energyCost, total,
        socReached, rangeAdded: Math.round(energyDelivered / v.batteryCapacity * v.rangeMax * 0.94),
        enoughTime: minutesBooked >= minutesNeeded
    };
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

function renderSummary() {
    const s = station();
    const v = vehicle();
    const est = estimate();

    $('#resSummary').innerHTML = `
        <div class="meta-row">
            <span class="meta-k">Station</span>
            <span class="meta-v" style="max-width:170px">${esc(s?.name || '—')}</span>
        </div>
        <div class="meta-row">
            <span class="meta-k">Charger</span>
            <span class="meta-v">${esc(state.connector || '—')} · ${s?.speed || '—'} kW</span>
        </div>
        <div class="meta-row">
            <span class="meta-k">Vehicle</span>
            <span class="meta-v" style="max-width:170px">${esc(v?.name || '—')}</span>
        </div>
        <div class="meta-row">
            <span class="meta-k">Date</span>
            <span class="meta-v">${fmt.date(state.date)}</span>
        </div>
        <div class="meta-row">
            <span class="meta-k">Start time</span>
            <span class="meta-v ${state.slot ? '' : 'text-muted'}">${state.slot || 'Select a slot'}</span>
        </div>
        <div class="meta-row">
            <span class="meta-k">Duration</span>
            <span class="meta-v">${fmt.duration(state.duration)}</span>
        </div>`;

    if (!est) { $('#resCost').innerHTML = ''; $('#resTotal').textContent = '—'; return; }

    $('#resCost').innerHTML = `
        <div class="bsp-price-row">
            <span class="k">Charge from</span>
            <span class="v">${Math.round(est.startSoc)}% → ${Math.round(est.socReached)}%</span>
        </div>
        <div class="bsp-price-row">
            <span class="k">Energy delivered <small>(est.)</small></span>
            <span class="v">${est.energyDelivered.toFixed(1)} kWh</span>
        </div>
        <div class="bsp-price-row">
            <span class="k">Range added <small>(est.)</small></span>
            <span class="v">+${est.rangeAdded} km</span>
        </div>
        <div class="bsp-price-row">
            <span class="k">Energy cost <small>@ ₹${s.price}/kWh</small></span>
            <span class="v">${fmt.money(est.energyCost)}</span>
        </div>
        <div class="bsp-price-row">
            <span class="k">Reservation fee</span>
            <span class="v">${fmt.money(RESERVATION_FEE)}</span>
        </div>`;

    $('#resTotal').textContent = fmt.money(est.total);

    // Duration guidance.
    const hint = $('#durationHint');
    if (est.socGain <= 0) {
        hint.innerHTML = `<span class="text-green">Already at or above your target charge.</span>`;
    } else if (est.enoughTime) {
        hint.innerHTML = `<span class="text-green">${fmt.duration(state.duration)} is enough to reach ${est.target}%</span>
            — roughly ${fmt.duration(est.minutesNeeded)} of charging at ${Math.round(est.effectiveKw)} kW.`;
    } else {
        hint.innerHTML = `<span class="text-warning">Reaching ${est.target}% needs about ${fmt.duration(est.minutesNeeded)}.</span>
            In ${fmt.duration(state.duration)} you'll get to roughly ${Math.round(est.socReached)}%.`;
    }
}

function updateSocLabels() {
    const v = vehicle();
    $('#socFrom').textContent = v ? `From ${Math.round(v.battery)}%` : 'From —';
    $('#socTo').textContent = `To ${state.targetSoc}%`;
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

$$('[data-dur]').forEach(chip => {
    chip.addEventListener('click', () => {
        $$('[data-dur]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.duration = +chip.dataset.dur;
        renderSummary();
    });
});

$('#targetSoc').addEventListener('input', e => {
    state.targetSoc = +e.target.value;
    updateSocLabels();
    renderSummary();
});

/* ------------------------------------------------------------------ */
/* Reserve                                                             */
/* ------------------------------------------------------------------ */

$('#reserveSlot').addEventListener('click', () => {
    if (!state.slot) {
        toast('Pick a start time for your slot', 'error', 'Time required');
        $('#slotGrid').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    const s = station();
    const v = vehicle();
    const est = estimate();

    if (!s || !v) { toast('Select a station and vehicle', 'error'); return; }

    const reservation = {
        id: 'RES-' + Date.now().toString(36).toUpperCase().slice(-6),
        stationId: s.id,
        stationName: s.name,
        stationAddress: s.address,
        vehicleId: v.id,
        vehicleName: v.name,
        connector: state.connector,
        date: state.date,
        time: state.slot,
        duration: state.duration,
        targetSoc: state.targetSoc,
        estEnergy: est ? +est.energyDelivered.toFixed(1) : 0,
        estCost: est ? est.total : RESERVATION_FEE,
        fee: RESERVATION_FEE,
        status: 'confirmed',
        createdAt: Date.now()
    };

    Store.saveReservation(reservation);

    RT.notify('success', 'calendar-check', 'Charging slot reserved',
        `${s.name} · ${fmt.date(state.date)} at ${state.slot}. Bay held for 15 minutes.`,
        'charging-reservation.html');

    toast(`Bay reserved at ${s.name} for ${state.slot}`, 'success', 'Reservation confirmed');

    renderExisting();
    $('#existingSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ------------------------------------------------------------------ */
/* Existing reservations                                               */
/* ------------------------------------------------------------------ */

function renderExisting() {
    const list = Store.getReservations().filter(r => r.status === 'confirmed');

    if (!list.length) { $('#existingSection').hidden = true; return; }

    $('#existingSection').hidden = false;
    $('#existingList').innerHTML = list.map(r => `
        <div class="card card-hover">
            <div class="card-head">
                <div>
                    <div class="card-title" style="font-size:.95rem">${esc(r.stationName)}</div>
                    <div class="card-sub">${esc(r.id)}</div>
                </div>
                <span class="badge badge-green">Confirmed</span>
            </div>
            <div class="meta-list">
                <div class="meta-row">
                    <span class="meta-k">When</span>
                    <span class="meta-v">${fmt.dateShort(r.date)} · ${esc(r.time)}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-k">Duration</span>
                    <span class="meta-v">${fmt.duration(r.duration)}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-k">Vehicle</span>
                    <span class="meta-v" style="max-width:150px">${esc(r.vehicleName)}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-k">Estimated cost</span>
                    <span class="meta-v text-green">${fmt.money(r.estCost)}</span>
                </div>
            </div>
            <div class="flex gap-2 mt-5">
                <a href="charging-details.html?id=${esc(r.stationId)}" class="btn btn-secondary btn-sm flex-1">Station</a>
                <button class="btn btn-danger btn-sm" data-cancel-res="${esc(r.id)}">Cancel</button>
            </div>
        </div>`).join('');

    icons();

    $$('[data-cancel-res]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await confirmDialog({
                title: 'Cancel this reservation?',
                message: 'Your bay will be released. The ₹40 fee is refunded when you cancel more than an hour ahead.',
                confirmText: 'Cancel reservation',
                cancelText: 'Keep it',
                danger: true
            });
            if (!ok) return;
            Store.cancelReservation(btn.dataset.cancelRes);
            toast('Reservation cancelled and fee refunded', 'info');
            renderExisting();
        });
    });
}

/* ------------------------------------------------------------------ */
/* Live station availability in the preview                            */
/* ------------------------------------------------------------------ */

RT.on('stations', stations => {
    const s = stations.find(x => x.id === state.stationId);
    if (!s) return;
    const node = $('[data-live="prevAvail"]');
    if (node && node.textContent !== String(s.available)) {
        node.textContent = s.available;
        node.classList.add('count-tick');
        setTimeout(() => node.classList.remove('count-tick'), 340);
    }
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

initStations();
initVehicles();
renderStationPreview();
renderVehiclePreview();
renderConnectors();
renderDates();
renderSlots();
renderSummary();
renderExisting();
