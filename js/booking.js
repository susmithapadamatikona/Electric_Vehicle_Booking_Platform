/* ==========================================================================
   EVRide — booking.js
   Booking engine: pricing, draft state, validation and the multi-step flow.
   Shared by booking.html, booking-summary.html, payment.html and
   booking-success.html so the quote is calculated in exactly one place.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { LOCATIONS, OFFERS } from './data.js';
import { fmt, esc } from './main.js';

/* ------------------------------------------------------------------ */
/* Pricing configuration                                               */
/* ------------------------------------------------------------------ */

export const ADDONS = [
    { id: 'insurance', name: 'Premium Protection',   desc: 'Zero excess, including tyres, glass and battery pack.', price: 299,  unit: 'day',  icon: 'shield-check', recommended: true },
    { id: 'charging',  name: 'Charging Package',     desc: 'Unlimited charging across the EVRide network.',          price: 499,  unit: 'day',  icon: 'zap' },
    { id: 'driver',    name: 'Additional Driver',    desc: 'Add a second verified driver to the booking.',          price: 250,  unit: 'day',  icon: 'users' },
    { id: 'delivery',  name: 'Doorstep Delivery',    desc: 'Delivered and collected at your address.',              price: 599,  unit: 'once', icon: 'truck' },
    { id: 'childseat', name: 'Child Seat',           desc: 'ISOFIX-fitted seat, 9 months to 4 years.',              price: 150,  unit: 'day',  icon: 'baby' },
    { id: 'wifi',      name: 'Onboard WiFi Hotspot', desc: '4G hotspot with unlimited data for the trip.',          price: 120,  unit: 'day',  icon: 'wifi' }
];

const TAX_RATE = 0.18;          // GST
const DELIVERY_FEE = 599;
const LONG_RENTAL_DAYS = 7;     // threshold for the multi-day discount
const LONG_RENTAL_DISCOUNT = 0.12;

/* ------------------------------------------------------------------ */
/* Draft lifecycle                                                     */
/* ------------------------------------------------------------------ */

export function newDraft(vehicleId) {
    const today = new Date();
    const tomorrow = new Date(Date.now() + 86400000);
    const iso = d => d.toISOString().split('T')[0];

    return {
        vehicleId: vehicleId || null,
        pickupDate: iso(today),
        pickupTime: '09:00',
        returnDate: iso(tomorrow),
        returnTime: '18:00',
        deliveryMode: 'hub',           // 'hub' | 'doorstep'
        pickupLocationId: null,
        pickupAddress: '',
        dropLocationId: null,
        sameReturn: true,
        addons: ['insurance'],
        promoCode: null,
        step: 1,
        driver: { name: '', email: '', phone: '', licence: '' },
        createdAt: Date.now()
    };
}

export function getDraft(fallbackVehicleId = null) {
    let d = Store.getDraft();
    if (!d) {
        d = newDraft(fallbackVehicleId);
        Store.setDraft(d);
    } else if (fallbackVehicleId && !d.vehicleId) {
        d.vehicleId = fallbackVehicleId;
        Store.setDraft(d);
    }
    return d;
}

export function patchDraft(patch) {
    const d = { ...getDraft(), ...patch };
    Store.setDraft(d);
    return d;
}

/* ------------------------------------------------------------------ */
/* Duration                                                            */
/* ------------------------------------------------------------------ */

export function tripDates(draft) {
    const start = new Date(`${draft.pickupDate}T${draft.pickupTime || '09:00'}`);
    const end   = new Date(`${draft.returnDate}T${draft.returnTime || '18:00'}`);
    return { start, end };
}

export function tripDuration(draft) {
    const { start, end } = tripDates(draft);
    const ms = end - start;
    if (isNaN(ms) || ms <= 0) return { days: 1, hours: 0, totalHours: 24, valid: false };

    const totalHours = ms / 3600000;
    // Rental days round up — a 26-hour rental is billed as two days.
    const days = Math.max(1, Math.ceil(totalHours / 24));
    return {
        days,
        hours: Math.round(totalHours % 24),
        totalHours: Math.round(totalHours),
        valid: true
    };
}

/* ------------------------------------------------------------------ */
/* Promo codes                                                         */
/* ------------------------------------------------------------------ */

