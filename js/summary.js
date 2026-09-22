/* ==========================================================================
   EVRide — summary.js
   Controller for booking-summary.html.
   ========================================================================== */

import Store from './storage.js';
import { LOCATIONS } from './data.js';
import { boot, fmt, $, esc, icons, toast, initAccordions } from './main.js';
import mountChrome from './navbar.js';
import { getDraft, tripDates, tripDuration, calculateQuote, renderSummaryPanel } from './booking.js';

boot();
mountChrome({ solidNav: true });

const draft = getDraft();

/* ------------------------------------------------------------------ */
/* Guard: no draft means nothing to review                             */
/* ------------------------------------------------------------------ */

if (!draft.vehicleId || !Store.getVehicle(draft.vehicleId)) {
    $('#reviewBody').innerHTML = `
    <div class="empty">
        <div class="empty-icon"><i data-lucide="clipboard-x"></i></div>
        <h4>No booking in progress</h4>
        <p>Start by choosing an electric vehicle, and your review will appear here.</p>
        <a href="explore-evs.html" class="btn btn-primary mt-6">
            <i data-lucide="car"></i> Browse vehicles
        </a>
    </div>`;
    $('#toPayment').classList.add('is-disabled');
    icons();
} else {
    renderReview();
}

/* ------------------------------------------------------------------ */
/* Review body                                                         */
/* ------------------------------------------------------------------ */

function renderReview() {
    const quote = calculateQuote(draft);
    const v = quote.vehicle;
    const { start, end } = tripDates(draft);
    const { days } = tripDuration(draft);

    const pickupLabel = draft.deliveryMode === 'doorstep'
        ? draft.pickupAddress
        : (LOCATIONS.find(l => l.id === draft.pickupLocationId)?.name || v.locationName);

    const dropLabel = draft.sameReturn
        ? pickupLabel
        : (LOCATIONS.find(l => l.id === draft.dropLocationId)?.name || pickupLabel);

    $('#reviewBody').innerHTML = `
    <!-- Vehicle -->
    <div class="bk-section">
        <div class="bk-section-title"><i data-lucide="car"></i> Your vehicle</div>
        <div class="flex gap-5 flex-wrap items-center card-glass">
            <img src="${esc(v.image)}" alt="${esc(v.name)}" data-fallback="${esc(v.brand)}"
                 style="width:168px;height:112px;object-fit:cover;border-radius:12px;background:var(--card-light)">
            <div style="flex:1;min-width:200px">
                <span class="v-brand">${esc(v.brand)} · ${v.year}</span>
                <h3 style="font-size:1.25rem;margin-bottom:8px">${esc(v.name)}</h3>
                <div class="flex gap-4 flex-wrap" style="font-size:.82rem;color:var(--text-secondary)">
                    <span><i data-lucide="hash" style="width:13px;height:13px"></i> ${esc(v.plate)}</span>
                    <span><i data-lucide="users" style="width:13px;height:13px"></i> ${v.seats} seats</span>
                    <span><i data-lucide="zap" style="width:13px;height:13px"></i> ${esc(v.connector)}</span>
                    <span><i data-lucide="star" style="width:13px;height:13px"></i> ${v.rating}</span>
                </div>
                <div class="flex gap-4 mt-4 flex-wrap items-center">
                    <span class="battery">
                        <span class="battery-shell">
                            <span class="battery-fill ${fmt.batteryClass(v.battery)}" style="width:${Math.round(v.battery)}%"></span>
                        </span>
                        <span class="battery-val">${Math.round(v.battery)}%</span>
                    </span>
                    <span class="text-muted" style="font-size:.82rem">${v.range} km live range</span>
                    <span class="status status-${esc(v.status)}"><span class="status-dot"></span>${esc(fmt.statusLabel(v.status))}</span>
                </div>
            </div>
            <a href="ev-details.html?id=${esc(v.id)}" class="btn btn-secondary btn-sm">View details</a>
        </div>
    </div>

    <!-- Trip -->
    <div class="bk-section">
        <div class="bk-section-title"><i data-lucide="route"></i> Trip details</div>
        <div class="ticket-details">
            <div class="ticket-field">
                <small>Pickup</small>
                <strong>${esc(pickupLabel)}</strong>
                <span>${fmt.date(start)} at ${fmt.time(start)}</span>
            </div>
            <div class="ticket-field">
                <small>Return</small>
                <strong>${esc(dropLabel)}</strong>
                <span>${fmt.date(end)} at ${fmt.time(end)}</span>
            </div>
            <div class="ticket-field">
                <small>Duration</small>
                <strong>${fmt.plural(days, 'day')}</strong>
                <span>${days * 300} km included</span>
            </div>
            <div class="ticket-field">
                <small>Collection</small>
                <strong>${draft.deliveryMode === 'doorstep' ? 'Doorstep delivery' : 'Hub collection'}</strong>
                <span>${draft.deliveryMode === 'doorstep' ? 'Delivered &amp; collected' : 'No extra charge'}</span>
            </div>
        </div>
    </div>

    <!-- Driver -->
    <div class="bk-section">
        <div class="bk-section-title"><i data-lucide="user"></i> Main driver</div>
        <div class="ticket-details">
            <div class="ticket-field">
                <small>Name</small>
                <strong>${esc(draft.driver.name || '—')}</strong>
            </div>
            <div class="ticket-field">
                <small>Email</small>
                <strong style="font-size:.88rem;word-break:break-all">${esc(draft.driver.email || '—')}</strong>
            </div>
            <div class="ticket-field">
                <small>Phone</small>
                <strong>${esc(draft.driver.phone || '—')}</strong>
            </div>
            <div class="ticket-field">
                <small>Licence</small>
                <strong>${esc(draft.driver.licence || '—')}</strong>
            </div>
        </div>
    </div>

    <!-- Add-ons -->
    <div class="bk-section">
        <div class="bk-section-title"><i data-lucide="plus-circle"></i> Extras selected</div>
        ${quote.addonLines.length ? `
        <div class="meta-list">
            ${quote.addonLines.map(l => `
            <div class="meta-row">
                <span class="meta-k"><i data-lucide="check" style="width:13px;height:13px;color:var(--primary)"></i> ${esc(l.name)}
                    ${l.unit === 'day' ? `<span class="text-muted">× ${l.qty} days</span>` : ''}</span>
                <span class="meta-v">${fmt.money(l.amount)}</span>
            </div>`).join('')}
        </div>` : `
        <p class="text-muted" style="font-size:.88rem">
            No extras selected. <a href="booking.html" class="text-green">Add insurance or a charging package</a>.
        </p>`}
    </div>`;

    icons();
    initAccordions();
}

