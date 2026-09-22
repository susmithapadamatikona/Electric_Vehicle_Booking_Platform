/* ==========================================================================
   EVRide — customer.js
   Controller for customer-dashboard.html.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { boot, fmt, $$, esc, icons, toast, confirmDialog } from './main.js';
import mountDash, { statTile, statusBadge, safeRender,
         dashEl as $ } from './dashboard.js';
import { renderGrid, bindFavorites, bindLiveCards } from './vehicles.js';

boot();
mountDash({ role: 'customer', active: 'overview', searchPlaceholder: 'Search bookings, vehicles, invoices…' });
bindFavorites(document);
bindLiveCards(document);

/* ------------------------------------------------------------------ */
/* User                                                                */
/* ------------------------------------------------------------------ */

function currentUser() {
    let u = Store.getUser();
    if (!u) {
        // A demo profile so the dashboard is never empty for a first-time visitor.
        u = {
            id: 'u-001',
            name: 'Susmitha Padamati',
            email: 'susmitha@example.com',
            phone: '+91 98450 12345',
            city: 'Bengaluru',
            role: 'customer',
            joined: Date.now() - 214 * 86400000,
            tier: 'Gold'
        };
        Store.setUser(u);
    }
    return u;
}

const user = currentUser();

const hour = new Date().getHours();
const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
// Only present on the overview page; the other sections are separate files.
$('#greeting') && ($('#greeting').textContent = `${greet}, ${user.name.split(' ')[0]}`);

/* ------------------------------------------------------------------ */
/* Aggregates                                                          */
/* ------------------------------------------------------------------ */

