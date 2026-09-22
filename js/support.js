/* ==========================================================================
   EVRide — support.js
   Controller for support.html: categories, article search, live chat sim.
   ========================================================================== */

import Store from './storage.js';
import { SUPPORT_CATEGORIES, FAQS } from './data.js';
import { boot, fmt, $, $$, esc, icons, toast, debounce } from './main.js';
import mountChrome from './navbar.js';

boot();
mountChrome({ solidNav: true });

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

// Map a support category onto the FAQ categories that answer it.
const CAT_TO_FAQ = {
    booking:   ['Booking'],
    payment:   ['Payments'],
    vehicle:   ['EVs'],
    charging:  ['Charging'],
    cancel:    ['Cancellation'],
    account:   ['Account', 'Fleet'],
    emergency: ['Safety']
};

function renderCategories() {
    $('#supportGrid').innerHTML = SUPPORT_CATEGORIES.map((c, i) => {
        const faqCats = CAT_TO_FAQ[c.id] || [];
        const target = faqCats.length ? `faq.html?cat=${encodeURIComponent(faqCats[0])}` : 'faq.html';
        const isEmergency = c.id === 'emergency';

        return `
        <a href="${isEmergency ? '#emergency' : target}"
           class="support-card ${isEmergency ? 'emergency' : ''}"
           data-reveal data-reveal-delay="${i * 50}">
            <span class="support-icon"><i data-lucide="${esc(c.icon)}"></i></span>
            <h4 style="font-size:1.02rem">${esc(c.name)}</h4>
            <p style="font-size:.86rem;color:var(--text-secondary);line-height:1.65;flex:1">
                ${esc(c.desc)}
            </p>
            <div class="flex items-center justify-between gap-3 pt-3" style="border-top:1px solid var(--border-faint)">
                <span class="text-muted" style="font-size:.78rem">${c.articles} articles</span>
                <i data-lucide="arrow-right" style="width:15px;height:15px;color:var(--primary)"></i>
            </div>
        </a>`;
    }).join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Article search                                                      */
/* ------------------------------------------------------------------ */

$('#supportSearch').addEventListener('input', debounce(e => {
    const q = e.target.value.trim().toLowerCase();
    const hits = $('#searchHits');

    if (q.length < 2) { hits.hidden = true; return; }

    const matches = FAQS
        .filter(f => `${f.q} ${f.a} ${f.cat}`.toLowerCase().includes(q))
        .slice(0, 6);

    if (!matches.length) {
        hits.innerHTML = `
        <div class="card" style="text-align:left">
            <p style="font-size:.88rem;color:var(--text-secondary)">
                No articles match "<strong class="text-primary">${esc(e.target.value)}</strong>".
                Try the live chat below — we'll answer directly.
            </p>
        </div>`;
        hits.hidden = false;
        return;
    }

    hits.innerHTML = `
    <div class="card" style="text-align:left;padding:var(--s-3)">
        <div class="article-list">
            ${matches.map(f => `
            <a href="faq.html?q=${encodeURIComponent(f.q.slice(0, 40))}" class="article-row">
                <i data-lucide="file-text"></i>
                <span style="flex:1;min-width:0">${esc(f.q)}</span>
                <span class="badge badge-muted">${esc(f.cat)}</span>
            </a>`).join('')}
        </div>
    </div>`;
    hits.hidden = false;
    icons();
}, 250));

/* ------------------------------------------------------------------ */
/* Popular articles                                                    */
/* ------------------------------------------------------------------ */

function renderPopular() {
    const popular = [
        FAQS.find(f => f.q.includes('cancellation policy')),
        FAQS.find(f => f.q.includes('battery runs low')),
        FAQS.find(f => f.q.includes('security deposit')),
        FAQS.find(f => f.q.includes('reserve a charging slot')),
        FAQS.find(f => f.q.includes('documents')),
        FAQS.find(f => f.q.includes('refunds take'))
    ].filter(Boolean);

    $('#popularArticles').innerHTML = popular.map(f => `
        <a href="faq.html?q=${encodeURIComponent(f.q.slice(0, 40))}" class="article-row">
            <i data-lucide="file-text"></i>
            <span style="flex:1;min-width:0">${esc(f.q)}</span>
        </a>`).join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* Live chat simulation                                                */
/* ------------------------------------------------------------------ */

const CHAT_KEY = 'evride:supportChat';

let chat = [];

function loadChat() {
    try {
        const raw = sessionStorage.getItem(CHAT_KEY);
        chat = raw ? JSON.parse(raw) : [];
    } catch (_) { chat = []; }

    if (!chat.length) {
        const user = Store.getUser();
        chat = [{
            from: 'agent',
            text: user
                ? `Hi ${user.name.split(' ')[0]} — you're through to EVRide support. What can I help with today?`
                : `Hi there — you're through to EVRide support. What can I help with today?`,
            at: Date.now()
        }];
        saveChat();
    }
}

function saveChat() {
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(chat.slice(-40))); } catch (_) {}
}

function paintChat() {
    const body = $('#chatBody');
    body.innerHTML = chat.map(m => `
        <div class="chat-msg ${m.from === 'user' ? 'out' : ''}">
            ${m.from === 'agent'
                ? '<div class="avatar avatar-sm avatar-blue" style="flex-shrink:0">VS</div>'
                : ''}
            <div>
                <div class="chat-bubble">${esc(m.text)}</div>
                <span class="chat-time">${fmt.time(m.at)}</span>
            </div>
        </div>`).join('');

    body.scrollTop = body.scrollHeight;
}

