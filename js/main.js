/* ==========================================================================
   EVRide — main.js
   Shared runtime: formatting helpers, toasts, modals, reveal, counters,
   accordions, tabs, and the bootstrap that every page calls.
   ========================================================================== */

import Store from './storage.js';
import Data, { seed } from './data.js';
import RT from './realtime.js';

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export const fmt = {
    money(n, withSymbol = true) {
        const v = Math.round(Number(n) || 0);
        const s = v.toLocaleString('en-IN');
        return withSymbol ? '₹' + s : s;
    },

    compact(n) {
        const v = Number(n) || 0;
        if (v >= 10000000) return (v / 10000000).toFixed(v % 10000000 === 0 ? 0 : 1) + 'Cr';
        if (v >= 100000)   return (v / 100000).toFixed(v % 100000 === 0 ? 0 : 1) + 'L';
        if (v >= 1000)     return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K';
        return String(v);
    },

    num(n, decimals = 0) {
        return (Number(n) || 0).toLocaleString('en-IN', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    },

    date(ts, opts = {}) {
        const d = new Date(ts);
        if (isNaN(d)) return '—';
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...opts });
    },

    dateShort(ts) {
        const d = new Date(ts);
        if (isNaN(d)) return '—';
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    },

    time(ts) {
        const d = new Date(ts);
        if (isNaN(d)) return '—';
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    },

    dateTime(ts) {
        return `${fmt.date(ts)} · ${fmt.time(ts)}`;
    },

    ago(ts) {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 10) return 'just now';
        if (s < 60) return s + 's ago';
        const m = Math.floor(s / 60);
        if (m < 60) return m + 'm ago';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h ago';
        const d = Math.floor(h / 24);
        if (d < 7) return d + 'd ago';
        if (d < 30) return Math.floor(d / 7) + 'w ago';
        return fmt.dateShort(ts);
    },

    duration(min) {
        const m = Math.round(min);
        if (m < 60) return m + ' min';
        const h = Math.floor(m / 60);
        const r = m % 60;
        return r ? `${h}h ${r}m` : `${h}h`;
    },

    statusLabel(s) {
        return ({
            available: 'Available', reserved: 'Reserved', on_trip: 'On Trip',
            charging: 'Charging', maintenance: 'Maintenance', offline: 'Offline',
            busy: 'Busy', active: 'Active', upcoming: 'Upcoming',
            completed: 'Completed', cancelled: 'Cancelled', paid: 'Paid',
            pending: 'Pending', failed: 'Failed', refunded: 'Refunded'
        })[s] || s;
    },

    batteryClass(pct) {
        return pct <= 20 ? 'low' : pct <= 45 ? 'mid' : '';
    },

    initials(name) {
        return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    },

    plural(n, one, many) {
        return `${n} ${n === 1 ? one : (many || one + 's')}`;
    }
};

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else node.setAttribute(k, v);
    });
    children.flat().forEach(c => {
        if (c == null) return;
        node.append(c.nodeType ? c : document.createTextNode(c));
    });
    return node;
}

/** Escape user-supplied text before interpolating into innerHTML. */
export function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function debounce(fn, ms = 250) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function throttle(fn, ms = 100) {
    let last = 0, timer;
    return (...args) => {
        const now = Date.now();
        const wait = ms - (now - last);
        if (wait <= 0) { last = now; fn(...args); }
        else { clearTimeout(timer); timer = setTimeout(() => { last = Date.now(); fn(...args); }, wait); }
    };
}