function aggregates() {
    const bookings = Store.getBookings();
    const completed = bookings.filter(b => b.status === 'completed');
    const distance = completed.reduce((s, b) => s + (b.distance || 0), 0);
    const spend = bookings.filter(b => b.paymentStatus === 'paid').reduce((s, b) => s + b.amount, 0);
    const energy = completed.reduce((s, b) => s + (b.energyUsed || 0), 0);

    return {
        bookings,
        total: bookings.length,
        active: bookings.filter(b => b.status === 'active').length,
        upcoming: bookings.filter(b => b.status === 'upcoming').length,
        completed: completed.length,
        distance,
        spend,
        energy,
        // A petrol equivalent at 15 km/l and ₹105/l against ~₹1.9/km electric.
        savings: Math.round(distance / 15 * 105 - distance * 1.9),
        co2: Math.round(distance * 0.12),
        fuel: Math.round(distance / 15),
        trees: Math.max(1, Math.round(distance * 0.12 / 21)),
        chargeSessions: Store.getReservations().length + completed.length
    };
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function renderStats() {
    const a = aggregates();

    $('#statsGrid').innerHTML = [
        statTile({
            label: 'Total trips', value: a.completed, icon: 'route',
            delta: '+12%', deltaDir: 'up', meta: 'vs. last quarter'
        }),
        statTile({
            label: 'Distance driven', value: `${fmt.num(a.distance)} <small style="font-size:1rem;color:var(--text-muted)">km</small>`,
            icon: 'gauge', tone: 'blue', meta: `${fmt.plural(a.completed, 'completed trip')}`
        }),
        statTile({
            label: 'Money saved', value: fmt.money(a.savings), icon: 'piggy-bank', tone: 'purple',
            delta: 'vs. petrol', deltaDir: 'up', meta: 'fuel + servicing'
        }),
        statTile({
            label: 'Charging sessions', value: a.chargeSessions, icon: 'zap', tone: 'warn',
            meta: `${fmt.num(a.energy)} kWh total`
        })
    ].join('');

    $('#impactGrid').innerHTML = `
        <div class="stat" style="border:none;background:rgba(0,230,118,.05)">
            <div class="stat-top">
                <span class="stat-label">CO₂ avoided</span>
                <span class="stat-icon"><i data-lucide="cloud-off"></i></span>
            </div>
            <div class="stat-value">${fmt.num(a.co2)} <small style="font-size:1rem;color:var(--text-muted)">kg</small></div>
            <div class="stat-meta"><span>vs. equivalent petrol trips</span></div>
        </div>
        <div class="stat" style="border:none;background:rgba(0,200,255,.05)">
            <div class="stat-top">
                <span class="stat-label">Fuel avoided</span>
                <span class="stat-icon blue"><i data-lucide="fuel"></i></span>
            </div>
            <div class="stat-value">${fmt.num(a.fuel)} <small style="font-size:1rem;color:var(--text-muted)">L</small></div>
            <div class="stat-meta"><span>never pumped, never burned</span></div>
        </div>
        <div class="stat" style="border:none;background:rgba(139,92,246,.05)">
            <div class="stat-top">
                <span class="stat-label">Trees equivalent</span>
                <span class="stat-icon purple"><i data-lucide="trees"></i></span>
            </div>
            <div class="stat-value">${a.trees}</div>
            <div class="stat-meta"><span>annual carbon absorption</span></div>
        </div>`;

    icons();
}

function renderActiveBooking() {
    const active = Store.getBookings().find(b => b.status === 'active');
    const wrap = $('#activeBookingWrap');

    if (!active) { wrap.innerHTML = ''; return; }

    const v = Store.getVehicle(active.vehicleId);
    const trip = Store.getActiveTrip();

    wrap.innerHTML = `
    <div class="active-card mb-6">
        <div class="active-card-media">
            <img src="${esc(active.vehicleImage)}" alt="${esc(active.vehicleName)}" data-fallback="${esc(active.vehicleBrand)}">
        </div>
        <div class="active-card-body">
            <div class="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <span class="badge badge-green mb-2">
                        <span class="status-dot available" style="width:6px;height:6px"></span> Trip in progress
                    </span>
                    <h3 style="font-size:1.3rem;margin-bottom:4px">${esc(active.vehicleName)}</h3>
                    <p class="text-muted" style="font-size:.85rem">
                        ${esc(active.id)} · ${esc(active.plate)} · ${esc(active.pickupLocation)}
                    </p>
                </div>
                <div class="flex gap-2 flex-wrap">
                    <a href="live-tracking.html" class="btn btn-primary btn-sm">
                        <i data-lucide="navigation"></i> Track live
                    </a>
                    <a href="charging-stations.html" class="btn btn-secondary btn-sm">
                        <i data-lucide="zap"></i> Charge
                    </a>
                </div>
            </div>

            <div class="active-card-grid">
                <div>
                    <small class="text-muted" style="font-size:.72rem;text-transform:uppercase;letter-spacing:.09em">Battery</small>
                    <div style="font-family:var(--font-display);font-size:1.4rem;color:var(--text-primary);letter-spacing:-.03em"
                         data-ab="battery">${v ? Math.round(v.battery) : '—'}%</div>
                </div>
                <div>
                    <small class="text-muted" style="font-size:.72rem;text-transform:uppercase;letter-spacing:.09em">Range</small>
                    <div style="font-family:var(--font-display);font-size:1.4rem;color:var(--text-primary);letter-spacing:-.03em"
                         data-ab="range">${v ? v.range : '—'} km</div>
                </div>
                <div>
                    <small class="text-muted" style="font-size:.72rem;text-transform:uppercase;letter-spacing:.09em">ETA</small>
                    <div style="font-family:var(--font-display);font-size:1.4rem;color:var(--electric-blue);letter-spacing:-.03em"
                         data-ab="eta">${trip ? trip.etaMin : '—'} min</div>
                </div>
                <div>
                    <small class="text-muted" style="font-size:.72rem;text-transform:uppercase;letter-spacing:.09em">Returns</small>
                    <div style="font-family:var(--font-display);font-size:1.4rem;color:var(--text-primary);letter-spacing:-.03em">
                        ${fmt.dateShort(active.returnDate)}
                    </div>
                </div>
            </div>

            ${trip ? `
            <div>
                <div class="flex justify-between mb-2" style="font-size:.8rem">
                    <span class="text-muted">${esc(trip.origin.label)}</span>
                    <span class="text-muted">${esc(trip.destination.label)}</span>
                </div>
                <div class="bar">
                    <div class="bar-fill animated" data-ab="progress" style="width:${trip.progress}%"></div>
                </div>
            </div>` : ''}
        </div>
    </div>`;

    icons();
}

function renderUpcoming() {
    const upcoming = Store.getBookings()
        .filter(b => b.status === 'upcoming')
        .sort((a, b) => new Date(a.pickupDate) - new Date(b.pickupDate))
        .slice(0, 3);

    const wrap = $('#upcomingList');

    if (!upcoming.length) {
        wrap.innerHTML = `
        <div class="empty" style="padding:40px 20px">
            <div class="empty-icon"><i data-lucide="calendar-x"></i></div>
            <h4>No upcoming bookings</h4>
            <p>Book an EV and it will appear here with a countdown to pickup.</p>
            <a href="explore-evs.html" class="btn btn-primary btn-sm mt-4">Browse vehicles</a>
        </div>`;
        icons();
        return;
    }

    wrap.innerHTML = `<div class="flex flex-col gap-3">${upcoming.map(b => {
        const days = Math.ceil((new Date(b.pickupDate) - Date.now()) / 86400000);
        const when = days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
        return `
        <div class="bk-card">
            <img src="${esc(b.vehicleImage)}" alt="${esc(b.vehicleName)}" data-fallback="${esc(b.vehicleBrand)}">
            <div class="bk-card-body">
                <strong>${esc(b.vehicleName)}</strong>
                <div class="bk-card-meta">
                    <span><i data-lucide="hash"></i> ${esc(b.id)}</span>
                    <span><i data-lucide="map-pin"></i> ${esc(b.pickupLocation)}</span>
                    <span><i data-lucide="calendar"></i> ${fmt.date(b.pickupDate)}</span>
                </div>
            </div>
            <div class="bk-card-right">
                <span class="badge badge-blue">${esc(when)}</span>
                <span class="bk-card-amount">${fmt.money(b.amount)}</span>
            </div>
        </div>`;
    }).join('')}</div>`;

    icons();
}

function renderActivity() {
    const notifications = Store.getNotifications().slice(0, 6);
    const iconClass = t => ({ success: '', info: 'blue', warning: 'warn', error: 'danger' })[t] || '';

    $('#activityFeed').innerHTML = notifications.map(n => `
        <div class="activity-item">
            <div class="activity-icon ${iconClass(n.type)}"><i data-lucide="${esc(n.icon || 'bell')}"></i></div>
            <div class="activity-body">
                <strong>${esc(n.title)}</strong>
                <p>${esc(n.msg)}</p>
                <div class="activity-time">${fmt.ago(n.time)}</div>
            </div>
        </div>`).join('') || '<div class="empty" style="padding:36px 20px"><p>No recent activity</p></div>';

    icons();
}

/* ------------------------------------------------------------------ */
/* Bookings table                                                      */
/* ------------------------------------------------------------------ */

let bookingFilter = 'all';

function renderBookings() {
    const all = Store.getBookings();
    const list = bookingFilter === 'all' ? all : all.filter(b => b.status === bookingFilter);

    $('#bookingCount').textContent = list.length;

    if (!list.length) {
        $('#bookingsTable').innerHTML = `
        <tr><td colspan="8">
            <div class="empty" style="padding:50px 20px">
                <div class="empty-icon"><i data-lucide="calendar-x"></i></div>
                <h4>No ${bookingFilter === 'all' ? '' : bookingFilter} bookings</h4>
                <p>When you book an EV it will show up here.</p>
            </div>
        </td></tr>`;
        icons();
        return;
    }

    $('#bookingsTable').innerHTML = list.map(b => `
        <tr>
            <td><span class="table-id">${esc(b.id)}</span></td>
            <td>
                <div class="cell-media">
                    <img src="${esc(b.vehicleImage)}" alt="" data-fallback="${esc(b.vehicleBrand)}">
                    <div class="cell-media-text">
                        <strong>${esc(b.vehicleName)}</strong>
                        <span>${esc(b.plate || b.vehicleBrand)}</span>
                    </div>
                </div>
            </td>
            <td>${esc(b.pickupLocation)}</td>
            <td>
                <div class="cell-strong">${fmt.dateShort(b.pickupDate)}</div>
                <span class="text-muted" style="font-size:.76rem">to ${fmt.dateShort(b.returnDate)}</span>
            </td>
            <td>${fmt.plural(b.days, 'day')}</td>
            <td class="cell-strong">${fmt.money(b.amount)}</td>
            <td>${statusBadge(b.status)}</td>
            <td>
                <div class="cell-actions">
                    ${b.status === 'active' ? `
                    <a href="live-tracking.html" class="btn btn-secondary btn-xs" title="Track">
                        <i data-lucide="navigation"></i>
                    </a>` : ''}
                    ${b.status === 'completed' && !b.rated ? `
                    <a href="ev-details.html?id=${esc(b.vehicleId)}" class="btn btn-secondary btn-xs" title="Rate">
                        <i data-lucide="star"></i>
                    </a>` : ''}
                    <a href="invoices.html?booking=${esc(b.id)}" class="btn btn-secondary btn-xs" title="Invoice">
                        <i data-lucide="file-text"></i>
                    </a>
                    ${['upcoming', 'active'].includes(b.status) ? `
                    <button class="btn btn-danger btn-xs" data-cancel="${esc(b.id)}" title="Cancel">
                        <i data-lucide="x"></i>
                    </button>` : ''}
                </div>
            </td>
        </tr>`).join('');

    icons();

    $$('[data-cancel]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const b = Store.getBooking(btn.dataset.cancel);
            if (!b) return;

            const hoursToPickup = (new Date(b.pickupDate) - Date.now()) / 3600000;
            const refundPct = hoursToPickup > 24 ? 100 : hoursToPickup > 6 ? 75 : hoursToPickup > 0 ? 50 : 0;
            const refund = Math.round(b.amount * refundPct / 100);

            const ok = await confirmDialog({
                title: `Cancel booking ${b.id}?`,
                message: refundPct === 100
                    ? `You're more than 24 hours from pickup, so you'll receive a full refund of ${fmt.money(refund)}.`
                    : `You're ${Math.max(0, Math.round(hoursToPickup))} hours from pickup. Our policy refunds ${refundPct}% — ${fmt.money(refund)} back to your original payment method.`,
                confirmText: 'Cancel booking',
                cancelText: 'Keep it',
                danger: true
            });
            if (!ok) return;

            Store.cancelBooking(b.id);
            if (b.vehicleId) RT.setVehicleStatus(b.vehicleId, 'available');
            RT.notify('info', 'x-circle', 'Booking cancelled',
                `${b.id} cancelled. ${fmt.money(refund)} will be refunded within 5–7 working days.`);
            toast(`Booking cancelled — ${fmt.money(refund)} refunded`, 'success');
            renderAll();
        });
    });
}

