/* ==========================================================================
   EVRide — success.js
   Controller for booking-success.html: confirmation ticket, QR code,
   confetti and the download/track actions.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { boot, fmt, $, $$, esc, icons, toast } from './main.js';
import mountChrome from './navbar.js';

boot();
mountChrome({ solidNav: true });

/* ------------------------------------------------------------------ */
/* Resolve the booking                                                 */
/* ------------------------------------------------------------------ */

const params = new URLSearchParams(location.search);
const bookingId = params.get('id') || sessionStorage.getItem('evride:lastBooking');
const booking = bookingId ? Store.getBooking(bookingId) : null;

if (!booking) {
    $('#ticket').innerHTML = `
    <div class="empty" style="padding:60px 20px">
        <div class="empty-icon"><i data-lucide="search-x"></i></div>
        <h4>Booking not found</h4>
        <p>We couldn't find that booking reference. It may have been cancelled, or the link may be incomplete.</p>
        <div class="flex gap-3 justify-center mt-6 flex-wrap">
            <a href="customer-dashboard.html#bookings" class="btn btn-primary">View my bookings</a>
            <a href="explore-evs.html" class="btn btn-secondary">Browse vehicles</a>
        </div>
    </div>`;
    $('#bookingIdText').textContent = '—';
    $('#successSub').textContent = 'We could not load this booking.';
    icons();
} else {
    renderTicket(booking);
    fireConfetti();
}

/* ------------------------------------------------------------------ */
/* QR code — generated as SVG, no library                              */
/* ------------------------------------------------------------------ */

/**
 * A real QR encoder is overkill for a demo key. This renders a
 * deterministic, QR-shaped matrix from the booking ID: finder patterns in
 * three corners plus a hash-seeded data field. It scans as an image, not as
 * a real code, which is the honest behaviour for a simulated digital key.
 */
function qrSvg(text, modules = 25) {
    // Simple deterministic hash → PRNG so the same booking always renders
    // the same pattern.
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    let seed = h >>> 0;
    const rand = () => {
        seed ^= seed << 13; seed >>>= 0;
        seed ^= seed >> 17;
        seed ^= seed << 5;  seed >>>= 0;
        return seed / 4294967296;
    };

    const grid = Array.from({ length: modules }, () => Array(modules).fill(0));

    // Finder pattern: 7×7 concentric square.
    const finder = (r0, c0) => {
        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                const edge = r === 0 || r === 6 || c === 0 || c === 6;
                const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                grid[r0 + r][c0 + c] = (edge || core) ? 1 : 0;
            }
        }
    };

    finder(0, 0);
    finder(0, modules - 7);
    finder(modules - 7, 0);

    const inFinder = (r, c) =>
        (r < 8 && c < 8) ||
        (r < 8 && c >= modules - 8) ||
        (r >= modules - 8 && c < 8);

    // Timing patterns.
    for (let i = 8; i < modules - 8; i++) {
        grid[6][i] = i % 2 === 0 ? 1 : 0;
        grid[i][6] = i % 2 === 0 ? 1 : 0;
    }

    // Data field.
    for (let r = 0; r < modules; r++) {
        for (let c = 0; c < modules; c++) {
            if (inFinder(r, c) || r === 6 || c === 6) continue;
            grid[r][c] = rand() > 0.52 ? 1 : 0;
        }
    }

    const cells = [];
    for (let r = 0; r < modules; r++) {
        for (let c = 0; c < modules; c++) {
            if (grid[r][c]) cells.push(`<rect x="${c}" y="${r}" width="1" height="1"/>`);
        }
    }

    return `<svg viewBox="0 0 ${modules} ${modules}" shape-rendering="crispEdges"
                 role="img" aria-label="Digital key QR code for booking ${esc(text)}">
        <rect width="${modules}" height="${modules}" fill="#fff"/>
        <g fill="#050B10">${cells.join('')}</g>
    </svg>`;
}

/* ------------------------------------------------------------------ */
/* Ticket                                                              */
/* ------------------------------------------------------------------ */

