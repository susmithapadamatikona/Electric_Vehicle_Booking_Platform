/* ==========================================================================
   EVRide — driver.js
   Controller for driver-dashboard.html (EV owner / driver).
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { boot, fmt, $$, esc, icons, toast, confirmDialog } from './main.js';
import mountDash, { statTile, statusBadge, safeRender,
         dashEl as $ } from './dashboard.js';
import {
    SERIES, lineChart, barChart, doughnutChart, sparkline,
    trend, monthLabels, dayLabels, resizeAll
} from './charts.js';

boot();
mountDash({ role: 'driver', active: 'overview', searchPlaceholder: 'Search vehicles, bookings, payouts…' });

/* ------------------------------------------------------------------ */
/* Owner's own fleet                                                   */
/* ------------------------------------------------------------------ */

// In a real deployment this would be `GET /owners/me/vehicles`. Here we treat
// a deterministic slice of the fleet as belonging to the signed-in owner so
// the numbers stay stable between reloads.
function myVehicles() {
    return Store.getVehicles().filter((_, i) => i % 4 === 0 || i % 7 === 0).slice(0, 6);
}

const owner = {
    name: 'Arun Prakash',
    rating: 4.9,
    reviews: 218,
    acceptance: 96,
    responseMin: 4,
    joined: Date.now() - 480 * 86400000,
    online: true
};

// Only present on the overview page; the other sections are separate files.
$('#ownerGreeting') && ($('#ownerGreeting').textContent = `Welcome back, ${owner.name.split(' ')[0]}`);

/* ------------------------------------------------------------------ */
/* Earnings model                                                      */
/* ------------------------------------------------------------------ */

const PLATFORM_FEE = 0.18;

function earningsFor(vehicles) {
    return vehicles.map(v => {
        // Trips attributable to this owner in the current period.
        const trips = Math.round(v.trips * 0.14);
        const gross = trips * v.price * 1.4;
        const fee = Math.round(gross * PLATFORM_FEE);
        const charging = Math.round(trips * v.batteryCapacity * 0.55 * 16);
        return {
            vehicle: v,
            trips,
            gross: Math.round(gross),
            fee,
            charging,
            net: Math.round(gross) - fee - charging
        };
    });
}