$$('[data-bfilter]').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('[data-bfilter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        bookingFilter = btn.dataset.bfilter;
        renderBookings();
    });
});

/* ------------------------------------------------------------------ */
/* Favourites                                                          */
/* ------------------------------------------------------------------ */

function renderFavorites() {
    const favs = Store.getFavorites().map(id => Store.getVehicle(id)).filter(Boolean);

    if (!favs.length) {
        $('#favGrid').innerHTML = `
        <div class="empty" style="grid-column:1/-1;padding:60px 20px">
            <div class="empty-icon"><i data-lucide="heart-off"></i></div>
            <h4>No saved vehicles yet</h4>
            <p>Tap the heart on any vehicle to keep it here for later.</p>
            <a href="explore-evs.html" class="btn btn-primary mt-6">Browse the fleet</a>
        </div>`;
        icons();
        return;
    }

    renderGrid($('#favGrid'), favs);
}

/* ------------------------------------------------------------------ */
/* Reservations                                                        */
/* ------------------------------------------------------------------ */

function renderReservations() {
    const list = Store.getReservations();
    const wrap = $('#reservationGrid');

    if (!list.length) {
        wrap.innerHTML = `
        <div class="empty" style="grid-column:1/-1;padding:60px 20px">
            <div class="empty-icon"><i data-lucide="calendar-clock"></i></div>
            <h4>No charging reservations</h4>
            <p>Reserve a bay in advance and skip the queue at busy stations.</p>
            <a href="404.html" class="btn btn-primary mt-6">Reserve a slot</a>
        </div>`;
        icons();
        return;
    }

    wrap.innerHTML = list.map(r => `
        <div class="panel">
            <div class="panel-head">
                <div>
                    <div class="panel-title" style="font-size:.95rem">${esc(r.stationName)}</div>
                    <div class="panel-sub">${esc(r.id)}</div>
                </div>
                ${statusBadge(r.status === 'confirmed' ? 'active' : r.status)}
            </div>
            <div class="panel-body">
                <div class="meta-list">
                    <div class="meta-row"><span class="meta-k">Date</span>
                        <span class="meta-v">${fmt.date(r.date)}</span></div>
                    <div class="meta-row"><span class="meta-k">Time</span>
                        <span class="meta-v">${esc(r.time)} · ${fmt.duration(r.duration)}</span></div>
                    <div class="meta-row"><span class="meta-k">Vehicle</span>
                        <span class="meta-v" style="max-width:150px">${esc(r.vehicleName)}</span></div>
                    <div class="meta-row"><span class="meta-k">Estimated</span>
                        <span class="meta-v text-green">${fmt.money(r.estCost)}</span></div>
                </div>
            </div>
            <div class="panel-foot">
                <a href="charging-details.html?id=${esc(r.stationId)}" class="btn-link">Station details</a>
                ${r.status === 'confirmed'
                    ? `<button class="btn btn-danger btn-xs" data-cancel-res="${esc(r.id)}">Cancel</button>`
                    : ''}
            </div>
        </div>`).join('');

    icons();

    $$('[data-cancel-res]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await confirmDialog({
                title: 'Cancel reservation?',
                message: 'Your bay will be released and the ₹40 fee refunded.',
                confirmText: 'Cancel it', danger: true
            });
            if (!ok) return;
            Store.cancelReservation(btn.dataset.cancelRes);
            toast('Reservation cancelled', 'info');
            renderReservations();
        });
    });
}

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