export function validatePromo(code, subtotal, days) {
    if (!code) return null;
    const offer = OFFERS.find(o => o.code.toUpperCase() === String(code).trim().toUpperCase());
    if (!offer) return { valid: false, reason: 'That promo code was not recognised.' };

    if (new Date(offer.expires) < new Date()) {
        return { valid: false, reason: 'This offer has expired.' };
    }

    // Offer-specific eligibility rules.
    if (offer.code === 'LONG30' && days < 15) {
        return { valid: false, reason: 'LONG30 requires a booking of 15 days or more.' };
    }
    if (offer.code === 'WEEKEND25' && days < 2) {
        return { valid: false, reason: 'WEEKEND25 requires a minimum 2-day rental.' };
    }

    // Parse the discount: either a percentage or a flat rupee amount.
    let amount;
    if (offer.discount.includes('%')) {
        const pct = parseFloat(offer.discount) / 100;
        amount = subtotal * pct;
        const capMatch = offer.cap.match(/[\d,]+/);
        if (capMatch) {
            const cap = parseFloat(capMatch[0].replace(/,/g, ''));
            amount = Math.min(amount, cap);
        }
    } else {
        amount = parseFloat(offer.discount.replace(/[^\d.]/g, '')) || 0;
    }

    return {
        valid: true,
        offer,
        amount: Math.round(amount),
        label: `${offer.code} — ${offer.discount}`
    };
}

/* ------------------------------------------------------------------ */
/* Quote calculation — the single source of pricing truth              */
/* ------------------------------------------------------------------ */

export function calculateQuote(draft) {
    const vehicle = draft.vehicleId ? Store.getVehicle(draft.vehicleId) : null;
    const { days } = tripDuration(draft);

    const base = vehicle ? vehicle.price * days : 0;

    // Add-ons.
    const addonLines = (draft.addons || []).map(id => {
        const a = ADDONS.find(x => x.id === id);
        if (!a) return null;
        const qty = a.unit === 'day' ? days : 1;
        return { id: a.id, name: a.name, unit: a.unit, qty, amount: a.price * qty };
    }).filter(Boolean);

    const addonsTotal = addonLines.reduce((sum, l) => sum + l.amount, 0);

    // Doorstep delivery fee — only when the add-on itself isn't already covering it.
    const deliveryFee = (draft.deliveryMode === 'doorstep' && !draft.addons.includes('delivery'))
        ? DELIVERY_FEE : 0;

    const subtotal = base + addonsTotal + deliveryFee;

    // Automatic long-rental discount.
    const autoDiscount = days >= LONG_RENTAL_DAYS ? Math.round(base * LONG_RENTAL_DISCOUNT) : 0;

    // Promo discount on top.
    const promo = validatePromo(draft.promoCode, subtotal - autoDiscount, days);
    const promoDiscount = promo && promo.valid ? promo.amount : 0;

    const discount = autoDiscount + promoDiscount;
    const taxable = Math.max(0, subtotal - discount);
    const taxes = Math.round(taxable * TAX_RATE);
    const total = taxable + taxes;

    const deposit = vehicle ? vehicle.deposit : 5000;

    return {
        vehicle,
        days,
        base,
        addonLines,
        addonsTotal,
        deliveryFee,
        subtotal,
        autoDiscount,
        promo,
        promoDiscount,
        discount,
        taxes,
        taxRate: TAX_RATE,
        total,
        deposit,
        perDay: vehicle ? vehicle.price : 0
    };
}

/* ------------------------------------------------------------------ */
/* Validation per step                                                 */
/* ------------------------------------------------------------------ */

