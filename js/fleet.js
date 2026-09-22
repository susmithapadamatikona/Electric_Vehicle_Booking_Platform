/* ==========================================================================
   EVRide — fleet.js
   Controller for fleet-dashboard.html.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { LOCATIONS } from './data.js';
import { boot, fmt, $$, esc, icons, toast, confirmDialog, debounce } from './main.js';
import mountDash, { statTile, statusBadge, safeRender,
         dashEl as $ } from './dashboard.js';
import { createMap, plotVehicles } from './map.js';
import Charts, { FLEET_COLORS, SERIES, lineChart, barChart, doughnutChart, trend, monthLabels, resizeAll } from './charts.js';

boot();
mountDash({ role: 'fleet', active: 'overview', searchPlaceholder: 'Search vehicles, drivers, plates…' });

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
    search: '',
    statusFilter: '',
    mapFilter: 'all'
};

let fleetMap = null;
let bigMap = null;

const STATES = ['available', 'on_trip', 'charging', 'reserved', 'maintenance'];

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function renderOps(targetId = 'fleetOps') {
    const s = RT.fleetStats();
    const wrap = $('#' + targetId);
    if (!wrap) return;

    const cells = [
        { k: 'Total fleet',  v: s.total,       cls: '',       dot: null },
        { k: 'Available',    v: s.available,   cls: 'green',  dot: 'available' },
        { k: 'On trip',      v: s.onTrip,      cls: 'blue',   dot: 'on_trip' },
        { k: 'Charging',     v: s.charging,    cls: 'purple', dot: 'charging' },
        { k: 'Reserved',     v: s.reserved,    cls: 'warn',   dot: 'reserved' },
        { k: 'Maintenance',  v: s.maintenance, cls: 'danger', dot: 'maintenance' }
    ];

    wrap.innerHTML = cells.map(c => `
        <div class="ops-cell ${c.cls}">
            <div class="ops-val" data-ops="${esc(targetId)}-${esc(c.k)}">${c.v}</div>
            <div class="ops-k">
                ${c.dot ? `<span class="status-dot ${c.dot}"></span>` : ''}${esc(c.k)}
            </div>
        </div>`).join('');
}

function renderFleetStats() {
    const s = RT.fleetStats();
    const vehicles = Store.getVehicles();
    const avgUtil = Math.round(vehicles.reduce((a, v) => a + v.utilization, 0) / (vehicles.length || 1));
    const avgHealth = Math.round(vehicles.reduce((a, v) => a + v.healthScore, 0) / (vehicles.length || 1));

    $('#fleetStats').innerHTML = [
        statTile({
            label: 'Fleet utilisation', value: s.utilization + '%', icon: 'activity',
            delta: '+6.2%', deltaDir: 'up', meta: 'vs. last week', id: 'utilStat'
        }),
        statTile({
            label: 'Average battery', value: s.avgBattery + '%', icon: 'battery-charging', tone: 'blue',
            meta: `${s.lowBattery} below 20%`, id: 'batteryStat'
        }),
        statTile({
            label: 'Average health', value: avgHealth + '%', icon: 'heart-pulse', tone: 'purple',
            meta: `${vehicles.filter(v => v.healthScore < 88).length} need attention`
        }),
        statTile({
            label: 'Avg utilisation', value: avgUtil + '%', icon: 'gauge', tone: 'warn',
            delta: '+3.4%', deltaDir: 'up', meta: 'per vehicle'
        })
    ].join('');

    $('#avgBattery').textContent = s.avgBattery + '%';
    icons();
}

function renderAlerts() {
    const vehicles = Store.getVehicles();

    const alerts = [
        ...vehicles.filter(v => v.status === 'maintenance').map(v => ({
            level: 'danger', icon: 'wrench',
            title: `${v.name} in maintenance`,
            text: `${v.plate} · health ${v.healthScore}% · ${v.locationName}`,
            vehicleId: v.id
        })),
        ...vehicles.filter(v => v.battery < 20 && v.status !== 'charging').map(v => ({
            level: 'warning', icon: 'battery-warning',
            title: `${v.name} battery critical`,
            text: `${Math.round(v.battery)}% · ${v.range} km range · ${v.area}`,
            vehicleId: v.id
        })),
        ...vehicles.filter(v => v.healthScore < 86 && v.status !== 'maintenance').map(v => ({
            level: 'info', icon: 'activity',
            title: `${v.name} service due`,
            text: `Health ${v.healthScore}% · ${fmt.num(v.odometer)} km since last service`,
            vehicleId: v.id
        }))
    ].slice(0, 6);

    $('#alertCount').textContent = alerts.length;

    if (!alerts.length) {
        $('#alertsList').innerHTML = `
        <div class="empty" style="padding:36px 16px">
            <div class="empty-icon" style="width:52px;height:52px"><i data-lucide="check-circle"></i></div>
            <h4 style="font-size:1rem">All clear</h4>
            <p style="font-size:.85rem">No vehicles need attention right now.</p>
        </div>`;
        icons();
        return;
    }

    $('#alertsList').innerHTML = alerts.map(a => `
        <div class="alert-strip ${esc(a.level)}">
            <span class="activity-icon ${a.level === 'danger' ? 'danger' : a.level === 'warning' ? 'warn' : 'blue'}">
                <i data-lucide="${esc(a.icon)}"></i>
            </span>
            <div class="alert-strip-body">
                <strong>${esc(a.title)}</strong>
                <span>${esc(a.text)}</span>
            </div>
            <button class="btn btn-secondary btn-xs" data-focus-vehicle="${esc(a.vehicleId)}">View</button>
        </div>`).join('');

    icons();

    $$('[data-focus-vehicle]').forEach(btn => {
        btn.addEventListener('click', () => {
            location.hash = 'vehicles';
            state.search = Store.getVehicle(btn.dataset.focusVehicle)?.plate || '';
            $('#fleetSearch').value = state.search;
            renderFleetTable();
        });
    });
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */

