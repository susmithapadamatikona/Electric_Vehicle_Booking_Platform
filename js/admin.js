/* ==========================================================================
   EVRide — admin.js
   Controller for admin-dashboard.html.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { LOCATIONS, CATEGORIES, OFFERS } from './data.js';
import { boot, fmt, $$, esc, icons, toast, confirmDialog, debounce } from './main.js';
import mountDash, { statTile, statusBadge, safeRender,
         dashEl as $ } from './dashboard.js';
import { createMap, plotVehicles, plotStations } from './map.js';
import {
    SERIES, FLEET_COLORS, lineChart, barChart, doughnutChart, sparkline,
    trend, monthLabels, dayLabels, resizeAll
} from './charts.js';

boot();
mountDash({ role: 'admin', active: 'overview', searchPlaceholder: 'Search users, bookings, vehicles…' });

/* ------------------------------------------------------------------ */
/* Synthetic platform-scale numbers                                    */
/* ------------------------------------------------------------------ */

// The local simulation holds 24 vehicles; a real deployment would hold
// thousands. Scale the demo fleet to network figures so the console reads
// like production without inventing a second data source.
const SCALE = 780;

function platform() {
    const f = RT.fleetStats();
    const s = RT.stationStats();
    const bookings = Store.getBookings();
    const revenue = bookings.filter(b => b.paymentStatus === 'paid')
        .reduce((a, b) => a + b.amount, 0);

    return {
        fleet: f,
        stations: s,
        totalUsers: 48_290,
        activeUsers: 12_447,
        // Project the demo fleet to a plausible national figure. Divide by the
        // real catalogue size, not a literal, so adding a vehicle does not
        // inflate the headline number.
        totalVehicles: f.total * SCALE / (f.total || 1) | 0,
        availableVehicles: f.available * SCALE / (f.total || 1) | 0,
        activeBookings: bookings.filter(b => ['active', 'upcoming'].includes(b.status)).length * 420,
        monthlyRevenue: revenue * 1840,
        chargingSessions: s.sessionsToday * 96,
        utilization: f.utilization,
        bookings
    };
}

let adminRange = 30;

/* ------------------------------------------------------------------ */
/* Overview KPIs                                                       */
/* ------------------------------------------------------------------ */

function renderKpis() {
    const p = platform();

    const kpis = [
        { k: 'Total users',      v: fmt.compact(p.totalUsers),      icon: 'users',          delta: '+12.4%', dir: 'up',   spark: trend('users', 12, { base: 30 }) },
        { k: 'Active users',     v: fmt.compact(p.activeUsers),     icon: 'user-check',     delta: '+8.1%',  dir: 'up',   spark: trend('active', 12, { base: 22 }) },
        { k: 'Fleet size',       v: fmt.compact(p.totalVehicles),   icon: 'car',            delta: '+46',    dir: 'up',   spark: trend('fleet', 12, { base: 18 }) },
        { k: 'Monthly revenue',  v: '₹' + fmt.compact(p.monthlyRevenue), icon: 'indian-rupee', delta: '+18.7%', dir: 'up', spark: trend('rev', 12, { base: 40 }) },
        { k: 'Active bookings',  v: fmt.compact(p.activeBookings),  icon: 'calendar-check', delta: '+5.2%',  dir: 'up',   spark: trend('bk', 12, { base: 26 }) },
        { k: 'Charging sessions',v: fmt.compact(p.chargingSessions),icon: 'zap',            delta: '+22.3%', dir: 'up',   spark: trend('chg', 12, { base: 34 }) },
        { k: 'Fleet utilisation',v: p.utilization + '%',            icon: 'activity',       delta: '+3.4%',  dir: 'up',   spark: trend('util', 12, { base: 55 }) },
        { k: 'Avg booking value',v: fmt.money(8_420),               icon: 'receipt',        delta: '−2.1%',  dir: 'down', spark: trend('abv', 12, { base: 30, drift: -0.01 }) }
    ];

    $('#adminKpi').innerHTML = kpis.map((k, i) => `
        <div class="kpi">
            <div class="kpi-k"><i data-lucide="${esc(k.icon)}"></i> ${esc(k.k)}</div>
            <div class="kpi-v">${esc(k.v)}</div>
            <div class="kpi-foot">
                <span class="stat-delta ${k.dir}">
                    <i data-lucide="trending-${k.dir}"></i> ${esc(k.delta)}
                </span>
                <span class="spark">${sparkline(k.spark, SERIES[i % SERIES.length])}</span>
            </div>
        </div>`).join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Overview charts                                                     */
/* ------------------------------------------------------------------ */

function renderOverviewCharts() {
    const labels = adminRange === 7 ? dayLabels(7)
                 : adminRange === 30 ? Array.from({ length: 30 }, (_, i) => String(i + 1))
                 : monthLabels(12);

    const n = labels.length;

    // Two measures on ONE axis. Bookings are indexed to the revenue scale
    // (× average booking value) rather than given a second y-axis.
    const revenue = trend('rev' + adminRange, n, { base: 1_800_000 / n * 4, drift: 0.02, noise: 0.14 });
    const bookingsIndexed = revenue.map(r => Math.round(r * 0.62));

    lineChart('revenueChart', labels, [
        { label: 'Revenue', data: revenue },
        { label: 'Bookings (× avg value)', data: bookingsIndexed, color: SERIES[2] }
    ], { money: true });

    // Fleet status — colours match the status dots used everywhere else.
    const f = RT.fleetStats();
    doughnutChart('adminStatusChart',
        ['Available', 'On trip', 'Charging', 'Reserved', 'Maintenance'],
        [f.available, f.onTrip, f.charging, f.reserved, f.maintenance],
        {
            colors: [FLEET_COLORS.available, FLEET_COLORS.on_trip, FLEET_COLORS.charging,
                     FLEET_COLORS.reserved, FLEET_COLORS.maintenance],
            unit: ' vehicles'
        }
    );

    // User growth — two cohorts, stacked.
    const months = monthLabels(12);
    barChart('userChart', months, [
        { label: 'New customers', data: trend('nc', 12, { base: 820, drift: 0.05 }) },
        { label: 'New owners', data: trend('no', 12, { base: 90, drift: 0.04 }), color: SERIES[2] }
    ], { stacked: true, unit: ' users' });

    // Top models by bookings — single series.
    const top = [...Store.getVehicles()]
        .sort((a, b) => b.trips - a.trips)
        .slice(0, 6);

    barChart('topModelsChart',
        top.map(v => v.model),
        [{ label: 'Trips', data: top.map(v => v.trips) }],
        { horizontal: true, unit: ' trips' }
    );
}

$$('#adminRange button').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('#adminRange button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        adminRange = +btn.dataset.range;
        renderOverviewCharts();
    });
});