function totals() {
    const rows = earningsFor(myVehicles());
    const net = rows.reduce((s, r) => s + r.net, 0);
    return {
        rows,
        net,
        gross: rows.reduce((s, r) => s + r.gross, 0),
        fees: rows.reduce((s, r) => s + r.fee, 0),
        charging: rows.reduce((s, r) => s + r.charging, 0),
        trips: rows.reduce((s, r) => s + r.trips, 0),
        today: Math.round(net * 0.021),
        week: Math.round(net * 0.14),
        month: Math.round(net * 0.42)
    };
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function renderEarningsHero() {
    const t = totals();

    $('#totalEarnings').textContent = fmt.money(t.net);

    $('#earningsSplit').innerHTML = `
        <div class="earnings-cell">
            <small>Today</small>
            <strong>${fmt.money(t.today)}</strong>
        </div>
        <div class="earnings-cell">
            <small>This week</small>
            <strong>${fmt.money(t.week)}</strong>
        </div>
        <div class="earnings-cell">
            <small>This month</small>
            <strong>${fmt.money(t.month)}</strong>
        </div>
        <div class="earnings-cell">
            <small>Pending payout</small>
            <strong class="text-green">${fmt.money(Math.round(t.week * 0.6))}</strong>
        </div>
        <div class="earnings-cell">
            <small>Completed trips</small>
            <strong>${t.trips}</strong>
        </div>`;
}

function renderOwnerStats() {
    const vehicles = myVehicles();
    const t = totals();
    const available = vehicles.filter(v => v.status === 'available').length;

    $('#ownerStats').innerHTML = [
        statTile({
            label: 'Listed vehicles', value: vehicles.length, icon: 'car',
            meta: `${available} available now`
        }),
        statTile({
            label: 'Acceptance rate', value: owner.acceptance + '%', icon: 'check-circle', tone: 'blue',
            delta: '+2%', deltaDir: 'up', meta: 'last 30 days'
        }),
        statTile({
            label: 'Avg response', value: owner.responseMin + ' min', icon: 'clock', tone: 'purple',
            meta: 'faster than 88% of owners'
        }),
        statTile({
            label: 'Avg utilisation',
            value: Math.round(vehicles.reduce((a, v) => a + v.utilization, 0) / (vehicles.length || 1)) + '%',
            icon: 'activity', tone: 'warn', delta: '+5.1%', deltaDir: 'up'
        })
    ].join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Booking requests                                                    */
/* ------------------------------------------------------------------ */

let requests = [];

function seedRequests() {
    const vehicles = myVehicles();
    const names = ['Priya Iyer', 'Vikram Desai', 'Sneha Kulkarni', 'Rahul Menon', 'Ananya Sharma'];

    requests = vehicles.slice(0, 4).map((v, i) => {
        const days = [1, 3, 2, 5][i % 4];
        const startsIn = [2, 18, 30, 54][i % 4];
        return {
            id: 'REQ-' + (2100 + i),
            vehicle: v,
            customer: names[i % names.length],
            rating: [4.9, 4.7, 5.0, 4.8][i % 4],
            trips: [24, 8, 61, 15][i % 4],
            days,
            startsIn,
            amount: Math.round(v.price * days * 1.18),
            pickup: v.locationName,
            status: 'pending'
        };
    });
}

function requestCard(r, compact = false) {
    return `
    <div class="${compact ? 'payout-row' : 'panel'}" data-req="${esc(r.id)}">
        ${compact ? `
            <div class="avatar avatar-sm">${esc(fmt.initials(r.customer))}</div>
            <div style="flex:1;min-width:0">
                <strong style="display:block;font-size:.87rem;color:var(--text-primary)">${esc(r.customer)}</strong>
                <span style="font-size:.76rem;color:var(--text-muted)">
                    ${esc(r.vehicle.name)} · ${fmt.plural(r.days, 'day')} · starts in ${r.startsIn}h
                </span>
            </div>
            <div style="text-align:right;flex-shrink:0">
                <strong style="display:block;font-family:var(--font-display);font-size:1rem;color:var(--primary)">
                    ${fmt.money(r.amount)}
                </strong>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-danger btn-xs" data-decline="${esc(r.id)}" aria-label="Decline">
                    <i data-lucide="x"></i>
                </button>
                <button class="btn btn-primary btn-xs" data-accept="${esc(r.id)}">Accept</button>
            </div>
        ` : `
            <div class="panel-head">
                <div class="flex items-center gap-3">
                    <div class="avatar avatar-sm">${esc(fmt.initials(r.customer))}</div>
                    <div>
                        <div class="panel-title" style="font-size:.93rem">${esc(r.customer)}</div>
                        <div class="panel-sub">
                            <i data-lucide="star" style="width:11px;height:11px;fill:currentColor;color:var(--warning)"></i>
                            ${r.rating} · ${r.trips} trips
                        </div>
                    </div>
                </div>
                <span class="badge badge-warning">${r.startsIn}h away</span>
            </div>
            <div class="panel-body">
                <div class="flex gap-3 mb-4">
                    <img src="${esc(r.vehicle.image)}" alt="" data-fallback="${esc(r.vehicle.brand)}"
                         style="width:80px;height:56px;object-fit:cover;border-radius:8px;background:var(--card-light)">
                    <div style="flex:1;min-width:0">
                        <strong style="display:block;font-size:.9rem;color:var(--text-primary)">${esc(r.vehicle.name)}</strong>
                        <span style="font-size:.77rem;color:var(--text-muted)">${esc(r.vehicle.plate)}</span>
                    </div>
                </div>
                <div class="meta-list">
                    <div class="meta-row"><span class="meta-k">Duration</span>
                        <span class="meta-v">${fmt.plural(r.days, 'day')}</span></div>
                    <div class="meta-row"><span class="meta-k">Pickup</span>
                        <span class="meta-v" style="max-width:150px">${esc(r.pickup)}</span></div>
                    <div class="meta-row"><span class="meta-k">You earn</span>
                        <span class="meta-v text-green">${fmt.money(Math.round(r.amount * (1 - 0.18)))}</span></div>
                </div>
            </div>
            <div class="panel-foot">
                <button class="btn btn-secondary btn-sm" data-decline="${esc(r.id)}">Decline</button>
                <button class="btn btn-primary btn-sm" data-accept="${esc(r.id)}">
                    <i data-lucide="check"></i> Accept
                </button>
            </div>
        `}
    </div>`;
}

function renderRequests() {
    const pending = requests.filter(r => r.status === 'pending');

    // #pendingCount and #requestsList live on the overview page, #requestsGrid
    // on driver-requests.html. Guard each so whichever page is open still
    // paints — an unguarded write here left the requests page blank.
    const count = $('#pendingCount');
    if (count) count.textContent = pending.length;

    const list = $('#requestsList');
    if (list) list.innerHTML = pending.length
        ? pending.map(r => requestCard(r, true)).join('')
        : `<div class="empty" style="padding:44px 20px">
               <div class="empty-icon"><i data-lucide="inbox"></i></div>
               <h4 style="font-size:1rem">No pending requests</h4>
               <p style="font-size:.85rem">New booking requests will appear here.</p>
           </div>`;

    const grid = $('#requestsGrid');
    if (grid) grid.innerHTML = pending.length
        ? pending.map(r => requestCard(r, false)).join('')
        : `<div class="empty" style="grid-column:1/-1;padding:60px 20px">
               <div class="empty-icon"><i data-lucide="inbox"></i></div>
               <h4>All caught up</h4>
               <p>You've responded to every request. Nice work.</p>
           </div>`;

    icons();
    bindRequestActions();
}

function bindRequestActions() {
    $$('[data-accept]').forEach(btn => {
        btn.addEventListener('click', () => {
            const r = requests.find(x => x.id === btn.dataset.accept);
            if (!r) return;
            r.status = 'accepted';
            RT.setVehicleStatus(r.vehicle.id, 'reserved');
            RT.notify('success', 'check-circle', 'Booking accepted',
                `${r.customer}'s request for ${r.vehicle.name} is confirmed.`);
            toast(`Accepted — you'll earn ${fmt.money(Math.round(r.amount * 0.82))}`, 'success');
            renderRequests();
            renderOwnerStats();
        });
    });

    $$('[data-decline]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const r = requests.find(x => x.id === btn.dataset.decline);
            if (!r) return;
            const ok = await confirmDialog({
                title: 'Decline this request?',
                message: 'Declining affects your acceptance rate, which influences how highly your vehicles rank in search.',
                confirmText: 'Decline', cancelText: 'Keep it', danger: true
            });
            if (!ok) return;
            r.status = 'declined';
            toast('Request declined', 'info');
            renderRequests();
        });
    });
}

