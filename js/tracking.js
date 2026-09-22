/* ==========================================================================
   EVRide — tracking.js
   Controller for live-tracking.html: live map, trip phases and telemetry.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { LOCATIONS } from './data.js';
import { boot, fmt, $, $$, esc, icons, toast, openModal, closeModal, confirmDialog } from './main.js';
import mountChrome from './navbar.js';
import { createMap } from './map.js';

boot();
mountChrome({ solidNav: true });

/* ------------------------------------------------------------------ */
/* Resolve the trip                                                    */
/* ------------------------------------------------------------------ */

const bookingParam = new URLSearchParams(location.search).get('booking');
let trip = Store.getActiveTrip();

// If a specific booking was requested but isn't the active trip, start one.
if (bookingParam && (!trip || trip.bookingId !== bookingParam)) {
    const booking = Store.getBooking(bookingParam);
    if (booking) {
        const v = Store.getVehicle(booking.vehicleId);
        const origin = v
            ? { lat: v.lat, lng: v.lng, label: booking.pickupLocation }
            : { lat: 12.9784, lng: 77.6408, label: booking.pickupLocation };
        const destLoc = LOCATIONS.find(l => l.name === booking.dropLocation) || LOCATIONS[1];
        trip = RT.startTrip(booking, {
            origin,
            destination: { lat: destLoc.lat, lng: destLoc.lng, label: booking.dropLocation }
        });
    }
}

let map = null;
let follow = true;
let showStations = false;
let breadcrumb = [];

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */


function renderNoTrip() {
    $('#trackLayout').innerHTML = `
    <div class="card" style="grid-column:1/-1">
        <div class="empty" style="padding:80px 20px">
            <div class="empty-icon"><i data-lucide="navigation-off"></i></div>
            <h4>No trip in progress</h4>
            <p>When a booking becomes active, live tracking will appear here with
               your vehicle's position, battery and ETA.</p>
            <div class="flex gap-3 justify-center mt-6 flex-wrap">
                <a href="customer-dashboard.html#bookings" class="btn btn-primary">
                    <i data-lucide="calendar-check"></i> My bookings
                </a>
                <a href="404.html" class="btn btn-secondary">Book an EV</a>
            </div>
        </div>
    </div>`;
    icons();
}

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

function initMap(t) {
    const centre = t.position || t.origin;
    map = createMap('trackMap', { center: [centre.lat, centre.lng], zoom: 14 });
    if (!map) return;

    // Endpoints.
    map.addMarker('origin', t.origin.lat, t.origin.lng, {
        status: 'pickup',
        popup: `<div class="map-popup"><h6>Pickup</h6><p style="font-size:.8rem;margin:0">${esc(t.origin.label)}</p></div>`
    });
    map.addMarker('dest', t.destination.lat, t.destination.lng, {
        status: 'destination',
        popup: `<div class="map-popup"><h6>Destination</h6><p style="font-size:.8rem;margin:0">${esc(t.destination.label)}</p></div>`
    });

    drawRoute(t);
    updateVehicleMarker(t);

    if (!map.isFallback) map.fitMarkers(70);
    map.invalidate();

    bindMapControls();
}

function drawRoute(t) {
    if (!map || map.isFallback) return;

    // A straight line looks fake; bend it with a couple of waypoints so it
    // reads like a road route.
    const { origin: o, destination: d } = t;
    const mid1 = {
        lat: o.lat + (d.lat - o.lat) * 0.35 + 0.004,
        lng: o.lng + (d.lng - o.lng) * 0.35 - 0.003
    };
    const mid2 = {
        lat: o.lat + (d.lat - o.lat) * 0.7 - 0.003,
        lng: o.lng + (d.lng - o.lng) * 0.7 + 0.004
    };

    map.drawRoute([
        [o.lat, o.lng],
        [mid1.lat, mid1.lng],
        [mid2.lat, mid2.lng],
        [d.lat, d.lng]
    ], { color: '#00C8FF' });
}