function renderCharts() {
    const s = RT.fleetStats();
    const vehicles = Store.getVehicles();

    // Status doughnut — colours mirror the UI status dots exactly.
    doughnutChart('statusChart',
        ['Available', 'On trip', 'Charging', 'Reserved', 'Maintenance'],
        [s.available, s.onTrip, s.charging, s.reserved, s.maintenance],
        {
            colors: [
                FLEET_COLORS.available, FLEET_COLORS.on_trip, FLEET_COLORS.charging,
                FLEET_COLORS.reserved, FLEET_COLORS.maintenance
            ],
            unit: ' vehicles'
        }
    );

    // Battery distribution — a single measure, so one series, no legend.
    const buckets = ['0–20%', '21–40%', '41–60%', '61–80%', '81–100%'];
    const counts = [0, 0, 0, 0, 0];
    vehicles.forEach(v => {
        const i = Math.min(4, Math.floor(v.battery / 20));
        counts[i]++;
    });

    barChart('batteryChart', buckets, [{ label: 'Vehicles', data: counts }], { unit: ' vehicles' });

    // Utilisation by location.
    const locs = LOCATIONS.slice(0, 6);
    const util = locs.map(l => {
        const at = vehicles.filter(v => v.locationId === l.id);
        return at.length
            ? Math.round(at.reduce((a, v) => a + v.utilization, 0) / at.length)
            : 0;
    });

    barChart('utilChart', locs.map(l => l.area), [{ label: 'Utilisation', data: util, color: SERIES[2] }], {
        horizontal: true, unit: '%'
    });
}

/* ------------------------------------------------------------------ */
/* Maps                                                                */
/* ------------------------------------------------------------------ */

function initFleetMap() {
    if (fleetMap) { fleetMap.invalidate(); return; }
    fleetMap = createMap('fleetMap', { zoom: 11 });
    plotVehicles(fleetMap, Store.getVehicles());
    if (fleetMap && !fleetMap.isFallback) fleetMap.fitMarkers(50);
    fleetMap?.invalidate();
}

function initBigMap() {
    if (!bigMap) {
        bigMap = createMap('bigMap', { zoom: 11 });
    }
    updateBigMap();
    bigMap?.invalidate();
}

function updateBigMap() {
    if (!bigMap) return;
    const vehicles = state.mapFilter === 'all'
        ? Store.getVehicles()
        : Store.getVehicles().filter(v => v.status === state.mapFilter);
    plotVehicles(bigMap, vehicles);
    if (!bigMap.isFallback && vehicles.length) bigMap.fitMarkers(50);
}