/* ------------------------------------------------------------------ */
/* Rating panel                                                        */
/* ------------------------------------------------------------------ */

function renderRatingPanel() {
    const dist = [
        { star: 5, pct: 84 }, { star: 4, pct: 12 }, { star: 3, pct: 3 },
        { star: 2, pct: 1 },  { star: 1, pct: 0 }
    ];

    $('#ratingPanel').innerHTML = `
        <div style="text-align:center;margin-bottom:20px">
            <div style="font-family:var(--font-display);font-size:3rem;line-height:1;color:var(--text-primary);letter-spacing:-.05em">
                ${owner.rating}
            </div>
            <div class="stars" style="justify-content:center;margin:10px 0 6px">
                ${Array.from({ length: 5 }, (_, i) =>
                    `<i data-lucide="star" ${i < Math.round(owner.rating) ? 'style="fill:currentColor"' : 'class="star-empty"'}></i>`
                ).join('')}
            </div>
            <span class="text-muted" style="font-size:.82rem">${owner.reviews} reviews</span>
        </div>
        <div class="review-bars">
            ${dist.map(d => `
            <div class="review-bar-row">
                <span>${d.star} star${d.star === 1 ? '' : 's'}</span>
                <div class="bar bar-sm"><div class="bar-fill green" style="width:${d.pct}%"></div></div>
                <span>${d.pct}%</span>
            </div>`).join('')}
        </div>
        <div class="divider"></div>
        <div class="meta-list">
            <div class="meta-row"><span class="meta-k">Acceptance rate</span>
                <span class="meta-v text-green">${owner.acceptance}%</span></div>
            <div class="meta-row"><span class="meta-k">Avg response</span>
                <span class="meta-v">${owner.responseMin} min</span></div>
            <div class="meta-row"><span class="meta-k">Owner since</span>
                <span class="meta-v">${fmt.date(owner.joined)}</span></div>
        </div>`;

    icons();
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

function renderActivity() {
    const items = Store.getNotifications().slice(0, 6);
    const iconClass = t => ({ success: '', info: 'blue', warning: 'warn', error: 'danger' })[t] || '';

    $('#ownerActivity').innerHTML = items.map(n => `
        <div class="activity-item">
            <div class="activity-icon ${iconClass(n.type)}"><i data-lucide="${esc(n.icon || 'bell')}"></i></div>
            <div class="activity-body">
                <strong>${esc(n.title)}</strong>
                <p>${esc(n.msg)}</p>
                <div class="activity-time">${fmt.ago(n.time)}</div>
            </div>
        </div>`).join('') || '<div class="empty" style="padding:36px"><p>No recent activity</p></div>';

    icons();
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */

let earnRange = 30;

function renderEarningsChart() {
    const t = totals();

    let labels, data;
    if (earnRange === 7) {
        labels = dayLabels(7);
        data = trend('earn7', 7, { base: t.today * 0.9, drift: 0.02, noise: 0.28 });
    } else if (earnRange === 30) {
        labels = Array.from({ length: 30 }, (_, i) => `${i + 1}`);
        data = trend('earn30', 30, { base: t.today * 0.85, drift: 0.008, noise: 0.3 });
    } else {
        labels = monthLabels(12);
        data = trend('earn12', 12, { base: t.month * 0.6, drift: 0.035, noise: 0.14 });
    }

    lineChart('earningsChart', labels, [{ label: 'Net earnings', data }], { money: true });
}

$$('#earnRange button').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('#earnRange button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        earnRange = +btn.dataset.range;
        renderEarningsChart();
    });
});

