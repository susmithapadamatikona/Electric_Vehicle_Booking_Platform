/* ==========================================================================
   EVRide — charging.js
   Controller for charging-stations.html: search, filter, sort, live map.
   Also exports the station-card renderer reused by other charging pages.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { CITY } from './data.js';
import { boot, fmt, $, $$, esc, icons, toast, debounce } from './main.js';
import mountChrome from './navbar.js';
import { createMap, stationPopup } from './map.js';

boot();
mountChrome({ solidNav: true });

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
    query: '',
    filter: 'all',
    sort: 'distance',
    activeId: null,
    results: []
};

let map = null;

/* ------------------------------------------------------------------ */
/* Card renderer (exported for reuse)                                  */
/* ------------------------------------------------------------------ */

export function stationCard(s, active = false) {
    const bays = Array.from({ length: Math.min(s.total, 24) }, (_, i) => {
        if (i < s.available) return 'free';
        if (i < s.available + s.busy) return 'busy';
        return 'offline';
    });

    return `
    <button type="button" class="cs-card ${active ? 'active' : ''}" data-station="${esc(s.id)}">
        <div class="cs-card-head">
            <span class="cs-icon ${s.status === 'busy' ? 'busy' : s.status === 'offline' ? 'offline' : ''}">
                <i data-lucide="zap"></i>
            </span>
            <span class="cs-head-body">
                <span class="cs-name">${esc(s.name)}</span>
                <span class="cs-operator">${esc(s.operator)} · ${esc(s.hours)}</span>
                <span class="cs-address">${esc(s.address)}</span>
            </span>
            <span class="rating" style="flex-shrink:0">
                <i data-lucide="star" style="fill:currentColor"></i> ${s.rating}
            </span>
        </div>

        <div class="cs-avail">
            <span class="cs-avail-num ${s.available === 0 ? 'none' : ''}" data-cs-avail="${esc(s.id)}">${s.available}</span>
            <span class="cs-avail-body">
                <span class="cs-avail-label">
                    of ${s.total} bays free${s.queue ? ` · ${fmt.plural(s.queue, 'car')} waiting` : ''}
                </span>
                <span class="cs-bays" data-cs-bays="${esc(s.id)}">
                    ${bays.map(b => `<span class="cs-bay ${b}"></span>`).join('')}
                </span>
            </span>
        </div>

        <div class="cs-meta">
            <span><i data-lucide="map-pin"></i> <strong>${s.distance}</strong> km</span>
            <span><i data-lucide="gauge"></i> <strong>${s.speed}</strong> kW</span>
            <span><i data-lucide="indian-rupee"></i> <strong>${s.price}</strong>/kWh</span>
            <span><i data-lucide="activity"></i> ${s.sessionsToday} today</span>
        </div>

        <div class="cs-tags">
            ${s.connectors.map(c => `<span class="badge badge-muted">${esc(c)}</span>`).join('')}
            ${s.speed >= 150 ? '<span class="badge badge-purple">Hyperhub</span>' : ''}
            ${s.hours === '24/7' ? '<span class="badge badge-blue">24/7</span>' : ''}
        </div>

        <div class="cs-actions">
            <a href="charging-details.html?id=${esc(s.id)}" class="btn btn-secondary btn-sm">Details</a>
            <a href="charging-reservation.html?station=${esc(s.id)}"
               class="btn btn-primary btn-sm ${s.status === 'offline' ? 'is-disabled' : ''}">
                ${s.status === 'offline' ? 'Offline' : 'Reserve'}
            </a>
        </div>
    </button>`;
}

/* ------------------------------------------------------------------ */
/* Filter & sort                                                       */
/* ------------------------------------------------------------------ */