function renderPayments() {
    const payments = Store.getPayments();
    const paid = payments.filter(p => p.status === 'paid');
    const total = paid.reduce((s, p) => s + p.amount, 0);
    const refunded = payments.filter(p => p.status === 'refunded').reduce((s, p) => s + p.amount, 0);

    $('#paymentStats').innerHTML = [
        statTile({ label: 'Total spent', value: fmt.money(total), icon: 'wallet', meta: `${fmt.plural(paid.length, 'transaction')}` }),
        statTile({ label: 'This month', value: fmt.money(Math.round(total * 0.24)), icon: 'calendar', tone: 'blue', delta: '+8%', deltaDir: 'up' }),
        statTile({ label: 'Refunded', value: fmt.money(refunded), icon: 'rotate-ccw', tone: 'warn', meta: 'processed in full' }),
        statTile({ label: 'EVRide credits', value: fmt.money(1240), icon: 'gift', tone: 'purple', meta: 'from referrals' })
    ].join('');

    $('#cardsList').innerHTML = `
        <div class="flex flex-col gap-3">
            ${[
                { brand: 'VISA', last: '4821', exp: '09/28', primary: true },
                { brand: 'MASTERCARD', last: '9037', exp: '03/27', primary: false }
            ].map(c => `
            <div class="flex items-center gap-4 p-4" style="padding:16px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,.02)">
                <span class="invoice-icon"><i data-lucide="credit-card"></i></span>
                <div style="flex:1;min-width:0">
                    <strong style="display:block;font-size:.9rem;color:var(--text-primary)">
                        ${esc(c.brand)} •••• ${esc(c.last)}
                    </strong>
                    <span style="font-size:.78rem;color:var(--text-muted)">Expires ${esc(c.exp)}</span>
                </div>
                ${c.primary ? '<span class="badge badge-green">Primary</span>' : ''}
                <button class="btn btn-secondary btn-xs" data-remove-card><i data-lucide="trash-2"></i></button>
            </div>`).join('')}
            <div class="flex items-center gap-4" style="padding:16px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,.02)">
                <span class="invoice-icon" style="background:rgba(139,92,246,.12);color:#B49BFF"><i data-lucide="smartphone"></i></span>
                <div style="flex:1;min-width:0">
                    <strong style="display:block;font-size:.9rem;color:var(--text-primary)">UPI — evride@okhdfc</strong>
                    <span style="font-size:.78rem;color:var(--text-muted)">Linked 14 Jan 2026</span>
                </div>
                <button class="btn btn-secondary btn-xs" data-remove-card><i data-lucide="trash-2"></i></button>
            </div>
        </div>`;

    $('#paymentsTable').innerHTML = payments.length ? payments.map(p => `
        <tr>
            <td><span class="table-id">${esc(p.id)}</span></td>
            <td>${fmt.date(p.date)}</td>
            <td><span class="table-id">${esc(p.bookingId)}</span></td>
            <td>${esc(p.method)}</td>
            <td class="cell-strong">${fmt.money(p.amount)}</td>
            <td>${statusBadge(p.status)}</td>
        </tr>`).join('')
        : `<tr><td colspan="6"><div class="empty" style="padding:50px"><p>No transactions yet</p></div></td></tr>`;

    icons();

    $$('[data-remove-card]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await confirmDialog({
                title: 'Remove payment method?',
                message: 'You can add it again at any time.',
                confirmText: 'Remove', danger: true
            });
            if (ok) toast('Payment method removed', 'info');
        });
    });
}