function renderEarningsSection() {
    const t = totals();

    $('#earningsKpi').innerHTML = [
        { k: 'Gross revenue', v: fmt.money(t.gross), icon: 'indian-rupee', spark: trend('g', 12, { base: 40 }) },
        { k: 'Platform fees', v: fmt.money(t.fees), icon: 'percent', spark: trend('f', 12, { base: 8 }) },
        { k: 'Charging costs', v: fmt.money(t.charging), icon: 'zap', spark: trend('c', 12, { base: 12 }) },
        { k: 'Net earnings', v: fmt.money(t.net), icon: 'wallet', spark: trend('n', 12, { base: 30 }) }
    ].map((kpi, i) => `
        <div class="kpi">
            <div class="kpi-k"><i data-lucide="${esc(kpi.icon)}"></i> ${esc(kpi.k)}</div>
            <div class="kpi-v">${kpi.v}</div>
            <div class="kpi-foot">
                <span class="stat-delta up"><i data-lucide="trending-up"></i> ${[18, 4, 9, 22][i]}%</span>
                <span class="spark">${sparkline(kpi.spark, SERIES[i % SERIES.length])}</span>
            </div>
        </div>`).join('');

    // Revenue by vehicle — one measure, one series, no legend needed.
    barChart('vehicleRevChart',
        t.rows.map(r => r.vehicle.model),
        [{ label: 'Net earnings', data: t.rows.map(r => r.net) }],
        { money: true, horizontal: true }
    );

    // Where the money goes.
    doughnutChart('feeChart',
        ['Your earnings', 'Platform fee', 'Charging'],
        [t.net, t.fees, t.charging],
        { colors: [SERIES[0], SERIES[3], SERIES[2]] }
    );

    $('#earningsTable').innerHTML = t.rows.map(r => `
        <tr>
            <td>
                <div class="cell-media">
                    <img src="${esc(r.vehicle.image)}" alt="" data-fallback="${esc(r.vehicle.brand)}">
                    <div class="cell-media-text">
                        <strong>${esc(r.vehicle.name)}</strong>
                        <span>${esc(r.vehicle.plate)}</span>
                    </div>
                </div>
            </td>
            <td>${r.trips}</td>
            <td class="cell-strong">${fmt.money(r.gross)}</td>
            <td class="text-muted">− ${fmt.money(r.fee)}</td>
            <td class="text-muted">− ${fmt.money(r.charging)}</td>
            <td><strong class="text-green">${fmt.money(r.net)}</strong></td>
            <td>
                <div class="cell-battery">
                    <div class="bar bar-sm">
                        <div class="bar-fill ${r.vehicle.utilization < 55 ? 'warn' : 'green'}"
                             style="width:${r.vehicle.utilization}%"></div>
                    </div>
                    <span>${r.vehicle.utilization}%</span>
                </div>
            </td>
        </tr>`).join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Vehicles                                                            */
/* ------------------------------------------------------------------ */

function renderOwnerVehicles() {
    const vehicles = myVehicles();

    $('#ownerVehicles').innerHTML = vehicles.map(v => `
        <div class="panel" data-ov="${esc(v.id)}">
            <div style="position:relative;aspect-ratio:16/9;background:var(--card-light);overflow:hidden">
                <img src="${esc(v.image)}" alt="${esc(v.name)}" data-fallback="${esc(v.brand)}"
                     style="width:100%;height:100%;object-fit:cover">
                <span style="position:absolute;top:12px;left:12px" data-status-slot="${esc(v.id)}">
                    ${statusBadge(v.status)}
                </span>
            </div>
            <div class="panel-body">
                <h4 style="font-size:1.02rem;margin-bottom:4px">${esc(v.name)}</h4>
                <p class="text-muted" style="font-size:.79rem;margin-bottom:16px">
                    ${esc(v.plate)} · ${esc(v.locationName)}
                </p>

                <div class="v-battery mb-4" data-battery="${esc(v.id)}">
                    <div class="v-battery-head">
                        <span><i data-lucide="battery-charging"></i> Battery</span>
                        <span class="battery-val">${Math.round(v.battery)}%</span>
                    </div>
                    <div class="bar bar-sm">
                        <div class="bar-fill ${fmt.batteryClass(v.battery) === 'low' ? 'danger' : 'green'}"
                             style="width:${Math.round(v.battery)}%"></div>
                    </div>
                </div>

                <div class="meta-list">
                    <div class="meta-row"><span class="meta-k">Daily rate</span>
                        <span class="meta-v">${fmt.money(v.price)}</span></div>
                    <div class="meta-row"><span class="meta-k">Utilisation</span>
                        <span class="meta-v">${v.utilization}%</span></div>
                    <div class="meta-row"><span class="meta-k">Rating</span>
                        <span class="meta-v">${v.rating} ★ (${v.reviews})</span></div>
                    <div class="meta-row"><span class="meta-k">Health</span>
                        <span class="meta-v">${v.healthScore}%</span></div>
                </div>
            </div>
            <div class="panel-foot">
                <label class="switch">
                    <input type="checkbox" ${v.status !== 'maintenance' ? 'checked' : ''} data-listing="${esc(v.id)}">
                    <span style="font-size:.82rem">Listed</span>
                </label>
                <div class="flex gap-2">
                    <a href="ev-details.html?id=${esc(v.id)}" class="btn btn-secondary btn-xs">View</a>
                    <button class="btn btn-secondary btn-xs" data-edit-price="${esc(v.id)}">Pricing</button>
                </div>
            </div>
        </div>`).join('');

    icons();

    $$('[data-listing]').forEach(input => {
        input.addEventListener('change', e => {
            const v = Store.getVehicle(e.target.dataset.listing);
            if (!v) return;
            if (e.target.checked) {
                RT.setVehicleStatus(v.id, 'available');
                toast(`${v.name} is now listed and bookable`, 'success');
            } else {
                RT.setVehicleStatus(v.id, 'maintenance');
                toast(`${v.name} unlisted — it won't appear in search`, 'info');
            }
        });
    });

    $$('[data-edit-price]').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = Store.getVehicle(btn.dataset.editPrice);
            toast(`${v.name} is priced at ${fmt.money(v.price)}/day. Dynamic pricing is managed in Settings.`, 'info');
        });
    });
}