/* ------------------------------------------------------------------ */
/* System alerts                                                       */
/* ------------------------------------------------------------------ */

function renderSystemAlerts() {
    const vehicles = Store.getVehicles();
    const stations = Store.getStations();

    const alerts = [];

    const maint = vehicles.filter(v => v.status === 'maintenance').length;
    if (maint) alerts.push({
        level: 'danger', icon: 'wrench',
        title: `${maint} ${maint === 1 ? 'vehicle' : 'vehicles'} in maintenance`,
        text: 'Out of the booking pool until cleared'
    });

    const low = vehicles.filter(v => v.battery < 20 && v.status !== 'charging').length;
    if (low) alerts.push({
        level: 'warning', icon: 'battery-warning',
        title: `${low} ${low === 1 ? 'vehicle needs' : 'vehicles need'} charging`,
        text: 'Below 20% and not currently plugged in'
    });

    const offline = stations.filter(s => s.status === 'offline').length;
    if (offline) alerts.push({
        level: 'danger', icon: 'zap-off',
        title: `${offline} charging ${offline === 1 ? 'station' : 'stations'} offline`,
        text: 'Partner operator notified automatically'
    });

    const busy = stations.filter(s => s.available === 0 && s.status !== 'offline').length;
    if (busy) alerts.push({
        level: 'warning', icon: 'users',
        title: `${busy} ${busy === 1 ? 'station' : 'stations'} at capacity`,
        text: 'Queueing enabled for waiting drivers'
    });

    alerts.push({
        level: 'info', icon: 'server',
        title: 'All systems operational',
        text: 'API 99.98% uptime · payments healthy · telemetry live'
    });

    $('#systemAlerts').innerHTML = alerts.slice(0, 5).map(a => `
        <div class="alert-strip ${esc(a.level)}">
            <span class="activity-icon ${a.level === 'danger' ? 'danger' : a.level === 'warning' ? 'warn' : 'blue'}">
                <i data-lucide="${esc(a.icon)}"></i>
            </span>
            <div class="alert-strip-body">
                <strong>${esc(a.title)}</strong>
                <span>${esc(a.text)}</span>
            </div>
        </div>`).join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Recent bookings                                                     */
/* ------------------------------------------------------------------ */

const CUSTOMERS = ['Susmitha Padamati', 'Rahul Menon', 'Priya Iyer', 'Vikram Desai',
    'Sneha Kulkarni', 'Arjun Nair', 'Ananya Sharma', 'Karthik S.', 'Divya P.'];

function renderRecentBookings() {
    const list = Store.getBookings().slice(0, 6);

    $('#recentBookings').innerHTML = list.map((b, i) => `
        <tr>
            <td><span class="table-id">${esc(b.id)}</span></td>
            <td>
                <div class="cell-media">
                    <span class="avatar avatar-sm">${esc(fmt.initials(CUSTOMERS[i % CUSTOMERS.length]))}</span>
                    <div class="cell-media-text">
                        <strong>${esc(CUSTOMERS[i % CUSTOMERS.length])}</strong>
                    </div>
                </div>
            </td>
            <td>${esc(b.vehicleName)}</td>
            <td>
                <div class="cell-strong">${fmt.dateShort(b.pickupDate)}</div>
                <span class="text-muted" style="font-size:.75rem">${fmt.plural(b.days, 'day')}</span>
            </td>
            <td class="cell-strong">${fmt.money(b.amount)}</td>
            <td>${statusBadge(b.status)}</td>
        </tr>`).join('');
}

/* ------------------------------------------------------------------ */
/* Live monitor                                                        */
/* ------------------------------------------------------------------ */

let opsMap = null;
let monitorFilter = 'all';

function renderMonitorOps() {
    const f = RT.fleetStats();
    const s = RT.stationStats();

    const cells = [
        { k: 'Active vehicles', v: f.total - f.maintenance, cls: '' },
        { k: 'On trip',         v: f.onTrip,      cls: 'blue',   dot: 'on_trip' },
        { k: 'Charging',        v: f.charging,    cls: 'purple', dot: 'charging' },
        { k: 'Available',       v: f.available,   cls: 'green',  dot: 'available' },
        { k: 'Maintenance',     v: f.maintenance, cls: 'danger', dot: 'maintenance' },
        { k: 'Bays free',       v: s.available,   cls: 'green' }
    ];

    $('#monitorOps').innerHTML = cells.map(c => `
        <div class="ops-cell ${c.cls}">
            <div class="ops-val">${c.v}</div>
            <div class="ops-k">${c.dot ? `<span class="status-dot ${c.dot}"></span>` : ''}${esc(c.k)}</div>
        </div>`).join('');
}

function initOpsMap() {
    if (!opsMap) opsMap = createMap('opsMap', { zoom: 11 });
    updateOpsMap();
    opsMap?.invalidate();
}

function updateOpsMap() {
    if (!opsMap) return;
    opsMap.clearMarkers();
    if (monitorFilter === 'all' || monitorFilter === 'vehicles') {
        plotVehicles(opsMap, Store.getVehicles());
    }
    if (monitorFilter === 'all' || monitorFilter === 'stations') {
        plotStations(opsMap, Store.getStations());
    }
    if (!opsMap.isFallback) opsMap.fitMarkers(50);
}

$$('[data-mf]').forEach(chip => {
    chip.addEventListener('click', () => {
        $$('[data-mf]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        monitorFilter = chip.dataset.mf;
        updateOpsMap();
    });
});

/* Event ticker — driven by the real-time engine. */
const events = [];

function pushEvent(text, tone = 'green') {
    events.unshift({ time: Date.now(), text, tone });
    if (events.length > 30) events.pop();
    paintTicker();
}

function paintTicker() {
    const el = $('#eventTicker');
    if (!el) return;

    if (!events.length) {
        el.innerHTML = '<div class="empty" style="padding:50px"><p>Waiting for events…</p></div>';
        return;
    }

    const dotColor = {
        green: 'var(--primary)', blue: 'var(--electric-blue)',
        purple: 'var(--electric-purple)', warn: 'var(--warning)', danger: 'var(--danger)'
    };

    el.innerHTML = events.map(e => `
        <div class="ticker-row">
            <span class="ticker-time">${new Date(e.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            <span class="ticker-dot" style="background:${dotColor[e.tone] || dotColor.green}"></span>
            <span class="ticker-text">${e.text}</span>
        </div>`).join('');
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

function buildUsers() {
    const roles = ['customer', 'customer', 'customer', 'owner', 'driver', 'customer', 'admin', 'owner', 'customer'];
    return CUSTOMERS.map((name, i) => ({
        id: 'U' + (1040 + i),
        name,
        email: name.toLowerCase().replace(/[^a-z]/g, '.').replace(/\.+/g, '.') + '@example.com',
        role: roles[i % roles.length],
        bookings: [14, 3, 27, 8, 41, 6, 0, 12, 19][i % 9],
        spend: [128400, 24800, 312600, 68200, 0, 42100, 0, 96400, 187300][i % 9],
        joined: Date.now() - (30 + i * 47) * 86400000,
        status: i === 6 ? 'pending' : 'active'
    }));
}

const USERS = buildUsers();
let userSearch = '', roleFilter = '';

function renderUsers() {
    let list = USERS;
    if (userSearch) {
        const q = userSearch.toLowerCase();
        list = list.filter(u => `${u.name} ${u.email}`.toLowerCase().includes(q));
    }
    if (roleFilter) list = list.filter(u => u.role === roleFilter);

    $('#userCount').textContent = list.length;

    $('#userStats').innerHTML = [
        statTile({ label: 'Total users', value: fmt.compact(48290), icon: 'users', delta: '+12.4%', deltaDir: 'up' }),
        statTile({ label: 'Customers', value: fmt.compact(44120), icon: 'user', tone: 'blue', meta: '91% of base' }),
        statTile({ label: 'EV owners', value: fmt.compact(3210), icon: 'key-round', tone: 'purple', delta: '+86', deltaDir: 'up' }),
        statTile({ label: 'Drivers', value: fmt.compact(960), icon: 'steering-wheel', tone: 'warn', meta: '4.8 avg rating' })
    ].join('');

    $('#usersTable').innerHTML = list.length ? list.map(u => `
        <tr>
            <td>
                <div class="cell-media">
                    <span class="avatar avatar-sm">${esc(fmt.initials(u.name))}</span>
                    <div class="cell-media-text">
                        <strong>${esc(u.name)}</strong>
                        <span>${esc(u.email)}</span>
                    </div>
                </div>
            </td>
            <td><span class="role-pill ${esc(u.role)}">${esc(u.role[0].toUpperCase() + u.role.slice(1))}</span></td>
            <td>${u.bookings}</td>
            <td class="cell-strong">${fmt.money(u.spend)}</td>
            <td class="text-muted">${fmt.date(u.joined)}</td>
            <td>${statusBadge(u.status === 'active' ? 'active' : 'pending')}</td>
            <td>
                <div class="user-row-actions">
                    <button class="btn btn-secondary btn-xs" title="View"><i data-lucide="eye"></i></button>
                    <button class="btn btn-secondary btn-xs" title="Message"><i data-lucide="mail"></i></button>
                    <button class="btn btn-danger btn-xs" data-suspend="${esc(u.id)}" title="Suspend">
                        <i data-lucide="ban"></i>
                    </button>
                </div>
            </td>
        </tr>`).join('')
        : `<tr><td colspan="7"><div class="empty" style="padding:50px"><p>No users match</p></div></td></tr>`;

    icons();

    $$('[data-suspend]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const u = USERS.find(x => x.id === btn.dataset.suspend);
            const ok = await confirmDialog({
                title: `Suspend ${u.name}?`,
                message: 'They will be signed out immediately and unable to book until reinstated. Active bookings are honoured.',
                confirmText: 'Suspend', danger: true
            });
            if (!ok) return;
            u.status = 'pending';
            renderUsers();
            toast(`${u.name} suspended`, 'warning');
        });
    });
}

