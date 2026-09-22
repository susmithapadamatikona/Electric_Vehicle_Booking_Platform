/* ==========================================================================
   EVRide — realtime.js
   Simulated real-time engine.

   Architecture note for future backend integration:
   ------------------------------------------------
   Every consumer subscribes to a *channel* via RT.on(channel, handler). The
   tick loop below is the only producer. To move to a real backend you replace
   `startTick()` with a WebSocket message handler that calls `RT.publish(...)`
   with the same payload shape — no subscriber needs to change.

   Channels:
     'vehicles'  -> Vehicle[]        (full fleet snapshot after each tick)
     'vehicle:<id>' -> Vehicle       (single vehicle delta)
     'stations'  -> Station[]
     'trip'      -> Trip             (active trip progress)
     'charging'  -> ChargeSession
     'notification' -> Notification  (one new notification)
     'tick'      -> { at: number }   (heartbeat, for clocks/counters)
   ========================================================================== */

import Store from './storage.js';

const TICK_MS = 4000;          // fleet simulation cadence
const TRIP_TICK_MS = 2000;     // trip/charging cadence (feels more live)

/* ------------------------------------------------------------------ */
/* Pub/Sub                                                             */
/* ------------------------------------------------------------------ */

const channels = new Map();

function on(channel, handler) {
    if (!channels.has(channel)) channels.set(channel, new Set());
    channels.get(channel).add(handler);
    return () => off(channel, handler);
}

function off(channel, handler) {
    const set = channels.get(channel);
    if (set) set.delete(handler);
}

function publish(channel, payload) {
    const set = channels.get(channel);
    if (set) set.forEach(fn => { try { fn(payload); } catch (e) { console.error('[RT]', channel, e); } });
}

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const rand  = (a, b) => Math.random() * (b - a) + a;
const randI = (a, b) => Math.floor(rand(a, b + 1));

/** Move a coordinate a small distance along a heading (degrees). */
function advance(lat, lng, headingDeg, km) {
    const R = 6371;
    const brng = headingDeg * Math.PI / 180;
    const lat1 = lat * Math.PI / 180;
    const lng1 = lng * Math.PI / 180;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(km / R) + Math.cos(lat1) * Math.sin(km / R) * Math.cos(brng));
    const lng2 = lng1 + Math.atan2(
        Math.sin(brng) * Math.sin(km / R) * Math.cos(lat1),
        Math.cos(km / R) - Math.sin(lat1) * Math.sin(lat2)
    );
    return { lat: +(lat2 * 180 / Math.PI).toFixed(6), lng: +(lng2 * 180 / Math.PI).toFixed(6) };
}

function lerp(a, b, t) { return a + (b - a) * t; }

/* ------------------------------------------------------------------ */
/* Vehicle state machine                                               */
/* ------------------------------------------------------------------ */

/**
 * Legal transitions. Booking/charging flows drive explicit transitions;
 * the tick loop only applies the *organic* ones (trip ending, charge full,
 * maintenance clearing) so user-initiated state is never stomped.
 */
const TRANSITIONS = {
    available:   ['reserved', 'charging', 'maintenance'],
    reserved:    ['on_trip', 'available'],
    on_trip:     ['available', 'charging'],
    charging:    ['available'],
    maintenance: ['available']
};

function canTransition(from, to) {
    return (TRANSITIONS[from] || []).includes(to);
}

