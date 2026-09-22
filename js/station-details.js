/* ==========================================================================
   EVRide — station-details.js
   Controller for charging-details.html.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { boot, fmt, $, $$, esc, icons, toast, initAccordions } from './main.js';
import mountChrome from './navbar.js';
import { createMap } from './map.js';

boot();
mountChrome({ solidNav: true });

const id = new URLSearchParams(location.search).get('id');
const station = id ? Store.getStation(id) : Store.getStations()[0];

if (!station) {
    $('#stationContent').innerHTML = `
    <div class="empty" style="padding:80px 20px">
        <div class="empty-icon"><i data-lucide="zap-off"></i></div>
        <h4>Station not found</h4>
        <p>That charging station is no longer listed, or the link is incomplete.</p>
        <a href="charging-stations.html" class="btn btn-primary mt-6">Find charging stations</a>
    </div>`;
    icons();
} else {
    document.title = `${station.name} | EVRide Charging`;
    $('#crumbName').textContent = station.name;
    // render() runs at the end of this module: it reads the AMENITY_ICON
    // const declared below, and a const is not hoisted.
}

/* ------------------------------------------------------------------ */
/* Amenity icons                                                       */
/* ------------------------------------------------------------------ */

const AMENITY_ICON = {
    'Café': 'coffee', 'Restroom': 'bath', 'WiFi': 'wifi', 'Lounge': 'sofa',
    'Shopping': 'shopping-bag', 'Parking': 'square-parking', 'Valet': 'concierge-bell',
    'Fleet Bay': 'truck'
};

/* ------------------------------------------------------------------ */
/* Occupancy pattern — deterministic per station                       */
/* ------------------------------------------------------------------ */