export function validateStep(draft, step) {
    const errors = [];

    switch (step) {
        case 1:
            if (!draft.vehicleId) errors.push('Choose a vehicle to continue.');
            else {
                const v = Store.getVehicle(draft.vehicleId);
                if (!v) errors.push('That vehicle is no longer in the fleet.');
                else if (v.status !== 'available') {
                    errors.push(`${v.name} is now ${fmt.statusLabel(v.status).toLowerCase()}. Please choose another vehicle.`);
                }
            }
            break;

        case 2: {
            const { start, end } = tripDates(draft);
            if (isNaN(start)) errors.push('Enter a valid pickup date and time.');
            if (isNaN(end)) errors.push('Enter a valid return date and time.');
            if (!isNaN(start) && !isNaN(end) && end <= start) {
                errors.push('The return must be after the pickup.');
            }
            // Allow same-day bookings but not ones in the past.
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            if (!isNaN(start) && start < now) errors.push('Pickup cannot be in the past.');
            break;
        }

        case 3:
            if (draft.deliveryMode === 'hub' && !draft.pickupLocationId) {
                errors.push('Select a pickup hub.');
            }
            if (draft.deliveryMode === 'doorstep' && !String(draft.pickupAddress || '').trim()) {
                errors.push('Enter the delivery address.');
            }
            break;

        case 4:
            // Add-ons are all optional — nothing to enforce.
            break;

        case 5:
            if (!draft.driver.name?.trim()) errors.push('Enter the main driver\'s name.');
            if (!draft.driver.email?.includes('@')) errors.push('Enter a valid email address.');
            if (!/^[\d\s+()-]{10,}$/.test(draft.driver.phone || '')) errors.push('Enter a valid phone number.');
            if (!draft.driver.licence?.trim()) errors.push('Enter the driving licence number.');
            break;
    }

    return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/* Booking creation                                                    */
/* ------------------------------------------------------------------ */

function generateBookingId() {
    // Sequential-looking IDs read as more real than random hashes.
    const existing = Store.getBookings()
        .map(b => parseInt(String(b.id).replace(/\D/g, ''), 10))
        .filter(n => !isNaN(n));
    const next = (existing.length ? Math.max(...existing) : 2048) + 1;
    return 'EV' + next;
}

function generateInvoiceId() {
    const existing = Store.getInvoices()
        .map(i => parseInt(String(i.id).split('-').pop(), 10))
        .filter(n => !isNaN(n));
    const next = (existing.length ? Math.max(...existing) : 418) + 1;
    return `INV-2026-${String(next).padStart(4, '0')}`;
}

/**
 * Commit the draft into a real booking. Drives the vehicle state machine,
 * writes the invoice and payment records, and fires a notification.
 */
export function createBooking(draft, payment) {
    const quote = calculateQuote(draft);
    const v = quote.vehicle;
    if (!v) throw new Error('Cannot create a booking without a vehicle.');

    const { start, end } = tripDates(draft);
    const id = generateBookingId();
    const user = Store.getUser();

    const pickupLoc = draft.deliveryMode === 'doorstep'
        ? draft.pickupAddress
        : (LOCATIONS.find(l => l.id === draft.pickupLocationId)?.name || v.locationName);

    const dropLoc = draft.sameReturn
        ? pickupLoc
        : (LOCATIONS.find(l => l.id === draft.dropLocationId)?.name || pickupLoc);

    const booking = {
        id,
        vehicleId: v.id,
        vehicleName: v.name,
        vehicleBrand: v.brand,
        vehicleImage: v.image,
        plate: v.plate,
        pickupLocation: pickupLoc,
        dropLocation: dropLoc,
        deliveryMode: draft.deliveryMode,
        pickupDate: start.toISOString(),
        returnDate: end.toISOString(),
        days: quote.days,
        status: 'upcoming',
        amount: quote.total,
        basePrice: quote.base,
        addons: quote.addonLines,
        insurance: quote.addonLines.find(a => a.id === 'insurance')?.amount || 0,
        deliveryFee: quote.deliveryFee,
        discount: quote.discount,
        promoCode: quote.promo?.valid ? quote.promo.offer.code : null,
        taxes: quote.taxes,
        deposit: quote.deposit,
        paymentStatus: 'paid',
        paymentMethod: payment?.label || 'Card',
        driver: draft.driver,
        distance: 0,
        energyUsed: 0,
        co2Saved: 0,
        rated: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    Store.saveBooking(booking);

    // Invoice.
    const invoice = {
        id: generateInvoiceId(),
        bookingId: id,
        date: Date.now(),
        customer: draft.driver.name || user?.name || 'Guest',
        email: draft.driver.email || user?.email || '',
        vehicle: v.name,
        amount: quote.total,
        base: quote.base,
        insurance: booking.insurance,
        taxes: quote.taxes,
        discount: quote.discount,
        status: 'paid',
        method: booking.paymentMethod
    };
    Store.saveInvoice(invoice);

    // Payment record.
    Store.savePayment({
        id: 'PAY-' + Date.now().toString(36).toUpperCase(),
        invoiceId: invoice.id,
        bookingId: id,
        date: Date.now(),
        amount: quote.total,
        method: booking.paymentMethod,
        status: 'paid',
        gateway: 'EVRide Secure Pay',
        ref: 'TXN' + Math.floor(Math.random() * 900000000 + 100000000)
    });

    // Drive the vehicle state machine: AVAILABLE -> RESERVED.
    RT.reserveVehicle(v.id);

    // Notify.
    RT.notify('success', 'check-circle', 'Booking confirmed',
        `${v.name} is reserved for ${fmt.date(start)} at ${fmt.time(start)}.`,
        'customer-dashboard.html');

    Store.clearDraft();

    return { booking, invoice, quote };
}

/* ------------------------------------------------------------------ */
/* Summary renderer — shared sidebar across the flow                   */
/* ------------------------------------------------------------------ */

export function renderSummaryPanel(container, draft, options = {}) {
    if (!container) return null;

    const quote = calculateQuote(draft);
    const v = quote.vehicle;
    const { start, end } = tripDates(draft);

    if (!v) {
        container.innerHTML = `
        <div class="bsp-body">
            <div class="empty" style="padding:40px 10px">
                <div class="empty-icon"><i data-lucide="car-front"></i></div>
                <h4>No vehicle selected</h4>
                <p>Choose an EV to see your quote.</p>
            </div>
        </div>`;
        return quote;
    }

    const pickupLabel = draft.deliveryMode === 'doorstep'
        ? (draft.pickupAddress || 'Your address')
        : (LOCATIONS.find(l => l.id === draft.pickupLocationId)?.name || 'Select a hub');

    const dropLabel = draft.sameReturn
        ? pickupLabel
        : (LOCATIONS.find(l => l.id === draft.dropLocationId)?.name || pickupLabel);

    container.innerHTML = `
    <div class="bsp-vehicle">
        <img src="${esc(v.image)}" alt="${esc(v.name)}" data-fallback="${esc(v.brand)} ${esc(v.model)}">
        <div class="bsp-vehicle-info">
            <strong>${esc(v.name)}</strong>
            <span>${esc(v.brand)} · ${esc(v.plate)} · ${Math.round(v.battery)}% charged</span>
        </div>
    </div>

    <div class="bsp-body">
        <div class="bsp-title">Your trip</div>

        <div class="bsp-trip">
            <div class="bsp-leg">
                <div class="bsp-leg-marker">
                    <span class="bsp-leg-dot"></span>
                    <span class="bsp-leg-line"></span>
                </div>
                <div class="bsp-leg-body">
                    <small>Pickup</small>
                    <strong>${esc(pickupLabel)}</strong>
                    <span>${fmt.date(start)} · ${fmt.time(start)}</span>
                </div>
            </div>
            <div class="bsp-leg">
                <div class="bsp-leg-marker">
                    <span class="bsp-leg-dot"></span>
                </div>
                <div class="bsp-leg-body">
                    <small>Return</small>
                    <strong>${esc(dropLabel)}</strong>
                    <span>${fmt.date(end)} · ${fmt.time(end)}</span>
                </div>
            </div>
        </div>

        <div class="bsp-title">Price breakdown</div>

        <div class="bsp-prices">
            <div class="bsp-price-row">
                <span class="k">${fmt.money(quote.perDay)} × ${fmt.plural(quote.days, 'day')}</span>
                <span class="v">${fmt.money(quote.base)}</span>
            </div>

            ${quote.addonLines.map(l => `
            <div class="bsp-price-row">
                <span class="k">${esc(l.name)} ${l.unit === 'day' ? `<small>× ${l.qty}</small>` : ''}</span>
                <span class="v">${fmt.money(l.amount)}</span>
            </div>`).join('')}

            ${quote.deliveryFee ? `
            <div class="bsp-price-row">
                <span class="k">Doorstep delivery</span>
                <span class="v">${fmt.money(quote.deliveryFee)}</span>
            </div>` : ''}

            ${quote.autoDiscount ? `
            <div class="bsp-price-row discount">
                <span class="k"><i data-lucide="tag" style="width:13px;height:13px"></i> Long rental discount</span>
                <span class="v">− ${fmt.money(quote.autoDiscount)}</span>
            </div>` : ''}

            ${quote.promoDiscount ? `
            <div class="bsp-price-row discount">
                <span class="k"><i data-lucide="tag" style="width:13px;height:13px"></i> ${esc(quote.promo.offer.code)}</span>
                <span class="v">− ${fmt.money(quote.promoDiscount)}</span>
            </div>` : ''}

            <div class="bsp-price-row">
                <span class="k">GST <small>(18%)</small></span>
                <span class="v">${fmt.money(quote.taxes)}</span>
            </div>
        </div>

        <div class="bsp-total">
            <span class="k">Total payable</span>
            <span class="v">${fmt.money(quote.total)}</span>
        </div>

        <p class="text-muted" style="font-size:.76rem;margin-top:10px;line-height:1.6">
            Plus a refundable ${fmt.money(quote.deposit)} security hold, released 5–7 days after return.
        </p>
    </div>

    ${options.showPromo === false ? '' : `
    <div class="bsp-foot">
        ${quote.promo?.valid ? `
        <div class="promo-applied">
            <span><i data-lucide="check-circle" style="width:14px;height:14px"></i> ${esc(quote.promo.label)}</span>
            <button id="promoRemove" aria-label="Remove promo code"><i data-lucide="x"></i></button>
        </div>` : `
        <div class="promo-row">
            <input type="text" class="input" id="promoInput" placeholder="Promo code" aria-label="Promo code"
                   value="${esc(draft.promoCode || '')}">
            <button class="btn btn-secondary btn-sm" id="promoApply">Apply</button>
        </div>`}
        ${options.footer || ''}
    </div>`}`;

    return quote;
}

export default {
    ADDONS, newDraft, getDraft, patchDraft, tripDates, tripDuration,
    calculateQuote, validatePromo, validateStep, createBooking, renderSummaryPanel
};
