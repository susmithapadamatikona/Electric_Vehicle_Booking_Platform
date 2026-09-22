/* ==========================================================================
   EVRide — locations.js
   Controller for locations.html.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { LOCATIONS, CITY } from './data.js';
import { boot, fmt, $, $$, esc, icons, toast, debounce } from './main.js';
import mountChrome from './navbar.js';
import { createMap } from './map.js';

boot();
mountChrome({ solidNav: true });

let map = null;
let filter = 'all';
let query = '';
let activeId = null;

/* ------------------------------------------------------------------ */
/* Live per-location counts                                            */
/* ------------------------------------------------------------------ */

/**
 * The seed data gives each location a nominal vehicle count. Overlay the
 * live simulation so the numbers move with the fleet rather than sitting
 * frozen.
 */
function enrich(loc) {
    const vehicles = Store.getVehicles().filter(v => v.locationId === loc.id);
    const available = vehicles.filter(v => v.status === 'available').length;
    const station = Store.getStations().find(s =>
        Math.abs(s.lat - loc.lat) < 0.01 && Math.abs(s.lng - loc.lng) < 0.01);

    return {
        ...loc,
        liveVehicles: vehicles.length || loc.vehicles,
        liveAvailable: vehicles.length ? available : Math.round(loc.vehicles * 0.55),
        liveChargers: station ? station.total : loc.chargers,
        freeChargers: station ? station.available : Math.round(loc.chargers * 0.4),
        stationId: station ? station.id : null
    };
}

function filtered() {
    let list = LOCATIONS.map(enrich);

    if (query) {
        const q = query.toLowerCase();
        list = list.filter(l => `${l.name} ${l.area} ${l.city}`.toLowerCase().includes(q));
    }
    if (filter !== 'all') list = list.filter(l => l.type === filter);

    return list;
}

/* ------------------------------------------------------------------ */
/* Header stats                                                        */
/* ------------------------------------------------------------------ */

