/* ==========================================================================
   EVRide — contact.js
   Controller for contact.html.
   ========================================================================== */

import Store from './storage.js';
import { FAQS, CITY } from './data.js';
import { boot, fmt, $, $$, esc, icons, toast, initAccordions } from './main.js';
import mountChrome from './navbar.js';
import { createMap } from './map.js';

boot();
mountChrome({ solidNav: true });

let topic = 'support';

/* ------------------------------------------------------------------ */
/* Topic picker — reveals the booking field where it's relevant        */
/* ------------------------------------------------------------------ */

$$('[data-topic]').forEach(chip => {
    chip.addEventListener('click', () => {
        $$('[data-topic]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        topic = chip.dataset.topic;

        const needsBooking = ['booking', 'billing', 'support'].includes(topic);
        $('#bookingField').style.display = needsBooking ? '' : 'none';

        // Corporate and press get routed elsewhere; say so rather than
        // silently sending it into the general queue.
        if (topic === 'corporate') {
            toast('For a faster response, use the proposal form on the Corporate page.', 'info');
        }
    });
});

/* ------------------------------------------------------------------ */
/* Character counter                                                   */
/* ------------------------------------------------------------------ */

const message = $('#ctMessage');
const MAX_CHARS = 1000;

message?.addEventListener('input', () => {
    if (message.value.length > MAX_CHARS) {
        message.value = message.value.slice(0, MAX_CHARS);
    }
    const n = message.value.length;
    const counter = $('#charCount');
    counter.textContent = `${n} / ${MAX_CHARS}`;
    counter.style.color = n > MAX_CHARS * 0.9 ? 'var(--warning)' : '';

    message.classList.remove('error');
    message.closest('.field').querySelector('.field-error')?.classList.remove('show');
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function showError(input, show = true) {
    input.classList.toggle('error', show);
    input.closest('.field')?.querySelector('.field-error')?.classList.toggle('show', show);
}

['#ctName', '#ctEmail', '#ctSubject'].forEach(sel => {
    $(sel)?.addEventListener('input', () => showError($(sel), false));
});

$('#contactForm')?.addEventListener('submit', e => {
    e.preventDefault();

    const name = $('#ctName');
    const email = $('#ctEmail');
    const subject = $('#ctSubject');
    const consent = $('#ctConsent');

    let valid = true;

    if (name.value.trim().length < 2) { showError(name); valid = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) { showError(email); valid = false; }
    if (subject.value.trim().length < 3) { showError(subject); valid = false; }
    if (message.value.trim().length < 10) { showError(message); valid = false; }

    if (!consent.checked) {
        consent.closest('.check').classList.add('shake');
        setTimeout(() => consent.closest('.check').classList.remove('shake'), 500);
        toast('Please tick the consent box so we can reply', 'warning');
        valid = false;
    }

    if (!valid) {
        toast('Please complete the highlighted fields', 'error');
        $('#contactForm .input.error, #contactForm .textarea.error')?.focus();
        return;
    }

    const btn = $('#ctSubmit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending…';

    setTimeout(() => {
        const ticket = {
            id: 'TK-' + Date.now().toString(36).toUpperCase().slice(-5),
            topic,
            name: name.value.trim(),
            email: email.value.trim(),
            phone: $('#ctPhone').value.trim(),
            bookingId: $('#ctBooking')?.value.trim() || null,
            subject: subject.value.trim(),
            message: message.value.trim(),
            status: 'open',
            createdAt: Date.now()
        };

        Store.saveTicket(ticket);

        // Expected turnaround varies by topic — be specific rather than vague.
        const sla = {
            support:   'under 2 hours',
            booking:   'under 1 hour',
            billing:   'within 4 hours',
            corporate: 'within 1 working day',
            partner:   'within 2 working days',
            press:     'within 1 working day'
        }[topic] || 'within 1 working day';

        $('#contactForm').innerHTML = `
        <div style="text-align:center;padding-block:32px">
            <div class="auth-success-icon success-pop" style="width:80px;height:80px;margin-bottom:26px">
                <svg viewBox="0 0 52 52" fill="none" stroke="currentColor" stroke-width="3.5"
                     stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 27l8 8 16-16" class="check-draw"/>
                </svg>
            </div>
            <h3 style="font-size:1.4rem;margin-bottom:12px">Message received</h3>
            <p class="text-secondary" style="font-size:.95rem;line-height:1.75;margin-bottom:26px;max-width:420px;margin-inline:auto">
                Thanks, ${esc(ticket.name.split(' ')[0])}. We've logged this as
                <strong class="text-primary mono">${esc(ticket.id)}</strong> and will reply to
                <strong class="text-primary">${esc(ticket.email)}</strong> ${esc(sla)}.
            </p>
            <div class="card-glass" style="text-align:left;max-width:420px;margin-inline:auto">
                <div class="meta-list">
                    <div class="meta-row">
                        <span class="meta-k">Reference</span>
                        <span class="meta-v mono">${esc(ticket.id)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Topic</span>
                        <span class="meta-v">${esc(topic[0].toUpperCase() + topic.slice(1))}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Expected reply</span>
                        <span class="meta-v text-green">${esc(sla)}</span>
                    </div>
                </div>
            </div>
            <div class="flex gap-3 justify-center mt-8 flex-wrap">
                <a href="support.html" class="btn btn-secondary">Browse help articles</a>
                <button class="btn btn-primary" onclick="location.reload()">Send another</button>
            </div>
        </div>`;

        icons();
        toast(`Message sent — reference ${ticket.id}`, 'success', 'Thanks for getting in touch');
    }, 1100);
});

/* ------------------------------------------------------------------ */
/* Support hours                                                       */
/* ------------------------------------------------------------------ */

const HOURS = [
    { day: 'Monday',    open: 8,  close: 21 },
    { day: 'Tuesday',   open: 8,  close: 21 },
    { day: 'Wednesday', open: 8,  close: 21 },
    { day: 'Thursday',  open: 8,  close: 21 },
    { day: 'Friday',    open: 8,  close: 21 },
    { day: 'Saturday',  open: 9,  close: 18 },
    { day: 'Sunday',    open: 10, close: 17 }
];

function renderHours() {
    const now = new Date();
    // JS weeks start on Sunday; our list starts on Monday.
    const todayIndex = (now.getDay() + 6) % 7;
    const hour = now.getHours() + now.getMinutes() / 60;

    $('#hoursList').innerHTML = HOURS.map((h, i) => `
        <div class="office-hours-row ${i === todayIndex ? 'today' : ''}">
            <span>${esc(h.day)}${i === todayIndex ? ' (today)' : ''}</span>
            <span>${String(h.open).padStart(2, '0')}:00 – ${String(h.close).padStart(2, '0')}:00</span>
        </div>`).join('');

    const today = HOURS[todayIndex];
    const isOpen = hour >= today.open && hour < today.close;
    const badge = $('#openNow');

    if (isOpen) {
        badge.className = 'badge badge-green';
        badge.textContent = 'Open now';
    } else {
        badge.className = 'badge badge-muted';
        const nextOpen = hour < today.open
            ? `Opens at ${String(today.open).padStart(2, '0')}:00`
            : 'Closed — opens tomorrow';
        badge.textContent = nextOpen;
    }
}

renderHours();
setInterval(renderHours, 60000);

/* ------------------------------------------------------------------ */
/* Office map                                                          */
/* ------------------------------------------------------------------ */

const OFFICE = { lat: 12.9784, lng: 77.6408 };

const officeMap = createMap('officeMap', { center: [OFFICE.lat, OFFICE.lng], zoom: 15 });
if (officeMap) {
    officeMap.addMarker('office', OFFICE.lat, OFFICE.lng, {
        status: 'available',
        pulsing: true,
        popup: `<div class="map-popup">
            <h6>EVRide Mobility Tower</h6>
            <p style="font-size:.79rem;margin:0">100 Feet Road, Indiranagar, Bengaluru 560038</p>
        </div>`
    });
    officeMap.invalidate();
}

$('#directionsBtn')?.addEventListener('click', () => {
    window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${OFFICE.lat},${OFFICE.lng}`,
        '_blank', 'noopener'
    );
});

/* ------------------------------------------------------------------ */
/* FAQ shortcut                                                        */
/* ------------------------------------------------------------------ */

// The questions support actually fields most often.
const COMMON = ['Booking', 'Cancellation', 'Payments', 'Charging', 'Safety'];

const picked = COMMON
    .map(cat => FAQS.find(f => f.cat === cat))
    .filter(Boolean);

$('#contactFaq').innerHTML = picked.map(f => `
    <div class="acc-item">
        <button class="acc-head">
            <span>${esc(f.q)}</span>
            <span class="acc-icon"><i data-lucide="chevron-down"></i></span>
        </button>
        <div class="acc-body">
            <div class="acc-body-inner">${esc(f.a)}</div>
        </div>
    </div>`).join('');

icons();
initAccordions();

/* ------------------------------------------------------------------ */
/* Prefill from a signed-in user                                       */
/* ------------------------------------------------------------------ */

const user = Store.getUser();
if (user) {
    if ($('#ctName')) $('#ctName').value = user.name || '';
    if ($('#ctEmail')) $('#ctEmail').value = user.email || '';
    if ($('#ctPhone')) $('#ctPhone').value = user.phone || '';
}

// Deep link: ?topic=billing&booking=EV2048
const params = new URLSearchParams(location.search);
const urlTopic = params.get('topic');
if (urlTopic) {
    const chip = $(`[data-topic="${urlTopic}"]`);
    if (chip) chip.click();
}
const urlBooking = params.get('booking');
if (urlBooking && $('#ctBooking')) {
    $('#ctBooking').value = urlBooking;
    $('#bookingField').style.display = '';
}
