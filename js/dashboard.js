/* ==========================================================================
   EVRide — dashboard.js
   Shared dashboard shell: sidebar, topbar, mobile drawer and bottom nav.
   Every dashboard page calls mountDash() with its own nav config.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { $, $$, el, esc, fmt, icons, toast, throttle } from './main.js';

/* ------------------------------------------------------------------ */
/* Nav definitions per role                                            */
/* ------------------------------------------------------------------ */

export const NAVS = {
    customer: {
        title: 'My Account',
        home: 'customer-dashboard.html',
        groups: [
            {
                items: [
                    { id: 'overview',  label: 'Dashboard',    icon: 'layout-dashboard', href: 'customer-dashboard.html#overview' },
                    { id: 'bookings',  label: 'My Bookings',  icon: 'calendar-check',   href: 'customer-bookings.html', badge: 'bookings' },
                    { id: 'favorites', label: 'Favourites',   icon: 'heart',            href: 'customer-dashboard.html#favorites', badge: 'favorites' }
                ]
            },
            {
                title: 'Charging',
                items: [
                    { id: 'stations',  label: 'Find Stations',icon: 'map-pin',          href: 'charging-stations.html' },
                    { id: 'reserved',  label: 'Reservations', icon: 'calendar-clock',   href: 'customer-dashboard.html#reservations' }
                ]
            },
            {
                title: 'Billing',
                items: [
                    { id: 'payments',  label: 'Payments',     icon: 'credit-card',      href: 'customer-payments.html' },
                    { id: 'invoices',  label: 'Invoices',     icon: 'file-text',        href: 'invoices.html' }
                ]
            },
            {
                title: 'Account',
                items: [
                    { id: 'notifications', label: 'Notifications', icon: 'bell',        href: 'customer-dashboard.html#notifications', badge: 'unread' },
                    { id: 'profile',   label: 'Profile',      icon: 'user',             href: 'customer-profile.html' },
                    { id: 'settings',  label: 'Settings',     icon: 'settings',         href: 'customer-dashboard.html#settings' },
                    { id: 'support',   label: 'Support',      icon: 'life-buoy',        href: 'support.html' }
                ]
            }
        ]
    },

    driver: {
        title: 'Driver / Owner',
        home: 'driver-dashboard.html',
        groups: [
            {
                items: [
                    { id: 'overview',  label: 'Dashboard',     icon: 'layout-dashboard', href: 'driver-dashboard.html#overview' },
                    { id: 'requests',  label: 'Booking Requests', icon: 'inbox',         href: 'driver-requests.html', badge: 'requests' },
                    { id: 'trips',     label: 'Active Trips',  icon: 'navigation',       href: 'driver-trips.html' }
                ]
            },
            {
                title: 'My Fleet',
                items: [
                    { id: 'vehicles',  label: 'My Vehicles',   icon: 'car',              href: 'driver-dashboard.html#vehicles' },
                    { id: 'availability', label: 'Availability', icon: 'calendar-range', href: 'driver-dashboard.html#availability' },
                    { id: 'maintenance', label: 'Maintenance', icon: 'wrench',           href: 'driver-dashboard.html#maintenance' }
                ]
            },
            {
                title: 'Business',
                items: [
                    { id: 'earnings',  label: 'Earnings',      icon: 'indian-rupee',     href: 'driver-earnings.html' },
                    { id: 'payouts',   label: 'Payouts',       icon: 'banknote',         href: 'driver-dashboard.html#payouts' },
                    { id: 'ratings',   label: 'Ratings',       icon: 'star',             href: 'driver-dashboard.html#ratings' },
                    { id: 'documents', label: 'Documents',     icon: 'file-check',       href: 'driver-dashboard.html#documents' }
                ]
            },
            {
                title: 'Account',
                items: [
                    { id: 'settings',  label: 'Settings',      icon: 'settings',         href: 'driver-dashboard.html#settings' },
                    { id: 'support',   label: 'Support',       icon: 'life-buoy',        href: 'support.html' }
                ]
            }
        ]
    },

    fleet: {
        title: 'Fleet Manager',
        home: 'fleet-dashboard.html',
        groups: [
            {
                items: [
                    { id: 'overview',  label: 'Fleet Overview', icon: 'layout-dashboard', href: 'fleet-dashboard.html#overview' },
                    { id: 'live',      label: 'Live Map',       icon: 'radar',            href: 'fleet-dashboard.html#live' },
                    { id: 'vehicles',  label: 'Vehicles',       icon: 'car',              href: 'fleet-vehicles.html', badge: 'vehicles' }
                ]
            },
            {
                title: 'Operations',
                items: [
                    { id: 'assignments', label: 'Assignments',  icon: 'clipboard-list',   href: 'fleet-assignments.html' },
                    { id: 'charging',  label: 'Charging',       icon: 'zap',              href: 'fleet-dashboard.html#charging' },
                    { id: 'maintenance', label: 'Maintenance',  icon: 'wrench',           href: 'fleet-maintenance.html', badge: 'alerts' },
                    { id: 'drivers',   label: 'Drivers',        icon: 'users',            href: 'fleet-dashboard.html#drivers' }
                ]
            },
            {
                title: 'Insights',
                items: [
                    { id: 'utilization', label: 'Utilisation',  icon: 'activity',         href: 'fleet-dashboard.html#utilization' },
                    { id: 'analytics', label: 'Analytics',      icon: 'bar-chart-3',      href: 'analytics.html' },
                    { id: 'reports',   label: 'Reports',        icon: 'file-text',        href: 'fleet-dashboard.html#reports' }
                ]
            }
        ]
    },

    admin: {
        title: 'Admin Console',
        home: 'admin-dashboard.html',
        groups: [
            {
                items: [
                    { id: 'overview',  label: 'Dashboard',      icon: 'layout-dashboard', href: 'admin-dashboard.html#overview' },
                    { id: 'monitor',   label: 'Live Operations',icon: 'radar',            href: 'admin-dashboard.html#monitor' }
                ]
            },
            {
                title: 'Manage',
                items: [
                    { id: 'users',     label: 'Users',          icon: 'users',            href: 'admin-users.html' },
                    { id: 'vehicles',  label: 'Vehicles',       icon: 'car',              href: 'admin-vehicles.html' },
                    { id: 'bookings',  label: 'Bookings',       icon: 'calendar-check',   href: 'admin-bookings.html' },
                    { id: 'drivers',   label: 'Drivers',        icon: 'steering-wheel',   href: 'admin-dashboard.html#drivers' },
                    { id: 'stations',  label: 'Charging',       icon: 'zap',              href: 'admin-dashboard.html#stations' }
                ]
            },
            {
                title: 'Finance',
                items: [
                    { id: 'payments',  label: 'Payments',       icon: 'credit-card',      href: 'admin-dashboard.html#payments' },
                    { id: 'revenue',   label: 'Revenue',        icon: 'trending-up',      href: 'admin-revenue.html' },
                    { id: 'promotions',label: 'Promotions',     icon: 'gift',             href: 'admin-dashboard.html#promotions' }
                ]
            },
            {
                title: 'Insights',
                items: [
                    { id: 'analytics', label: 'Analytics',      icon: 'bar-chart-3',      href: 'analytics.html' },
                    { id: 'reviews',   label: 'Reviews',        icon: 'star',             href: 'admin-dashboard.html#reviews' },
                    { id: 'support',   label: 'Support Tickets',icon: 'life-buoy',        href: 'admin-dashboard.html#support', badge: 'tickets' },
                    { id: 'settings',  label: 'Settings',       icon: 'settings',         href: 'admin-dashboard.html#settings' }
                ]
            }
        ]
    }
};