function renderStats() {
    const all = LOCATIONS.map(enrich);
    const set = (id, v) => {
        const node = $(id);
        if (node && node.textContent !== String(v)) {
            node.textContent = v;
            node.classList.add('count-tick');
            setTimeout(() => node.classList.remove('count-tick'), 340);
        }
    };
    set('#locCount', all.length);
    set('#locVehicles', all.reduce((a, l) => a + l.liveVehicles, 0));
    set('#locChargers', all.reduce((a, l) => a + l.liveChargers, 0));
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

const TYPE_ICON = { hub: 'building-2', airport: 'plane', depot: 'warehouse', pickup: 'map-pin' };
const TYPE_LABEL = { hub: 'Hub', airport: 'Airport', depot: 'Depot', pickup: 'Pickup point' };

function renderList() {
    const list = filtered();
    const wrap = $('#locList');

    if (!list.length) {
        wrap.innerHTML = `
        <div class="empty" style="padding:50px 20px">
            <div class="empty-icon"><i data-lucide="map-pin-off"></i></div>
            <h4>No locations match</h4>
            <p>Try a different area or clear the filter.</p>
        </div>`;
        icons();
        return;
    }

    wrap.innerHTML = list.map(l => `
        <button type="button" class="loc-item ${l.id === activeId ? 'active' : ''}" data-loc="${esc(l.id)}">
            <span class="loc-item-icon ${l.type === 'airport' ? 'airport' : l.type === 'depot' ? 'depot' : ''}">
                <i data-lucide="${TYPE_ICON[l.type] || 'map-pin'}"></i>
            </span>
            <span class="loc-item-body">
                <strong>${esc(l.name)}</strong>
                <span>${esc(l.area)}, ${esc(l.city)} · ${esc(TYPE_LABEL[l.type] || 'Location')}</span>
                <span class="loc-item-stats">
                    <span><i data-lucide="car"></i>
                        <strong class="text-green" data-loc-avail="${esc(l.id)}">${l.liveAvailable}</strong>
                        of ${l.liveVehicles} free
                    </span>
                    <span><i data-lucide="zap"></i>
                        <strong class="text-blue" data-loc-chg="${esc(l.id)}">${l.freeChargers}</strong>
                        of ${l.liveChargers} bays
                    </span>
                </span>
            </span>
            <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text-muted);flex-shrink:0"></i>
        </button>`).join('');

    icons();

    $$('[data-loc]', wrap).forEach(btn => {
        btn.addEventListener('click', () => select(btn.dataset.loc));
    });
}

function select(id) {
    activeId = id;
    const loc = LOCATIONS.find(l => l.id === id);
    if (!loc) return;

    $$('.loc-item').forEach(n => n.classList.toggle('active', n.dataset.loc === id));

    if (map) {
        map.setView(loc.lat, loc.lng, 15);
        if (!map.isFallback) map.panTo(loc.lat, loc.lng);
    }
}

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

function initMap() {
    map = createMap('locMap', { center: [CITY.lat, CITY.lng], zoom: 11 });
    updateMap();
    if (map && !map.isFallback) map.fitMarkers(60);
    map?.invalidate();
}

function updateMap() {
    if (!map) return;

    const list = filtered();
    const seen = new Set();

    list.forEach(l => {
        seen.add(l.id);
        const status = l.type === 'airport' ? 'on_trip'
                     : l.type === 'depot' ? 'charging'
                     : l.type === 'pickup' ? 'reserved' : 'available';

        map.addMarker(l.id, l.lat, l.lng, {
            status,
            pulsing: l.liveAvailable > 0,
            popup: `<div class="map-popup">
                <h6>${esc(l.name)}</h6>
                <div class="map-popup-meta">
                    <span>${esc(l.area)}</span>
                    <span>${esc(TYPE_LABEL[l.type] || '')}</span>
                </div>
                <div class="map-popup-meta">
                    <span><strong style="color:var(--primary)">${l.liveAvailable}</strong> EVs free</span>
                    <span><strong style="color:var(--electric-blue)">${l.freeChargers}</strong> bays free</span>
                </div>
                <a href="explore-evs.html?loc=${esc(l.id)}" class="btn btn-primary btn-xs btn-block">
                    View vehicles here
                </a>
            </div>`
        });
    });

    [...map.markers.keys()].forEach(id => { if (!seen.has(id)) map.removeMarker(id); });
}

/* ------------------------------------------------------------------ */
/* Cities                                                              */
/* ------------------------------------------------------------------ */

const CITIES = [
    { name: 'Bengaluru', vehicles: 4820, chargers: 612, live: true,  hubs: 12 },
    { name: 'Mumbai',    vehicles: 3140, chargers: 428, live: true,  hubs: 9 },
    { name: 'Delhi NCR', vehicles: 3680, chargers: 496, live: true,  hubs: 11 },
    { name: 'Hyderabad', vehicles: 2210, chargers: 284, live: true,  hubs: 7 },
    { name: 'Pune',      vehicles: 1640, chargers: 208, live: true,  hubs: 6 },
    { name: 'Chennai',   vehicles: 1480, chargers: 192, live: true,  hubs: 5 },
    { name: 'Kolkata',   vehicles: 960,  chargers: 124, live: true,  hubs: 4 },
    { name: 'Ahmedabad', vehicles: 740,  chargers: 96,  live: true,  hubs: 3 },
    { name: 'Jaipur',    vehicles: 420,  chargers: 58,  live: true,  hubs: 2 },
    { name: 'Kochi',     vehicles: 380,  chargers: 52,  live: true,  hubs: 2 },
    { name: 'Chandigarh',vehicles: 310,  chargers: 44,  live: true,  hubs: 2 },
    { name: 'Goa',       vehicles: 280,  chargers: 38,  live: true,  hubs: 2 },
    { name: 'Lucknow',   vehicles: 0,    chargers: 0,   live: false, hubs: 0 },
    { name: 'Coimbatore',vehicles: 0,    chargers: 0,   live: false, hubs: 0 }
];

function renderCities() {
    $('#cityGrid').innerHTML = CITIES.map((c, i) => `
        <div class="card ${c.live ? 'card-hover' : ''}" style="${c.live ? '' : 'opacity:.6'}" data-reveal data-reveal-delay="${i * 40}">
            <div class="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h4 style="font-size:1.02rem;margin-bottom:4px">${esc(c.name)}</h4>
                    <span class="text-muted" style="font-size:.78rem">
                        ${c.live ? `${c.hubs} ${c.hubs === 1 ? 'hub' : 'hubs'}` : 'Coming 2026'}
                    </span>
                </div>
                <span class="badge ${c.live ? 'badge-green' : 'badge-muted'}">
                    ${c.live ? 'Live' : 'Soon'}
                </span>
            </div>
            ${c.live ? `
            <div class="flex gap-4" style="font-size:.8rem;color:var(--text-secondary)">
                <span><strong class="text-primary">${fmt.compact(c.vehicles)}</strong> EVs</span>
                <span><strong class="text-blue">${c.chargers}</strong> chargers</span>
            </div>` : `
            <button class="btn btn-secondary btn-xs" data-notify-city="${esc(c.name)}">
                <i data-lucide="bell"></i> Notify me
            </button>`}
        </div>`).join('');

    icons();

    $$('[data-notify-city]').forEach(btn => {
        btn.addEventListener('click', () => {
            toast(`We'll email you the moment EVRide launches in ${btn.dataset.notifyCity}.`,
                'success', 'On the list');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="check"></i> Added';
            icons();
        });
    });
}

/* ------------------------------------------------------------------ */
/* Bindings                                                            */
/* ------------------------------------------------------------------ */

$('#locSearch').addEventListener('input', debounce(e => {
    query = e.target.value;
    renderList();
    updateMap();
}, 250));

$$('[data-lf]').forEach(chip => {
    chip.addEventListener('click', () => {
        $$('[data-lf]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filter = chip.dataset.lf;
        renderList();
        updateMap();
        if (map && !map.isFallback) map.fitMarkers(60);
    });
});

/* ------------------------------------------------------------------ */
/* Live updates                                                        */
/* ------------------------------------------------------------------ */

RT.on('vehicles', () => {
    renderStats();
    LOCATIONS.map(enrich).forEach(l => {
        const node = $(`[data-loc-avail="${l.id}"]`);
        if (node && node.textContent !== String(l.liveAvailable)) {
            node.textContent = l.liveAvailable;
            node.classList.add('count-tick');
            setTimeout(() => node.classList.remove('count-tick'), 340);
        }
    });
});

RT.on('stations', () => {
    LOCATIONS.map(enrich).forEach(l => {
        const node = $(`[data-loc-chg="${l.id}"]`);
        if (node && node.textContent !== String(l.freeChargers)) {
            node.textContent = l.freeChargers;
        }
    });
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

renderStats();
renderList();
renderCities();
initMap();

// Deep link: ?id=loc-03
const focus = new URLSearchParams(location.search).get('id');
if (focus) setTimeout(() => select(focus), 400);