function applyFilters(stations) {
    let out = [...stations];

    if (state.query) {
        const q = state.query.toLowerCase();
        out = out.filter(s =>
            `${s.name} ${s.address} ${s.operator} ${s.connectors.join(' ')}`.toLowerCase().includes(q));
    }

    switch (state.filter) {
        case 'available': out = out.filter(s => s.available > 0); break;
        case 'fast':      out = out.filter(s => s.speed >= 150); break;
        case 'dc':        out = out.filter(s => s.type === 'dc'); break;
        case 'ac':        out = out.filter(s => s.type === 'ac'); break;
        case '24h':       out = out.filter(s => s.hours === '24/7'); break;
    }

    const sorters = {
        distance:  (a, b) => a.distance - b.distance,
        available: (a, b) => b.available - a.available,
        speed:     (a, b) => b.speed - a.speed,
        price:     (a, b) => a.price - b.price,
        rating:    (a, b) => b.rating - a.rating
    };

    return out.sort(sorters[state.sort] || sorters.distance);
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function render() {
    state.results = applyFilters(Store.getStations());
    const wrap = $('#csResults');

    $('#csCount').textContent = state.results.length;

    if (!state.results.length) {
        wrap.innerHTML = `
        <div class="empty">
            <div class="empty-icon"><i data-lucide="zap-off"></i></div>
            <h4>No stations match</h4>
            <p>Try clearing a filter or widening your search area.</p>
            <button class="btn btn-secondary btn-sm mt-4" id="csReset">
                <i data-lucide="rotate-ccw"></i> Reset filters
            </button>
        </div>`;
        icons();
        $('#csReset')?.addEventListener('click', resetFilters);
        return;
    }

    wrap.innerHTML = state.results.map(s => stationCard(s, s.id === state.activeId)).join('');
    icons();

    $$('[data-station]', wrap).forEach(card => {
        card.addEventListener('click', e => {
            // Let the action links work normally.
            if (e.target.closest('a')) return;
            selectStation(card.dataset.station);
        });
    });

    updateMap();
}

function selectStation(id) {
    state.activeId = id;
    const s = Store.getStation(id);
    if (!s) return;

    $$('.cs-card').forEach(c => c.classList.toggle('active', c.dataset.station === id));

    if (map) {
        map.setView(s.lat, s.lng, 15);
        if (!map.isFallback) map.panTo(s.lat, s.lng);
    }
}

function resetFilters() {
    state.query = '';
    state.filter = 'all';
    $('#csSearch').value = '';
    $$('[data-cf]').forEach(c => c.classList.toggle('active', c.dataset.cf === 'all'));
    render();
}

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

function initMap() {
    map = createMap('csMap', { center: [CITY.lat, CITY.lng], zoom: 11 });
    updateMap();
    if (map && !map.isFallback) map.fitMarkers(60);
    map?.invalidate();
}

function updateMap() {
    if (!map) return;

    const seen = new Set();
    state.results.forEach(s => {
        seen.add(s.id);
        map.addMarker(s.id, s.lat, s.lng, {
            status: s.status === 'available' ? 'charging'
                  : s.status === 'busy' ? 'reserved' : 'maintenance',
            popup: stationPopup(s),
            pulsing: s.status === 'available'
        });
    });

    [...map.markers.keys()].forEach(id => { if (!seen.has(id)) map.removeMarker(id); });
}

/* ------------------------------------------------------------------ */
/* Header stats                                                        */
/* ------------------------------------------------------------------ */

function updateStats() {
    const s = RT.stationStats();
    const set = (id, val) => {
        const node = $(id);
        if (node && node.textContent !== String(val)) {
            node.textContent = val;
            node.classList.add('count-tick');
            setTimeout(() => node.classList.remove('count-tick'), 340);
        }
    };
    set('#statAvail', s.available);
    set('#statTotal', s.chargers);
    set('#statStations', s.total);
}

/* ------------------------------------------------------------------ */
/* Bindings                                                            */
/* ------------------------------------------------------------------ */

$('#csSearch').addEventListener('input', debounce(e => {
    state.query = e.target.value;
    render();
}, 260));

$$('[data-cf]').forEach(chip => {
    chip.addEventListener('click', () => {
        $$('[data-cf]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filter = chip.dataset.cf;
        render();
    });
});

$('#csSort').addEventListener('change', e => {
    state.sort = e.target.value;
    render();
});

$('#useLocation').addEventListener('click', () => {
    const btn = $('#useLocation');
    btn.innerHTML = '<span class="spinner"></span> Locating…';
    btn.disabled = true;

    const done = (lat, lng, label) => {
        // Recompute distances from the reported position.
        const stations = Store.getStations().map(s => ({
            ...s,
            distance: +Math.hypot((s.lat - lat) * 111, (s.lng - lng) * 109).toFixed(1)
        }));
        Store.setStations(stations);
        state.sort = 'distance';
        $('#csSort').value = 'distance';
        render();
        if (map) map.setView(lat, lng, 13);
        btn.innerHTML = '<i data-lucide="crosshair"></i> Use my current location';
        btn.disabled = false;
        icons();
        toast(`Showing stations near ${label}`, 'success');
    };

    if (!navigator.geolocation) {
        done(CITY.lat, CITY.lng, CITY.name);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        pos => done(pos.coords.latitude, pos.coords.longitude, 'your location'),
        () => {
            // Denied or unavailable — fall back to the city centre rather than failing.
            done(CITY.lat, CITY.lng, CITY.name);
        },
        { timeout: 6000, maximumAge: 300000 }
    );
});

/* ------------------------------------------------------------------ */
/* Live updates                                                        */
/* ------------------------------------------------------------------ */

RT.on('stations', stations => {
    updateStats();

    // Patch the visible cards in place rather than re-rendering the list.
    stations.forEach(s => {
        const num = $(`[data-cs-avail="${s.id}"]`);
        if (num && num.textContent !== String(s.available)) {
            num.textContent = s.available;
            num.classList.toggle('none', s.available === 0);
            num.classList.add('count-tick');
            setTimeout(() => num.classList.remove('count-tick'), 340);
        }

        const bays = $(`[data-cs-bays="${s.id}"]`);
        if (bays) {
            const nodes = $$('.cs-bay', bays);
            nodes.forEach((node, i) => {
                const cls = i < s.available ? 'free' : i < s.available + s.busy ? 'busy' : 'offline';
                node.className = `cs-bay ${cls}`;
            });
        }

        const icon = $(`[data-station="${s.id}"] .cs-icon`);
        if (icon) {
            icon.className = `cs-icon ${s.status === 'busy' ? 'busy' : s.status === 'offline' ? 'offline' : ''}`;
        }
    });

    // Keep the marker colours honest.
    updateMap();

    // If the "available now" filter is on, membership can change.
    if (state.filter === 'available') {
        const next = applyFilters(stations);
        if (next.length !== state.results.length) render();
    }
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

updateStats();
render();
initMap();

// Deep link: ?id=cs-02 focuses that station.
const focusId = new URLSearchParams(location.search).get('id');
if (focusId) {
    setTimeout(() => {
        selectStation(focusId);
        $(`[data-station="${focusId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
}