/**
 * Keyword-routed replies. Deliberately narrow: it answers the handful of
 * things it genuinely knows and hands everything else to a human, rather
 * than pretending to be a general-purpose assistant.
 */
const REPLIES = [
    {
        match: /cancel|cancellation/i,
        text: 'You can cancel from My Bookings in your dashboard. Free up to 24 hours before pickup with a full refund; 75% between 24 and 6 hours; 50% under 6 hours. Want me to pull up a specific booking?'
    },
    {
        match: /refund|money back|charged twice/i,
        text: 'Refunds are initiated the moment you cancel. Cards usually show the credit in 5–7 working days, UPI and wallets same-day. If it has been longer than that, give me your booking ID and I will chase it.'
    },
    {
        match: /charg|charger|plug|kwh/i,
        text: 'If a charger will not start, try unplugging and re-seating the connector first — that fixes it about half the time. Still stuck? Tell me the station name and bay number and I will reset it remotely.'
    },
    {
        match: /extend|longer|more days/i,
        text: 'You can extend from My Bookings → Modify, as long as nobody has reserved the car after you. The system checks availability live and quotes the difference before you commit.'
    },
    {
        match: /battery|range|out of charge|stranded/i,
        text: 'If you are below 10% we can send a mobile charging unit free of charge — call 1800-EVRIDE-911 and we will dispatch to your live location. Otherwise, tap Find Charging in the app for the nearest free bay.'
    },
    {
        match: /deposit|hold|security/i,
        text: 'The refundable hold is ₹5,000 for standard vehicles and ₹15,000 for luxury and performance models. It is released automatically 5–7 working days after you return the car.'
    },
    {
        match: /document|licence|license|kyc|verif/i,
        text: 'We need a driving licence held at least one year, one government photo ID, and the payment card used for the booking. Upload them once in your profile and verification usually clears within fifteen minutes.'
    },
    {
        match: /accident|crash|emergency|breakdown/i,
        text: 'Please call 1800-EVRIDE-911 straight away rather than waiting on chat — that line is staffed 24/7 and we can see your vehicle location immediately. Are you somewhere safe right now?'
    },
    {
        match: /price|cost|how much|rate/i,
        text: 'Rates start at ₹950/day for a compact and run to ₹24,800/day for a Model S Plaid. Every price on the site includes tax, and booking 7+ days automatically knocks 12% off.'
    },
    {
        match: /thank|thanks|cheers|great|perfect/i,
        text: 'Happy to help. Anything else I can sort out for you?'
    }
];

function agentReply(userText) {
    const hit = REPLIES.find(r => r.match.test(userText));

    if (hit) return hit.text;

    // No confident match — escalate rather than guess.
    return 'I want to get this right rather than guess, so I am passing you to a specialist who handles this area. They will pick up in under two minutes — or call +91 80 4567 8900 if you would rather talk it through now.';
}

$('#chatForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#chatInput');
    const text = input.value.trim();
    if (!text) return;

    chat.push({ from: 'user', text, at: Date.now() });
    saveChat();
    paintChat();
    input.value = '';

    const typing = $('#chatTyping');
    typing.hidden = false;
    $('#chatBody').scrollTop = $('#chatBody').scrollHeight;

    // Longer messages get a slightly longer "typing" pause — feels human.
    const delay = Math.min(2400, 900 + text.length * 22);

    setTimeout(() => {
        typing.hidden = true;
        chat.push({ from: 'agent', text: agentReply(text), at: Date.now() });
        saveChat();
        paintChat();
    }, delay);
});

$$('[data-quick-msg]').forEach(chip => {
    chip.addEventListener('click', () => {
        $('#chatInput').value = chip.dataset.quickMsg;
        $('#chatForm').dispatchEvent(new Event('submit'));
    });
});

$('#clearChat')?.addEventListener('click', () => {
    chat = [];
    try { sessionStorage.removeItem(CHAT_KEY); } catch (_) {}
    loadChat();
    paintChat();
    toast('Chat reset', 'info');
});

/* ------------------------------------------------------------------ */
/* Platform status                                                     */
/* ------------------------------------------------------------------ */

function renderStatus() {
    const systems = [
        { name: 'Booking &amp; search',      uptime: '99.98%', status: 'operational' },
        { name: 'Payments &amp; billing',    uptime: '99.99%', status: 'operational' },
        { name: 'Live vehicle telemetry',    uptime: '99.94%', status: 'operational' },
        { name: 'Charging network API',      uptime: '99.91%', status: 'operational' },
        { name: 'Mobile apps',               uptime: '99.97%', status: 'operational' },
        { name: 'Notifications',             uptime: '99.89%', status: 'operational' }
    ];

    $('#statusList').innerHTML = systems.map(s => `
        <div class="setting-row">
            <div class="setting-row-body">
                <strong>${s.name}</strong>
                <span>30-day uptime ${s.uptime}</span>
            </div>
            <span class="status status-available status-static">
                <span class="status-dot"></span>Operational
            </span>
        </div>`).join('');
}

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

renderCategories();
renderPopular();
renderStatus();
loadChat();
paintChat();

// Deep link to the emergency block.
if (location.hash === '#emergency') {
    setTimeout(() => {
        $('#emergency')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
}