/** Refresh Lucide icons after dynamic DOM insertion. */
export function icons(root) {
    if (window.lucide?.createIcons) {
        try { window.lucide.createIcons(root ? { nameAttr: 'data-lucide', attrs: {} } : undefined); } catch (_) { window.lucide.createIcons(); }
    }
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

const TOAST_ICON = {
    success: 'check-circle', error: 'alert-circle',
    warning: 'alert-triangle', info: 'info'
};

export function toast(message, type = 'success', title = null, duration = 4200) {
    let stack = $('.toast-stack');
    if (!stack) {
        stack = el('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
        document.body.appendChild(stack);
    }

    const node = el('div', { class: `toast ${type}` }, [
        el('div', { class: 'toast-icon', html: `<i data-lucide="${TOAST_ICON[type] || 'info'}"></i>` }),
        el('div', { class: 'toast-body' }, [
            title ? el('div', { class: 'toast-title', text: title }) : null,
            el('div', { class: 'toast-msg', text: message })
        ]),
        el('button', { class: 'toast-x', 'aria-label': 'Dismiss', html: '<i data-lucide="x"></i>' }),
        el('div', { class: 'toast-timer', style: `animation-duration:${duration}ms` })
    ]);

    stack.appendChild(node);
    icons();

    const close = () => {
        node.classList.add('out');
        setTimeout(() => node.remove(), 280);
    };

    node.querySelector('.toast-x').addEventListener('click', close);
    const timer = setTimeout(close, duration);
    node.addEventListener('mouseenter', () => {
        clearTimeout(timer);
        const bar = node.querySelector('.toast-timer');
        if (bar) bar.style.animationPlayState = 'paused';
    });

    return close;
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

let lastFocus = null;

export function openModal(idOrNode) {
    const node = typeof idOrNode === 'string' ? document.getElementById(idOrNode) : idOrNode;
    if (!node) return;
    lastFocus = document.activeElement;
    node.classList.add('open');
    document.body.classList.add('no-scroll');
    const focusable = node.querySelector('input, button, select, textarea, [tabindex]');
    if (focusable) setTimeout(() => focusable.focus(), 120);
}

export function closeModal(idOrNode) {
    const node = typeof idOrNode === 'string' ? document.getElementById(idOrNode) : idOrNode;
    if (!node) return;
    node.classList.remove('open');
    if (!$('.modal-backdrop.open')) document.body.classList.remove('no-scroll');
    if (lastFocus) { lastFocus.focus(); lastFocus = null; }
}

function bindModals() {
    document.addEventListener('click', e => {
        const opener = e.target.closest('[data-modal-open]');
        if (opener) { e.preventDefault(); openModal(opener.dataset.modalOpen); return; }

        const closer = e.target.closest('[data-modal-close]');
        if (closer) { e.preventDefault(); closeModal(closer.closest('.modal-backdrop')); return; }

        if (e.target.classList.contains('modal-backdrop')) closeModal(e.target);
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const open = $('.modal-backdrop.open');
            if (open) closeModal(open);
        }
    });
}

/** Promise-based confirm dialog styled to the design system. */
export function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
    return new Promise(resolve => {
        const backdrop = el('div', { class: 'modal-backdrop' }, [
            el('div', { class: 'modal modal-sm', role: 'dialog', 'aria-modal': 'true' }, [
                el('div', { class: 'modal-head' }, [
                    el('div', {}, [
                        el('h4', { class: 'modal-title', text: title }),
                    ]),
                    el('button', { class: 'modal-close', 'aria-label': 'Close', html: '<i data-lucide="x"></i>' })
                ]),
                el('div', { class: 'modal-body' }, [
                    el('p', { style: 'font-size:.92rem;line-height:1.7', text: message })
                ]),
                el('div', { class: 'modal-foot' }, [
                    el('button', { class: 'btn btn-secondary', text: cancelText, dataset: { act: 'no' } }),
                    el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: confirmText, dataset: { act: 'yes' } })
                ])
            ])
        ]);

        document.body.appendChild(backdrop);
        icons();
        requestAnimationFrame(() => openModal(backdrop));

        const done = val => {
            closeModal(backdrop);
            setTimeout(() => backdrop.remove(), 300);
            resolve(val);
        };

        backdrop.querySelector('[data-act="yes"]').onclick = () => done(true);
        backdrop.querySelector('[data-act="no"]').onclick = () => done(false);
        backdrop.querySelector('.modal-close').onclick = () => done(false);
        backdrop.onclick = e => { if (e.target === backdrop) done(false); };
    });
}

/* ------------------------------------------------------------------ */
/* Scroll reveal                                                       */
/* ------------------------------------------------------------------ */

function initReveal() {
    const items = $$('[data-reveal]');
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
        items.forEach(i => i.classList.add('revealed'));
        return;
    }

    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const delay = parseInt(entry.target.dataset.revealDelay || 0, 10);
            setTimeout(() => entry.target.classList.add('revealed'), delay);
            io.unobserve(entry.target);
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    items.forEach(i => io.observe(i));
}

/** Re-scan for reveal targets added after initial load. */
export function refreshReveal(root = document) {
    $$('[data-reveal]:not(.revealed)', root).forEach(n => n.classList.add('revealed'));
}

/* ------------------------------------------------------------------ */
/* Animated counters                                                   */
/* ------------------------------------------------------------------ */