/* ------------------------------------------------------------------ */
/* Active trips                                                        */
/* ------------------------------------------------------------------ */

function renderActiveTrips() {
    const onTrip = myVehicles().filter(v => v.status === 'on_trip');

    if (!onTrip.length) {
        $('#activeTrips').innerHTML = `
        <div class="panel">
            <div class="empty" style="padding:70px 20px">
                <div class="empty-icon"><i data-lucide="navigation-off"></i></div>
                <h4>No active trips</h4>
                <p>When a customer collects one of your vehicles, you'll see its live position here.</p>
            </div>
        </div>`;
        icons();
        return;
    }

    $('#activeTrips').innerHTML = `<div class="dash-grid-2">${onTrip.map(v => `
        <div class="panel">
            <div class="panel-head">
                <div class="panel-title"><i data-lucide="navigation"></i> ${esc(v.name)}</div>
                <span class="live-tag">Live</span>
            </div>
            <div class="panel-body">
                <div class="track-stats" style="border:1px solid var(--border);border-radius:14px;overflow:hidden">
                    <div class="track-stat">
                        <div class="track-stat-k"><i data-lucide="battery-charging"></i> Battery</div>
                        <div class="track-stat-v" data-battery-v="${esc(v.id)}">${Math.round(v.battery)}<small>%</small></div>
                    </div>
                    <div class="track-stat">
                        <div class="track-stat-k"><i data-lucide="wind"></i> Speed</div>
                        <div class="track-stat-v" data-speed="${esc(v.id)}">${v.speed}<small>km/h</small></div>
                    </div>
                    <div class="track-stat">
                        <div class="track-stat-k"><i data-lucide="gauge"></i> Range</div>
                        <div class="track-stat-v" data-range="${esc(v.id)}">${v.range}<small>km</small></div>
                    </div>
                    <div class="track-stat">
                        <div class="track-stat-k"><i data-lucide="map-pin"></i> Area</div>
                        <div class="track-stat-v" style="font-size:1rem">${esc(v.area)}</div>
                    </div>
                </div>
            </div>
            <div class="panel-foot">
                <span class="text-muted" style="font-size:.8rem">${esc(v.plate)}</span>
                <a href="live-tracking.html" class="btn btn-secondary btn-sm">Track on map</a>
            </div>
        </div>`).join('')}</div>`;

    icons();
}

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

function renderAvailability() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    $('#availabilityPanel').innerHTML = days.map((d, i) => `
        <div class="setting-row">
            <div class="setting-row-body">
                <strong>${esc(d)}</strong>
                <span>${i >= 5 ? 'Weekend rates apply (+18%)' : 'Standard weekday rates'}</span>
            </div>
            <div class="flex gap-3 items-center flex-wrap">
                <input type="time" class="input" value="06:00" style="width:auto;padding:8px 12px;font-size:.84rem">
                <span class="text-muted">to</span>
                <input type="time" class="input" value="22:00" style="width:auto;padding:8px 12px;font-size:.84rem">
                <label class="switch"><input type="checkbox" ${i < 6 ? 'checked' : ''}></label>
            </div>
        </div>`).join('');
}

$('#applyAllDays')?.addEventListener('click', () => {
    const inputs = $$('#availabilityPanel input[type="time"]');
    if (inputs.length < 2) return;
    const from = inputs[0].value, to = inputs[1].value;
    inputs.forEach((input, i) => { input.value = i % 2 === 0 ? from : to; });
    toast(`Applied ${from}–${to} to every day`, 'success');
});

/* ------------------------------------------------------------------ */
/* Maintenance                                                         */
/* ------------------------------------------------------------------ */

