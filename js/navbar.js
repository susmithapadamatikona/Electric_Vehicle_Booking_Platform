/* ==========================================================================
   EVRide — navbar.js
   Renders the announcement bar, navbar, mobile drawer, search overlay and
   footer into every page. Keeping the chrome in one module means a nav change
   is a one-file change across all 29 pages.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { $, $$, el, esc, fmt, icons, toast, throttle, refreshReveal } from './main.js';

/* ------------------------------------------------------------------ */
/* Markup                                                             */
/* ------------------------------------------------------------------ */

function logoHTML(href = 'index.html') {
    // The Stackly asset includes its own wordmark, so it replaces the old
    // mark + text pair rather than sitting beside them.
    return `
    <a href="${href}" class="logo" aria-label="Stackly home">
        <img src="assets/images/stackly-whitish_blue-logo.webp" alt="Stackly"
             class="logo-img" width="320" height="132">
    </a>`;
}

const NAV_ITEMS = [
    { label: 'Home', href: 'index.html', nav: 'index.html' },
    { label: 'Explore EVs', href: '404.html', nav: 'explore-evs.html,ev-details.html' },
    { label: 'Charging', href: '404.html', nav: 'charging-stations.html,charging-details.html,charging-reservation.html,charging-dashboard.html' },
    { label: 'Offers', href: '404.html', nav: 'offers.html' },
    { label: 'About', href: '404.html', nav: 'about.html,corporate.html,faq.html,support.html' },
    { label: 'Contact', href: '404.html', nav: 'contact.html' }
];

function navLinksHTML() {
    return NAV_ITEMS.map(item => `
        <div class="nav-item" ${item.nav ? `data-nav="${item.nav}"` : ''}>
            <a href="${item.href}" class="nav-link">${esc(item.label)}</a>
        </div>`).join('');
}

