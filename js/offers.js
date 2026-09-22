/* ==========================================================================
   EVRide — offers.js
   Controller for offers.html.
   ========================================================================== */

import Store from './storage.js';
import { OFFERS } from './data.js';
import { boot, fmt, $, $$, esc, icons, toast, initAccordions, refreshReveal } from './main.js';
import mountChrome from './navbar.js';

boot();
mountChrome({ solidNav: true });

/* ------------------------------------------------------------------ */
/* Countdown — ends at midnight on the last day of the current month   */
/* ------------------------------------------------------------------ */

function nextDeadline() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
}

const deadline = nextDeadline();

function tickCountdown() {
    const diff = Math.max(0, deadline - Date.now());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff / 3600000) % 24;
    const mins = Math.floor(diff / 60000) % 60;
    const secs = Math.floor(diff / 1000) % 60;

    const set = (key, value) => {
        const node = $(`[data-cd="${key}"]`);
        const v = String(value).padStart(2, '0');
        if (node && node.textContent !== v) node.textContent = v;
    };

    set('days', days);
    set('hours', hours);
    set('mins', mins);
    set('secs', secs);
}

tickCountdown();
setInterval(tickCountdown, 1000);

/* ------------------------------------------------------------------ */
/* Offer grid                                                          */
/* ------------------------------------------------------------------ */

let offerFilter = 'all';

function renderOffers() {
    const list = offerFilter === 'all'
        ? OFFERS
        : OFFERS.filter(o => o.badge === offerFilter);

    const grid = $('#offerGrid');

    if (!list.length) {
        grid.innerHTML = `
        <div class="empty" style="grid-column:1/-1">
            <div class="empty-icon"><i data-lucide="tag"></i></div>
            <h4>No offers in this category right now</h4>
            <p>Check back soon, or browse all offers.</p>
        </div>`;
        icons();
        return;
    }

    grid.innerHTML = list.map((o, i) => {
        const daysLeft = Math.ceil((new Date(o.expires) - Date.now()) / 86400000);
        return `
        <article class="offer-card c-${esc(o.color)}" data-reveal data-reveal-delay="${i * 60}">
            <div class="offer-head">
                <div>
                    <span class="badge badge-${o.color === 'green' ? 'green' : o.color === 'blue' ? 'blue' : 'purple'} mb-3">
                        ${esc(o.badge)}
                    </span>
                    <h3 class="offer-title">${esc(o.title)}</h3>
                </div>
                <span class="offer-discount">${esc(o.discount)}</span>
            </div>

            <p class="offer-desc">${esc(o.desc)}</p>

            <div class="offer-code-row">
                <i data-lucide="tag" style="width:15px;height:15px;color:var(--primary)"></i>
                <code>${esc(o.code)}</code>
                <button class="btn btn-primary btn-xs" data-copy-code="${esc(o.code)}">
                    <i data-lucide="copy"></i> Copy
                </button>
            </div>

            <div class="offer-meta">
                <span><i data-lucide="calendar"></i> ${daysLeft > 0 ? `${daysLeft} days left` : 'Expired'}</span>
                <span><i data-lucide="wallet"></i> Max ${esc(o.cap)}</span>
            </div>

            <details class="offer-terms">
                <summary><i data-lucide="chevron-down"></i> Terms &amp; conditions</summary>
                <ul>${o.terms.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
            </details>

            <a href="404.html" class="btn btn-secondary btn-sm btn-block">
                Browse eligible EVs <i data-lucide="arrow-right"></i>
            </a>
        </article>`;
    }).join('');

    icons();
    refreshReveal(grid);
}