$('#userSearch')?.addEventListener('input', debounce(e => { userSearch = e.target.value; renderUsers(); }, 250));
$('#roleFilter')?.addEventListener('change', e => { roleFilter = e.target.value; renderUsers(); });
$('#inviteUser')?.addEventListener('click', () => toast('Invitation flow sends a signup link by email', 'info'));

/* ------------------------------------------------------------------ */
/* Vehicles (admin view)                                               */
/* ------------------------------------------------------------------ */

let adminVehicleSearch = '';

function renderAdminVehicles() {
    let list = Store.getVehicles();
    if (adminVehicleSearch) {
        const q = adminVehicleSearch.toLowerCase();
        list = list.filter(v => `${v.name} ${v.brand} ${v.plate} ${v.owner}`.toLowerCase().includes(q));
    }

    $('#adminVehicleCount').textContent = list.length;

    $('#adminVehiclesTable').innerHTML = list.length ? list.map(v => `
        <tr>
            <td>
                <div class="cell-media">
                    <img src="${esc(v.image)}" alt="" data-fallback="${esc(v.brand)}">
                    <div class="cell-media-text">
                        <strong>${esc(v.name)}</strong>
                        <span>${esc(v.plate)}</span>
                    </div>
                </div>
            </td>
            <td>${esc(v.owner)}</td>
            <td>${esc(CATEGORIES.find(c => c.id === v.category)?.name || v.category)}</td>
            <td>
                <div class="cell-battery" data-battery="${esc(v.id)}">
                    <div class="bar bar-sm">
                        <div class="bar-fill ${fmt.batteryClass(v.battery) === 'low' ? 'danger' : 'green'}"
                             style="width:${Math.round(v.battery)}%"></div>
                    </div>
                    <span class="battery-val">${Math.round(v.battery)}%</span>
                </div>
            </td>
            <td data-status-slot="${esc(v.id)}">${statusBadge(v.status)}</td>
            <td class="cell-strong">${fmt.money(v.price)}</td>
            <td>${v.trips}</td>
            <td><span class="rating"><i data-lucide="star" style="fill:currentColor"></i> ${v.rating}</span></td>
            <td>
                <div class="user-row-actions">
                    <a href="ev-details.html?id=${esc(v.id)}" class="btn btn-secondary btn-xs" title="View">
                        <i data-lucide="eye"></i>
                    </a>
                    <button class="btn btn-secondary btn-xs" data-admin-service="${esc(v.id)}" title="Maintenance">
                        <i data-lucide="wrench"></i>
                    </button>
                </div>
            </td>
        </tr>`).join('')
        : `<tr><td colspan="9"><div class="empty" style="padding:50px"><p>No vehicles match</p></div></td></tr>`;

    icons();

    $$('[data-admin-service]').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = Store.getVehicle(btn.dataset.adminService);
            const inService = v.status === 'maintenance';
            RT.setVehicleStatus(v.id, inService ? 'available' : 'maintenance',
                inService ? { healthScore: 98, lastService: Date.now() } : {});
            toast(inService ? `${v.name} returned to service` : `${v.name} sent for maintenance`,
                inService ? 'success' : 'warning');
            renderAdminVehicles();
        });
    });
}