/* ------------------------------------------------------------------ */
/* Badge resolution                                                    */
/* ------------------------------------------------------------------ */

function badgeValue(key) {
    switch (key) {
        case 'bookings':  return Store.getBookings().filter(b => ['upcoming', 'active'].includes(b.status)).length;
        case 'favorites': return Store.getFavorites().length;
        case 'unread':    return Store.unreadCount();
        case 'vehicles':  return Store.getVehicles().length;
        case 'alerts':    return Store.getVehicles().filter(v => v.status === 'maintenance' || v.battery < 20).length;
        case 'requests':  return 3;
        case 'tickets':   return Store.getTickets().filter(t => t.status !== 'closed').length || 4;
        default:          return 0;
    }
}

/* ------------------------------------------------------------------ */
/* Markup                                                             */
/* ------------------------------------------------------------------ */

function sidebarHTML(nav, activeId) {
    const user = Store.getUser() || { name: 'Guest User', email: 'guest@evride.in', role: 'customer' };

    return `
    <aside class="sidebar" id="sidebar" aria-label="Dashboard navigation">
        <div class="side-head">
            <a href="index.html" class="logo">
                <!-- Square mark shows on its own when the rail is collapsed;
                     the full wordmark is a .side-label so it hides with it. -->
                <img src="assets/images/stackly-mark.webp" alt=""
                     class="logo-mark-img" width="128" height="128">
                <span class="logo-text side-label">
                    <img src="assets/images/stackly-whitish_blue-logo.webp" alt="Stackly"
                         class="logo-img" width="320" height="132">
                    <span class="logo-tag">${esc(nav.title)}</span>
                </span>
            </a>
            <button class="side-toggle" id="sideToggle" aria-label="Collapse sidebar">
                <i data-lucide="panel-left-close"></i>
            </button>
        </div>

        <nav class="side-body">
            ${nav.groups.map(group => `
                ${group.title ? `<div class="side-group-title">${esc(group.title)}</div>` : ''}
                ${group.items.map(item => {
                    const n = item.badge ? badgeValue(item.badge) : 0;
                    return `
                    <a href="${esc(item.href)}" class="side-link ${item.id === activeId ? 'active' : ''}"
                       data-side="${esc(item.id)}" ${item.href.includes('#') ? 'data-section' : ''}>
                        <i data-lucide="${esc(item.icon)}"></i>
                        <span class="side-label">${esc(item.label)}</span>
                        ${n ? `<span class="side-badge ${item.badge === 'alerts' ? 'danger' : ''}"
                                     data-badge="${esc(item.badge)}">${n}</span>` : ''}
                    </a>`;
                }).join('')}
            `).join('')}
        </nav>

        <div class="side-foot">
            <a href="#profile" class="side-user" data-section>
                <span class="avatar avatar-sm">${esc(fmt.initials(user.name))}</span>
                <span class="side-foot-text">
                    <strong>${esc(user.name)}</strong>
                    <span>${esc(user.email)}</span>
                </span>
                <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text-muted);flex-shrink:0"></i>
            </a>
        </div>
    </aside>`;
}