/** Advance one vehicle by one tick. Returns a patch or null. */
function tickVehicle(v) {
    const patch = {};
    let changed = false;

    switch (v.status) {
        case 'on_trip': {
            // Drive: drain battery, move position, vary speed.
            const speed = clamp(v.speed + randI(-7, 7), 12, 74);
            const kmThisTick = speed * (TICK_MS / 3600000);
            const pos = advance(v.lat, v.lng, v.heading, kmThisTick);
            const drain = kmThisTick / (v.rangeMax / 100) * rand(0.9, 1.25);
            const battery = clamp(+(v.battery - drain).toFixed(1), 2, 100);

            patch.speed = speed;
            patch.lat = pos.lat;
            patch.lng = pos.lng;
            patch.heading = (v.heading + randI(-12, 12) + 360) % 360;
            patch.battery = battery;
            patch.range = Math.round(v.rangeMax * battery / 100 * 0.92);
            patch.odometer = +(v.odometer + kmThisTick).toFixed(1);
            changed = true;

            // Trip may end, or the car may need a charge.
            if (battery < 12) {
                patch.status = 'charging';
                patch.speed = 0;
                notify('warning', 'battery-low', 'Low battery',
                    `${v.name} (${v.plate}) dropped to ${Math.round(battery)}% and is heading to charge.`);
            } else if (Math.random() < 0.035) {
                patch.status = 'available';
                patch.speed = 0;
                patch.trips = (v.trips || 0) + 1;
            }
            break;
        }

        case 'charging': {
            // Charge curve: fast to 80%, tapering after.
            const rate = v.battery < 80 ? rand(1.6, 3.4) : rand(0.5, 1.2);
            const battery = clamp(+(v.battery + rate).toFixed(1), 0, 100);
            patch.battery = battery;
            patch.range = Math.round(v.rangeMax * battery / 100 * 0.94);
            changed = true;

            if (battery >= 97) {
                patch.status = 'available';
                patch.battery = 100;
                patch.range = Math.round(v.rangeMax * 0.94);
                notify('success', 'battery-full', 'Charging complete',
                    `${v.name} is fully charged at ${v.locationName}.`);
            }
            break;
        }

        case 'reserved': {
            // Reserved cars occasionally start their trip.
            if (Math.random() < 0.06) {
                patch.status = 'on_trip';
                patch.speed = randI(16, 40);
                changed = true;
            }
            break;
        }

        case 'maintenance': {
            if (Math.random() < 0.02) {
                patch.status = 'available';
                patch.healthScore = randI(94, 100);
                patch.lastService = Date.now();
                changed = true;
            }
            break;
        }

        case 'available':
        default: {
            // Idle drift: tiny battery self-discharge, occasional state change.
            if (Math.random() < 0.15) {
                patch.battery = clamp(+(v.battery - rand(0.05, 0.2)).toFixed(1), 0, 100);
                patch.range = Math.round(v.rangeMax * patch.battery / 100 * 0.94);
                changed = true;
            }
            if (Math.random() < 0.03 && v.battery < 35) {
                patch.status = 'charging';
                changed = true;
            } else if (Math.random() < 0.012) {
                patch.status = 'reserved';
                changed = true;
            } else if (Math.random() < 0.004) {
                patch.status = 'maintenance';
                patch.speed = 0;
                changed = true;
            }
            break;
        }
    }

    // Distance from the user drifts a little for cars that moved.
    if (patch.lat !== undefined) {
        patch.distance = +clamp(v.distance + rand(-0.4, 0.4), 0.2, 24).toFixed(1);
    }

    if (changed) {
        patch.available = (patch.status || v.status) === 'available';
        patch.updatedAt = Date.now();
    }
    return changed ? patch : null;
}

/* ------------------------------------------------------------------ */
/* Station simulation                                                  */
/* ------------------------------------------------------------------ */

function tickStation(s) {
    if (Math.random() > 0.35) return null;

    let busy = clamp(s.busy + randI(-2, 2), 0, s.total - s.offline);
    let offline = s.offline;

    if (Math.random() < 0.02) offline = offline > 0 ? 0 : randI(1, 2);
    offline = clamp(offline, 0, s.total);
    busy = clamp(busy, 0, s.total - offline);

    const available = s.total - busy - offline;
    return {
        busy,
        offline,
        available,
        queue: available === 0 ? clamp(s.queue + randI(-1, 1), 0, 6) : 0,
        status: offline >= s.total ? 'offline' : available === 0 ? 'busy' : 'available',
        sessionsToday: s.sessionsToday + (Math.random() < 0.2 ? 1 : 0),
        energyToday: s.energyToday + randI(0, 14),
        updatedAt: Date.now()
    };
}