$('#adminVehicleSearch')?.addEventListener('input', debounce(e => {
    adminVehicleSearch = e.target.value;
    renderAdminVehicles();
}, 250));

/* ------------------------------------------------------------------ */
/* Bookings                                                            */
/* ------------------------------------------------------------------ */

let adminBookingFilter = 'all';

function renderAdminBookings() {
    const all = Store.getBookings();
    const list = adminBookingFilter === 'all' ? all : all.filter(b => b.status === adminBookingFilter);

    const revenue = all.filter(b => b.paymentStatus === 'paid').reduce((a, b) => a + b.amount, 0);

    $('#bookingStats').innerHTML = [
        statTile({ label: 'Total bookings', value: all.length * 420, icon: 'calendar-check', delta: '+9.4%', deltaDir: 'up' }),
        statTile({ label: 'Active now', value: all.filter(b => b.status === 'active').length * 180, icon: 'navigation', tone: 'blue' }),
        statTile({ label: 'Revenue', value: '₹' + fmt.compact(revenue * 1840), icon: 'indian-rupee', tone: 'purple', delta: '+18.7%', deltaDir: 'up' }),
        statTile({ label: 'Cancellation rate', value: '3.2%', icon: 'x-circle', tone: 'warn', delta: '−0.6%', deltaDir: 'up', meta: 'improving' })
    ].join('');

    $('#adminBookingsTable').innerHTML = list.length ? list.map(b => `
        <tr>
            <td><span class="table-id">${esc(b.id)}</span></td>
            <td>
                <div class="cell-media">
                    <img src="${esc(b.vehicleImage)}" alt="" data-fallback="${esc(b.vehicleBrand)}">
                    <div class="cell-media-text"><strong>${esc(b.vehicleName)}</strong></div>
                </div>
            </td>
            <td>${esc(b.pickupLocation)}</td>
            <td>
                <div class="cell-strong">${fmt.dateShort(b.pickupDate)}</div>
                <span class="text-muted" style="font-size:.75rem">to ${fmt.dateShort(b.returnDate)}</span>
            </td>
            <td>${b.days}</td>
            <td class="cell-strong">${fmt.money(b.amount)}</td>
            <td>${statusBadge(b.paymentStatus)}</td>
            <td>${statusBadge(b.status)}</td>
        </tr>`).join('')
        : `<tr><td colspan="8"><div class="empty" style="padding:50px"><p>No bookings in this state</p></div></td></tr>`;

    icons();
}

$$('[data-abf]').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('[data-abf]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        adminBookingFilter = btn.dataset.abf;
        renderAdminBookings();
    });
});

/* ------------------------------------------------------------------ */
/* Drivers                                                             */
/* ------------------------------------------------------------------ */