$$('[data-mapf]').forEach(chip => {
    chip.addEventListener('click', () => {
        $$('[data-mapf]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.mapFilter = chip.dataset.mapf;
        updateBigMap();
    });
});

/* ------------------------------------------------------------------ */
/* Vehicles table                                                      */
/* ------------------------------------------------------------------ */

function healthClass(n) {
    return n >= 92 ? 'good' : n >= 85 ? 'fair' : 'poor';
}

function filteredVehicles() {
    let list = Store.getVehicles();

    if (state.search) {
        const q = state.search.toLowerCase();
        list = list.filter(v =>
            `${v.name} ${v.brand} ${v.plate} ${v.owner} ${v.area}`.toLowerCase().includes(q));
    }
    if (state.statusFilter) list = list.filter(v => v.status === state.statusFilter);

    return list;
}

function renderFleetTable() {
    const list = filteredVehicles();
    $('#fleetRowCount').textContent = list.length;
    $('#fleetFootNote').textContent =
        `Showing ${list.length} of ${Store.getVehicles().length} vehicles`;

    if (!list.length) {
        $('#fleetTable').innerHTML = `
        <tr><td colspan="9">
            <div class="empty" style="padding:50px 20px">
                <div class="empty-icon"><i data-lucide="search-x"></i></div>
                <h4>No vehicles match</h4>
                <p>Try a different search term or clear the status filter.</p>
            </div>
        </td></tr>`;
        icons();
        return;
    }

    $('#fleetTable').innerHTML = list.map(v => `
        <tr data-row="${esc(v.id)}">
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
            <td>
                <div class="cell-battery" data-battery="${esc(v.id)}">
                    <div class="bar bar-sm">
                        <div class="bar-fill ${fmt.batteryClass(v.battery) === 'low' ? 'danger' : fmt.batteryClass(v.battery) === 'mid' ? 'warn' : 'green'}"
                             style="width:${Math.round(v.battery)}%"></div>
                    </div>
                    <span class="battery-val">${Math.round(v.battery)}%</span>
                </div>
            </td>
            <td data-range="${esc(v.id)}">${v.range} km</td>
            <td>
                <div class="cell-strong">${esc(v.area)}</div>
                <span class="text-muted" style="font-size:.75rem">${esc(v.locationName)}</span>
            </td>
            <td data-status-slot="${esc(v.id)}">${statusBadge(v.status)}</td>
            <td>
                <span class="health ${healthClass(v.healthScore)}">
                    <span class="health-dot"></span>${v.healthScore}%
                </span>
            </td>
            <td class="text-muted" style="font-size:.79rem" data-updated="${esc(v.id)}">${fmt.ago(v.updatedAt)}</td>
            <td>
                <div class="cell-actions">
                    <a href="ev-details.html?id=${esc(v.id)}" class="btn btn-secondary btn-xs" title="View">
                        <i data-lucide="eye"></i>
                    </a>
                    <button class="btn btn-secondary btn-xs" data-track="${esc(v.id)}" title="Track">
                        <i data-lucide="map-pin"></i>
                    </button>
                    <button class="btn btn-secondary btn-xs" data-service="${esc(v.id)}" title="Maintenance">
                        <i data-lucide="wrench"></i>
                    </button>
                </div>
            </td>
        </tr>`).join('');

    icons();
    bindTableActions();
}

function bindTableActions() {
    $$('[data-track]').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = Store.getVehicle(btn.dataset.track);
            if (!v) return;
            location.hash = 'live';
            setTimeout(() => {
                initBigMap();
                if (bigMap) bigMap.setView(v.lat, v.lng, 15);
                toast(`Centred on ${v.name}`, 'info');
            }, 200);
        });
    });

    $$('[data-service]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const v = Store.getVehicle(btn.dataset.service);
            if (!v) return;

            const inService = v.status === 'maintenance';
            const ok = await confirmDialog({
                title: inService ? `Return ${v.name} to service?` : `Send ${v.name} for maintenance?`,
                message: inService
                    ? 'The vehicle becomes available for booking immediately and its health score resets.'
                    : `${v.plate} will be taken out of the booking pool until maintenance is marked complete.`,
                confirmText: inService ? 'Return to service' : 'Send for maintenance',
                danger: !inService
            });
            if (!ok) return;

            if (inService) {
                RT.setVehicleStatus(v.id, 'available', { healthScore: 98, lastService: Date.now() });
                toast(`${v.name} is back in service`, 'success');
            } else {
                RT.setVehicleStatus(v.id, 'maintenance');
                toast(`${v.name} sent for maintenance`, 'warning');
            }
            renderAll();
        });
    });
}