$('#addCardBtn')?.addEventListener('click', () => {
    toast('Add a card during your next checkout — we never store details outside a payment flow.', 'info');
});

/* ------------------------------------------------------------------ */
/* Notifications page                                                  */
/* ------------------------------------------------------------------ */

function renderNotificationsFull() {
    const items = Store.getNotifications();
    const iconClass = t => ({ success: '', info: 'blue', warning: 'warn', error: 'danger' })[t] || '';

    if (!items.length) {
        $('#notifFull').innerHTML = `
        <div class="empty" style="padding:60px 20px">
            <div class="empty-icon"><i data-lucide="bell-off"></i></div>
            <h4>No notifications</h4>
            <p>Booking updates, charging alerts and offers will appear here.</p>
        </div>`;
        icons();
        return;
    }

    $('#notifFull').innerHTML = items.map(n => `
        <div class="activity-item ${n.read ? '' : 'unread'}" style="${n.read ? '' : 'background:rgba(0,230,118,.03)'}">
            <div class="activity-icon ${iconClass(n.type)}"><i data-lucide="${esc(n.icon || 'bell')}"></i></div>
            <div class="activity-body">
                <strong>${esc(n.title)}</strong>
                <p>${esc(n.msg)}</p>
                <div class="activity-time">${fmt.ago(n.time)} · ${fmt.dateTime(n.time)}</div>
            </div>
            ${n.link ? `<a href="${esc(n.link)}" class="btn btn-secondary btn-xs" style="align-self:center">Open</a>` : ''}
        </div>`).join('');

    icons();
}

