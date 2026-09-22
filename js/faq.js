/* ==========================================================================
   EVRide — faq.js
   Controller for faq.html: category nav, search and accordions.
   ========================================================================== */

import { FAQS } from './data.js';
import { boot, $, $$, esc, icons, toast, initAccordions, debounce } from './main.js';
import mountChrome from './navbar.js';

boot();
mountChrome({ solidNav: true });

const CAT_ICON = {
    Booking: 'calendar-check',
    EVs: 'car',
    Charging: 'zap',
    Payments: 'credit-card',
    Cancellation: 'x-circle',
    Safety: 'shield-check',
    Fleet: 'truck',
    Account: 'user'
};

const CATEGORIES = [...new Set(FAQS.map(f => f.cat))];

let activeCat = 'all';
let query = '';

/* ------------------------------------------------------------------ */
/* Filtering                                                           */
/* ------------------------------------------------------------------ */

function matching() {
    let list = FAQS;

    if (query) {
        const q = query.toLowerCase();
        list = list.filter(f => `${f.q} ${f.a} ${f.cat}`.toLowerCase().includes(q));
    }
    if (activeCat !== 'all') list = list.filter(f => f.cat === activeCat);

    return list;
}

/* ------------------------------------------------------------------ */
/* Category nav                                                        */
/* ------------------------------------------------------------------ */

function renderNav() {
    const counts = {};
    const pool = query
        ? FAQS.filter(f => `${f.q} ${f.a} ${f.cat}`.toLowerCase().includes(query.toLowerCase()))
        : FAQS;

    CATEGORIES.forEach(c => { counts[c] = pool.filter(f => f.cat === c).length; });

    $('#faqNav').innerHTML = `
        <button class="faq-nav-item ${activeCat === 'all' ? 'active' : ''}" data-cat="all">
            <span class="flex items-center gap-2">
                <i data-lucide="layout-grid" style="width:15px;height:15px"></i> All questions
            </span>
            <span class="faq-nav-count">${pool.length}</span>
        </button>
        ${CATEGORIES.map(c => `
        <button class="faq-nav-item ${activeCat === c ? 'active' : ''} ${counts[c] ? '' : 'is-disabled'}"
                data-cat="${esc(c)}" ${counts[c] ? '' : 'disabled style="opacity:.4"'}>
            <span class="flex items-center gap-2">
                <i data-lucide="${CAT_ICON[c] || 'help-circle'}" style="width:15px;height:15px"></i> ${esc(c)}
            </span>
            <span class="faq-nav-count">${counts[c]}</span>
        </button>`).join('')}`;

    icons();

    $$('[data-cat]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            activeCat = btn.dataset.cat;
            renderNav();
            renderContent();
            // On mobile the nav sits above the list; scroll the answers into view.
            if (window.innerWidth <= 992) {
                $('#faqContent').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

/** Wrap search hits in <mark> without letting user input reach innerHTML raw. */
function highlight(text) {
    const safe = esc(text);
    if (!query) return safe;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(`(${escaped})`, 'gi'),
        '<mark style="background:rgba(0,230,118,.22);color:var(--primary);padding:1px 3px;border-radius:3px">$1</mark>');
}

function renderContent() {
    const list = matching();
    const wrap = $('#faqContent');

    if (!list.length) {
        wrap.innerHTML = `
        <div class="empty" style="padding:70px 20px">
            <div class="empty-icon"><i data-lucide="search-x"></i></div>
            <h4>No questions match "${esc(query)}"</h4>
            <p>Try a different wording, or ask us directly — we answer in under two minutes.</p>
            <div class="flex gap-3 justify-center mt-6 flex-wrap">
                <button class="btn btn-secondary btn-sm" id="clearFaqSearch">
                    <i data-lucide="rotate-ccw"></i> Clear search
                </button>
                <a href="support.html" class="btn btn-primary btn-sm">
                    <i data-lucide="message-circle"></i> Ask support
                </a>
            </div>
        </div>`;
        icons();
        $('#clearFaqSearch')?.addEventListener('click', () => {
            query = '';
            $('#faqSearch').value = '';
            renderNav();
            renderContent();
        });
        return;
    }

    // Group by category so a broad search still reads as an organised page.
    const groups = {};
    list.forEach(f => {
        (groups[f.cat] = groups[f.cat] || []).push(f);
    });

    wrap.innerHTML = Object.entries(groups).map(([cat, items]) => `
        <div class="faq-group">
            <h2 class="faq-group-title">
                <i data-lucide="${CAT_ICON[cat] || 'help-circle'}"></i> ${esc(cat)}
                <span class="badge badge-muted" style="margin-left:4px">${items.length}</span>
            </h2>
            <div class="accordion" data-single="false">
                ${items.map(f => `
                <div class="acc-item">
                    <button class="acc-head">
                        <span>${highlight(f.q)}</span>
                        <span class="acc-icon"><i data-lucide="chevron-down"></i></span>
                    </button>
                    <div class="acc-body">
                        <div class="acc-body-inner">
                            ${highlight(f.a)}
                            <div class="flex items-center gap-4 mt-5 pt-4" style="border-top:1px solid var(--border-faint)">
                                <span class="text-muted" style="font-size:.79rem">Was this helpful?</span>
                                <button class="btn btn-secondary btn-xs" data-helpful="yes">
                                    <i data-lucide="thumbs-up"></i> Yes
                                </button>
                                <button class="btn btn-secondary btn-xs" data-helpful="no">
                                    <i data-lucide="thumbs-down"></i> No
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`).join('')}
            </div>
        </div>`).join('');

    icons();
    initAccordions(wrap);

    // Searching implies intent — open the first result so the answer is visible.
    if (query) {
        const first = wrap.querySelector('.acc-item');
        if (first) {
            first.classList.add('open');
            const body = first.querySelector('.acc-body');
            body.style.maxHeight = body.scrollHeight + 'px';
            first.querySelector('.acc-head').setAttribute('aria-expanded', 'true');
        }
    }

    bindFeedback();
}

function bindFeedback() {
    $$('[data-helpful]').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = btn.parentElement;
            const helpful = btn.dataset.helpful === 'yes';

            row.innerHTML = helpful
                ? `<span class="text-green" style="font-size:.82rem;display:inline-flex;align-items:center;gap:6px">
                       <i data-lucide="check" style="width:14px;height:14px"></i> Thanks for the feedback
                   </span>`
                : `<span style="font-size:.82rem;color:var(--text-secondary)">
                       Sorry that didn't help —
                       <a href="support.html" class="text-green" style="font-weight:600">ask our team</a>
                       and we'll sort it out.
                   </span>`;

            icons();
        });
    });
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

$('#faqSearch').addEventListener('input', debounce(e => {
    query = e.target.value.trim();

    // A search should look across everything, not just the open category.
    if (query && activeCat !== 'all') activeCat = 'all';

    renderNav();
    renderContent();
}, 260));

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

renderNav();
renderContent();

// Deep link: ?cat=Charging or ?q=deposit
const params = new URLSearchParams(location.search);
const urlCat = params.get('cat');
const urlQ = params.get('q');

if (urlQ) {
    query = urlQ;
    $('#faqSearch').value = urlQ;
    renderNav();
    renderContent();
} else if (urlCat && CATEGORIES.includes(urlCat)) {
    activeCat = urlCat;
    renderNav();
    renderContent();
}