function navHTML() {
    return `
    <a href="#main" class="skip-link">Skip to main content</a>

    <div class="announce" id="announceBar">
        <div class="announce-inner">
            <i data-lucide="sparkles"></i>
            <span><strong>40% off your first ride</strong> with code EVRIDEFIRST — plus a free full charge on pickup.</span>
            <a href="offers.html">View offers <i data-lucide="arrow-right"></i></a>
        </div>
        <button class="announce-close" aria-label="Dismiss announcement"><i data-lucide="x"></i></button>
    </div>

    <header class="nav" id="mainNav">
        <div class="nav-inner">
            ${logoHTML()}

            <nav class="nav-links" aria-label="Primary">
                ${navLinksHTML()}
            </nav>

            <div class="nav-actions">
                <a href="login.html" class="btn btn-secondary btn-sm nav-login">Log in</a>
                <a href="register.html" class="btn btn-primary btn-sm nav-cta">Register</a>

                <button class="burger" id="burger" aria-label="Open menu" aria-expanded="false">
                    <i data-lucide="menu"></i>
                </button>
            </div>
        </div>
    </header>

    <div class="scrim" id="scrim"></div>

    <aside class="drawer" id="drawer" aria-label="Mobile navigation">
        <div class="drawer-head">
            ${logoHTML()}
            <button class="modal-close" id="drawerClose" aria-label="Close menu"><i data-lucide="x"></i></button>
        </div>
        <div class="drawer-body">
            <a href="index.html" class="drawer-link">Home</a>
            <a href="404.html" class="drawer-link">Explore EVs</a>
            <a href="charging-stations.html" class="drawer-link">Charging</a>
            <a href="index.html#how-it-works" class="drawer-link">How It Works</a>
            <a href="offers.html" class="drawer-link">Offers</a>
            <a href="404.html" class="drawer-link">Corporate</a>
            <a href="about.html" class="drawer-link">About</a>
            <a href="support.html" class="drawer-link">Support</a>
            <a href="404.html" class="drawer-link">FAQ</a>
            <a href="404.html" class="drawer-link">Contact</a>
            <button class="drawer-link w-full" data-drawer-toggle="d3">Dashboards <i data-lucide="chevron-down"></i></button>
            <div class="drawer-sub" id="d3">
                <a href="customer-dashboard.html" class="drawer-link">Customer</a>
                <a href="driver-dashboard.html" class="drawer-link">Driver / Owner</a>
                <a href="fleet-dashboard.html" class="drawer-link">Fleet Manager</a>
                <a href="404.html" class="drawer-link">Admin Console</a>
                <a href="analytics.html" class="drawer-link">Analytics</a>
            </div>
        </div>
        <div class="drawer-foot">
            <a href="login.html" class="btn btn-secondary btn-block">Log in</a>
            <a href="register.html" class="btn btn-primary btn-block">Register</a>
        </div>
    </aside>

    <div class="search-overlay" id="searchOverlay" role="dialog" aria-label="Search">
        <div class="search-box">
            <div class="search-field">
                <i data-lucide="search"></i>
                <input type="search" id="searchInput" placeholder="Search EVs, charging stations, locations…" aria-label="Search query">
                <span class="search-esc">ESC</span>
            </div>
            <div class="search-results" id="searchResults"></div>
            <div class="search-hints">
                <button class="chip" data-q="Tesla">Tesla</button>
                <button class="chip" data-q="SUV">Electric SUV</button>
                <button class="chip" data-q="Indiranagar">Indiranagar</button>
                <button class="chip" data-q="fast charging">Fast charging</button>
                <button class="chip" data-q="luxury">Luxury</button>
            </div>
        </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */

function footerHTML() {
    return `
    <footer class="footer">
        <div class="container">
            <div class="footer-top">
                <div class="footer-brand">
                    ${logoHTML()}
                    <p class="footer-about">
                        India's intelligent electric mobility platform. Book premium EVs by the hour,
                        day or month, find a charger in seconds, and track every trip in real time —
                        all from one connected system.
                    </p>
                    <div class="socials">
                        <a href="404.html" class="social" aria-label="X (Twitter)"><i data-lucide="twitter"></i></a>
                        <a href="404.html" class="social" aria-label="LinkedIn"><i data-lucide="linkedin"></i></a>
                        <a href="404.html" class="social" aria-label="Instagram"><i data-lucide="instagram"></i></a>
                        <a href="404.html" class="social" aria-label="YouTube"><i data-lucide="youtube"></i></a>
                        <a href="404.html" class="social" aria-label="Facebook"><i data-lucide="facebook"></i></a>
                    </div>
                </div>

                <div class="footer-col">
                    <h6>Platform</h6>
                    <ul>
                        <li><a href="404.html">Explore EVs</a></li>
                        <li><a href="404.html">Book an EV</a></li>
                        <li><a href="404.html">Charging Network</a></li>
                        <li><a href="404.html">Locations</a></li>
                        <li><a href="offers.html">Offers &amp; Deals</a></li>
                        <li><a href="404.html">Live Tracking</a></li>
                    </ul>
                </div>

                <div class="footer-col">
                    <h6>Company</h6>
                    <ul>
                        <li><a href="404.html">About EVRide</a></li>
                        <li><a href="404.html">Corporate</a></li>
                        <li><a href="404.html">Careers</a></li>
                        <li><a href="about.html#press">Press &amp; Blog</a></li>
                        <li><a href="404.html">Contact</a></li>
                        <li><a href="404.html">Sustainability</a></li>
                    </ul>
                </div>

                <div class="footer-col">
                    <h6>Support</h6>
                    <ul>
                        <li><a href="404.html">Help Centre</a></li>
                        <li><a href="404.html">FAQ</a></li>
                        <li><a href="404.html">Safety</a></li>
                        <li><a href="404.html">Emergency</a></li>
                        <li><a href="404.html">Invoices</a></li>
                        <li><a href="404.html">My Account</a></li>
                    </ul>
                </div>

                <div class="footer-col">
                    <h6>Legal</h6>
                    <div class="footer-contact">
                        <div class="footer-contact-row">
                            <i data-lucide="map-pin"></i>
                            <span>EVRide Mobility Tower, Indiranagar, Bengaluru 560038</span>
                        </div>
                        <div class="footer-contact-row">
                            <i data-lucide="phone"></i>
                            <a href="tel:+918045678900">+91 80 4567 8900</a>
                        </div>
                        <div class="footer-contact-row">
                            <i data-lucide="mail"></i>
                            <a href="mailto:hello@evride.in">hello@evride.in</a>
                        </div>
                        <div class="footer-contact-row">
                            <i data-lucide="life-buoy"></i>
                            <a href="tel:1800865811" style="color:var(--primary);font-weight:600">1800-EVRIDE-911 — 24/7 Emergency</a>
                        </div>
                    </div>
                </div>
            </div>

            <div class="footer-bottom">
                <span>© 2026 EVRide Electric Mobility Pvt. Ltd. All rights reserved.</span>
                <div class="footer-bottom-links">
                    <a href="404.html">Privacy</a>
                    <a href="404.html">Terms</a>
                    <a href="404.html">Sitemap</a>
                    <a href="404.html">Accessibility</a>
                    <a href="404.html">Image Credits</a>
                    <span class="text-muted">Made for a cleaner commute 🌱</span>
                </div>
            </div>
        </div>
    </footer>`;
}

/* ------------------------------------------------------------------ */
/* Behaviour                                                           */
/* ------------------------------------------------------------------ */

function bindDrawer() {
    const drawer = $('#drawer');
    const scrim = $('#scrim');
    const burger = $('#burger');
    if (!drawer) return;

    const open = () => {
        drawer.classList.add('open');
        scrim.classList.add('open');
        document.body.classList.add('no-scroll');
        burger?.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
        drawer.classList.remove('open');
        scrim.classList.remove('open');
        document.body.classList.remove('no-scroll');
        burger?.setAttribute('aria-expanded', 'false');
    };

    burger?.addEventListener('click', open);
    $('#drawerClose')?.addEventListener('click', close);
    scrim?.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    // Close when a destination is chosen. Navigating to another page hid this
    // (the reload cleared everything), but a same-page "#hash" link left the
    // drawer, scrim and body scroll-lock in place with the page behind them.
    // Delegated so it also covers links rendered after this runs.
    drawer.addEventListener('click', e => {
        const link = e.target.closest('a[href]');
        // Section toggles inside the drawer are buttons, not links, so they
        // are untouched here and keep their accordion behaviour.
        if (link && !link.hasAttribute('data-drawer-toggle')) close();
    });

    $$('[data-drawer-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = $('#' + btn.dataset.drawerToggle);
            if (!target) return;
            const isOpen = target.classList.toggle('open');
            const icon = btn.querySelector('[data-lucide], svg');
            if (icon) icon.style.transform = isOpen ? 'rotate(180deg)' : '';
        });
    });
}

function bindSearch() {
    const overlay = $('#searchOverlay');
    const input = $('#searchInput');
    const results = $('#searchResults');
    if (!overlay) return;

    const open = () => {
        overlay.classList.add('open');
        document.body.classList.add('no-scroll');
        setTimeout(() => input?.focus(), 140);
    };
    const close = () => {
        overlay.classList.remove('open');
        document.body.classList.remove('no-scroll');
        if (input) input.value = '';
        results?.classList.remove('show');
    };

    // The search icon was removed from the header; the overlay is now opened
    // with Ctrl/Cmd+K or "/" only.
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) close();
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); open(); }
        if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
            e.preventDefault(); open();
        }
    });

    const run = (q) => {
        const query = q.trim().toLowerCase();
        if (query.length < 2) { results.classList.remove('show'); return; }

        const vehicles = Store.getVehicles().filter(v =>
            `${v.name} ${v.brand} ${v.model} ${v.category} ${v.area}`.toLowerCase().includes(query)
        ).slice(0, 5);

        const stations = Store.getStations().filter(s =>
            `${s.name} ${s.address} ${s.operator}`.toLowerCase().includes(query)
        ).slice(0, 3);

        let html = '';

        if (vehicles.length) {
            html += '<div class="search-group-label">Vehicles</div>';
            html += vehicles.map(v => `
                <a href="ev-details.html?id=${esc(v.id)}" class="search-result">
                    <img src="${esc(v.image)}" alt="${esc(v.name)}" data-fallback="${esc(v.brand)}">
                    <div style="flex:1;min-width:0">
                        <strong>${esc(v.name)}</strong>
                        <span>${esc(v.brand)} · ${v.battery}% battery · ${v.range} km range</span>
                    </div>
                    <span class="badge badge-green">${fmt.money(v.price)}/day</span>
                </a>`).join('');
        }

        if (stations.length) {
            html += '<div class="search-group-label">Charging Stations</div>';
            html += stations.map(s => `
                <a href="charging-details.html?id=${esc(s.id)}" class="search-result">
                    <div style="width:46px;height:34px;border-radius:6px;display:grid;place-items:center;background:rgba(0,200,255,.1);color:var(--electric-blue);flex-shrink:0">
                        <i data-lucide="zap" style="width:16px;height:16px"></i>
                    </div>
                    <div style="flex:1;min-width:0">
                        <strong>${esc(s.name)}</strong>
                        <span>${s.available} of ${s.total} free · ${s.speed} kW · ${fmt.money(s.price)}/kWh</span>
                    </div>
                </a>`).join('');
        }

        if (!html) {
            html = `<div class="empty" style="padding:34px 20px">
                <p>No results for "<strong>${esc(q)}</strong>"</p></div>`;
        }

        results.innerHTML = html;
        results.classList.add('show');
        icons();
    };

    let t;
    input?.addEventListener('input', e => {
        clearTimeout(t);
        t = setTimeout(() => run(e.target.value), 220);
    });

    $$('.search-hints .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            input.value = chip.dataset.q;
            run(chip.dataset.q);
            input.focus();
        });
    });
}

function bindScroll() {
    const nav = $('#mainNav');
    if (!nav) return;
    const onScroll = throttle(() => {
        nav.classList.toggle('scrolled', window.scrollY > 24);
    }, 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
}

function bindAnnounce() {
    const bar = $('#announceBar');
    if (!bar) return;
    if (sessionStorage.getItem('evride:announceClosed') === '1') {
        bar.style.display = 'none';
        return;
    }
    bar.querySelector('.announce-close')?.addEventListener('click', () => {
        bar.style.height = '0';
        bar.style.opacity = '0';
        setTimeout(() => bar.style.display = 'none', 260);
        sessionStorage.setItem('evride:announceClosed', '1');
    });
}

/* ------------------------------------------------------------------ */
/* Mount                                                               */
/* ------------------------------------------------------------------ */

export function mountChrome({ nav = true, footer = true, solidNav = false } = {}) {
    if (nav) {
        const slot = $('#navSlot') || document.body;
        const wrap = el('div');
        wrap.innerHTML = navHTML();
        if (slot.id === 'navSlot') slot.replaceWith(...wrap.childNodes);
        else document.body.prepend(...wrap.childNodes);

        if (solidNav) $('#mainNav')?.classList.add('nav-solid');
    }

    if (footer) {
        const slot = $('#footerSlot');
        const wrap = el('div');
        wrap.innerHTML = footerHTML();
        if (slot) slot.replaceWith(...wrap.childNodes);
        else document.body.append(...wrap.childNodes);   // append takes many nodes
    }

    icons();
    // Chrome is injected after boot() ran initReveal(), so any [data-reveal]
    // node in it would never be observed and would sit at opacity:0. No-op
    // today; keeps that failure from returning if the chrome gains one.
    refreshReveal();

    // boot() marks the active nav item, but it runs before this function
    // injects the nav — so re-apply it here against the real elements.
    const page = location.pathname.split('/').pop() || 'index.html';
    $$('[data-nav]').forEach(item => {
        if (item.dataset.nav.split(',').map(x => x.trim()).includes(page)) {
            item.classList.add('active');
        }
    });
    bindAnnounce();
    bindScroll();
    bindDrawer();
    bindSearch();

    // The header no longer has a notification badge, but live pushes still
    // surface as toasts. Notifications remain readable on the dashboard.
    RT.on('notification', n => {
        if (Store.getPrefs().notifications) {
            toast(n.msg, n.type === 'warning' ? 'warning' : n.type === 'error' ? 'error' : n.type, n.title);
        }
    });
}

export default mountChrome;