function updateVehicleMarker(t) {
    if (!map || !t.position) return;

    map.addMarker('vehicle', t.position.lat, t.position.lng, {
        status: 'on_trip',
        pulsing: true,
        popup: `<div class="map-popup">
            <h6>${esc(vehicleName(t))}</h6>
            <div class="map-popup-meta">
                <span>${Math.round(t.battery || 0)}% battery</span>
                <span>${t.speed || 0} km/h</span>
            </div>
        </div>`
    });

    // Leave a fading breadcrumb so movement is legible at a glance.
    breadcrumb.push([t.position.lat, t.position.lng]);
    if (breadcrumb.length > 40) breadcrumb.shift();

    if (follow && !map.isFallback) map.panTo(t.position.lat, t.position.lng);
}

function bindMapControls() {
    $('#followBtn')?.addEventListener('click', () => {
        follow = !follow;
        $('#followBtn').classList.toggle('active', follow);
        toast(follow ? 'Following the vehicle' : 'Free pan enabled', 'info');
        if (follow && trip?.position && map) map.panTo(trip.position.lat, trip.position.lng);
    });

    $('#fitBtn')?.addEventListener('click', () => {
        follow = false;
        $('#followBtn').classList.remove('active');
        if (map && !map.isFallback) map.fitMarkers(70);
    });

    $('#stationsBtn')?.addEventListener('click', () => {
        showStations = !showStations;
        $('#stationsBtn').classList.toggle('active', showStations);

        if (showStations) {
            Store.getStations().slice(0, 8).forEach(s => {
                map.addMarker('st-' + s.id, s.lat, s.lng, {
                    status: 'charging',
                    popup: `<div class="map-popup">
                        <h6>${esc(s.name)}</h6>
                        <div class="map-popup-meta">
                            <span><strong style="color:var(--primary)">${s.available}</strong>/${s.total} free</span>
                            <span>${s.speed} kW</span>
                        </div>
                        <a href="charging-details.html?id=${esc(s.id)}" class="btn btn-primary btn-xs btn-block">View station</a>
                    </div>`
                });
            });
            toast('Charging stations shown on the map', 'info');
        } else {
            Store.getStations().forEach(s => map.removeMarker('st-' + s.id));
        }
    });
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

function vehicleName(t) {
    const v = Store.getVehicle(t.vehicleId);
    return v ? v.name : 'Your vehicle';
}

const PHASES = [
    { id: 'approaching', label: 'Vehicle dispatched',   sub: 'On its way to the pickup point' },
    { id: 'arrived',     label: 'Arrived at pickup',    sub: 'Waiting for you' },
    { id: 'boarding',    label: 'Ready to start',       sub: 'Unlock with the app' },
    { id: 'en_route',    label: 'Trip in progress',     sub: 'En route to your destination' },
    { id: 'arriving',    label: 'Arriving shortly',     sub: 'Almost at the destination' },
    { id: 'completed',   label: 'Trip completed',       sub: 'Thanks for driving electric' }
];

function renderPanel(t) {
    const v = Store.getVehicle(t.vehicleId);
    const booking = t.bookingId ? Store.getBooking(t.bookingId) : null;

    if (t.phase === 'completed') {
        renderCompleted(t, v, booking);
        return;
    }

    $('#trackPanel').innerHTML = `
    <!-- Vehicle -->
    <div class="track-vehicle">
        <div class="track-vehicle-media">
            <img src="${esc(v?.image || '')}" alt="${esc(v?.name || 'Vehicle')}" data-fallback="${esc(v?.brand || 'EV')}">
            <div class="track-vehicle-overlay">
                <div>
                    <strong>${esc(v?.name || 'Your vehicle')}</strong>
                    <span>${esc(v?.plate || '')} · ${esc(v?.colorName || '')}</span>
                </div>
                <span class="badge badge-blue" id="tvStatus">${esc(fmt.statusLabel(v?.status || 'on_trip'))}</span>
            </div>
        </div>
        <div class="track-stats">
            <div class="track-stat">
                <div class="track-stat-k"><i data-lucide="battery-charging"></i> Battery</div>
                <div class="track-stat-v" data-t="battery">${Math.round(t.battery || 0)}<small>%</small></div>
            </div>
            <div class="track-stat">
                <div class="track-stat-k"><i data-lucide="gauge"></i> Range</div>
                <div class="track-stat-v" data-t="range">${t.range || 0}<small>km</small></div>
            </div>
            <div class="track-stat">
                <div class="track-stat-k"><i data-lucide="wind"></i> Speed</div>
                <div class="track-stat-v" data-t="speed">${t.speed || 0}<small>km/h</small></div>
            </div>
            <div class="track-stat">
                <div class="track-stat-k"><i data-lucide="route"></i> Remaining</div>
                <div class="track-stat-v" data-t="remaining">${t.remainingKm || 0}<small>km</small></div>
            </div>
        </div>
    </div>

    <!-- Progress -->
    <div class="trip-progress">
        <div class="trip-route">
            <div class="trip-route-end">
                <small>From</small>
                <strong>${esc(t.origin.label)}</strong>
            </div>
            <span class="trip-route-arrow"><i data-lucide="move-right"></i></span>
            <div class="trip-route-end right">
                <small>To</small>
                <strong>${esc(t.destination.label)}</strong>
            </div>
        </div>

        <div class="trip-track">
            <div class="trip-track-fill" data-t="progressBar" style="width:${t.progress || 0}%"></div>
            <span class="trip-car" data-t="progressCar" style="left:${t.progress || 0}%">
                <i data-lucide="car"></i>
            </span>
        </div>

        <div class="trip-milestones">
            <span data-t="progressPct">${Math.round(t.progress || 0)}% complete</span>
            <span data-t="totalKm">${t.totalKm || 0} km total</span>
        </div>
    </div>

    <!-- Phases -->
    <div class="card">
        <div class="card-head">
            <div class="card-title">Trip status</div>
            <span class="live-tag">Live</span>
        </div>
        <div class="phase-list" id="phaseList"></div>
    </div>

    <!-- Low-battery charging suggestion -->
    <div class="charge-suggest" id="chargeSuggest" hidden>
        <div class="stat-icon blue"><i data-lucide="zap"></i></div>
        <div style="flex:1;min-width:0">
            <strong style="display:block;font-size:.88rem;color:var(--text-primary)">Charging recommended</strong>
            <span style="font-size:.78rem;color:var(--text-secondary)" id="chargeSuggestText">
                Battery is getting low for the distance remaining.
            </span>
        </div>
        <a href="charging-stations.html" class="btn btn-blue btn-sm">Find</a>
    </div>

    <!-- Booking -->
    ${booking ? `
    <div class="card">
        <div class="card-head">
            <div>
                <div class="card-title">Booking ${esc(booking.id)}</div>
                <div class="card-sub">${fmt.date(booking.pickupDate)} – ${fmt.date(booking.returnDate)}</div>
            </div>
            <span class="badge badge-green">${esc(fmt.statusLabel(booking.status))}</span>
        </div>
        <div class="meta-list">
            <div class="meta-row">
                <span class="meta-k">Duration</span>
                <span class="meta-v">${fmt.plural(booking.days, 'day')}</span>
            </div>
            <div class="meta-row">
                <span class="meta-k">Total paid</span>
                <span class="meta-v">${fmt.money(booking.amount)}</span>
            </div>
        </div>
        <a href="customer-dashboard.html#bookings" class="btn btn-secondary btn-sm btn-block mt-4">
            Manage booking
        </a>
    </div>` : ''}

    <!-- Support -->
    <div class="driver-card">
        <div class="avatar avatar-blue"><i data-lucide="headset" style="width:18px;height:18px"></i></div>
        <div class="driver-card-body">
            <strong>EVRide Support</strong>
            <span>Available 24/7 · answers in under 30s</span>
        </div>
        <a href="tel:18008658110" class="btn btn-secondary btn-icon" aria-label="Call support">
            <i data-lucide="phone"></i>
        </a>
    </div>

    <!-- SOS -->
    <div class="sos-band">
        <div class="sos-icon"><i data-lucide="life-buoy"></i></div>
        <div style="flex:1;min-width:0">
            <strong style="display:block;font-size:.88rem;color:var(--text-primary)">Emergency?</strong>
            <span style="font-size:.78rem;color:var(--text-secondary)">We can see your live location</span>
        </div>
        <button class="btn btn-danger btn-sm" data-modal-open="sosModal">SOS</button>
    </div>

    <!-- Actions -->
    <div class="flex gap-3">
        <button class="btn btn-secondary flex-1" id="endTripBtn">
            <i data-lucide="flag"></i> End trip
        </button>
        <a href="charging-stations.html" class="btn btn-secondary flex-1">
            <i data-lucide="zap"></i> Charge
        </a>
    </div>`;

    renderPhases(t);
    icons();
    bindPanelActions();
}

function renderPhases(t) {
    const currentIndex = PHASES.findIndex(p => p.id === t.phase);

    $('#phaseList').innerHTML = PHASES.map((p, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : '';
        return `
        <div class="phase ${state}">
            <div class="phase-marker">
                <span class="phase-dot"></span>
                ${i < PHASES.length - 1 ? '<span class="phase-line"></span>' : ''}
            </div>
            <div class="phase-body">
                <strong>${esc(p.label)}</strong>
                <span>${esc(p.sub)}</span>
            </div>
        </div>`;
    }).join('');
}

function bindPanelActions() {
    $('#endTripBtn')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
            title: 'End this trip?',
            message: 'The vehicle will be marked returned and your invoice finalised. This cannot be undone.',
            confirmText: 'End trip',
            cancelText: 'Keep driving',
            danger: true
        });
        if (!ok) return;
        RT.endTrip();
        toast('Trip completed. Your invoice is ready.', 'success');
    });

    $$('[data-sos]').forEach(btn => {
        btn.addEventListener('click', () => {
            const kind = btn.dataset.sos;
            closeModal('sosModal');

            const messages = {
                accident:  'Emergency team dispatched. Stay with the vehicle if it is safe to do so.',
                breakdown: 'A roadside mechanic is on the way — estimated arrival 32 minutes.',
                battery:   'Mobile charging unit dispatched, free of charge. Estimated arrival 24 minutes.',
                other:     'Connecting you to support on 1800-EVRIDE-911…'
            };

            toast(messages[kind], kind === 'accident' ? 'error' : 'warning', 'Help is on the way', 8000);
            RT.notify('warning', 'life-buoy', 'Assistance requested',
                messages[kind], 'live-tracking.html');
        });
    });
}

