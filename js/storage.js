/* ==========================================================================
   EVRide — storage.js
   LocalStorage abstraction layer. Every persisted entity goes through here so
   that swapping to a REST/WebSocket backend later means replacing only the
   read/write bodies of Store.* methods, not the call sites.
   ========================================================================== */

const NS = 'evride:';

const KEYS = {
    user:          NS + 'user',
    session:       NS + 'session',
    vehicles:      NS + 'vehicles',
    stations:      NS + 'stations',
    bookings:      NS + 'bookings',
    payments:      NS + 'payments',
    invoices:      NS + 'invoices',
    notifications: NS + 'notifications',
    favorites:     NS + 'favorites',
    reservations:  NS + 'reservations',
    searchHistory: NS + 'searchHistory',
    recentlyViewed:NS + 'recentlyViewed',
    preferences:   NS + 'preferences',
    draftBooking:  NS + 'draftBooking',
    activeTrip:    NS + 'activeTrip',
    chargeSession: NS + 'chargeSession',
    reviews:       NS + 'reviews',
    tickets:       NS + 'tickets',
    seeded:        NS + 'seeded',
    version:       NS + 'schemaVersion'
};

// Bump this whenever seeded records change shape or content, so returning
// visitors get fresh data instead of a stale LocalStorage copy.
// 4: vehicle images switched from (mostly wrong / 404ing) Unsplash URLs to
//    generated SVG artwork — old cached records still held the dead URLs.
// 5: switched again to real photographs in assets/images/vehicles/, each
//    verified against its Wikimedia Commons filename; records now also
//    carry `artFallback` for offline use.
// 6: added ev-025 (Mahindra BE 6) — a cached 24-vehicle list would never
//    show the new car without a reseed.
const SCHEMA_VERSION = 6;

/* ------------------------------------------------------------------ */
/* Low-level safe accessors                                            */
/* ------------------------------------------------------------------ */

function read(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
    } catch (err) {
        console.warn('[Store] read failed for', key, err);
        return fallback;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        emit(key, value);
        return true;
    } catch (err) {
        // Quota exceeded or private mode — degrade gracefully.
        console.warn('[Store] write failed for', key, err);
        return false;
    }
}

function remove(key) {
    try {
        localStorage.removeItem(key);
        emit(key, null);
    } catch (err) {
        console.warn('[Store] remove failed', err);
    }
}

/* ------------------------------------------------------------------ */
/* Change subscription (in-tab + cross-tab)                            */
/* ------------------------------------------------------------------ */

const listeners = new Map();

function emit(key, value) {
    const subs = listeners.get(key);
    if (subs) subs.forEach(fn => { try { fn(value); } catch (e) { console.error(e); } });
    const all = listeners.get('*');
    if (all) all.forEach(fn => { try { fn(key, value); } catch (e) { console.error(e); } });
}

function subscribe(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key).delete(fn);
}

// Mirror writes from other tabs so open dashboards stay in sync.
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (!e.key || !e.key.startsWith(NS)) return;
        let parsed = null;
        try { parsed = e.newValue ? JSON.parse(e.newValue) : null; } catch (_) {}
        emit(e.key, parsed);
    });
}

/* ------------------------------------------------------------------ */
/* Collection helpers                                                  */
/* ------------------------------------------------------------------ */

function list(key) {
    const v = read(key, []);
    return Array.isArray(v) ? v : [];
}

function upsert(key, item, idField = 'id') {
    const items = list(key);
    const i = items.findIndex(x => x[idField] === item[idField]);
    if (i > -1) items[i] = { ...items[i], ...item };
    else items.unshift(item);
    write(key, items);
    return item;
}

function removeFrom(key, id, idField = 'id') {
    const items = list(key).filter(x => x[idField] !== id);
    write(key, items);
    return items;
}