function topbarHTML(opts) {
    const unread = Store.unreadCount();
    return `
    <header class="dash-topbar">
        <button class="dash-burger" id="dashBurger" aria-label="Open navigation">
            <i data-lucide="menu"></i>
        </button>

        <div class="dash-search">
            <i data-lucide="search"></i>
            <input type="search" id="dashSearch" placeholder="${esc(opts.searchPlaceholder || 'Search…')}"
                   aria-label="Search">
        </div>

        <div class="dash-topbar-actions">
            <span class="live-tag" style="margin-right:6px">Live</span>

            <a href="index.html" class="icon-btn" aria-label="Back to site" title="Back to site">
                <i data-lucide="home"></i>
            </a>

            <div class="relative">
                <button class="icon-btn" id="dashNotifBtn" aria-label="Notifications" aria-expanded="false">
                    <i data-lucide="bell"></i>
                    <span class="icon-badge" id="dashNotifBadge" ${unread ? '' : 'hidden'}>${unread}</span>
                </button>
                <div class="nav-panel" id="dashNotifPanel" role="dialog" aria-label="Notifications">
                    <div class="nav-panel-head">
                        <h5>Notifications</h5>
                        <button class="btn-link" style="font-size:.78rem" id="dashMarkRead">Mark all read</button>
                    </div>
                    <div class="nav-panel-body" id="dashNotifList"></div>
                </div>
            </div>

            <a href="404.html" class="btn btn-primary btn-sm">
                <i data-lucide="zap"></i> <span class="side-label">Book an EV</span>
            </a>

            <button class="btn btn-secondary btn-sm" id="dashLogout" title="Log out">
                <i data-lucide="log-out"></i> <span class="side-label">Log out</span>
            </button>
        </div>
    </header>`;
}