/* ------------------------------------------------------------------ */
/* Completed state                                                     */
/* ------------------------------------------------------------------ */

function renderCompleted(t, v, booking) {
    const co2 = Math.round((t.totalKm || 0) * 0.12);
    const energy = Math.round((t.totalKm || 0) * 0.17);
    const fuelSaved = ((t.totalKm || 0) / 15).toFixed(1);

    $('#trackPanel').innerHTML = `
    <div class="card">
        <div class="trip-complete">
            <div class="trip-complete-icon success-pop"><i data-lucide="check"></i></div>
            <h3 style="margin-bottom:8px">Trip completed</h3>
            <p class="text-secondary" style="font-size:.92rem">
                ${esc(v?.name || 'Your vehicle')} has been returned to ${esc(t.destination.label)}.
            </p>

            <div class="trip-summary-grid">
                <div class="trip-summary-cell">
                    <strong>${t.totalKm || 0}</strong>
                    <span>km travelled</span>
                </div>
                <div class="trip-summary-cell">
                    <strong>${energy}</strong>
                    <span>kWh used</span>
                </div>
                <div class="trip-summary-cell">
                    <strong>${co2}</strong>
                    <span>kg CO₂ saved</span>
                </div>
                <div class="trip-summary-cell">
                    <strong>${fuelSaved}</strong>
                    <span>L fuel avoided</span>
                </div>
            </div>

            <div class="flex flex-col gap-3">
                <a href="invoices.html" class="btn btn-primary btn-block">
                    <i data-lucide="file-text"></i> View invoice
                </a>
                <a href="ev-details.html?id=${esc(t.vehicleId)}#reviews" class="btn btn-secondary btn-block">
                    <i data-lucide="star"></i> Rate this vehicle
                </a>
                <a href="explore-evs.html" class="btn btn-ghost btn-block">Book another EV</a>
            </div>
        </div>
    </div>`;

    // Update the banner too.
    $('#bannerTitle').textContent = 'Trip completed';
    $('#bannerSub').textContent = `${t.totalKm || 0} km · ${co2} kg CO₂ avoided`;
    $('#bannerEta').textContent = '✓';
    $('#bannerIcon')?.setAttribute('data-lucide', 'check-circle');

    icons();
}