function findIn(key, id, idField = 'id') {
    return list(key).find(x => x[idField] === id) || null;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export const Store = {
    KEYS,
    read,
    write,
    remove,
    list,
    upsert,
    removeFrom,
    findIn,
    subscribe,

    /* ---- Session / user ---- */
    getUser()            { return read(KEYS.user, null); },
    setUser(user)        { return write(KEYS.user, user); },
    isLoggedIn()         { return !!read(KEYS.session, null); },
    login(user)          { write(KEYS.user, user); write(KEYS.session, { at: Date.now(), role: user.role }); },
    logout()             { remove(KEYS.session); },
    getRole()            { const u = read(KEYS.user, null); return u ? u.role : 'guest'; },

    /* ---- Vehicles ---- */
    getVehicles()        { return list(KEYS.vehicles); },
    setVehicles(v)       { return write(KEYS.vehicles, v); },
    getVehicle(id)       { return findIn(KEYS.vehicles, id); },
    updateVehicle(id, patch) {
        const vehicles = list(KEYS.vehicles);
        const i = vehicles.findIndex(v => v.id === id);
        if (i === -1) return null;
        vehicles[i] = { ...vehicles[i], ...patch, updatedAt: Date.now() };
        write(KEYS.vehicles, vehicles);
        return vehicles[i];
    },

    /* ---- Charging stations ---- */
    getStations()        { return list(KEYS.stations); },
    setStations(s)       { return write(KEYS.stations, s); },
    getStation(id)       { return findIn(KEYS.stations, id); },
    updateStation(id, patch) {
        const stations = list(KEYS.stations);
        const i = stations.findIndex(s => s.id === id);
        if (i === -1) return null;
        stations[i] = { ...stations[i], ...patch };
        write(KEYS.stations, stations);
        return stations[i];
    },

    /* ---- Bookings ---- */
    getBookings()        { return list(KEYS.bookings); },
    getBooking(id)       { return findIn(KEYS.bookings, id); },
    saveBooking(b)       { return upsert(KEYS.bookings, b); },
    updateBooking(id, patch) {
        const bookings = list(KEYS.bookings);
        const i = bookings.findIndex(b => b.id === id);
        if (i === -1) return null;
        bookings[i] = { ...bookings[i], ...patch, updatedAt: Date.now() };
        write(KEYS.bookings, bookings);
        return bookings[i];
    },
    cancelBooking(id, reason = 'User cancelled') {
        return this.updateBooking(id, { status: 'cancelled', cancelReason: reason, cancelledAt: Date.now() });
    },

    /* ---- Draft (multi-step booking flow) ---- */
    getDraft()           { return read(KEYS.draftBooking, null); },
    setDraft(d)          { return write(KEYS.draftBooking, d); },
    patchDraft(patch)    { const d = read(KEYS.draftBooking, {}) || {}; return write(KEYS.draftBooking, { ...d, ...patch }); },
    clearDraft()         { remove(KEYS.draftBooking); },

    /* ---- Payments & invoices ---- */
    getPayments()        { return list(KEYS.payments); },
    savePayment(p)       { return upsert(KEYS.payments, p); },
    getInvoices()        { return list(KEYS.invoices); },
    getInvoice(id)       { return findIn(KEYS.invoices, id); },
    saveInvoice(i)       { return upsert(KEYS.invoices, i); },

    /* ---- Notifications ---- */
    getNotifications()   { return list(KEYS.notifications); },
    addNotification(n) {
        const items = list(KEYS.notifications);
        items.unshift(n);
        write(KEYS.notifications, items.slice(0, 60));
        return n;
    },
    markNotificationRead(id) {
        const items = list(KEYS.notifications).map(n => n.id === id ? { ...n, read: true } : n);
        write(KEYS.notifications, items);
    },
    markAllNotificationsRead() {
        write(KEYS.notifications, list(KEYS.notifications).map(n => ({ ...n, read: true })));
    },
    clearNotifications()  { write(KEYS.notifications, []); },
    unreadCount()         { return list(KEYS.notifications).filter(n => !n.read).length; },

    /* ---- Favorites ---- */
    getFavorites()        { return list(KEYS.favorites); },
    isFavorite(id)        { return list(KEYS.favorites).includes(id); },
    toggleFavorite(id) {
        const favs = list(KEYS.favorites);
        const i = favs.indexOf(id);
        if (i > -1) favs.splice(i, 1); else favs.push(id);
        write(KEYS.favorites, favs);
        return i === -1; // true when newly added
    },

    /* ---- Charging reservations & live session ---- */
    getReservations()     { return list(KEYS.reservations); },
    saveReservation(r)    { return upsert(KEYS.reservations, r); },
    cancelReservation(id) {
        const items = list(KEYS.reservations).map(r => r.id === id ? { ...r, status: 'cancelled' } : r);
        write(KEYS.reservations, items);
    },
    getChargeSession()    { return read(KEYS.chargeSession, null); },
    setChargeSession(s)   { return write(KEYS.chargeSession, s); },
    clearChargeSession()  { remove(KEYS.chargeSession); },

    /* ---- Active trip ---- */
    getActiveTrip()       { return read(KEYS.activeTrip, null); },
    setActiveTrip(t)      { return write(KEYS.activeTrip, t); },
    clearActiveTrip()     { remove(KEYS.activeTrip); },

    /* ---- Reviews ---- */
    getReviews()          { return list(KEYS.reviews); },
    getReviewsFor(vid)    { return list(KEYS.reviews).filter(r => r.vehicleId === vid); },
    saveReview(r)         { return upsert(KEYS.reviews, r); },

    /* ---- Support tickets ---- */
    getTickets()          { return list(KEYS.tickets); },
    saveTicket(t)         { return upsert(KEYS.tickets, t); },

    /* ---- Search history & recently viewed ---- */
    getSearchHistory()    { return list(KEYS.searchHistory); },
    addSearch(query) {
        const items = list(KEYS.searchHistory)
            .filter(q => JSON.stringify(q.params) !== JSON.stringify(query.params));
        items.unshift({ ...query, at: Date.now() });
        write(KEYS.searchHistory, items.slice(0, 12));
    },
    clearSearchHistory()  { write(KEYS.searchHistory, []); },

    getRecentlyViewed()   { return list(KEYS.recentlyViewed); },
    addRecentlyViewed(id) {
        const items = list(KEYS.recentlyViewed).filter(x => x !== id);
        items.unshift(id);
        write(KEYS.recentlyViewed, items.slice(0, 10));
    },

    /* ---- Preferences ---- */
    getPrefs() {
        return read(KEYS.preferences, {
            currency: 'INR',
            units: 'metric',
            notifications: true,
            emailAlerts: true,
            liveUpdates: true,
            reducedMotion: false
        });
    },
    setPref(k, v) {
        const p = this.getPrefs();
        p[k] = v;
        return write(KEYS.preferences, p);
    },

    /* ---- Maintenance ---- */
    isSeeded()            { return read(KEYS.seeded, false) && read(KEYS.version, 0) === SCHEMA_VERSION; },
    markSeeded()          { write(KEYS.seeded, true); write(KEYS.version, SCHEMA_VERSION); },
    resetAll() {
        Object.values(KEYS).forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
    },
    /** Wipe generated/simulated data but keep the user's account + preferences. */
    resetSimulation() {
        [KEYS.vehicles, KEYS.stations, KEYS.seeded, KEYS.version,
         KEYS.activeTrip, KEYS.chargeSession].forEach(k => {
            try { localStorage.removeItem(k); } catch (_) {}
        });
    },
    exportAll() {
        const dump = {};
        Object.entries(KEYS).forEach(([name, key]) => { dump[name] = read(key, null); });
        return dump;
    }
};

export default Store;