function renderMaintenance() {
    const vehicles = myVehicles();

    $('#ownerMaintenance').innerHTML = `
    <div class="dash-grid-4 mb-6">
        ${statTile({ label: 'Vehicles healthy', value: vehicles.filter(v => v.healthScore >= 90).length, icon: 'heart-pulse', meta: `of ${vehicles.length} listed` })}
        ${statTile({ label: 'Service due', value: vehicles.filter(v => v.healthScore < 90).length, icon: 'wrench', tone: 'warn', meta: 'health below 90%' })}
        ${statTile({ label: 'In workshop', value: vehicles.filter(v => v.status === 'maintenance').length, icon: 'alert-triangle', tone: 'danger', meta: 'not earning' })}
        ${statTile({ label: 'Avg health', value: Math.round(vehicles.reduce((a, v) => a + v.healthScore, 0) / (vehicles.length || 1)) + '%', icon: 'activity', tone: 'blue' })}
    </div>

    <div class="panel">
        <div class="panel-head">
            <div class="panel-title"><i data-lucide="wrench"></i> Vehicle health</div>
        </div>
        <div class="panel-body">
            ${vehicles.map(v => {
                const days = Math.round((Date.now() - v.lastService) / 86400000);
                return `
                <div class="setting-row">
                    <div class="flex items-center gap-3" style="flex:1;min-width:0">
                        <img src="${esc(v.image)}" alt="" data-fallback="${esc(v.brand)}"
                             style="width:52px;height:38px;object-fit:cover;border-radius:7px;background:var(--card-light)">
                        <div class="setting-row-body">
                            <strong>${esc(v.name)}</strong>
                            <span>${esc(v.plate)} · ${fmt.num(v.odometer)} km · serviced ${days} days ago</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-4 flex-wrap">
                        <div class="cell-battery" style="min-width:110px">
                            <div class="bar bar-sm">
                                <div class="bar-fill ${v.healthScore >= 92 ? 'green' : v.healthScore >= 85 ? 'warn' : 'danger'}"
                                     style="width:${v.healthScore}%"></div>
                            </div>
                            <span>${v.healthScore}%</span>
                        </div>
                        <button class="btn btn-secondary btn-sm" data-book-service="${esc(v.id)}">Book service</button>
                    </div>
                </div>`;
            }).join('')}
        </div>
    </div>`;

    icons();

    $$('[data-book-service]').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = Store.getVehicle(btn.dataset.bookService);
            toast(`Service slot requested for ${v.name}. Our partner workshop will confirm within the hour.`, 'success');
        });
    });
}

/* ------------------------------------------------------------------ */
/* Payouts                                                             */
/* ------------------------------------------------------------------ */

function renderPayouts() {
    const t = totals();
    const payouts = Array.from({ length: 8 }, (_, i) => ({
        id: 'PO-' + (4820 - i * 3),
        date: Date.now() - (i * 7 + 2) * 86400000,
        amount: Math.round(t.week * (0.85 + (i % 3) * 0.12)),
        status: i === 0 ? 'pending' : 'paid',
        trips: 8 + (i % 5) * 3
    }));

    $('#payoutList').innerHTML = payouts.map(p => `
        <div class="payout-row">
            <span class="invoice-icon ${p.status === 'pending' ? '' : ''}">
                <i data-lucide="${p.status === 'pending' ? 'clock' : 'check'}"></i>
            </span>
            <div style="flex:1;min-width:0">
                <strong style="display:block;font-size:.88rem;color:var(--text-primary)">${esc(p.id)}</strong>
                <span style="font-size:.76rem;color:var(--text-muted)">
                    ${fmt.date(p.date)} · ${fmt.plural(p.trips, 'trip')}
                </span>
            </div>
            <div style="text-align:right">
                <strong style="display:block;font-family:var(--font-display);font-size:1rem;color:var(--text-primary)">
                    ${fmt.money(p.amount)}
                </strong>
                ${statusBadge(p.status)}
            </div>
        </div>`).join('');

    $('#bankPanel').innerHTML = `
        <div class="flex items-center gap-4 mb-5" style="padding:16px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,.02)">
            <span class="invoice-icon"><i data-lucide="landmark"></i></span>
            <div style="flex:1;min-width:0">
                <strong style="display:block;font-size:.9rem;color:var(--text-primary)">HDFC Bank •••• 7742</strong>
                <span style="font-size:.78rem;color:var(--text-muted)">Arun Prakash · Savings</span>
            </div>
            <span class="badge badge-green">Verified</span>
        </div>

        <div class="meta-list mb-5">
            <div class="meta-row"><span class="meta-k">Payout schedule</span>
                <span class="meta-v">Weekly, Mondays</span></div>
            <div class="meta-row"><span class="meta-k">Next payout</span>
                <span class="meta-v text-green">${fmt.date(Date.now() + 3 * 86400000)}</span></div>
            <div class="meta-row"><span class="meta-k">Pending amount</span>
                <span class="meta-v">${fmt.money(Math.round(totals().week * 0.6))}</span></div>
            <div class="meta-row"><span class="meta-k">Minimum payout</span>
                <span class="meta-v">${fmt.money(1000)}</span></div>
        </div>

        <button class="btn btn-secondary btn-block">Change bank account</button>`;

    icons();
}