function occupancyByHour(s) {
    // Two commuter peaks, quiet overnight. Seeded off the station id so each
    // station has its own consistent shape.
    let seed = 0;
    for (let i = 0; i < s.id.length; i++) seed += s.id.charCodeAt(i);

    return Array.from({ length: 24 }, (_, h) => {
        const morning = Math.exp(-Math.pow(h - 9, 2) / 8);
        const evening = Math.exp(-Math.pow(h - 18.5, 2) / 10);
        const night = h < 6 ? 0.12 : 0;
        const wobble = ((seed * (h + 3)) % 17) / 100;
        return Math.min(1, morning * 0.8 + evening * 0.95 + night + wobble);
    });
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function render() {
    const s = station;
    const occ = occupancyByHour(s);
    const nowHour = new Date().getHours();

    const bays = Array.from({ length: s.total }, (_, i) => {
        if (i < s.available) return 'free';
        if (i < s.available + s.busy) return 'busy';
        return 'offline';
    });

    $('#stationContent').innerHTML = `
    <!-- Hero -->
    <div class="cs-hero">
        <img src="${esc(s.image)}" alt="${esc(s.name)}" data-fallback="${esc(s.name)}">
        <div class="cs-hero-overlay">
            <div>
                <div class="flex gap-2 mb-3 flex-wrap">
                    <span class="badge ${s.status === 'available' ? 'badge-green' : s.status === 'busy' ? 'badge-warning' : 'badge-muted'}"
                          data-live="statusBadge">
                        <span class="status-dot ${esc(s.status)}" style="width:6px;height:6px"></span>
                        ${esc(fmt.statusLabel(s.status))}
                    </span>
                    ${s.speed >= 150 ? '<span class="badge badge-purple">Hyperhub</span>' : ''}
                    ${s.hours === '24/7' ? '<span class="badge badge-blue">Open 24/7</span>' : ''}
                </div>
                <h1 style="font-size:clamp(1.7rem,3.4vw,2.5rem);color:var(--white)">${esc(s.name)}</h1>
                <p style="color:var(--text-secondary);font-size:.92rem;margin-top:6px">
                    ${esc(s.operator)} · ${esc(s.address)}
                </p>
            </div>
            <div class="flex gap-3 items-center">
                <span class="rating" style="font-size:.95rem">
                    <i data-lucide="star" style="fill:currentColor;width:16px;height:16px"></i>
                    ${s.rating} <span>(${s.reviews})</span>
                </span>
            </div>
        </div>
    </div>

    <div class="cs-detail-layout">
        <!-- ============ MAIN ============ -->
        <div>
            <!-- Live availability -->
            <div class="card mb-6">
                <div class="card-head">
                    <div>
                        <div class="card-title">Live bay availability</div>
                        <div class="card-sub">Updated continuously from the station controller</div>
                    </div>
                    <span class="live-tag">Live</span>
                </div>

                <div class="flex gap-6 items-center mb-6 flex-wrap">
                    <div>
                        <div style="font-family:var(--font-display);font-size:3rem;line-height:1;letter-spacing:-.05em;color:var(--primary)"
                             data-live="available">${s.available}</div>
                        <div class="text-muted" style="font-size:.82rem">of ${s.total} bays free</div>
                    </div>
                    <div style="flex:1;min-width:200px">
                        <div class="bar bar-lg mb-2">
                            <div class="bar-fill green" data-live="availBar"
                                 style="width:${s.total ? s.available / s.total * 100 : 0}%"></div>
                        </div>
                        <div class="flex gap-4 flex-wrap" style="font-size:.78rem;color:var(--text-muted)">
                            <span><span class="legend-dot available"></span> <strong data-live="freeCount">${s.available}</strong> free</span>
                            <span><span class="legend-dot reserved"></span> <strong data-live="busyCount">${s.busy}</strong> in use</span>
                            <span><span class="legend-dot maintenance"></span> <strong data-live="offCount">${s.offline}</strong> offline</span>
                        </div>
                    </div>
                </div>

                <div class="bay-grid" id="bayGrid">
                    ${bays.map((b, i) => `
                    <div class="bay ${b}">
                        <div class="bay-icon"><i data-lucide="${b === 'offline' ? 'plug' : 'plug-zap'}"></i></div>
                        <div class="bay-num">Bay ${String(i + 1).padStart(2, '0')}</div>
                        <div class="bay-status">${b === 'free' ? 'Available' : b === 'busy' ? 'In use' : 'Offline'}</div>
                        <div class="bay-power">${s.speed} kW · ${esc(s.connectors[i % s.connectors.length])}</div>
                    </div>`).join('')}
                </div>
            </div>

            <!-- Pricing -->
            <div class="card mb-6">
                <div class="card-head">
                    <div class="card-title">Pricing</div>
                    <span class="text-muted" style="font-size:.8rem">No membership required</span>
                </div>
                <div class="price-tiers">
                    <div class="price-tier">
                        <div class="price-tier-name">Energy</div>
                        <div class="price-tier-val">₹${s.price}<small>/kWh</small></div>
                        <div class="price-tier-sub">Billed per kWh delivered</div>
                    </div>
                    <div class="price-tier">
                        <div class="price-tier-name">Reservation</div>
                        <div class="price-tier-val">₹40</div>
                        <div class="price-tier-sub">Credited to your session</div>
                    </div>
                    <div class="price-tier">
                        <div class="price-tier-name">Idle fee</div>
                        <div class="price-tier-val">₹5<small>/min</small></div>
                        <div class="price-tier-sub">After 10 min at full charge</div>
                    </div>
                    <div class="price-tier">
                        <div class="price-tier-name">Typical 60 kWh</div>
                        <div class="price-tier-val">₹${Math.round(s.price * 48)}</div>
                        <div class="price-tier-sub">10% to 90% charge</div>
                    </div>
                </div>
            </div>

            <!-- Busy times -->
            <div class="card mb-6">
                <div class="card-head">
                    <div>
                        <div class="card-title">Typical busy times</div>
                        <div class="card-sub">Based on the last 30 days at this station</div>
                    </div>
                    <span class="badge badge-green" id="busyNow">—</span>
                </div>
                <div class="occupancy">
                    ${occ.map((v, h) => `
                    <div class="occ-bar ${h === nowHour ? 'now' : ''}"
                         style="height:${Math.max(6, v * 100)}%"
                         title="${String(h).padStart(2, '0')}:00 — ${Math.round(v * 100)}% occupied"></div>`).join('')}
                </div>
                <div class="occ-labels">
                    <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
                </div>
            </div>

            <!-- Connectors & amenities -->
            <div class="grid grid-2 gap-5 mb-6">
                <div class="card">
                    <div class="card-head"><div class="card-title">Connectors</div></div>
                    <div class="flex flex-col gap-3">
                        ${s.connectors.map(c => `
                        <div class="flex items-center gap-3">
                            <span class="stat-icon blue" style="width:34px;height:34px">
                                <i data-lucide="plug" style="width:15px;height:15px"></i>
                            </span>
                            <div style="flex:1">
                                <strong style="display:block;font-size:.88rem;color:var(--text-primary)">${esc(c)}</strong>
                                <span style="font-size:.76rem;color:var(--text-muted)">
                                    Up to ${s.speed} kW ${c === 'Type 2' ? 'AC' : 'DC'}
                                </span>
                            </div>
                        </div>`).join('')}
                    </div>
                </div>

                <div class="card">
                    <div class="card-head"><div class="card-title">Amenities</div></div>
                    <div class="amenities">
                        ${s.amenities.map(a => `
                        <span class="amenity">
                            <i data-lucide="${AMENITY_ICON[a] || 'check'}"></i> ${esc(a)}
                        </span>`).join('')}
                    </div>
                    <div class="divider"></div>
                    <div class="meta-list">
                        <div class="meta-row">
                            <span class="meta-k">Opening hours</span>
                            <span class="meta-v">${esc(s.hours)}</span>
                        </div>
                        <div class="meta-row">
                            <span class="meta-k">Sessions today</span>
                            <span class="meta-v" data-live="sessions">${s.sessionsToday}</span>
                        </div>
                        <div class="meta-row">
                            <span class="meta-k">Energy delivered today</span>
                            <span class="meta-v" data-live="energy">${fmt.num(s.energyToday)} kWh</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Map -->
            <div class="card mb-6">
                <div class="card-head">
                    <div class="card-title">Location</div>
                    <span class="text-muted" style="font-size:.82rem">${s.distance} km away</span>
                </div>
                <div class="map map-sm" id="stationMap"></div>
            </div>

            <!-- FAQ -->
            <div class="card">
                <div class="card-head"><div class="card-title">Good to know</div></div>
                <div class="accordion" data-single="true">
                    <div class="acc-item">
                        <button class="acc-head"><span>How do I start a session here?</span>
                            <span class="acc-icon"><i data-lucide="chevron-down"></i></span></button>
                        <div class="acc-body"><div class="acc-body-inner">
                            Plug in, then tap Start Charging in the EVRide app or scan the QR code on
                            the bay. Billing begins the moment energy starts flowing and stops the
                            second you unplug.
                        </div></div>
                    </div>
                    <div class="acc-item">
                        <button class="acc-head"><span>What if all bays are occupied?</span>
                            <span class="acc-icon"><i data-lucide="chevron-down"></i></span></button>
                        <div class="acc-body"><div class="acc-body-inner">
                            Join the virtual queue in the app and you'll get a notification the moment
                            a bay frees up, with fifteen minutes to arrive. Reserving ahead avoids the
                            queue entirely.
                        </div></div>
                    </div>
                    <div class="acc-item">
                        <button class="acc-head"><span>Why is my car charging slower than ${s.speed} kW?</span>
                            <span class="acc-icon"><i data-lucide="chevron-down"></i></span></button>
                        <div class="acc-body"><div class="acc-body-inner">
                            Charging speed is limited by whichever is lower: the charger's output or
                            your vehicle's peak acceptance rate. It also tapers above 80% state of
                            charge to protect the battery, and drops in very cold or very hot weather.
                        </div></div>
                    </div>
                    <div class="acc-item">
                        <button class="acc-head"><span>Is there an idle fee?</span>
                            <span class="acc-icon"><i data-lucide="chevron-down"></i></span></button>
                        <div class="acc-body"><div class="acc-body-inner">
                            Yes — ₹5 per minute once your car has been at full charge for more than
                            ten minutes. It keeps bays moving at busy sites. You'll get a push
                            notification before it starts.
                        </div></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ============ SIDEBAR ============ -->
        <aside class="book-panel">
            <div class="book-panel-head">
                <div class="flex items-center gap-3 mb-3">
                    <span class="cs-icon"><i data-lucide="zap"></i></span>
                    <div>
                        <div style="font-family:var(--font-display);font-size:1.15rem;color:var(--text-primary);letter-spacing:-.02em">
                            ${s.speed} kW
                        </div>
                        <div class="text-muted" style="font-size:.78rem">Maximum output</div>
                    </div>
                </div>
                <div class="flex items-baseline gap-2">
                    <strong style="font-family:var(--font-display);font-size:2rem;color:var(--primary);letter-spacing:-.04em">
                        ₹${s.price}
                    </strong>
                    <span class="text-muted" style="font-size:.88rem">per kWh</span>
                </div>
            </div>

            <div class="book-panel-body">
                <div class="meta-list">
                    <div class="meta-row">
                        <span class="meta-k">Available now</span>
                        <span class="meta-v text-green" data-live="sideAvail">${s.available} of ${s.total}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Distance</span>
                        <span class="meta-v">${s.distance} km</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Operator</span>
                        <span class="meta-v">${esc(s.operator)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Hours</span>
                        <span class="meta-v">${esc(s.hours)}</span>
                    </div>
                </div>

                <div class="divider" style="margin:4px 0"></div>

                <a href="charging-reservation.html?station=${esc(s.id)}"
                   class="btn btn-primary btn-lg btn-block ${s.status === 'offline' ? 'is-disabled' : ''}">
                    <i data-lucide="calendar-clock"></i> Reserve Charger
                </a>

                <button class="btn btn-secondary btn-block" id="startCharging">
                    <i data-lucide="zap"></i> Start Charging Now
                </button>

                <button class="btn btn-secondary btn-block" id="navigateBtn">
                    <i data-lucide="navigation"></i> Navigate Here
                </button>

                <p class="text-center text-muted" style="font-size:.78rem">
                    Reservation fee ₹40, credited against your session.
                </p>
            </div>

            <div class="trust-strip">
                <div class="trust-row"><i data-lucide="shield-check"></i> Verified EVRide partner site</div>
                <div class="trust-row"><i data-lucide="headset"></i> 24/7 remote assistance</div>
                <div class="trust-row"><i data-lucide="receipt"></i> Itemised billing per session</div>
            </div>
        </aside>
    </div>`;

    icons();
    initAccordions();
    initMap();
    bindActions();
    updateBusyNow(occ, nowHour);
}

function updateBusyNow(occ, hour) {
    const level = occ[hour];
    const badge = $('#busyNow');
    if (!badge) return;
    if (level > 0.7) {
        badge.className = 'badge badge-danger';
        badge.textContent = 'Busier than usual';
    } else if (level > 0.4) {
        badge.className = 'badge badge-warning';
        badge.textContent = 'Moderately busy';
    } else {
        badge.className = 'badge badge-green';
        badge.textContent = 'Quieter than usual';
    }
}

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

function initMap() {
    const map = createMap('stationMap', { center: [station.lat, station.lng], zoom: 15 });
    if (!map) return;
    map.addMarker(station.id, station.lat, station.lng, {
        status: 'charging',
        pulsing: true,
        popup: `<div class="map-popup"><h6>${esc(station.name)}</h6>
                <p style="font-size:.78rem;margin:0">${esc(station.address)}</p></div>`
    });
    map.invalidate();
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

function bindActions() {
    $('#navigateBtn')?.addEventListener('click', () => {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;
        window.open(url, '_blank', 'noopener');
    });

    $('#startCharging')?.addEventListener('click', () => {
        if (station.available === 0) {
            toast('All bays are occupied right now. Reserve one to skip the queue.', 'warning', 'No bays free');
            return;
        }

        // Charge the user's most recently used vehicle, or the first available.
        const recent = Store.getRecentlyViewed()[0];
        const vehicle = (recent && Store.getVehicle(recent))
            || Store.getVehicles().find(v => v.status === 'available')
            || Store.getVehicles()[0];

        if (!vehicle) {
            toast('No vehicle linked to your account yet', 'error');
            return;
        }

        RT.startCharging({
            vehicleId: vehicle.id,
            stationId: station.id,
            targetSoc: 100,
            maxPower: station.speed,
            pricePerKwh: station.price
        });

        toast(`Charging started for ${vehicle.name}`, 'success', 'Session active');
        setTimeout(() => location.href = 'charging-dashboard.html', 900);
    });
}

/* ------------------------------------------------------------------ */
/* Live updates                                                        */
/* ------------------------------------------------------------------ */

RT.on('stations', stations => {
    const s = stations.find(x => x.id === station.id);
    if (!s) return;
    Object.assign(station, s);

    const set = (key, value) => {
        const node = $(`[data-live="${key}"]`);
        if (node && node.textContent !== String(value)) {
            node.textContent = value;
            node.classList.add('value-flash');
            setTimeout(() => node.classList.remove('value-flash'), 800);
        }
    };

    set('available', s.available);
    set('freeCount', s.available);
    set('busyCount', s.busy);
    set('offCount', s.offline);
    set('sessions', s.sessionsToday);
    set('energy', fmt.num(s.energyToday) + ' kWh');
    set('sideAvail', `${s.available} of ${s.total}`);

    const bar = $('[data-live="availBar"]');
    if (bar) bar.style.width = (s.total ? s.available / s.total * 100 : 0) + '%';

    const badge = $('[data-live="statusBadge"]');
    if (badge) {
        badge.className = `badge ${s.status === 'available' ? 'badge-green' : s.status === 'busy' ? 'badge-warning' : 'badge-muted'}`;
        badge.innerHTML = `<span class="status-dot ${s.status}" style="width:6px;height:6px"></span> ${fmt.statusLabel(s.status)}`;
    }

    // Repaint the bay grid.
    const grid = $('#bayGrid');
    if (grid) {
        $$('.bay', grid).forEach((bay, i) => {
            const cls = i < s.available ? 'free' : i < s.available + s.busy ? 'busy' : 'offline';
            bay.className = `bay ${cls}`;
            const status = bay.querySelector('.bay-status');
            if (status) status.textContent = cls === 'free' ? 'Available' : cls === 'busy' ? 'In use' : 'Offline';
        });
    }
});

/* ------------------------------------------------------------------ */
/* Initial paint — after every const above has been initialised.       */
/* ------------------------------------------------------------------ */

if (station) render();