function bottomNavHTML(nav) {
    const items = nav.groups[0].items.slice(0, 2)
        .concat(nav.groups[1] ? nav.groups[1].items.slice(0, 2) : []);

    return `
    <nav class="bottom-nav" aria-label="Quick navigation">
        ${items.slice(0, 2).map(i => `
        <a href="${esc(i.href)}" class="bottom-nav-item" data-side="${esc(i.id)}" ${i.href.includes('#') ? 'data-section' : ''}>
            <i data-lucide="${esc(i.icon)}"></i>
            <span>${esc(i.label.split(' ')[0])}</span>
        </a>`).join('')}

        <a href="explore-evs.html" class="bottom-nav-item primary">
            <span class="bn-icon"><i data-lucide="zap"></i></span>
        </a>

        ${items.slice(2, 4).map(i => `
        <a href="${esc(i.href)}" class="bottom-nav-item" data-side="${esc(i.id)}" ${i.href.includes('#') ? 'data-section' : ''}>
            <i data-lucide="${esc(i.icon)}"></i>
            <span>${esc(i.label.split(' ')[0])}</span>
        </a>`).join('')}
    </nav>`;
}

/* ------------------------------------------------------------------ */
/* Notifications panel                                                 */
/* ------------------------------------------------------------------ */

function renderDashNotifs() {
    const list = $('#dashNotifList');
    if (!list) return;
    const items = Store.getNotifications().slice(0, 10);

    if (!items.length) {
        list.innerHTML = `<div class="empty" style="padding:36px 20px"><p>No notifications</p></div>`;
        return;
    }

    const iconClass = t => ({ success: '', info: 'blue', warning: 'warn', error: 'danger' })[t] || '';

    list.innerHTML = items.map(n => `
        <div class="notif ${n.read ? '' : 'unread'}" data-dnotif="${esc(n.id)}">
            <div class="notif-icon ${iconClass(n.type)}"><i data-lucide="${esc(n.icon || 'bell')}"></i></div>
            <div class="notif-body">
                <div class="notif-title">${esc(n.title)}</div>
                <div class="notif-msg">${esc(n.msg)}</div>
                <div class="notif-time">${fmt.ago(n.time)}</div>
            </div>
        </div>`).join('');

    icons();

    $$('[data-dnotif]', list).forEach(node => {
        node.addEventListener('click', () => {
            Store.markNotificationRead(node.dataset.dnotif);
            node.classList.remove('unread');
            updateDashBadge();
        });
    });
}

function updateDashBadge() {
    const badge = $('#dashNotifBadge');
    if (!badge) return;
    const n = Store.unreadCount();
    badge.textContent = n > 9 ? '9+' : n;
    badge.hidden = n === 0;
}

/* ------------------------------------------------------------------ */
/* Section routing (hash-based, single page per role)                  */
/* ------------------------------------------------------------------ */

function showSection(id) {
    const panels = $$('[data-dash-section]');
    if (!panels.length) return;

    let matched = false;
    panels.forEach(p => {
        const on = p.dataset.dashSection === id;
        p.hidden = !on;
        if (on) matched = true;
    });

    // Unknown hash → fall back to the first section.
    if (!matched && panels[0]) {
        panels[0].hidden = false;
        id = panels[0].dataset.dashSection;
    }

    $$('[data-side]').forEach(link => {
        link.classList.toggle('active', link.dataset.side === id);
    });

    // Let the page react (charts need a resize after becoming visible).
    document.dispatchEvent(new CustomEvent('dash:section', { detail: { id } }));
}

function initRouting() {
    const applyHash = () => {
        const id = location.hash.replace('#', '') || $$('[data-dash-section]')[0]?.dataset.dashSection;
        if (id) showSection(id);
    };

    window.addEventListener('hashchange', applyHash);

    $$('[data-section]').forEach(link => {
        link.addEventListener('click', () => closeMobileNav());
    });

    applyHash();
}

/* ------------------------------------------------------------------ */
/* Mobile nav                                                          */
/* ------------------------------------------------------------------ */

function closeMobileNav() {
    $('#sidebar')?.classList.remove('open');
    $('#dashScrim')?.classList.remove('open');
    document.body.classList.remove('no-scroll');
}

function initMobileNav() {
    let scrim = $('#dashScrim');
    if (!scrim) {
        scrim = el('div', { class: 'scrim', id: 'dashScrim' });
        document.body.appendChild(scrim);
    }

    $('#dashBurger')?.addEventListener('click', () => {
        $('#sidebar').classList.add('open');
        scrim.classList.add('open');
        document.body.classList.add('no-scroll');
    });

    scrim.addEventListener('click', closeMobileNav);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMobileNav(); });
}