$$('[data-of]').forEach(chip => {
    chip.addEventListener('click', () => {
        $$('[data-of]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        offerFilter = chip.dataset.of;
        renderOffers();
    });
});

/* ------------------------------------------------------------------ */
/* Subscription plans                                                  */
/* ------------------------------------------------------------------ */

const PLANS = [
    {
        name: 'City',
        price: 24900,
        desc: 'For short urban commutes',
        featured: false,
        features: [
            { text: 'Compact and hatchback EVs', on: true },
            { text: '1,200 km per month included', on: true },
            { text: 'Insurance &amp; servicing included', on: true },
            { text: 'Swap vehicle once a month', on: true },
            { text: 'Free home charging installation', on: false },
            { text: 'Priority vehicle allocation', on: false }
        ]
    },
    {
        name: 'Commuter',
        price: 42900,
        desc: 'The everyday all-rounder',
        featured: true,
        features: [
            { text: 'Sedans, SUVs and hatchbacks', on: true },
            { text: '2,500 km per month included', on: true },
            { text: 'Insurance &amp; servicing included', on: true },
            { text: 'Swap vehicle twice a month', on: true },
            { text: 'Free home charging installation', on: true },
            { text: 'Priority vehicle allocation', on: false }
        ]
    },
    {
        name: 'Executive',
        price: 89900,
        desc: 'Premium and luxury EVs',
        featured: false,
        features: [
            { text: 'Every vehicle including luxury', on: true },
            { text: 'Unlimited kilometres', on: true },
            { text: 'Insurance &amp; servicing included', on: true },
            { text: 'Unlimited vehicle swaps', on: true },
            { text: 'Free home charging installation', on: true },
            { text: 'Priority vehicle allocation', on: true }
        ]
    }
];

function renderPlans() {
    $('#planGrid').innerHTML = PLANS.map((p, i) => `
        <div class="plan ${p.featured ? 'featured' : ''}" data-reveal data-reveal-delay="${i * 80}">
            ${p.featured ? '<span class="plan-badge">Most popular</span>' : ''}
            <div>
                <h3 class="plan-name">${esc(p.name)}</h3>
                <p class="text-muted" style="font-size:.85rem">${esc(p.desc)}</p>
            </div>
            <div class="plan-price">
                <strong>${fmt.money(p.price)}</strong>
                <span>/ month</span>
            </div>
            <div class="plan-features">
                ${p.features.map(f => `
                <div class="plan-feature ${f.on ? '' : 'off'}">
                    <i data-lucide="${f.on ? 'check' : 'minus'}"></i>
                    <span>${f.text}</span>
                </div>`).join('')}
            </div>
            <button class="btn ${p.featured ? 'btn-primary' : 'btn-secondary'} btn-block" data-plan="${esc(p.name)}">
                Choose ${esc(p.name)}
            </button>
        </div>`).join('');

    icons();
    refreshReveal($('#planGrid'));

    $$('[data-plan]').forEach(btn => {
        btn.addEventListener('click', () => {
            toast(`${btn.dataset.plan} plan selected — our team will call you within the hour to set it up.`,
                'success', 'Subscription request');
        });
    });
}

/* ------------------------------------------------------------------ */
/* Copy-to-clipboard                                                   */
/* ------------------------------------------------------------------ */

document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-copy-code]');
    if (!btn) return;

    // Requested: this control routes to the 404 page instead of copying.
    location.href = '404.html';
    return;

    /* eslint-disable no-unreachable */
    const code = btn.dataset.copyCode;

    try {
        await navigator.clipboard.writeText(code);
        toast(`${code} copied — paste it at checkout`, 'success', 'Code copied');

        const original = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="check"></i> Copied';
        icons();
        setTimeout(() => { btn.innerHTML = original; icons(); }, 1800);
    } catch (_) {
        // Clipboard needs a secure context; show the code so it can be copied manually.
        toast(`Copy this code: ${code}`, 'info', 'Promo code');
    }
});

/* ------------------------------------------------------------------ */
/* Referral share                                                      */
/* ------------------------------------------------------------------ */

$$('[data-share]').forEach(btn => {
    btn.addEventListener('click', async () => {
        const code = $('#referralCode').textContent.trim();
        const link = `${location.origin}${location.pathname.replace('offers.html', 'register.html')}?ref=${code}`;
        const message = `I'm using EVRide for electric car rentals — use my code ${code} and we both get ₹500. ${link}`;

        switch (btn.dataset.share) {
            case 'whatsapp':
                window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
                break;
            case 'email':
                location.href = `mailto:?subject=${encodeURIComponent('₹500 off your first EVRide ride')}&body=${encodeURIComponent(message)}`;
                break;
            default:
                try {
                    await navigator.clipboard.writeText(link);
                    toast('Referral link copied', 'success');
                } catch (_) {
                    toast(link, 'info', 'Your referral link');
                }
        }
    });
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

renderOffers();
renderPlans();
initAccordions();

// Personalise the referral code from the signed-in user, if there is one.
const user = Store.getUser();
if (user) {
    const initials = fmt.initials(user.name).replace(/[^A-Z]/g, '') || 'EV';
    const suffix = String(Math.abs(
        [...user.email].reduce((a, c) => a + c.charCodeAt(0), 0)
    )).slice(-4);
    const code = `EVRIDE-${initials}${suffix}`;
    $('#referralCode').textContent = code;
    $$('[data-copy-code="EVRIDE-SP4821"]').forEach(b => { b.dataset.copyCode = code; });
}