/* ------------------------------------------------------------------ */
/* Active trip simulation                                              */
/* ------------------------------------------------------------------ */

const TRIP_PHASES = [
    { id: 'approaching', label: 'Vehicle is approaching pickup location', to: 22 },
    { id: 'arrived',     label: 'Vehicle has arrived at pickup point',    to: 30 },
    { id: 'boarding',    label: 'Ready to start — unlock with the app',   to: 38 },
    { id: 'en_route',    label: 'Trip in progress — en route to destination', to: 92 },
    { id: 'arriving',    label: 'Arriving at destination shortly',        to: 100 },
    { id: 'completed',   label: 'Trip completed',                         to: 100 }
];

function tickTrip() {
    const trip = Store.getActiveTrip();
    if (!trip || trip.phase === 'completed') return;

    const step = trip.phase === 'en_route' ? rand(0.9, 2.1) : rand(0.5, 1.3);
    let progress = clamp(trip.progress + step, 0, 100);

    // Determine phase from progress.
    let phase = trip.phase;
    for (const p of TRIP_PHASES) {
        if (progress <= p.to) { phase = p.id; break; }
    }
    if (progress >= 100) phase = 'completed';

    const phaseMeta = TRIP_PHASES.find(p => p.id === phase) || TRIP_PHASES[0];

    // Interpolate vehicle position along the route.
    const t = progress / 100;
    const pos = {
        lat: lerp(trip.origin.lat, trip.destination.lat, t),
        lng: lerp(trip.origin.lng, trip.destination.lng, t)
    };

    const vehicle = Store.getVehicle(trip.vehicleId);
    const totalKm = trip.totalKm || 12.4;
    const remainingKm = +(totalKm * (1 - t)).toFixed(1);
    const speed = phase === 'en_route' ? randI(34, 58)
                : phase === 'approaching' ? randI(18, 42)
                : phase === 'arriving' ? randI(12, 28) : 0;
    const etaMin = speed > 0 ? Math.max(1, Math.round(remainingKm / speed * 60)) : 0;

    const updated = {
        ...trip,
        progress: +progress.toFixed(1),
        phase,
        statusLabel: phaseMeta.label,
        position: pos,
        speed,
        etaMin,
        remainingKm,
        totalKm,
        battery: vehicle ? vehicle.battery : trip.battery,
        range: vehicle ? vehicle.range : trip.range,
        updatedAt: Date.now()
    };

    Store.setActiveTrip(updated);
    publish('trip', updated);

    // Phase-change notifications.
    if (phase !== trip.phase) {
        if (phase === 'arrived') notify('success', 'map-pin', 'Vehicle arrived', 'Your EV is at the pickup point and unlocked.');
        if (phase === 'en_route') notify('info', 'navigation', 'Trip started', 'Drive safe. Live tracking is active.');
        if (phase === 'completed') {
            notify('success', 'check-circle', 'Trip completed', `You travelled ${totalKm} km and saved ${Math.round(totalKm * 0.12)} kg of CO₂.`);
            if (trip.bookingId) Store.updateBooking(trip.bookingId, { status: 'completed', distance: Math.round(totalKm) });
            if (vehicle) setVehicleStatus(vehicle.id, 'available');
        }
    }
}

/* ------------------------------------------------------------------ */
/* Charging session simulation                                         */
/* ------------------------------------------------------------------ */