function renderAdminDrivers() {
    const drivers = [
        { name: 'Arun Prakash',  rating: 4.9, trips: 412, status: 'on_trip',   earnings: 284000, since: 480 },
        { name: 'Meera Reddy',   rating: 4.8, trips: 328, status: 'available', earnings: 219400, since: 390 },
        { name: 'Kiran Rao',     rating: 4.7, trips: 267, status: 'on_trip',   earnings: 176800, since: 310 },
        { name: 'Sanjay Kumar',  rating: 4.9, trips: 501, status: 'available', earnings: 341200, since: 620 },
        { name: 'Fatima Sheikh', rating: 5.0, trips: 189, status: 'offline',   earnings: 128600, since: 210 },
        { name: 'Rohit Nair',    rating: 4.6, trips: 234, status: 'available', earnings: 154900, since: 280 }
    ];

    $('#adminDrivers').innerHTML = drivers.map(d => `
        <div class="driver-tile">
            <div class="driver-tile-head">
                <div class="avatar">${esc(fmt.initials(d.name))}</div>
                <div class="driver-tile-head-body">
                    <strong>${esc(d.name)}</strong>
                    <span>Driver since ${fmt.date(Date.now() - d.since * 86400000)}</span>
                </div>
                <span class="status status-${d.status === 'offline' ? 'offline' : d.status}">
                    <span class="status-dot"></span>${esc(fmt.statusLabel(d.status))}
                </span>
            </div>
            <div class="driver-stats">
                <div class="driver-stat"><strong>${d.rating}</strong><span>Rating</span></div>
                <div class="driver-stat"><strong>${d.trips}</strong><span>Trips</span></div>
                <div class="driver-stat"><strong>₹${fmt.compact(d.earnings)}</strong><span>Earned</span></div>
            </div>
            <div class="flex gap-2 mt-5">
                <button class="btn btn-secondary btn-sm flex-1">View profile</button>
                <button class="btn btn-secondary btn-sm btn-icon" aria-label="Message"><i data-lucide="mail"></i></button>
            </div>
        </div>`).join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Stations                                                            */
/* ------------------------------------------------------------------ */

function renderStations() {
    const s = RT.stationStats();
    const stations = Store.getStations();

    $('#stationStats').innerHTML = [
        statTile({ label: 'Stations', value: s.total, icon: 'zap', meta: `${s.chargers} bays total` }),
        statTile({ label: 'Bays available', value: s.available, icon: 'plug', tone: 'blue', id: 'stAvail' }),
        statTile({ label: 'Sessions today', value: s.sessionsToday, icon: 'activity', tone: 'purple', delta: '+14%', deltaDir: 'up' }),
        statTile({ label: 'Energy today', value: fmt.compact(s.energyToday) + ' kWh', icon: 'battery-charging', tone: 'warn' })
    ].join('');

    $('#adminStations').innerHTML = stations.map(st => `
        <div class="station-admin-row">
            <span class="cs-icon ${st.status === 'busy' ? 'busy' : st.status === 'offline' ? 'offline' : ''}"
                  style="width:40px;height:40px">
                <i data-lucide="zap" style="width:18px;height:18px"></i>
            </span>
            <div style="flex:1;min-width:0">
                <strong style="display:block;font-size:.9rem;color:var(--text-primary)">${esc(st.name)}</strong>
                <span style="font-size:.77rem;color:var(--text-muted)">
                    ${esc(st.operator)} · ${st.speed} kW · ₹${st.price}/kWh · ${st.sessionsToday} sessions today
                </span>
            </div>
            <div class="station-usage">
                <div class="bar bar-sm">
                    <div class="bar-fill ${st.available === 0 ? 'warn' : 'green'}"
                         data-st-bar="${esc(st.id)}"
                         style="width:${st.total ? (st.total - st.available) / st.total * 100 : 0}%"></div>
                </div>
                <span style="font-size:.72rem;color:var(--text-muted);display:block;margin-top:4px;text-align:right"
                      data-st-text="${esc(st.id)}">${st.available}/${st.total} free</span>
            </div>
            ${statusBadge(st.status)}
            <a href="charging-details.html?id=${esc(st.id)}" class="btn btn-secondary btn-xs">View</a>
        </div>`).join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

function renderPayments() {
    const payments = Store.getPayments();
    const total = payments.filter(p => p.status === 'paid').reduce((a, p) => a + p.amount, 0);

    $('#payStats').innerHTML = [
        statTile({ label: 'Processed', value: '₹' + fmt.compact(total * 1840), icon: 'credit-card', delta: '+18.7%', deltaDir: 'up' }),
        statTile({ label: 'Transactions', value: fmt.compact(payments.length * 420), icon: 'receipt', tone: 'blue' }),
        statTile({ label: 'Refunded', value: '₹' + fmt.compact(total * 42), icon: 'rotate-ccw', tone: 'warn', meta: '2.3% of volume' }),
        statTile({ label: 'Success rate', value: '98.7%', icon: 'check-circle', tone: 'purple', delta: '+0.4%', deltaDir: 'up' })
    ].join('');

    $('#adminPaymentsTable').innerHTML = payments.map(p => `
        <tr>
            <td><span class="table-id">${esc(p.id)}</span></td>
            <td><span class="table-id">${esc(p.bookingId)}</span></td>
            <td>${fmt.date(p.date)}</td>
            <td>${esc(p.method)}</td>
            <td class="text-muted">${esc(p.gateway)}</td>
            <td class="cell-strong">${fmt.money(p.amount)}</td>
            <td>${statusBadge(p.status)}</td>
        </tr>`).join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Revenue                                                             */
/* ------------------------------------------------------------------ */

function renderRevenue() {
    const p = platform();

    $('#revenueKpi').innerHTML = [
        { k: 'Gross revenue',    v: '₹' + fmt.compact(p.monthlyRevenue),        icon: 'indian-rupee' },
        { k: 'Rental income',    v: '₹' + fmt.compact(p.monthlyRevenue * 0.72), icon: 'car' },
        { k: 'Charging revenue', v: '₹' + fmt.compact(p.monthlyRevenue * 0.14), icon: 'zap' },
        { k: 'Add-ons & fees',   v: '₹' + fmt.compact(p.monthlyRevenue * 0.14), icon: 'plus-circle' }
    ].map((k, i) => `
        <div class="kpi">
            <div class="kpi-k"><i data-lucide="${esc(k.icon)}"></i> ${esc(k.k)}</div>
            <div class="kpi-v">${esc(k.v)}</div>
            <div class="kpi-foot">
                <span class="stat-delta up"><i data-lucide="trending-up"></i> ${[18.7, 16.2, 28.4, 11.9][i]}%</span>
                <span class="spark">${sparkline(trend('rk' + i, 12, { base: 30 }), SERIES[i % SERIES.length])}</span>
            </div>
        </div>`).join('');

    // Revenue by category.
    const byCat = CATEGORIES.map(c => {
        const vehicles = Store.getVehicles().filter(v => v.category === c.id);
        return vehicles.reduce((a, v) => a + v.price * v.trips, 0);
    });

    barChart('catRevChart',
        CATEGORIES.map(c => c.name.replace('Electric ', '')),
        [{ label: 'Revenue', data: byCat }],
        { money: true, horizontal: true }
    );

    // Revenue by location.
    const byLoc = LOCATIONS.slice(0, 8).map(l => {
        const vehicles = Store.getVehicles().filter(v => v.locationId === l.id);
        return vehicles.reduce((a, v) => a + v.price * v.trips, 0) || Math.round(Math.random() * 40000 + 20000);
    });

    barChart('locRevChart',
        LOCATIONS.slice(0, 8).map(l => l.area),
        [{ label: 'Revenue', data: byLoc, color: SERIES[2] }],
        { money: true }
    );
}

/* ------------------------------------------------------------------ */
/* Promotions                                                          */
/* ------------------------------------------------------------------ */

function renderPromotions() {
    $('#promoGrid').innerHTML = OFFERS.map((o, i) => {
        const redemptions = [1842, 964, 312, 88, 2104, 640][i % 6];
        const budget = [500000, 300000, 200000, 400000, 250000, 150000][i % 6];
        const used = Math.round(budget * [0.72, 0.41, 0.63, 0.18, 0.88, 0.35][i % 6]);

        return `
        <div class="promo-card">
            <div class="flex items-start justify-between gap-3 mb-4" style="position:relative;z-index:1">
                <div>
                    <span class="badge badge-${o.color === 'green' ? 'green' : o.color === 'blue' ? 'blue' : 'purple'} mb-2">
                        ${esc(o.badge)}
                    </span>
                    <h4 style="font-size:1.02rem;margin-bottom:6px">${esc(o.title)}</h4>
                    <span class="promo-code">${esc(o.code)}</span>
                </div>
                <label class="switch"><input type="checkbox" checked></label>
            </div>
            <div class="meta-list" style="position:relative;z-index:1">
                <div class="meta-row"><span class="meta-k">Discount</span>
                    <span class="meta-v text-green">${esc(o.discount)}</span></div>
                <div class="meta-row"><span class="meta-k">Redemptions</span>
                    <span class="meta-v">${fmt.num(redemptions)}</span></div>
                <div class="meta-row"><span class="meta-k">Expires</span>
                    <span class="meta-v">${fmt.date(o.expires)}</span></div>
            </div>
            <div class="mt-4" style="position:relative;z-index:1">
                <div class="flex justify-between mb-2" style="font-size:.78rem">
                    <span class="text-muted">Budget used</span>
                    <span class="text-primary">${fmt.money(used)} / ${fmt.money(budget)}</span>
                </div>
                <div class="bar bar-sm">
                    <div class="bar-fill ${used / budget > 0.8 ? 'warn' : 'green'}" style="width:${used / budget * 100}%"></div>
                </div>
            </div>
        </div>`;
    }).join('');

    icons();
}

$('#newPromo')?.addEventListener('click', () => toast('Promotion builder opens a guided wizard', 'info'));

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

function renderReviews() {
    const reviews = Store.getReviews();
    const avg = reviews.length
        ? (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1) : '—';

    $('#reviewsSection').innerHTML = `
    <div class="panel">
        <div class="panel-head">
            <div class="panel-title"><i data-lucide="message-square"></i> Latest reviews</div>
            <span class="text-muted" style="font-size:.82rem">${reviews.length} total</span>
        </div>
        <div class="panel-body">
            ${reviews.slice(0, 10).map(r => {
                const v = Store.getVehicle(r.vehicleId);
                return `
                <article class="review">
                    <div class="review-head">
                        <div class="avatar avatar-sm">${esc(r.initials || fmt.initials(r.name))}</div>
                        <div class="review-head-info">
                            <strong>${esc(r.name)}</strong>
                            <span>${v ? esc(v.name) : ''} · ${fmt.ago(r.date)}</span>
                        </div>
                        <div class="stars">
                            ${Array.from({ length: 5 }, (_, i) =>
                                `<i data-lucide="star" ${i < r.rating ? 'style="fill:currentColor"' : 'class="star-empty"'}></i>`
                            ).join('')}
                        </div>
                    </div>
                    <p class="review-text">${esc(r.text)}</p>
                    <div class="review-foot">
                        <button><i data-lucide="flag"></i> Flag</button>
                        <button><i data-lucide="reply"></i> Respond</button>
                    </div>
                </article>`;
            }).join('')}
        </div>
    </div>

    <div class="panel">
        <div class="panel-head"><div class="panel-title"><i data-lucide="star"></i> Rating summary</div></div>
        <div class="panel-body">
            <div style="text-align:center;margin-bottom:24px">
                <div style="font-family:var(--font-display);font-size:3.2rem;line-height:1;color:var(--text-primary);letter-spacing:-.05em">
                    ${avg}
                </div>
                <span class="text-muted" style="font-size:.84rem">across ${reviews.length} reviews</span>
            </div>
            <div class="review-bars">
                ${[5, 4, 3, 2, 1].map(star => {
                    const n = reviews.filter(r => r.rating === star).length;
                    const pct = reviews.length ? n / reviews.length * 100 : 0;
                    return `
                    <div class="review-bar-row">
                        <span>${star} star${star === 1 ? '' : 's'}</span>
                        <div class="bar bar-sm"><div class="bar-fill green" style="width:${pct}%"></div></div>
                        <span>${n}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>
    </div>`;

    icons();
}

/* ------------------------------------------------------------------ */
/* Support tickets                                                     */
/* ------------------------------------------------------------------ */

function renderTickets() {
    const tickets = [
        { id: 'TK-4821', subject: 'Charging session did not start',   user: 'Priya Iyer',       priority: 'high',   status: 'open',        age: 22,  category: 'Charging' },
        { id: 'TK-4820', subject: 'Refund not received for EV2031',   user: 'Vikram Desai',     priority: 'high',   status: 'open',        age: 48,  category: 'Payments' },
        { id: 'TK-4819', subject: 'Vehicle interior not clean',       user: 'Sneha Kulkarni',   priority: 'medium', status: 'in_progress', age: 6,   category: 'Vehicle' },
        { id: 'TK-4818', subject: 'Cannot extend an active booking',  user: 'Rahul Menon',      priority: 'medium', status: 'open',        age: 14,  category: 'Booking' },
        { id: 'TK-4817', subject: 'App shows wrong battery level',    user: 'Arjun Nair',       priority: 'low',    status: 'in_progress', age: 71,  category: 'Technical' },
        { id: 'TK-4816', subject: 'Request to add a second driver',   user: 'Ananya Sharma',    priority: 'low',    status: 'open',        age: 96,  category: 'Account' }
    ];

    $('#ticketStats').innerHTML = [
        statTile({ label: 'Open tickets', value: tickets.filter(t => t.status === 'open').length, icon: 'inbox', tone: 'warn' }),
        statTile({ label: 'In progress', value: tickets.filter(t => t.status === 'in_progress').length, icon: 'loader', tone: 'blue' }),
        statTile({ label: 'Avg first response', value: '8 min', icon: 'clock', delta: '−2 min', deltaDir: 'up', meta: 'faster than target' }),
        statTile({ label: 'Satisfaction', value: '4.7', icon: 'smile', tone: 'purple', meta: 'post-resolution survey' })
    ].join('');

    $('#ticketList').innerHTML = tickets.map(t => `
        <div class="ticket-row">
            <span class="ticket-priority ${esc(t.priority)}"></span>
            <div style="flex:1;min-width:0">
                <div class="flex items-center gap-3 mb-1 flex-wrap">
                    <span class="table-id">${esc(t.id)}</span>
                    <strong style="font-size:.9rem;color:var(--text-primary)">${esc(t.subject)}</strong>
                    <span class="badge badge-muted">${esc(t.category)}</span>
                </div>
                <span style="font-size:.78rem;color:var(--text-muted)">
                    ${esc(t.user)} · opened ${t.age}h ago
                </span>
            </div>
            <span class="badge ${t.priority === 'high' ? 'badge-danger' : t.priority === 'medium' ? 'badge-warning' : 'badge-muted'}">
                ${esc(t.priority[0].toUpperCase() + t.priority.slice(1))}
            </span>
            ${statusBadge(t.status === 'in_progress' ? 'active' : 'pending')}
            <button class="btn btn-secondary btn-xs">Open</button>
        </div>`).join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function renderAdminSettings() {
    $('#adminSettings').innerHTML = `
    <div class="panel">
        <div class="panel-head"><div class="panel-title"><i data-lucide="sliders-horizontal"></i> Platform</div></div>
        <div class="panel-body">
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Platform commission</strong>
                    <span>Taken from every completed booking</span>
                </div>
                <span class="badge badge-green">18%</span>
            </div>
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>GST rate</strong>
                    <span>Applied to the taxable subtotal</span>
                </div>
                <span class="badge badge-blue">18%</span>
            </div>
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Instant booking</strong>
                    <span>Allow qualifying users to skip owner approval</span>
                </div>
                <label class="switch"><input type="checkbox" checked></label>
            </div>
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Maintenance mode</strong>
                    <span>Show a holding page to all non-admin users</span>
                </div>
                <label class="switch"><input type="checkbox"></label>
            </div>
        </div>
    </div>

    <div class="panel">
        <div class="panel-head"><div class="panel-title"><i data-lucide="activity"></i> Simulation</div></div>
        <div class="panel-body">
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Real-time engine</strong>
                    <span>Drives battery, position and status updates</span>
                </div>
                <label class="switch"><input type="checkbox" id="rtToggle" checked></label>
            </div>
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Regenerate fleet data</strong>
                    <span>Rebuild vehicles, stations and bookings from scratch</span>
                </div>
                <button class="btn btn-secondary btn-sm" id="regenBtn">Regenerate</button>
            </div>
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Export platform data</strong>
                    <span>Full JSON dump of every stored entity</span>
                </div>
                <button class="btn btn-secondary btn-sm" id="dumpBtn">Export JSON</button>
            </div>
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Clear all data</strong>
                    <span>Wipes local storage and returns to a clean state</span>
                </div>
                <button class="btn btn-danger btn-sm" id="wipeBtn">Clear</button>
            </div>
        </div>
    </div>`;

    $('#rtToggle')?.addEventListener('change', e => {
        if (e.target.checked) { RT.resume(); toast('Real-time engine resumed', 'success'); }
        else { RT.pause(); toast('Real-time engine paused', 'warning'); }
    });

    $('#regenBtn')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
            title: 'Regenerate all fleet data?',
            message: 'Vehicles, stations and bookings will be rebuilt. User accounts and preferences are kept.',
            confirmText: 'Regenerate'
        });
        if (!ok) return;
        Store.resetSimulation();
        toast('Regenerating…', 'info');
        setTimeout(() => location.reload(), 800);
    });

    $('#dumpBtn')?.addEventListener('click', () => {
        const dump = JSON.stringify(Store.exportAll(), null, 2);
        const blob = new Blob([dump], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `evride-platform-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('Platform data exported', 'success');
    });

    $('#wipeBtn')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
            title: 'Clear all platform data?',
            message: 'Everything in local storage is removed, including user accounts. This cannot be undone.',
            confirmText: 'Clear everything', danger: true
        });
        if (!ok) return;
        Store.resetAll();
        toast('All data cleared', 'info');
        setTimeout(() => location.href = 'index.html', 1200);
    });
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