$('#markAllBtn')?.addEventListener('click', () => {
    Store.markAllNotificationsRead();
    renderNotificationsFull();
    toast('All marked as read', 'success');
});

$('#clearNotifsBtn')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
        title: 'Clear all notifications?',
        message: 'This removes your notification history. It cannot be undone.',
        confirmText: 'Clear all', danger: true
    });
    if (!ok) return;
    Store.clearNotifications();
    renderNotificationsFull();
    toast('Notifications cleared', 'info');
});

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

function renderProfile() {
    const a = aggregates();

    $('#profileHead').innerHTML = `
    <div class="profile-head">
        <div class="profile-avatar-wrap">
            <div class="avatar avatar-xl">${esc(fmt.initials(user.name))}</div>
            <button class="profile-avatar-edit" aria-label="Change photo"><i data-lucide="camera"></i></button>
        </div>
        <div style="flex:1;min-width:220px">
            <div class="flex items-center gap-3 flex-wrap mb-2">
                <h2 style="font-size:1.5rem">${esc(user.name)}</h2>
                <span class="badge badge-solid">${esc(user.tier || 'Member')}</span>
                <span class="badge badge-green"><i data-lucide="badge-check" style="width:11px;height:11px"></i> Verified</span>
            </div>
            <p class="text-muted" style="font-size:.88rem">
                ${esc(user.email)} · ${esc(user.phone)} · ${esc(user.city)}
            </p>
            <div class="profile-meta">
                <div class="profile-meta-item"><strong>${a.completed}</strong> Trips</div>
                <div class="profile-meta-item"><strong>${fmt.num(a.distance)}</strong> km driven</div>
                <div class="profile-meta-item"><strong>${a.co2}</strong> kg CO₂ saved</div>
                <div class="profile-meta-item"><strong>${fmt.date(user.joined)}</strong> Member since</div>
            </div>
        </div>
    </div>`;

    $('#pfName').value = user.name;
    $('#pfEmail').value = user.email;
    $('#pfPhone').value = user.phone;
    $('#pfCity').value = user.city;

    icons();
}