function tickCharging() {
    const s = Store.getChargeSession();
    if (!s || s.status !== 'charging') return;

    const elapsedMin = (Date.now() - s.startedAt) / 60000;
    const capacity = s.batteryCapacity || 75;

    // Realistic taper: full power to 80%, then falls off sharply.
    const soc = s.battery;
    const powerFactor = soc < 55 ? 1 : soc < 80 ? 0.82 : soc < 92 ? 0.42 : 0.18;
    const powerKw = +(s.maxPower * powerFactor * rand(0.95, 1.03)).toFixed(1);

    const hoursThisTick = TRIP_TICK_MS / 3600000;
    const kwhAdded = powerKw * hoursThisTick;
    const socAdded = (kwhAdded / capacity) * 100;

    const battery = clamp(+(soc + socAdded).toFixed(1), 0, 100);
    const energyAdded = +(s.energyAdded + kwhAdded).toFixed(2);
    const cost = +(energyAdded * s.pricePerKwh).toFixed(0);

    // Remaining time to target.
    const target = s.targetSoc || 100;
    const remainingSoc = Math.max(0, target - battery);
    const remainingKwh = remainingSoc / 100 * capacity;
    const avgFuturePower = battery < 80 ? s.maxPower * 0.8 : s.maxPower * 0.3;
    const etaMin = avgFuturePower > 0 ? Math.ceil(remainingKwh / avgFuturePower * 60) : 0;

    const done = battery >= target;

    const updated = {
        ...s,
        battery,
        powerKw: done ? 0 : powerKw,
        energyAdded,
        cost,
        etaMin: done ? 0 : etaMin,
        elapsedMin: +elapsedMin.toFixed(1),
        range: Math.round((s.rangeMax || 500) * battery / 100 * 0.94),
        status: done ? 'complete' : 'charging',
        updatedAt: Date.now()
    };

    Store.setChargeSession(updated);
    publish('charging', updated);

    if (done) {
        notify('success', 'battery-charging', 'Charging complete',
            `${s.vehicleName} reached ${target}%. ${energyAdded.toFixed(1)} kWh added for ₹${cost}.`);
        if (s.vehicleId) {
            Store.updateVehicle(s.vehicleId, {
                battery, status: 'available', available: true,
                range: updated.range
            });
        }
    }
}

/* ------------------------------------------------------------------ */
/* Ambient notifications                                               */
/* ------------------------------------------------------------------ */

const AMBIENT = [
    { type: 'info',    icon: 'zap',            title: 'Charger freed up',      msg: 'A 350 kW bay just opened at EVRide Koramangala Hyperhub.' },
    { type: 'info',    icon: 'car',            title: 'New EV nearby',         msg: 'A Kia EV6 GT-Line is now available 1.8 km from you.' },
    { type: 'success', icon: 'trending-down',  title: 'Price drop',            msg: 'Weekend rates on Electric SUVs are down 18% for the next 48 hours.' },
    { type: 'info',    icon: 'leaf',           title: 'Sustainability update', msg: 'Your trips this month have avoided 42 kg of CO₂ emissions.' },
    { type: 'warning', icon: 'cloud-rain',     title: 'Weather advisory',      msg: 'Rain expected in Bengaluru — expect 8% lower real-world range.' },
    { type: 'info',    icon: 'gift',           title: 'Reward unlocked',       msg: 'You earned 250 EVRide points on your last completed trip.' }
];

let ambientCounter = 0;

function tickAmbient() {
    ambientCounter++;
    // Roughly one ambient notification every ~2 minutes of wall time.
    if (ambientCounter % 30 !== 0) return;
    const n = AMBIENT[randI(0, AMBIENT.length - 1)];
    notify(n.type, n.icon, n.title, n.msg);
}

/** Create + persist + broadcast a notification. */
function notify(type, icon, title, msg, link = null) {
    const n = {
        id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6),
        type, icon, title, msg, link,
        time: Date.now(),
        read: false
    };
    Store.addNotification(n);
    publish('notification', n);
    return n;
}

/* ------------------------------------------------------------------ */
/* Tick loop                                                           */
/* ------------------------------------------------------------------ */

let fleetTimer = null;
let tripTimer = null;
let running = false;
let paused = false;