export function countUp(node, target, duration = 1800) {
    const decimals = parseInt(node.dataset.decimals || 0, 10);
    const prefix = node.dataset.prefix || '';
    const suffix = node.dataset.suffix || '';
    const useCompact = node.dataset.compact === 'true';
    const start = performance.now();

    function frame(now) {
        const p = Math.min((now - start) / duration, 1);
        // easeOutExpo
        const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        const val = target * eased;
        node.textContent = prefix + (useCompact ? fmt.compact(val) : fmt.num(val, decimals)) + suffix;
        if (p < 1) requestAnimationFrame(frame);
        else node.textContent = prefix + (useCompact ? fmt.compact(target) : fmt.num(target, decimals)) + suffix;
    }
    requestAnimationFrame(frame);
}

function initCounters() {
    const nodes = $$('[data-count]');
    if (!nodes.length) return;

    if (!('IntersectionObserver' in window)) {
        nodes.forEach(n => countUp(n, parseFloat(n.dataset.count)));
        return;
    }

    const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            countUp(e.target, parseFloat(e.target.dataset.count),
                parseInt(e.target.dataset.duration || 1800, 10));
            io.unobserve(e.target);
        });
    }, { threshold: 0.4 });

    nodes.forEach(n => io.observe(n));
}

/* ------------------------------------------------------------------ */
/* Accordion & tabs                                                    */
/* ------------------------------------------------------------------ */

export function initAccordions(root = document) {
    $$('.acc-head', root).forEach(head => {
        if (head.dataset.bound) return;
        head.dataset.bound = '1';
        head.setAttribute('aria-expanded', 'false');

        head.addEventListener('click', () => {
            const item = head.closest('.acc-item');
            const body = item.querySelector('.acc-body');
            const group = item.closest('.accordion');
            const isOpen = item.classList.contains('open');

            if (group && group.dataset.single !== 'false') {
                $$('.acc-item.open', group).forEach(other => {
                    if (other === item) return;
                    other.classList.remove('open');
                    other.querySelector('.acc-body').style.maxHeight = null;
                    other.querySelector('.acc-head').setAttribute('aria-expanded', 'false');
                });
            }

            item.classList.toggle('open', !isOpen);
            head.setAttribute('aria-expanded', String(!isOpen));
            body.style.maxHeight = isOpen ? null : body.scrollHeight + 'px';
        });
    });
}

export function initTabs(root = document) {
    $$('[data-tabs]', root).forEach(group => {
        if (group.dataset.bound) return;
        group.dataset.bound = '1';

        const buttons = $$('.tab, .segment button', group);
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;
                if (!target) return;
                buttons.forEach(b => {
                    b.classList.toggle('active', b === btn);
                    b.setAttribute('aria-selected', String(b === btn));
                });
                const scope = group.dataset.tabsScope
                    ? document.querySelector(group.dataset.tabsScope)
                    : group.parentElement;
                $$('.tab-panel', scope).forEach(p => {
                    p.classList.toggle('active', p.dataset.panel === target);
                });
            });
        });
    });
}

/* ------------------------------------------------------------------ */
/* Ripple micro-interaction                                            */
/* ------------------------------------------------------------------ */

function initRipple() {
    document.addEventListener('pointerdown', e => {
        const btn = e.target.closest('.btn-primary, .btn-blue');
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        const r = el('span', {
            class: 'ripple',
            style: `left:${e.clientX - rect.left}px;top:${e.clientY - rect.top}px`
        });
        btn.appendChild(r);
        setTimeout(() => r.remove(), 620);
    });
}

/* ------------------------------------------------------------------ */
/* Back to top                                                         */
/* ------------------------------------------------------------------ */

function initToTop() {
    let btn = $('.to-top');
    if (!btn) {
        btn = el('button', {
            class: 'to-top', 'aria-label': 'Back to top',
            html: '<i data-lucide="arrow-up"></i>'
        });
        document.body.appendChild(btn);
        icons();
    }
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('scroll', throttle(() => {
        btn.classList.toggle('show', window.scrollY > 640);
    }, 160), { passive: true });
}

/* ------------------------------------------------------------------ */
/* Image fallback — generated SVG poster when a photo fails to load    */
/* ------------------------------------------------------------------ */

const FALLBACK_CACHE = new Map();