$('#fleetSearch')?.addEventListener('input', debounce(e => {
    state.search = e.target.value;
    renderFleetTable();
}, 250));

$('#fleetStatusFilter')?.addEventListener('change', e => {
    state.statusFilter = e.target.value;
    renderFleetTable();
});

/* ------------------------------------------------------------------ */
/* Assignments                                                         */
/* ------------------------------------------------------------------ */

const DRIVERS = [
    { id: 'd1', name: 'Arun Prakash',  rating: 4.9, trips: 412, status: 'on_trip',   phone: '+91 98450 11223' },
    { id: 'd2', name: 'Meera Reddy',   rating: 4.8, trips: 328, status: 'available', phone: '+91 98450 33445' },
    { id: 'd3', name: 'Kiran Rao',     rating: 4.7, trips: 267, status: 'on_trip',   phone: '+91 98450 55667' },
    { id: 'd4', name: 'Sanjay Kumar',  rating: 4.9, trips: 501, status: 'available', phone: '+91 98450 77889' },
    { id: 'd5', name: 'Fatima Sheikh', rating: 5.0, trips: 189, status: 'off_duty',  phone: '+91 98450 99001' },
    { id: 'd6', name: 'Rohit Nair',    rating: 4.6, trips: 234, status: 'available', phone: '+91 98450 22334' }
];

function renderAssignments() {
    const vehicles = Store.getVehicles();
    const assigned = vehicles.filter(v => v.status === 'on_trip' || v.status === 'reserved');
    const unassigned = vehicles.filter(v => v.status === 'available');

    $('#assignmentGrid').innerHTML = `
    <div class="panel">
        <div class="panel-head">
            <div class="panel-title"><i data-lucide="link"></i> Currently assigned</div>
            <span class="badge badge-blue">${assigned.length}</span>
        </div>
        <div class="panel-body flush">
            ${assigned.length ? assigned.slice(0, 8).map((v, i) => {
                const d = DRIVERS[i % DRIVERS.length];
                return `
                <div class="payout-row">
                    <div class="avatar avatar-sm">${esc(fmt.initials(d.name))}</div>
                    <div style="flex:1;min-width:0">
                        <strong style="display:block;font-size:.87rem;color:var(--text-primary)">${esc(d.name)}</strong>
                        <span style="font-size:.76rem;color:var(--text-muted)">${esc(v.name)} · ${esc(v.plate)}</span>
                    </div>
                    ${statusBadge(v.status)}
                </div>`;
            }).join('') : '<div class="empty" style="padding:40px"><p>No active assignments</p></div>'}
        </div>
    </div>

    <div class="panel">
        <div class="panel-head">
            <div class="panel-title"><i data-lucide="unlink"></i> Unassigned vehicles</div>
            <span class="badge badge-green">${unassigned.length}</span>
        </div>
        <div class="panel-body flush">
            ${unassigned.length ? unassigned.slice(0, 8).map(v => `
                <div class="payout-row">
                    <img src="${esc(v.image)}" alt="" data-fallback="${esc(v.brand)}"
                         style="width:44px;height:32px;object-fit:cover;border-radius:6px;background:var(--card-light)">
                    <div style="flex:1;min-width:0">
                        <strong style="display:block;font-size:.87rem;color:var(--text-primary)">${esc(v.name)}</strong>
                        <span style="font-size:.76rem;color:var(--text-muted)">${esc(v.plate)} · ${Math.round(v.battery)}% · ${esc(v.area)}</span>
                    </div>
                    <button class="btn btn-secondary btn-xs" data-assign="${esc(v.id)}">Assign</button>
                </div>`).join('') : '<div class="empty" style="padding:40px"><p>Every vehicle is assigned</p></div>'}
        </div>
    </div>`;

    icons();

    $$('[data-assign]').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = Store.getVehicle(btn.dataset.assign);
            const free = DRIVERS.filter(d => d.status === 'available');
            if (!free.length) { toast('No drivers are free right now', 'warning'); return; }
            const d = free[Math.floor(Math.random() * free.length)];
            RT.setVehicleStatus(v.id, 'reserved');
            toast(`${v.name} assigned to ${d.name}`, 'success');
            renderAll();
        });
    });
}

