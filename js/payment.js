/* ==========================================================================
   EVRide — payment.js
   Controller for payment.html: method selection, card formatting, validation
   and the simulated authorisation sequence.
   ========================================================================== */

import Store from './storage.js';
import { boot, fmt, $, $$, esc, icons, toast } from './main.js';
import mountChrome from './navbar.js';
import { getDraft, calculateQuote, createBooking, renderSummaryPanel } from './booking.js';

boot();
mountChrome({ solidNav: true });

const draft = getDraft();
let method = 'card';
let selectedBank = null;

/* ------------------------------------------------------------------ */
/* Guard                                                               */
/* ------------------------------------------------------------------ */

if (!draft.vehicleId || !Store.getVehicle(draft.vehicleId)) {
    toast('No booking in progress — start by choosing a vehicle', 'warning');
    setTimeout(() => location.href = 'explore-evs.html', 1500);
}

const quote = calculateQuote(draft);
$('#payAmount').textContent = fmt.money(quote.total);

renderSummaryPanel($('#summaryPanel'), draft, { showPromo: false });
icons();

/* ------------------------------------------------------------------ */
/* Method switching                                                    */
/* ------------------------------------------------------------------ */

$$('[data-method]').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('.pay-method').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        method = btn.dataset.method;
        selectedBank = null;

        $$('.pay-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === method));
        $$('.bank-opt').forEach(b => b.classList.remove('selected'));
    });
});

/* ------------------------------------------------------------------ */
/* Banks                                                               */
/* ------------------------------------------------------------------ */

const BANKS = [
    { id: 'hdfc',  name: 'HDFC Bank',    logo: 'H' },
    { id: 'icici', name: 'ICICI Bank',   logo: 'I' },
    { id: 'sbi',   name: 'State Bank',   logo: 'S' },
    { id: 'axis',  name: 'Axis Bank',    logo: 'A' },
    { id: 'kotak', name: 'Kotak',        logo: 'K' },
    { id: 'idfc',  name: 'IDFC First',   logo: 'I' }
];

const MORE_BANKS = ['Bank of Baroda', 'Canara Bank', 'Punjab National Bank', 'Union Bank',
    'Indian Bank', 'IndusInd Bank', 'Yes Bank', 'Federal Bank', 'RBL Bank', 'Bandhan Bank'];

$('#bankGrid').innerHTML = BANKS.map(b => `
    <button type="button" class="bank-opt" data-bank="${esc(b.id)}" data-name="${esc(b.name)}">
        <span class="bank-logo">${esc(b.logo)}</span> ${esc(b.name)}
    </button>`).join('');

$('#otherBank').innerHTML = '<option value="">Select your bank</option>' +
    MORE_BANKS.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');

// Generic selector for bank / UPI app / wallet tiles.
document.addEventListener('click', e => {
    const opt = e.target.closest('.bank-opt');
    if (!opt) return;
    const group = opt.closest('.bank-grid');
    $$('.bank-opt', group).forEach(b => b.classList.remove('selected'));
    opt.classList.add('selected');
    selectedBank = opt.dataset.name || opt.dataset.upi || opt.dataset.wallet;
});

$('#otherBank').addEventListener('change', e => {
    if (!e.target.value) return;
    $$('#bankGrid .bank-opt').forEach(b => b.classList.remove('selected'));
    selectedBank = e.target.value;
});

/* ------------------------------------------------------------------ */
/* Card formatting & live preview                                      */
/* ------------------------------------------------------------------ */

const numberInput = $('#cardNumber');
const holderInput = $('#cardHolder');
const expiryInput = $('#cardExpiry');
const cvvInput = $('#cardCvv');

function detectBrand(digits) {
    if (/^4/.test(digits)) return 'VISA';
    if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'MASTERCARD';
    if (/^3[47]/.test(digits)) return 'AMEX';
    if (/^6(?:011|5)/.test(digits)) return 'DISCOVER';
    if (/^60|^65|^81/.test(digits)) return 'RUPAY';
    return 'EVRide PAY';
}

numberInput.addEventListener('input', e => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
    e.target.value = digits.replace(/(.{4})/g, '$1 ').trim();

    const padded = digits.padEnd(16, '•');
    $('#cardNumberDisplay').textContent = padded.replace(/(.{4})/g, '$1 ').trim();
    $('#cardBrand').textContent = detectBrand(digits);

    e.target.classList.remove('error');
    e.target.closest('.field').querySelector('.field-error').classList.remove('show');
});

holderInput.addEventListener('input', e => {
    $('#cardHolderDisplay').textContent = e.target.value.toUpperCase() || 'YOUR NAME';
    e.target.classList.remove('error');
    e.target.closest('.field').querySelector('.field-error').classList.remove('show');
});

expiryInput.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
    e.target.value = v;
    $('#cardExpiryDisplay').textContent = v || 'MM/YY';
    e.target.classList.remove('error');
    e.target.closest('.field').querySelector('.field-error').classList.remove('show');
});

cvvInput.addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    e.target.classList.remove('error');
    e.target.closest('.field').querySelector('.field-error').classList.remove('show');
});