/* ------------------------------------------------------------------ */
/* Summary panel                                                       */
/* ------------------------------------------------------------------ */

function renderSummary() {
    renderSummaryPanel($('#summaryPanel'), draft, { showPromo: true });
    icons();
    bindPromo();
}

function bindPromo() {
    $('#promoApply')?.addEventListener('click', () => {
        const code = $('#promoInput').value.trim();
        if (!code) return;
        import('./booking.js').then(({ validatePromo, patchDraft, calculateQuote }) => {
            const q = calculateQuote({ ...draft, promoCode: null });
            const result = validatePromo(code, q.subtotal, q.days);
            if (!result || !result.valid) {
                toast(result?.reason || 'That promo code was not recognised.', 'error', 'Invalid code');
                return;
            }
            patchDraft({ promoCode: code.toUpperCase() });
            draft.promoCode = code.toUpperCase();
            renderSummary();
            renderReview();
            toast(`Saved ${fmt.money(result.amount)} with ${result.offer.code}`, 'success', 'Promo applied');
        });
    });

    $('#promoRemove')?.addEventListener('click', () => {
        import('./booking.js').then(({ patchDraft }) => {
            patchDraft({ promoCode: null });
            draft.promoCode = null;
            renderSummary();
        });
    });
}

if (draft.vehicleId) renderSummary();

/* ------------------------------------------------------------------ */
/* Continue                                                            */
/* ------------------------------------------------------------------ */

$('#toPayment').addEventListener('click', () => {
    const v = Store.getVehicle(draft.vehicleId);
    if (!v) {
        toast('Please select a vehicle first', 'error');
        return;
    }
    if (v.status !== 'available') {
        toast(`${v.name} is now ${fmt.statusLabel(v.status).toLowerCase()}. Please choose another vehicle.`,
            'error', 'Vehicle unavailable');
        setTimeout(() => location.href = 'booking.html', 1600);
        return;
    }
    location.href = 'payment.html';
});