export function posterFor(label = 'EV', accent = '#00E676') {
    const key = label + accent;
    if (FALLBACK_CACHE.has(key)) return FALLBACK_CACHE.get(key);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#101F27"/><stop offset="1" stop-color="#0B151C"/></linearGradient>
<linearGradient id="a" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${accent}" stop-opacity=".9"/><stop offset="1" stop-color="#00C8FF" stop-opacity=".9"/></linearGradient></defs>
<rect width="800" height="500" fill="url(#g)"/>
<g opacity=".08" stroke="${accent}" stroke-width="1">
${Array.from({ length: 10 }, (_, i) => `<line x1="0" y1="${i * 50}" x2="800" y2="${i * 50}"/>`).join('')}
${Array.from({ length: 16 }, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="500"/>`).join('')}
</g>
<ellipse cx="400" cy="250" rx="260" ry="120" fill="${accent}" opacity=".07"/>
<path d="M230 290h340l-42-62c-8-12-21-19-35-19H307c-14 0-27 7-35 19l-42 62z" fill="url(#a)" opacity=".55"/>
<rect x="215" y="288" width="370" height="46" rx="20" fill="url(#a)" opacity=".8"/>
<circle cx="292" cy="336" r="26" fill="#050B10" stroke="${accent}" stroke-width="3"/>
<circle cx="508" cy="336" r="26" fill="#050B10" stroke="${accent}" stroke-width="3"/>
<text x="400" y="420" font-family="system-ui,sans-serif" font-size="22" font-weight="600" fill="#71828B" text-anchor="middle">${esc(label)}</text>
</svg>`;
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    FALLBACK_CACHE.set(key, url);
    return url;
}

/** Attach once; catches every <img data-fallback> that errors, now or later. */
function initImageFallback() {
    document.addEventListener('error', e => {
        const img = e.target;
        if (img.tagName !== 'IMG' || img.dataset.fallbackApplied) return;
        img.dataset.fallbackApplied = '1';

        // Vehicle photos fall back to that vehicle's generated artwork —
        // right body style, right colour — rather than a generic poster.
        // `data-vehicle-art` carries the pre-built SVG from the seed.
        if (img.dataset.vehicleArt) {
            img.src = img.dataset.vehicleArt;
            return;
        }
        img.src = posterFor(img.dataset.fallback || img.alt || 'EVRide EV');
    }, true);
}

/* ------------------------------------------------------------------ */
/* Lazy loading hint                                                   */
/* ------------------------------------------------------------------ */

function initLazy() {
    $$('img:not([loading])').forEach(img => {
        if (!img.closest('.hero')) img.loading = 'lazy';
        img.decoding = 'async';
    });
}

/* ------------------------------------------------------------------ */
/* Page-level bootstrap                                                */
/* ------------------------------------------------------------------ */

let booted = false;

export function boot(options = {}) {
    if (booted) return;
    booted = true;

    // 1. Data must exist before any renderer runs.
    seed();

    // 2. Icons as early as possible to avoid layout shift.
    icons();

    // 3. Shared behaviours.
    bindModals();
    initReveal();
    initCounters();
    initAccordions();
    initTabs();
    initRipple();
    initImageFallback();
    initLazy();
    if (options.toTop !== false) initToTop();

    // 4. Start the simulated real-time feed.
    if (options.realtime !== false) RT.start();

    // 5. Mark the active nav item from the current filename.
    const page = location.pathname.split('/').pop() || 'index.html';
    $$('[data-nav]').forEach(item => {
        const match = item.dataset.nav.split(',').map(s => s.trim());
        if (match.includes(page)) item.classList.add('active');
    });

    document.body.classList.add('is-ready');
    retirePreloader();
}

/* ------------------------------------------------------------------ */
/* Preloader                                                           */
/* ------------------------------------------------------------------ */

/**
 * Drop the overlay once the page is ready.
 *
 * .is-ready alone fades it via CSS; this also removes the node so it cannot
 * swallow clicks, and is safe to call more than once.
 */
function retirePreloader() {
    const el = document.getElementById('preloader');
    if (!el) return;
    document.body.classList.add('is-ready');
    // Match the CSS fade before removing, so it does not vanish abruptly.
    setTimeout(() => el.remove(), 460);
}

/**
 * Failsafe: never let a script error strand the visitor behind the overlay.
 * If boot() has not run by the time the window loads (plus a grace period),
 * clear it anyway — a broken page is still better than a blank screen.
 */
if (typeof window !== 'undefined') {
    const failsafe = () => setTimeout(retirePreloader, 1200);
    if (document.readyState === 'complete') failsafe();
    else window.addEventListener('load', failsafe);
    window.addEventListener('error', () => setTimeout(retirePreloader, 400));
}

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

export { Store, Data, RT };

// Expose on window for inline handlers and quick console debugging.
if (typeof window !== 'undefined') {
    window.EVRide = { Store, Data, RT, fmt, toast, confirmDialog, openModal, closeModal, $, $$, el, esc, icons, posterFor, countUp };
}