$('#profileForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const updated = {
        ...user,
        name: $('#pfName').value.trim(),
        email: $('#pfEmail').value.trim(),
        phone: $('#pfPhone').value.trim(),
        city: $('#pfCity').value.trim()
    };

    if (!updated.name) { toast('Name cannot be empty', 'error'); return; }
    if (!updated.email.includes('@')) { toast('Enter a valid email address', 'error'); return; }

    Store.setUser(updated);
    Object.assign(user, updated);
    renderProfile();
    toast('Profile updated', 'success');
});

$('#uploadSelfie')?.addEventListener('click', () => {
    toast('Selfie verification is available in the EVRide mobile app', 'info');
});

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function renderSettings() {
    const prefs = Store.getPrefs();

    const row = (key, title, desc, checked) => `
        <div class="setting-row">
            <div class="setting-row-body">
                <strong>${esc(title)}</strong>
                <span>${esc(desc)}</span>
            </div>
            <label class="switch">
                <input type="checkbox" data-pref="${esc(key)}" ${checked ? 'checked' : ''}>
            </label>
        </div>`;

    $('#notifSettings').innerHTML =
        row('notifications', 'Push notifications', 'Booking, trip and charging alerts in-app', prefs.notifications) +
        row('emailAlerts', 'Email alerts', 'Confirmations, invoices and receipts', prefs.emailAlerts) +
        row('liveUpdates', 'Live telemetry updates', 'Real-time battery and location on your vehicles', prefs.liveUpdates) +
        `<div class="setting-row">
            <div class="setting-row-body">
                <strong>Marketing &amp; offers</strong>
                <span>Occasional deals — never more than twice a month</span>
            </div>
            <label class="switch"><input type="checkbox"></label>
        </div>`;

    $('#prefSettings').innerHTML = `
        <div class="setting-row">
            <div class="setting-row-body">
                <strong>Currency</strong>
                <span>Used across pricing and invoices</span>
            </div>
            <select class="select" style="width:auto;min-width:110px" data-pref-select="currency">
                <option value="INR" ${prefs.currency === 'INR' ? 'selected' : ''}>₹ INR</option>
                <option value="USD" ${prefs.currency === 'USD' ? 'selected' : ''}>$ USD</option>
                <option value="EUR" ${prefs.currency === 'EUR' ? 'selected' : ''}>€ EUR</option>
            </select>
        </div>
        <div class="setting-row">
            <div class="setting-row-body">
                <strong>Units</strong>
                <span>Distance and range display</span>
            </div>
            <select class="select" style="width:auto;min-width:130px" data-pref-select="units">
                <option value="metric" ${prefs.units === 'metric' ? 'selected' : ''}>Kilometres</option>
                <option value="imperial" ${prefs.units === 'imperial' ? 'selected' : ''}>Miles</option>
            </select>
        </div>
        ${row('reducedMotion', 'Reduce motion', 'Minimise animations across the platform', prefs.reducedMotion)}`;

    $$('[data-pref]').forEach(input => {
        input.addEventListener('change', e => {
            Store.setPref(e.target.dataset.pref, e.target.checked);
            toast('Preference saved', 'success', null, 2200);
        });
    });

    $$('[data-pref-select]').forEach(sel => {
        sel.addEventListener('change', e => {
            Store.setPref(e.target.dataset.prefSelect, e.target.value);
            toast('Preference saved', 'success', null, 2200);
        });
    });
}