function fleetTick() {
    if (paused) return;

    const vehicles = Store.getVehicles();
    if (!vehicles.length) return;

    let mutated = false;
    const next = vehicles.map(v => {
        const patch = tickVehicle(v);
        if (!patch) return v;
        mutated = true;
        const merged = { ...v, ...patch };
        publish('vehicle:' + v.id, merged);
        return merged;
    });

    if (mutated) {
        Store.setVehicles(next);
        publish('vehicles', next);
    }

    const stations = Store.getStations();
    if (stations.length) {
        let sMutated = false;
        const nextS = stations.map(s => {
            const patch = tickStation(s);
            if (!patch) return s;
            sMutated = true;
            return { ...s, ...patch };
        });
        if (sMutated) {
            Store.setStations(nextS);
            publish('stations', nextS);
        }
    }

    tickAmbient();
    publish('tick', { at: Date.now() });
}

function fastTick() {
    if (paused) return;
    tickTrip();
    tickCharging();
}

function start() {
    if (running) return;
    running = true;
    fleetTimer = setInterval(fleetTick, TICK_MS);
    tripTimer  = setInterval(fastTick, TRIP_TICK_MS);
}

function stop() {
    clearInterval(fleetTimer);
    clearInterval(tripTimer);
    running = false;
}

// Pause simulation when the tab is hidden — saves cycles and avoids a
// jarring burst of accumulated changes on return.
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        paused = document.hidden;
    });
}

/* ------------------------------------------------------------------ */
/* Explicit transitions used by the booking / charging flows           */
/* ------------------------------------------------------------------ */

function setVehicleStatus(id, status, extra = {}) {
    const v = Store.getVehicle(id);
    if (!v) return null;
    const updated = Store.updateVehicle(id, {
        status,
        available: status === 'available',
        speed: status === 'on_trip' ? randI(18, 42) : 0,
        ...extra
    });
    if (updated) {
        publish('vehicle:' + id, updated);
        publish('vehicles', Store.getVehicles());
    }
    return updated;
}

/** Called when a booking is paid for: AVAILABLE -> RESERVED. */
function reserveVehicle(id) {
    return setVehicleStatus(id, 'reserved');
}

/** Called when the user starts the trip: RESERVED -> ON_TRIP. */
function startTrip(booking, route) {
    const v = Store.getVehicle(booking.vehicleId);
    if (!v) return null;

    setVehicleStatus(v.id, 'on_trip');

    const origin = route?.origin || { lat: v.lat, lng: v.lng, label: booking.pickupLocation };
    const destination = route?.destination || { lat: 12.9352, lng: 77.6245, label: booking.dropLocation };
    const totalKm = +(Math.hypot(
        (destination.lat - origin.lat) * 111,
        (destination.lng - origin.lng) * 109
    ) * 1.32).toFixed(1);

    const trip = {
        bookingId: booking.id,
        vehicleId: v.id,
        phase: 'approaching',
        statusLabel: TRIP_PHASES[0].label,
        progress: 0,
        speed: 0,
        etaMin: Math.max(3, Math.round(totalKm / 38 * 60)),
        totalKm: Math.max(2.4, totalKm),
        remainingKm: Math.max(2.4, totalKm),
        battery: v.battery,
        range: v.range,
        origin,
        destination,
        position: { lat: origin.lat, lng: origin.lng },
        startedAt: Date.now()
    };

    Store.setActiveTrip(trip);
    Store.updateBooking(booking.id, { status: 'active' });
    publish('trip', trip);
    notify('info', 'navigation', 'Trip started', `${v.name} is on its way to ${origin.label}.`);
    return trip;
}

/** Called when the user completes the trip early. */
function endTrip() {
    const trip = Store.getActiveTrip();
    if (!trip) return;
    const updated = { ...trip, progress: 100, phase: 'completed', speed: 0, etaMin: 0, remainingKm: 0 };
    Store.setActiveTrip(updated);
    publish('trip', updated);
    if (trip.bookingId) Store.updateBooking(trip.bookingId, { status: 'completed' });
    if (trip.vehicleId) setVehicleStatus(trip.vehicleId, 'available');
    notify('success', 'check-circle', 'Trip completed', 'Thanks for driving electric. Your invoice is ready.');
}