$('#autoAssign')?.addEventListener('click', async () => {
    const free = Store.getVehicles().filter(v => v.status === 'available');
    if (!free.length) { toast('No unassigned vehicles', 'info'); return; }

    const ok = await confirmDialog({
        title: 'Auto-assign vehicles?',
        message: `${free.length} available vehicles will be matched to free drivers by proximity and rating.`,
        confirmText: 'Auto-assign'
    });
    if (!ok) return;

    const n = Math.min(free.length, DRIVERS.filter(d => d.status === 'available').length);
    free.slice(0, n).forEach(v => RT.setVehicleStatus(v.id, 'reserved'));
    toast(`${n} ${n === 1 ? 'vehicle' : 'vehicles'} assigned`, 'success');
    renderAll();
});

/* ------------------------------------------------------------------ */
/* Charging                                                            */
/* ------------------------------------------------------------------ */

function renderCharging() {
    const vehicles = Store.getVehicles();
    const charging = vehicles.filter(v => v.status === 'charging');
    const st = RT.stationStats();

    $('#chargeStats').innerHTML = [
        statTile({ label: 'Charging now', value: charging.length, icon: 'zap', tone: 'purple', meta: 'across the network' }),
        statTile({ label: 'Bays available', value: st.available, icon: 'plug', meta: `of ${st.chargers} total` }),
        statTile({ label: 'Energy today', value: fmt.compact(st.energyToday) + ' kWh', icon: 'battery-charging', tone: 'blue', delta: '+14%', deltaDir: 'up' }),
        statTile({ label: 'Sessions today', value: st.sessionsToday, icon: 'activity', tone: 'warn', meta: 'network-wide' })
    ].join('');

    $('#chargingNow').innerHTML = charging.length ? charging.map(v => `
        <div class="payout-row">
            <span class="activity-icon purple"><i data-lucide="zap"></i></span>
            <div style="flex:1;min-width:0">
                <strong style="display:block;font-size:.87rem;color:var(--text-primary)">${esc(v.name)}</strong>
                <span style="font-size:.76rem;color:var(--text-muted)">${esc(v.plate)} · ${esc(v.locationName)}</span>
                <div class="bar bar-sm mt-2" style="max-width:150px">
                    <div class="bar-fill animated" data-battery="${esc(v.id)}" style="width:${Math.round(v.battery)}%"></div>
                </div>
            </div>
            <div style="text-align:right">
                <strong style="font-family:var(--font-display);font-size:1.1rem;color:#B49BFF">${Math.round(v.battery)}%</strong>
                <span style="display:block;font-size:.72rem;color:var(--text-muted)">${v.range} km</span>
            </div>
        </div>`).join('')
        : '<div class="empty" style="padding:50px"><p>No vehicles charging right now</p></div>';

    $('#networkCapacity').innerHTML = Store.getStations().slice(0, 8).map(s => `
        <div class="station-admin-row" style="padding-inline:0">
            <span class="cs-icon" style="width:36px;height:36px">
                <i data-lucide="zap" style="width:16px;height:16px"></i>
            </span>
            <div style="flex:1;min-width:0">
                <strong style="display:block;font-size:.86rem;color:var(--text-primary)">${esc(s.name)}</strong>
                <span style="font-size:.75rem;color:var(--text-muted)">${s.speed} kW · ₹${s.price}/kWh</span>
            </div>
            <div class="station-usage">
                <div class="bar bar-sm">
                    <div class="bar-fill ${s.available === 0 ? 'warn' : 'green'}"
                         style="width:${s.total ? (s.total - s.available) / s.total * 100 : 0}%"></div>
                </div>
                <span style="font-size:.72rem;color:var(--text-muted);display:block;margin-top:4px;text-align:right">
                    ${s.available}/${s.total} free
                </span>
            </div>
        </div>`).join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Maintenance                                                         */
/* ------------------------------------------------------------------ */

function renderMaintenance() {
    const vehicles = Store.getVehicles();
    const inService = vehicles.filter(v => v.status === 'maintenance');
    const dueSoon = vehicles.filter(v => v.healthScore < 90 && v.status !== 'maintenance');
    const overdue = vehicles.filter(v => Date.now() - v.lastService > 90 * 86400000);

    $('#maintStats').innerHTML = [
        statTile({ label: 'In maintenance', value: inService.length, icon: 'wrench', tone: 'danger', meta: 'out of service' }),
        statTile({ label: 'Service due', value: dueSoon.length, icon: 'alert-triangle', tone: 'warn', meta: 'health below 90%' }),
        statTile({ label: 'Overdue', value: overdue.length, icon: 'calendar-x', tone: 'danger', meta: '90+ days since service' }),
        statTile({ label: 'Fleet health', value: Math.round(vehicles.reduce((a, v) => a + v.healthScore, 0) / (vehicles.length || 1)) + '%', icon: 'heart-pulse', meta: 'average score' })
    ].join('');

    const queue = [...inService, ...dueSoon, ...overdue]
        .filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i)
        .slice(0, 12);

    $('#maintTable').innerHTML = queue.length ? queue.map(v => {
        const daysSince = Math.round((Date.now() - v.lastService) / 86400000);
        const priority = v.status === 'maintenance' ? 'high'
            : v.healthScore < 86 || daysSince > 120 ? 'high'
            : v.healthScore < 90 ? 'medium' : 'low';
        const issue = v.status === 'maintenance' ? 'Currently in workshop'
            : v.healthScore < 86 ? 'Health score below threshold'
            : daysSince > 90 ? 'Scheduled service overdue'
            : 'Routine inspection due';

        return `
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
            <td>${esc(issue)}</td>
            <td><span class="badge ${priority === 'high' ? 'badge-danger' : priority === 'medium' ? 'badge-warning' : 'badge-muted'}">
                ${priority === 'high' ? 'High' : priority === 'medium' ? 'Medium' : 'Low'}
            </span></td>
            <td><span class="health ${healthClass(v.healthScore)}"><span class="health-dot"></span>${v.healthScore}%</span></td>
            <td>${fmt.num(v.odometer)} km</td>
            <td class="text-muted">${daysSince} days ago</td>
            <td>
                <div class="cell-actions">
                    <button class="btn btn-secondary btn-xs" data-service="${esc(v.id)}">
                        ${v.status === 'maintenance' ? 'Complete' : 'Schedule'}
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('') : `
        <tr><td colspan="7">
            <div class="empty" style="padding:50px">
                <div class="empty-icon"><i data-lucide="check-circle"></i></div>
                <h4>Nothing in the queue</h4>
                <p>Every vehicle is healthy and up to date on servicing.</p>
            </div>
        </td></tr>`;

    icons();
    bindTableActions();
}

$('#scheduleService')?.addEventListener('click', () => {
    toast('Select a vehicle from the service queue to schedule its slot', 'info');
});

/* ------------------------------------------------------------------ */
/* Drivers                                                             */
/* ------------------------------------------------------------------ */

function renderDrivers() {
    $('#driversGrid').innerHTML = DRIVERS.map(d => `
        <div class="driver-tile">
            <div class="driver-tile-head">
                <div class="avatar">${esc(fmt.initials(d.name))}</div>
                <div class="driver-tile-head-body">
                    <strong>${esc(d.name)}</strong>
                    <span>${esc(d.phone)}</span>
                </div>
                <span class="status status-${d.status === 'off_duty' ? 'offline' : d.status}">
                    <span class="status-dot"></span>
                    ${d.status === 'off_duty' ? 'Off duty' : fmt.statusLabel(d.status)}
                </span>
            </div>
            <div class="driver-stats">
                <div class="driver-stat">
                    <strong>${d.rating}</strong>
                    <span>Rating</span>
                </div>
                <div class="driver-stat">
                    <strong>${d.trips}</strong>
                    <span>Trips</span>
                </div>
                <div class="driver-stat">
                    <strong>${Math.round(d.trips * 0.94)}</strong>
                    <span>On time</span>
                </div>
            </div>
            <div class="flex gap-2 mt-5">
                <button class="btn btn-secondary btn-sm flex-1">Profile</button>
                <a href="tel:${esc(d.phone.replace(/\s/g, ''))}" class="btn btn-secondary btn-sm btn-icon" aria-label="Call">
                    <i data-lucide="phone"></i>
                </a>
            </div>
        </div>`).join('');

    icons();
}

$('#inviteDriver')?.addEventListener('click', () => {
    toast('Driver invitations are sent from Admin → Users', 'info');
});

/* ------------------------------------------------------------------ */
/* Utilisation                                                         */
/* ------------------------------------------------------------------ */

function renderUtilization() {
    const vehicles = Store.getVehicles();
    const sorted = [...vehicles].sort((a, b) => b.utilization - a.utilization);
    const avg = Math.round(vehicles.reduce((a, v) => a + v.utilization, 0) / (vehicles.length || 1));

    $('#utilStats').innerHTML = [
        statTile({ label: 'Average utilisation', value: avg + '%', icon: 'activity', delta: '+4.1%', deltaDir: 'up' }),
        statTile({ label: 'Best performer', value: (sorted[0]?.utilization || 0) + '%', icon: 'trophy', tone: 'blue', meta: sorted[0]?.name || '—' }),
        statTile({ label: 'Underused', value: vehicles.filter(v => v.utilization < 55).length, icon: 'trending-down', tone: 'warn', meta: 'below 55%' }),
        statTile({ label: 'Revenue per vehicle', value: fmt.money(Math.round(avg * 480)), icon: 'indian-rupee', tone: 'purple', meta: 'monthly average' })
    ].join('');

    const labels = monthLabels(12);
    lineChart('utilTrendChart', labels, [
        { label: 'Fleet utilisation', data: trend('util', 12, { base: 58, drift: 0.021, noise: 0.1 }) },
        { label: 'Target', data: labels.map(() => 75), color: SERIES[3], fill: false }
    ], { unit: '%' });

    $('#utilList').innerHTML = sorted.slice(0, 10).map(v => `
        <div class="flex items-center gap-4 mb-4">
            <img src="${esc(v.image)}" alt="" data-fallback="${esc(v.brand)}"
                 style="width:52px;height:38px;object-fit:cover;border-radius:7px;background:var(--card-light);flex-shrink:0">
            <div style="flex:1;min-width:0">
                <div class="flex justify-between gap-3 mb-2">
                    <strong style="font-size:.87rem;color:var(--text-primary)">${esc(v.name)}</strong>
                    <span style="font-size:.85rem;font-weight:600;color:var(--primary);font-variant-numeric:tabular-nums">${v.utilization}%</span>
                </div>
                <div class="bar bar-sm">
                    <div class="bar-fill ${v.utilization < 55 ? 'warn' : 'green'}" style="width:${v.utilization}%"></div>
                </div>
            </div>
            <span class="text-muted" style="font-size:.78rem;white-space:nowrap">${v.trips} trips</span>
        </div>`).join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

function renderReports() {
    const reports = [
        { icon: 'car',              title: 'Fleet inventory',     desc: 'Every vehicle with specs, status, health and location.', rows: Store.getVehicles().length },
        { icon: 'activity',         title: 'Utilisation report',  desc: 'Per-vehicle and per-location utilisation over time.', rows: Store.getVehicles().length },
        { icon: 'zap',              title: 'Charging summary',    desc: 'Sessions, energy delivered and cost by station.', rows: Store.getStations().length },
        { icon: 'wrench',           title: 'Maintenance log',     desc: 'Service history, health scores and open issues.', rows: 24 },
        { icon: 'calendar-check',   title: 'Booking export',      desc: 'All bookings with revenue, duration and status.', rows: Store.getBookings().length },
        { icon: 'indian-rupee',     title: 'Revenue breakdown',   desc: 'Income by vehicle, category and location.', rows: 12 }
    ];

    $('#reportsGrid').innerHTML = reports.map(r => `
        <div class="report-card">
            <div class="report-icon"><i data-lucide="${esc(r.icon)}"></i></div>
            <div style="flex:1">
                <h5 style="font-size:1rem;margin-bottom:6px">${esc(r.title)}</h5>
                <p style="font-size:.85rem;color:var(--text-secondary);line-height:1.65">${esc(r.desc)}</p>
            </div>
            <div class="flex items-center justify-between gap-3">
                <span class="text-muted" style="font-size:.78rem">${r.rows} rows</span>
                <button class="btn btn-secondary btn-sm" data-report="${esc(r.title)}">
                    <i data-lucide="download"></i> CSV
                </button>
            </div>
        </div>`).join('');

    icons();

    $$('[data-report]').forEach(btn => {
        btn.addEventListener('click', () => exportCsv(btn.dataset.report));
    });
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

function exportCsv(name = 'Fleet inventory') {
    const vehicles = Store.getVehicles();
    const headers = ['ID', 'Name', 'Brand', 'Plate', 'Status', 'Battery %', 'Range km',
                     'Location', 'Health %', 'Utilisation %', 'Odometer km', 'Trips', 'Price/day'];

    const rows = vehicles.map(v => [
        v.id, v.name, v.brand, v.plate, fmt.statusLabel(v.status),
        Math.round(v.battery), v.range, v.locationName, v.healthScore,
        v.utilization, Math.round(v.odometer), v.trips, v.price
    ]);

    // Quote every field so commas inside names can't break the columns.
    const csv = [headers, ...rows]
        .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evride-${name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    toast(`${name} exported (${rows.length} rows)`, 'success', 'Download ready');
}

$('#exportFleet')?.addEventListener('click', () => exportCsv('Fleet inventory'));
$('#exportVehicles')?.addEventListener('click', () => exportCsv('Fleet inventory'));

$('#addVehicle')?.addEventListener('click', () => {
    toast('Vehicle onboarding runs through Admin → Vehicles', 'info');
});

/* ------------------------------------------------------------------ */
/* Live updates                                                        */
/* ------------------------------------------------------------------ */

RT.on('vehicles', vehicles => {
    renderOps('fleetOps');
    renderOps('liveOps');

    // Patch table cells rather than re-render, so sorting/scroll survive.
    vehicles.forEach(v => {
        const cell = $(`.cell-battery[data-battery="${v.id}"]`);
        if (cell) {
            const fill = cell.querySelector('.bar-fill');
            const val = cell.querySelector('.battery-val');
            if (fill) {
                fill.style.width = Math.round(v.battery) + '%';
                const c = fmt.batteryClass(v.battery);
                fill.className = `bar-fill ${c === 'low' ? 'danger' : c === 'mid' ? 'warn' : 'green'}`;
            }
            if (val) val.textContent = Math.round(v.battery) + '%';
        }

        const range = $(`td[data-range="${v.id}"]`);
        if (range) range.textContent = v.range + ' km';

        const status = $(`td[data-status-slot="${v.id}"]`);
        if (status && status.dataset.last !== v.status) {
            status.dataset.last = v.status;
            status.innerHTML = statusBadge(v.status);
        }

        const updated = $(`[data-updated="${v.id}"]`);
        if (updated) updated.textContent = fmt.ago(v.updatedAt);
    });

    if (fleetMap) plotVehicles(fleetMap, vehicles);
    if (bigMap) updateBigMap();
});

RT.on('stations', () => {
    if (!$('[data-dash-section="charging"]').hidden) renderCharging();
});

// Charts inside hidden panels have no size; resize when their panel appears.
document.addEventListener('dash:section', e => {
    resizeAll();
    if (e.detail.id === 'live') initBigMap();
    if (e.detail.id === 'overview') initFleetMap();
    if (e.detail.id === 'utilization') renderUtilization();
    if (e.detail.id === 'charging') renderCharging();
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

function renderAll() {
    safeRender(
        () => renderOps('fleetOps'),
        () => renderOps('liveOps'),
        renderFleetStats,
        renderAlerts,
        renderFleetTable,
        renderAssignments,
        renderCharging,
        renderMaintenance,
        renderDrivers,
        renderReports
    );
}

renderAll();
// Charts and the Leaflet map also target section-specific containers.
safeRender(renderCharts, renderUtilization, initFleetMap);