$('#adminExport')?.addEventListener('click', () => exportBookingsCsv());
$('#exportVehiclesAdmin')?.addEventListener('click', () => exportVehiclesCsv());

function toCsv(headers, rows, name) {
    const csv = [headers, ...rows]
        .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evride-${name}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${rows.length} rows exported`, 'success', 'Download ready');
}

function exportBookingsCsv() {
    const rows = Store.getBookings().map(b => [
        b.id, b.vehicleName, b.pickupLocation, fmt.date(b.pickupDate),
        fmt.date(b.returnDate), b.days, b.amount, b.paymentStatus, b.status
    ]);
    toCsv(['Booking ID', 'Vehicle', 'Pickup', 'Start', 'End', 'Days', 'Amount', 'Payment', 'Status'], rows, 'bookings');
}

function exportVehiclesCsv() {
    const rows = Store.getVehicles().map(v => [
        v.id, v.name, v.brand, v.plate, v.owner, v.category,
        Math.round(v.battery), v.range, fmt.statusLabel(v.status), v.price, v.trips, v.rating
    ]);
    toCsv(['ID', 'Name', 'Brand', 'Plate', 'Owner', 'Category', 'Battery %', 'Range', 'Status', 'Rate', 'Trips', 'Rating'], rows, 'vehicles');
}

/* ------------------------------------------------------------------ */
/* Live updates                                                        */
/* ------------------------------------------------------------------ */

RT.on('vehicles', vehicles => {
    renderMonitorOps();
    renderSystemAlerts();

    vehicles.forEach(v => {
        const cell = $(`.cell-battery[data-battery="${v.id}"]`);
        if (cell) {
            const fill = cell.querySelector('.bar-fill');
            const val = cell.querySelector('.battery-val');
            if (fill) fill.style.width = Math.round(v.battery) + '%';
            if (val) val.textContent = Math.round(v.battery) + '%';
        }
        const slot = $(`td[data-status-slot="${v.id}"]`);
        if (slot && slot.dataset.last !== v.status) {
            slot.dataset.last = v.status;
            slot.innerHTML = statusBadge(v.status);
        }
    });

    if (opsMap) updateOpsMap();
});

// Surface individual state transitions in the ticker.
Store.getVehicles().forEach(v => {
    let last = v.status;
    RT.on('vehicle:' + v.id, updated => {
        if (updated.status === last) return;
        const tone = { available: 'green', on_trip: 'blue', charging: 'purple',
                       reserved: 'warn', maintenance: 'danger' }[updated.status] || 'green';
        pushEvent(`<strong>${esc(updated.name)}</strong> (${esc(updated.plate)}) → ${esc(fmt.statusLabel(updated.status))}`, tone);
        last = updated.status;
    });
});

RT.on('stations', stations => {
    stations.forEach(s => {
        const bar = $(`[data-st-bar="${s.id}"]`);
        const text = $(`[data-st-text="${s.id}"]`);
        if (bar) {
            bar.style.width = (s.total ? (s.total - s.available) / s.total * 100 : 0) + '%';
            bar.className = `bar-fill ${s.available === 0 ? 'warn' : 'green'}`;
        }
        if (text) text.textContent = `${s.available}/${s.total} free`;
    });
    const avail = $('[data-stat="stAvail"]');
    if (avail) avail.textContent = RT.stationStats().available;
});

RT.on('notification', n => {
    pushEvent(`<strong>${esc(n.title)}</strong> — ${esc(n.msg)}`,
        n.type === 'warning' ? 'warn' : n.type === 'error' ? 'danger' : 'blue');
});

document.addEventListener('dash:section', e => {
    resizeAll();
    if (e.detail.id === 'monitor') initOpsMap();
    if (e.detail.id === 'revenue') renderRevenue();
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

safeRender(
    renderKpis,
    renderOverviewCharts,
    renderSystemAlerts,
    renderRecentBookings,
    renderMonitorOps,
    renderUsers,
    renderAdminVehicles,
    renderAdminBookings,
    renderAdminDrivers,
    renderStations,
    renderPayments,
    renderRevenue,
    renderPromotions,
    renderReviews,
    renderTickets,
    renderAdminSettings
);

pushEvent('<strong>Operations console</strong> connected to live telemetry', 'green');