/* ------------------------------------------------------------------ */
/* Initial paint                                                       */
/* ------------------------------------------------------------------ */

// Runs here, not beside the `trip` declaration near the top: renderPanel()
// reads the PHASES const, and a `const` is not hoisted — calling it earlier
// threw "Cannot access 'PHASES' before initialization" and the page stayed
// blank.
if (!trip) {
    renderNoTrip();
} else {
    renderPanel(trip);
    initMap(trip);
}

/* ------------------------------------------------------------------ */
/* Live updates                                                        */
/* ------------------------------------------------------------------ */

RT.on('trip', t => {
    const phaseChanged = trip && trip.phase !== t.phase;
    trip = t;

    // Banner.
    $('#bannerTitle').textContent = t.statusLabel || 'Trip in progress';
    $('#bannerSub').textContent = t.phase === 'completed'
        ? `${t.totalKm} km completed`
        : `${t.remainingKm} km remaining · ${t.speed} km/h`;
    $('#bannerEta').textContent = t.phase === 'completed' ? '✓' : (t.etaMin || '—');

    // A full re-render only when the phase changes; otherwise patch values so
    // transitions stay smooth and focus is never stolen.
    if (phaseChanged) {
        renderPanel(t);
        if (t.phase === 'completed') return;
    } else {
        patch('battery',   `${Math.round(t.battery || 0)}<small>%</small>`);
        patch('range',     `${t.range || 0}<small>km</small>`);
        patch('speed',     `${t.speed || 0}<small>km/h</small>`);
        patch('remaining', `${t.remainingKm || 0}<small>km</small>`);

        const bar = $('[data-t="progressBar"]');
        const car = $('[data-t="progressCar"]');
        if (bar) bar.style.width = t.progress + '%';
        if (car) car.style.left = t.progress + '%';

        const pct = $('[data-t="progressPct"]');
        if (pct) pct.textContent = `${Math.round(t.progress)}% complete`;
    }

    // Charging suggestion when range is tight for the distance left.
    const suggest = $('#chargeSuggest');
    if (suggest) {
        const tight = (t.range || 0) < (t.remainingKm || 0) * 1.6 || (t.battery || 100) < 25;
        suggest.hidden = !tight;
        if (tight) {
            $('#chargeSuggestText').textContent =
                `${Math.round(t.battery)}% battery for ${t.remainingKm} km remaining — a top-up is advisable.`;
        }
    }

    updateVehicleMarker(t);
});

function patch(key, html) {
    const node = $(`[data-t="${key}"]`);
    if (!node || node.innerHTML === html) return;
    node.innerHTML = html;
    node.classList.add('value-flash');
    setTimeout(() => node.classList.remove('value-flash'), 800);
}

/* ------------------------------------------------------------------ */
/* Share                                                               */
/* ------------------------------------------------------------------ */

$('#shareTripBtn')?.addEventListener('click', async () => {
    const link = location.href;
    const data = {
        title: 'Follow my EVRide trip',
        text: trip ? `I'm on my way — ETA ${trip.etaMin} minutes.` : 'Track my EVRide trip',
        url: link
    };
    if (navigator.share) {
        try { await navigator.share(data); return; } catch (_) { /* dismissed */ }
    }
    try {
        await navigator.clipboard.writeText(link);
        toast('Tracking link copied — anyone with it can follow your trip live', 'success');
    } catch (_) {
        toast('Copy this page URL to share your live trip', 'info');
    }
});