/** Begin a live charging session. AVAILABLE -> CHARGING. */
function startCharging({ vehicleId, stationId, targetSoc = 100, maxPower, pricePerKwh }) {
    const v = Store.getVehicle(vehicleId);
    const st = Store.getStation(stationId);
    if (!v) return null;

    const session = {
        id: 'CHG-' + Date.now().toString(36).toUpperCase(),
        vehicleId: v.id,
        vehicleName: v.name,
        stationId: st ? st.id : null,
        stationName: st ? st.name : 'EVRide Home Charger',
        bay: 'Bay ' + String(randI(1, 12)).padStart(2, '0'),
        connector: v.connector,
        battery: v.battery,
        startSoc: v.battery,
        targetSoc,
        batteryCapacity: v.batteryCapacity,
        rangeMax: v.rangeMax,
        range: v.range,
        maxPower: Math.min(maxPower || (st ? st.speed : 60), v.peakCharge || 60) || 50,
        pricePerKwh: pricePerKwh || (st ? st.price : 16),
        powerKw: 0,
        energyAdded: 0,
        cost: 0,
        etaMin: 0,
        elapsedMin: 0,
        status: 'charging',
        startedAt: Date.now()
    };

    Store.setChargeSession(session);
    setVehicleStatus(v.id, 'charging');
    publish('charging', session);
    notify('info', 'zap', 'Charging started', `${v.name} plugged in at ${session.stationName}.`);
    return session;
}

function stopCharging() {
    const s = Store.getChargeSession();
    if (!s) return;
    const updated = { ...s, status: 'stopped', powerKw: 0 };
    Store.setChargeSession(updated);
    publish('charging', updated);
    if (s.vehicleId) setVehicleStatus(s.vehicleId, 'available', { battery: s.battery });
    notify('info', 'square', 'Charging stopped', `${s.energyAdded.toFixed(1)} kWh added. Total ₹${s.cost}.`);
}

/* ------------------------------------------------------------------ */
/* Fleet aggregate stats (used by dashboards)                          */
/* ------------------------------------------------------------------ */

function fleetStats() {
    const v = Store.getVehicles();
    const by = s => v.filter(x => x.status === s).length;
    const avgBattery = v.length ? Math.round(v.reduce((a, x) => a + x.battery, 0) / v.length) : 0;
    return {
        total: v.length,
        available: by('available'),
        onTrip: by('on_trip'),
        charging: by('charging'),
        reserved: by('reserved'),
        maintenance: by('maintenance'),
        avgBattery,
        lowBattery: v.filter(x => x.battery < 20).length,
        utilization: v.length ? Math.round((by('on_trip') + by('reserved')) / v.length * 100) : 0
    };
}

function stationStats() {
    const s = Store.getStations();
    return {
        total: s.length,
        chargers: s.reduce((a, x) => a + x.total, 0),
        available: s.reduce((a, x) => a + x.available, 0),
        busy: s.reduce((a, x) => a + x.busy, 0),
        offline: s.reduce((a, x) => a + x.offline, 0),
        sessionsToday: s.reduce((a, x) => a + x.sessionsToday, 0),
        energyToday: s.reduce((a, x) => a + x.energyToday, 0)
    };
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export const RT = {
    on, off, publish, notify,
    start, stop,
    get running() { return running; },
    pause()  { paused = true; },
    resume() { paused = false; },

    // Explicit state transitions
    setVehicleStatus, reserveVehicle, startTrip, endTrip,
    startCharging, stopCharging, canTransition,

    // Aggregates
    fleetStats, stationStats,

    // Geo helpers reused by map.js
    advance,

    TICK_MS, TRIP_TICK_MS, TRIP_PHASES
};

export default RT;