$('#withdrawBtn')?.addEventListener('click', async () => {
    const amount = Math.round(totals().week * 0.6);
    const ok = await confirmDialog({
        title: 'Withdraw to your bank?',
        message: `${fmt.money(amount)} will be transferred to HDFC Bank •••• 7742. Funds usually arrive within 24 hours.`,
        confirmText: 'Withdraw'
    });
    if (!ok) return;
    RT.notify('success', 'banknote', 'Payout initiated',
        `${fmt.money(amount)} is on its way to HDFC Bank •••• 7742.`);
    toast(`${fmt.money(amount)} withdrawal initiated`, 'success');
});

/* ------------------------------------------------------------------ */
/* Ratings                                                             */
/* ------------------------------------------------------------------ */

function renderRatings() {
    const reviews = Store.getReviews().slice(0, 10);

    $('#ratingsSection').innerHTML = `
    <div class="dash-split">
        <div class="panel">
            <div class="panel-head">
                <div class="panel-title"><i data-lucide="message-square"></i> Recent reviews</div>
            </div>
            <div class="panel-body">
                ${reviews.length ? reviews.map(r => {
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
                    </article>`;
                }).join('') : '<div class="empty" style="padding:50px"><p>No reviews yet</p></div>'}
            </div>
        </div>
        <div class="panel">
            <div class="panel-head">
                <div class="panel-title"><i data-lucide="award"></i> Performance</div>
            </div>
            <div class="panel-body" id="perfPanel"></div>
        </div>
    </div>`;

    const metrics = [
        { k: 'Cleanliness', v: 4.9 },
        { k: 'Accuracy of listing', v: 4.8 },
        { k: 'Communication', v: 5.0 },
        { k: 'Battery on pickup', v: 4.7 },
        { k: 'Value for money', v: 4.6 }
    ];

    $('#perfPanel').innerHTML = metrics.map(m => `
        <div class="mb-4">
            <div class="flex justify-between mb-2" style="font-size:.84rem">
                <span class="text-secondary">${esc(m.k)}</span>
                <span style="color:var(--text-primary);font-weight:600">${m.v}</span>
            </div>
            <div class="bar bar-sm"><div class="bar-fill green" style="width:${m.v / 5 * 100}%"></div></div>
        </div>`).join('') + `
        <div class="divider"></div>
        <div class="card-glass" style="text-align:center">
            <div class="stat-icon" style="margin:0 auto 12px"><i data-lucide="award"></i></div>
            <strong style="display:block;color:var(--text-primary);margin-bottom:4px">Superhost status</strong>
            <span class="text-muted" style="font-size:.82rem">
                Maintained for 6 consecutive months
            </span>
        </div>`;

    icons();
}

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

function renderDocuments() {
    const docs = [
        { name: 'Registration certificates', status: 'verified', count: 6, expires: '—', icon: 'file-text' },
        { name: 'Insurance policies',        status: 'verified', count: 6, expires: '14 Aug 2026', icon: 'shield-check' },
        { name: 'Fitness certificates',      status: 'verified', count: 6, expires: '22 Nov 2026', icon: 'badge-check' },
        { name: 'PUC certificates',          status: 'pending',  count: 4, expires: '03 Apr 2026', icon: 'leaf' },
        { name: 'Owner KYC',                 status: 'verified', count: 1, expires: '—', icon: 'user-check' },
        { name: 'Bank verification',         status: 'verified', count: 1, expires: '—', icon: 'landmark' }
    ];

    $('#documentsGrid').innerHTML = docs.map(d => `
        <div class="panel">
            <div class="panel-body">
                <div class="flex items-center gap-4">
                    <span class="invoice-icon ${d.status === 'pending' ? '' : ''}"
                          style="${d.status === 'pending' ? 'background:rgba(245,158,11,.1);color:var(--warning)' : ''}">
                        <i data-lucide="${esc(d.icon)}"></i>
                    </span>
                    <div style="flex:1;min-width:0">
                        <strong style="display:block;font-size:.92rem;color:var(--text-primary)">${esc(d.name)}</strong>
                        <span style="font-size:.78rem;color:var(--text-muted)">
                            ${d.count} ${d.count === 1 ? 'document' : 'documents'}
                            ${d.expires !== '—' ? ` · expires ${esc(d.expires)}` : ''}
                        </span>
                    </div>
                    <span class="badge ${d.status === 'verified' ? 'badge-green' : 'badge-warning'}">
                        ${d.status === 'verified' ? 'Verified' : 'Pending'}
                    </span>
                </div>
            </div>
        </div>`).join('');

    icons();
}

$('#uploadDoc')?.addEventListener('click', () => {
    toast('Document upload opens in the EVRide mobile app for camera capture', 'info');
});

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function renderSettings() {
    $('#ownerSettings').innerHTML = `
    <div class="panel">
        <div class="panel-head"><div class="panel-title"><i data-lucide="indian-rupee"></i> Pricing</div></div>
        <div class="panel-body">
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Dynamic pricing</strong>
                    <span>Let EVRide adjust rates by demand, up to ±20%</span>
                </div>
                <label class="switch"><input type="checkbox" checked></label>
            </div>
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Weekend premium</strong>
                    <span>Automatically add 18% Friday to Sunday</span>
                </div>
                <label class="switch"><input type="checkbox" checked></label>
            </div>
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Long-rental discount</strong>
                    <span>Offer 12% off bookings of 7 days or more</span>
                </div>
                <label class="switch"><input type="checkbox" checked></label>
            </div>
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Instant booking</strong>
                    <span>Accept qualifying requests without manual approval</span>
                </div>
                <label class="switch"><input type="checkbox"></label>
            </div>
        </div>
    </div>

    <div class="panel">
        <div class="panel-head"><div class="panel-title"><i data-lucide="bell"></i> Notifications</div></div>
        <div class="panel-body">
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>New booking requests</strong>
                    <span>Push and SMS the moment a request arrives</span>
                </div>
                <label class="switch"><input type="checkbox" checked></label>
            </div>
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Trip milestones</strong>
                    <span>Pickup, return and any incident on your vehicles</span>
                </div>
                <label class="switch"><input type="checkbox" checked></label>
            </div>
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Low battery alerts</strong>
                    <span>When a listed vehicle drops below 20%</span>
                </div>
                <label class="switch"><input type="checkbox" checked></label>
            </div>
            <div class="setting-row">
                <div class="setting-row-body">
                    <strong>Payout confirmations</strong>
                    <span>Every transfer to your bank account</span>
                </div>
                <label class="switch"><input type="checkbox" checked></label>
            </div>
        </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Header actions                                                      */