// Tilt the card slightly toward the cursor — a small touch of realism.
const preview = $('#cardPreview');
preview.addEventListener('pointermove', e => {
    const r = preview.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    preview.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
});
preview.addEventListener('pointerleave', () => { preview.style.transform = ''; });

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function fail(input, message) {
    input.classList.add('error');
    const err = input.closest('.field')?.querySelector('.field-error');
    if (err) err.classList.add('show');
    toast(message, 'error', 'Payment details');
    input.focus();
    return false;
}

function validatePayment() {
    if (method === 'card') {
        const digits = numberInput.value.replace(/\D/g, '');

        if (!holderInput.value.trim() || holderInput.value.trim().length < 2) {
            return fail(holderInput, 'Enter the card holder name');
        }
        if (digits.length < 15) {
            return fail(numberInput, 'Enter a valid card number');
        }
        if (!luhn(digits)) {
            return fail(numberInput, 'That card number failed validation. Check the digits.');
        }

        const exp = expiryInput.value.split('/');
        if (exp.length !== 2 || exp[0].length !== 2 || exp[1].length !== 2) {
            return fail(expiryInput, 'Enter the expiry as MM/YY');
        }
        const mm = +exp[0], yy = +exp[1];
        if (mm < 1 || mm > 12) return fail(expiryInput, 'Month must be between 01 and 12');

        const now = new Date();
        const expDate = new Date(2000 + yy, mm, 0, 23, 59);
        if (expDate < now) return fail(expiryInput, 'That card has expired');

        if (cvvInput.value.length < 3) {
            return fail(cvvInput, 'Enter the CVV from the back of your card');
        }
        return true;
    }

    if (method === 'upi') {
        const upi = $('#upiId').value.trim();
        const appPicked = $$('[data-upi].selected').length > 0;
        if (!appPicked && !/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(upi)) {
            return fail($('#upiId'), 'Enter a valid UPI ID, or pick an app');
        }
        return true;
    }

    if (method === 'netbanking') {
        if (!selectedBank) { toast('Select your bank to continue', 'error'); return false; }
        return true;
    }

    if (method === 'wallet') {
        if (!selectedBank) { toast('Choose a wallet to continue', 'error'); return false; }
        return true;
    }

    return true;
}

/** Luhn checksum — the same check a real gateway runs client-side. */
function luhn(digits) {
    let sum = 0, alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let n = +digits[i];
        if (alt) { n *= 2; if (n > 9) n -= 9; }
        sum += n;
        alt = !alt;
    }
    return sum % 10 === 0;
}

/* ------------------------------------------------------------------ */
/* Payment label for the booking record                                */
/* ------------------------------------------------------------------ */

function paymentLabel() {
    switch (method) {
        case 'card': {
            const digits = numberInput.value.replace(/\D/g, '');
            return `${detectBrand(digits)} •••• ${digits.slice(-4)}`;
        }
        case 'upi': {
            const app = $$('[data-upi].selected')[0];
            return app ? `UPI — ${app.textContent.trim()}` : `UPI — ${$('#upiId').value.trim()}`;
        }
        case 'netbanking': return `Net Banking — ${selectedBank}`;
        case 'wallet':     return `Wallet — ${selectedBank}`;
        default:           return 'EVRide Pay';
    }
}

/* ------------------------------------------------------------------ */
/* Process                                                             */
/* ------------------------------------------------------------------ */

$('#payNow').addEventListener('click', async () => {
    if (!validatePayment()) return;

    const v = Store.getVehicle(draft.vehicleId);
    if (!v || v.status !== 'available') {
        toast('This vehicle was just reserved by someone else. Please choose another.',
            'error', 'No longer available');
        setTimeout(() => location.href = 'booking.html', 1800);
        return;
    }

    const overlay = $('#payProcessing');
    overlay.classList.add('show');
    document.body.classList.add('no-scroll');

    const steps = $$('[data-pstep]');
    const advance = (i) => {
        steps.forEach((s, idx) => {
            s.classList.toggle('active', idx === i);
            s.classList.toggle('done', idx < i);
        });
    };

    // Simulated authorisation sequence.
    const timings = [700, 1100, 800, 700];
    for (let i = 0; i < steps.length; i++) {
        advance(i);
        await new Promise(r => setTimeout(r, timings[i]));
    }
    steps.forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
    await new Promise(r => setTimeout(r, 400));

    try {
        const { booking } = createBooking(draft, { label: paymentLabel(), method });
        sessionStorage.setItem('evride:lastBooking', booking.id);
        location.href = `booking-success.html?id=${booking.id}`;
    } catch (err) {
        console.error(err);
        overlay.classList.remove('show');
        document.body.classList.remove('no-scroll');
        toast('Something went wrong creating your booking. Please try again.', 'error', 'Payment failed');
    }
});

/* ------------------------------------------------------------------ */
/* Prefill the card holder from the driver details                     */
/* ------------------------------------------------------------------ */

if (draft.driver?.name) {
    holderInput.value = draft.driver.name;
    $('#cardHolderDisplay').textContent = draft.driver.name.toUpperCase();
}