function renderTicket(b) {
    const start = new Date(b.pickupDate);
    const end = new Date(b.returnDate);
    const v = Store.getVehicle(b.vehicleId);
    const invoice = Store.getInvoices().find(i => i.bookingId === b.id);

    $('#bookingIdText').textContent = b.id;
    $('#successSub').innerHTML =
        `Your <strong class="text-primary">${esc(b.vehicleName)}</strong> is reserved for
         ${fmt.date(start)} at ${fmt.time(start)}. We've emailed the details and your digital key.`;

    $('#ticket').innerHTML = `
    <div class="ticket-head">
        <img src="${esc(b.vehicleImage)}" alt="${esc(b.vehicleName)}" data-fallback="${esc(b.vehicleBrand)}">
        <div class="ticket-head-body">
            <span class="v-brand">${esc(b.vehicleBrand)}</span>
            <h3 style="font-size:1.35rem;margin-bottom:8px">${esc(b.vehicleName)}</h3>
            <div class="flex gap-3 flex-wrap items-center">
                <span class="badge badge-green">
                    <i data-lucide="check-circle" style="width:12px;height:12px"></i> Confirmed
                </span>
                <span class="badge badge-blue">${esc(b.plate)}</span>
                ${v ? `<span class="badge badge-muted">${Math.round(v.battery)}% charged</span>` : ''}
            </div>
        </div>
        <div style="text-align:right">
            <small class="text-muted" style="display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.1em">Total paid</small>
            <strong style="font-family:var(--font-display);font-size:1.9rem;color:var(--primary);letter-spacing:-.04em">
                ${fmt.money(b.amount)}
            </strong>
            <small class="text-muted" style="display:block;font-size:.76rem">${esc(b.paymentMethod)}</small>
        </div>
    </div>

    <div class="ticket-body">
        <div class="ticket-details">
            <div class="ticket-field">
                <small>Pickup location</small>
                <strong>${esc(b.pickupLocation)}</strong>
                <span>${b.deliveryMode === 'doorstep' ? 'Doorstep delivery' : 'Hub collection'}</span>
            </div>
            <div class="ticket-field">
                <small>Pickup</small>
                <strong>${fmt.date(start)}</strong>
                <span>${fmt.time(start)}</span>
            </div>
            <div class="ticket-field">
                <small>Return location</small>
                <strong>${esc(b.dropLocation)}</strong>
                <span>${b.dropLocation === b.pickupLocation ? 'Same as pickup' : 'Different location'}</span>
            </div>
            <div class="ticket-field">
                <small>Return</small>
                <strong>${fmt.date(end)}</strong>
                <span>${fmt.time(end)}</span>
            </div>
            <div class="ticket-field">
                <small>Duration</small>
                <strong>${fmt.plural(b.days, 'day')}</strong>
                <span>${b.days * 300} km included</span>
            </div>
            <div class="ticket-field">
                <small>Main driver</small>
                <strong>${esc(b.driver?.name || '—')}</strong>
                <span>${esc(b.driver?.phone || '')}</span>
            </div>
            <div class="ticket-field">
                <small>Payment status</small>
                <strong class="text-green">Paid in full</strong>
                <span>${invoice ? esc(invoice.id) : ''}</span>
            </div>
            <div class="ticket-field">
                <small>Security deposit</small>
                <strong>${fmt.money(b.deposit || 5000)}</strong>
                <span>Refundable, held at pickup</span>
            </div>
        </div>

        <div class="qr-block">
            <div class="qr-code">${qrSvg(b.id)}</div>
            <p class="qr-note">
                <strong class="text-primary">Your digital key</strong><br>
                Scan at the vehicle to unlock, or tap Unlock in the EVRide app.
            </p>
        </div>
    </div>

    <div class="ticket-foot">
        <a href="customer-dashboard.html#bookings" class="btn btn-secondary">
            <i data-lucide="calendar-check"></i> View Booking
        </a>
        <a href="live-tracking.html?booking=${esc(b.id)}" class="btn btn-secondary">
            <i data-lucide="navigation"></i> Track Vehicle
        </a>
        <button class="btn btn-secondary" id="downloadInvoice">
            <i data-lucide="download"></i> Download Invoice
        </button>
        <a href="customer-dashboard.html" class="btn btn-primary">
            <i data-lucide="layout-dashboard"></i> Back to Dashboard
        </a>
    </div>`;

    icons();
    bindActions(b, invoice);
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

function bindActions(b, invoice) {
    $('#copyId')?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(b.id);
            toast(`Booking ID ${b.id} copied`, 'success');
        } catch (_) {
            // Clipboard API needs a secure context; fall back to selection.
            const range = document.createRange();
            range.selectNode($('#bookingIdText'));
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            toast('Booking ID selected — press Ctrl+C to copy', 'info');
        }
    });

    $('#downloadInvoice')?.addEventListener('click', () => {
        if (invoice) {
            location.href = `invoices.html?id=${invoice.id}&print=1`;
        } else {
            location.href = 'invoices.html';
        }
    });
}

/* ------------------------------------------------------------------ */
/* Confetti                                                            */
/* ------------------------------------------------------------------ */

function fireConfetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const colors = ['#00E676', '#00C8FF', '#8B5CF6', '#69F0AE', '#FFFFFF'];
    const hero = document.querySelector('.success-hero');
    if (!hero) return;

    for (let i = 0; i < 44; i++) {
        const piece = document.createElement('span');
        piece.className = 'confetti';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.top = '20%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = (Math.random() * 0.7) + 's';
        piece.style.animationDuration = (2.2 + Math.random() * 1.4) + 's';
        piece.style.opacity = 0.7 + Math.random() * 0.3;
        hero.appendChild(piece);
        setTimeout(() => piece.remove(), 4200);
    }
}

/* ------------------------------------------------------------------ */
/* Keep the live battery reading fresh on the ticket                   */
/* ------------------------------------------------------------------ */

if (booking) {
    RT.on('vehicles', () => {
        const v = Store.getVehicle(booking.vehicleId);
        if (!v) return;
        const badge = $$('.ticket-head .badge-muted')[0];
        if (badge) badge.textContent = `${Math.round(v.battery)}% charged`;
    });
}