/* ------------------------------------------------------------------ */

$('#toggleAvailability')?.addEventListener('click', () => {
    owner.online = !owner.online;
    const btn = $('#toggleAvailability');
    btn.innerHTML = owner.online
        ? '<i data-lucide="power"></i> Go offline'
        : '<i data-lucide="power"></i> Go online';
    btn.classList.toggle('btn-danger', !owner.online);
    btn.classList.toggle('btn-secondary', owner.online);
    icons();
    toast(owner.online
        ? 'You are online — your vehicles are accepting bookings'
        : 'You are offline — no new booking requests will come through', owner.online ? 'success' : 'warning');
});

['#addListing', '#addListing2'].forEach(sel => {
    $(sel)?.addEventListener('click', () => {
        toast('Vehicle listing requires registration, insurance and an inspection. Start in the mobile app.', 'info');
    });
});

$('#exportEarnings')?.addEventListener('click', () => {
    const t = totals();
    const headers = ['Vehicle', 'Plate', 'Trips', 'Gross', 'Platform fee', 'Charging', 'Net', 'Utilisation %'];
    const rows = t.rows.map(r => [
        r.vehicle.name, r.vehicle.plate, r.trips, r.gross, r.fee, r.charging, r.net, r.vehicle.utilization
    ]);
    const csv = [headers, ...rows]
        .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evride-earnings-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Earnings exported (${rows.length} vehicles)`, 'success');
});

/* ------------------------------------------------------------------ */
/* Live updates                                                        */
/* ------------------------------------------------------------------ */

RT.on('vehicles', vehicles => {
    vehicles.forEach(v => {
        const cell = $(`[data-battery="${v.id}"]`);
        if (cell) {
            const fill = cell.querySelector('.bar-fill');
            const val = cell.querySelector('.battery-val');
            if (fill) fill.style.width = Math.round(v.battery) + '%';
            if (val) val.textContent = Math.round(v.battery) + '%';
        }
        const bv = $(`[data-battery-v="${v.id}"]`);
        if (bv) bv.innerHTML = `${Math.round(v.battery)}<small>%</small>`;
        const sp = $(`[data-speed="${v.id}"]`);
        if (sp) sp.innerHTML = `${v.speed}<small>km/h</small>`;
        const rg = $(`[data-range="${v.id}"]`);
        if (rg) rg.innerHTML = `${v.range}<small>km</small>`;

        const slot = $(`[data-status-slot="${v.id}"]`);
        if (slot && slot.dataset.last !== v.status) {
            slot.dataset.last = v.status;
            slot.innerHTML = statusBadge(v.status);
        }
    });
});

RT.on('notification', renderActivity);

document.addEventListener('dash:section', e => {
    resizeAll();
    if (e.detail.id === 'earnings') renderEarningsSection();
    if (e.detail.id === 'trips') renderActiveTrips();
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

seedRequests();
safeRender(
    renderEarningsHero,
    renderOwnerStats,
    renderRequests,
    renderRatingPanel,
    renderActivity,
    renderEarningsChart,
    renderOwnerVehicles,
    renderActiveTrips,
    renderAvailability,
    renderMaintenance,
    renderEarningsSection,
    renderPayouts,
    renderRatings,
    renderDocuments,
    renderSettings
);