/* ------------------------------------------------------------------ */
/* Sidebar collapse                                                    */
/* ------------------------------------------------------------------ */

function initCollapse() {
    const key = 'evride:sideCollapsed';
    const sidebar = $('#sidebar');
    const layout = $('.dash-layout');

    const apply = (collapsed) => {
        if (window.innerWidth <= 992) return; // drawer mode ignores collapse
        sidebar.style.width = collapsed ? 'var(--sidebar-w-collapsed)' : '';
        if (layout) layout.style.gridTemplateColumns = collapsed
            ? 'var(--sidebar-w-collapsed) 1fr' : '';
        $$('.side-label, .side-group-title, .side-badge').forEach(n => {
            n.style.display = collapsed ? 'none' : '';
        });
        // Swap the wide wordmark for the square glyph on the narrow rail.
        // The head's 20px side padding leaves only 36px, so tighten it too or
        // the mark overflows the 76px rail.
        const mark = $('.side-head .logo-mark-img');
        if (mark) mark.style.display = collapsed ? 'block' : 'none';
        // Side by side, the mark and the toggle need ~86px in a 76px rail, so
        // stack them instead: the glyph gets the full width, toggle beneath.
        const head = $('.side-head');
        if (head) {
            head.style.paddingInline = collapsed ? '8px' : '';
            head.style.flexDirection = collapsed ? 'column' : '';
            head.style.justifyContent = collapsed ? 'center' : '';
            head.style.gap = collapsed ? '10px' : '';
        }
        $$('.side-link').forEach(n => {
            n.style.justifyContent = collapsed ? 'center' : '';
            n.style.paddingInline = collapsed ? '0' : '';
        });
        const icon = $('#sideToggle i, #sideToggle svg');
        if (icon) icon.setAttribute('data-lucide', collapsed ? 'panel-left-open' : 'panel-left-close');
        icons();
    };

    let collapsed = localStorage.getItem(key) === '1';
    apply(collapsed);

    $('#sideToggle')?.addEventListener('click', () => {
        collapsed = !collapsed;
        localStorage.setItem(key, collapsed ? '1' : '0');
        apply(collapsed);
    });
}

/* ------------------------------------------------------------------ */
/* Badges stay live                                                    */
/* ------------------------------------------------------------------ */

function refreshBadges() {
    $$('[data-badge]').forEach(node => {
        const n = badgeValue(node.dataset.badge);
        if (node.textContent !== String(n)) {
            node.textContent = n;
            node.style.display = n ? '' : 'none';
        }
    });
}

/* ------------------------------------------------------------------ */
/* Mount                                                               */
/* ------------------------------------------------------------------ */

export function mountDash({ role = 'customer', active = 'overview', searchPlaceholder } = {}) {
    const nav = NAVS[role] || NAVS.customer;

    // Sections that live on their own page: match the nav item whose href is
    // this file, so the sidebar highlights it without every page passing
    // `active` by hand.
    const file = location.pathname.split('/').pop() || '';
    if (file && !/-dashboard\.html$/.test(file)) {
        const hit = nav.groups
            .flatMap(g => g.items)
            .find(i => i.href === file);
        if (hit) active = hit.id;
    }

    document.body.classList.add('dash-body');

    // Sidebar.
    const sideSlot = $('#sidebarSlot');
    if (sideSlot) {
        const wrap = el('div');
        wrap.innerHTML = sidebarHTML(nav, active);
        sideSlot.replaceWith(...wrap.childNodes);
    }

    // Topbar.
    const topSlot = $('#topbarSlot');
    if (topSlot) {
        const wrap = el('div');
        wrap.innerHTML = topbarHTML({ searchPlaceholder });
        topSlot.replaceWith(...wrap.childNodes);
    }

    // Bottom nav (mobile).
    if (!$('.bottom-nav')) {
        const wrap = el('div');
        wrap.innerHTML = bottomNavHTML(nav);
        // append(), not appendChild(): the template starts with whitespace, so
        // childNodes is [text, <nav>]. appendChild takes a single node, so it
        // consumed the text node and silently dropped the nav.
        document.body.append(...wrap.childNodes);
    }

    icons();
    initMobileNav();
    initCollapse();
    initRouting();
    renderDashNotifs();
    updateDashBadge();

    // Notification panel toggle.
    const btn = $('#dashNotifBtn');
    const panel = $('#dashNotifPanel');
    btn?.addEventListener('click', e => {
        e.stopPropagation();
        const open = !panel.classList.contains('open');
        panel.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
        if (open) renderDashNotifs();
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('.nav-panel')) panel?.classList.remove('open');
    });

    // The site header has no account menu, so the dashboard owns logout.
    $('#dashLogout')?.addEventListener('click', () => {
        Store.logout();
        toast('You have been signed out', 'info');
        setTimeout(() => { location.href = 'index.html'; }, 700);
    });

    $('#dashMarkRead')?.addEventListener('click', e => {
        e.stopPropagation();
        Store.markAllNotificationsRead();
        renderDashNotifs();
        updateDashBadge();
        toast('All notifications marked as read', 'success');
    });

    // Live badge + notification refresh.
    RT.on('notification', () => {
        updateDashBadge();
        renderDashNotifs();
        refreshBadges();
    });

    RT.on('vehicles', throttle(refreshBadges, 3000));

    return { nav, showSection };
}