$('#resetDataBtn')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
        title: 'Reset demo data?',
        message: 'The fleet, charging stations and bookings will be regenerated. Your profile and preferences are kept.',
        confirmText: 'Reset data'
    });
    if (!ok) return;
    Store.resetSimulation();
    toast('Regenerating simulation…', 'info');
    setTimeout(() => location.reload(), 900);
});

$('#deleteAccountBtn')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
        title: 'Delete your account?',
        message: 'All bookings, invoices and saved data will be removed within 30 days. This cannot be undone.',
        confirmText: 'Delete account', danger: true
    });
    if (!ok) return;
    Store.resetAll();
    toast('Account deleted. Redirecting…', 'info');
    setTimeout(() => location.href = 'index.html', 1400);
});

/* ------------------------------------------------------------------ */
/* Live updates                                                        */
/* ------------------------------------------------------------------ */

RT.on('vehicles', () => {
    const active = Store.getBookings().find(b => b.status === 'active');
    if (!active) return;
    const v = Store.getVehicle(active.vehicleId);
    if (!v) return;

    const set = (key, value) => {
        const node = $(`[data-ab="${key}"]`);
        if (node && node.textContent !== value) {
            node.textContent = value;
            node.classList.add('value-flash');
            setTimeout(() => node.classList.remove('value-flash'), 800);
        }
    };
    set('battery', `${Math.round(v.battery)}%`);
    set('range', `${v.range} km`);
});

RT.on('trip', t => {
    const eta = $('[data-ab="eta"]');
    if (eta) eta.textContent = `${t.etaMin} min`;
    const bar = $('[data-ab="progress"]');
    if (bar) bar.style.width = t.progress + '%';
});

RT.on('notification', () => {
    renderActivity();
    if (!$('[data-dash-section="notifications"]').hidden) renderNotificationsFull();
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

function renderAll() {
    safeRender(
        renderStats,
        renderActiveBooking,
        renderUpcoming,
        renderActivity,
        renderBookings,
        renderFavorites,
        renderReservations,
        renderPayments,
        renderNotificationsFull,
        renderProfile,
        renderSettings
    );
}

renderAll();

// Favourites can change from any card on the page.
Store.subscribe(Store.KEYS.favorites, renderFavorites);