/* ------------------------------------------------------------------ */
/* Shared renderers used across dashboards                             */
/* ------------------------------------------------------------------ */

/**
 * Element lookup that tolerates a missing target.
 *
 * Every dashboard section now has its own page, so a controller written for
 * the old single-page layout addresses many elements that are not on the
 * current page. Returning a detached stub means those writes land harmlessly
 * instead of throwing and aborting the renderer partway — which is what left
 * split pages blank or half-painted.
 *
 * Reads still behave sensibly: the stub is a real (detached) element, so
 * `.value`, `.classList` and `.dataset` all work.
 */
export function dashEl(sel, root = document) {
    return root.querySelector(sel) || document.createElement('div');
}

/**
 * Run section renderers independently.
 *
 * Each dashboard section now has its own page, so on any given page most of
 * the elements a controller writes to are absent. The renderers address them
 * directly (`$('#statsGrid').innerHTML = …`), so a missing node throws and
 * every later renderer in the list never runs — which left split pages blank.
 *
 * Isolating each call means a renderer whose section is not on this page
 * simply does nothing, and the one that matters still runs.
 */
export function safeRender(...fns) {
    fns.forEach(fn => {
        try {
            fn();
        } catch (err) {
            // Only a genuinely missing element is expected here; anything
            // else is a real bug worth seeing in the console.
            if (!(err instanceof TypeError)) console.error('[dash] render failed:', err);
        }
    });
}

export function statTile({ label, value, icon, tone = '', delta, deltaDir, meta, id }) {
    return `
    <div class="stat">
        <div class="stat-top">
            <span class="stat-label">${esc(label)}</span>
            <span class="stat-icon ${esc(tone)}"><i data-lucide="${esc(icon)}"></i></span>
        </div>
        <div class="stat-value" ${id ? `data-stat="${esc(id)}"` : ''}>${value}</div>
        ${delta || meta ? `
        <div class="stat-meta">
            ${delta ? `
            <span class="stat-delta ${deltaDir === 'down' ? 'down' : 'up'}">
                <i data-lucide="${deltaDir === 'down' ? 'trending-down' : 'trending-up'}"></i> ${esc(delta)}
            </span>` : ''}
            ${meta ? `<span>${esc(meta)}</span>` : ''}
        </div>` : ''}
    </div>`;
}

export function statusBadge(status) {
    const map = {
        available: 'badge-green', active: 'badge-green', paid: 'badge-green',
        completed: 'badge-blue', upcoming: 'badge-blue', on_trip: 'badge-blue',
        reserved: 'badge-warning', pending: 'badge-warning', charging: 'badge-purple',
        busy: 'badge-warning', cancelled: 'badge-muted', offline: 'badge-muted',
        maintenance: 'badge-danger', failed: 'badge-danger', refunded: 'badge-muted'
    };
    return `<span class="badge ${map[status] || 'badge-muted'}">${esc(fmt.statusLabel(status))}</span>`;
}

export default mountDash;
