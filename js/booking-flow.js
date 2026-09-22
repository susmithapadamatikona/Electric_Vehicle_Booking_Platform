/* ==========================================================================
   EVRide — booking-flow.js
   Controller for booking.html: the five-step wizard.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { LOCATIONS } from './data.js';
import { boot, fmt, $, $$, esc, icons, toast } from './main.js';
import mountChrome from './navbar.js';
import { sortVehicles } from './vehicles.js';
import {
    ADDONS, getDraft, patchDraft, tripDuration, calculateQuote,
    validateStep, validatePromo, renderSummaryPanel
} from './booking.js';

boot();
mountChrome({ solidNav: true });

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const TOTAL_STEPS = 5;

const STEP_TITLES = {
    1: 'Select Vehicle',
    2: 'Schedule',
    3: 'Location',
    4: 'Add-ons',
    5: 'Your Details'
};

// A vehicle passed in the URL seeds a fresh draft.
const urlVehicle = new URLSearchParams(location.search).get('vehicle');
let draft = getDraft(urlVehicle);
if (urlVehicle && draft.vehicleId !== urlVehicle) {
    draft = patchDraft({ vehicleId: urlVehicle, step: 2 });
}

let step = Math.min(Math.max(draft.step || 1, 1), TOTAL_STEPS);
// If a vehicle arrived via URL, skip straight past step 1.
if (urlVehicle && step === 1) step = 2;

let pickerSort = 'recommended';
let pickerQuery = '';

/* ------------------------------------------------------------------ */
/* Step navigation                                                     */
/* ------------------------------------------------------------------ */

function renderStepper() {
    $$('.step-node').forEach(node => {
        const n = +node.dataset.step;
        node.classList.toggle('active', n === step);
        node.classList.toggle('done', n < step);
        const dot = node.querySelector('.step-dot');
        dot.innerHTML = n < step ? '<i data-lucide="check"></i>' : n;
    });

    $$('.stepper-line').forEach((line, i) => {
        line.classList.toggle('filled', i < step - 1);
    });

    $('#smTitle').textContent = STEP_TITLES[step];
    $('#smCount').textContent = `Step ${step} of ${TOTAL_STEPS}`;
    $('#smBar').style.width = (step / TOTAL_STEPS * 100) + '%';
    $('#bkStepLabel').textContent = `Step ${step} of ${TOTAL_STEPS}`;

    // Back button is disabled on the first step.
    $('#bkBack').disabled = step === 1;

    const next = $('#bkNext');
    next.innerHTML = step === TOTAL_STEPS
        ? 'Review Booking <i data-lucide="arrow-right"></i>'
        : 'Continue <i data-lucide="arrow-right"></i>';

    icons();
}

function showStep(n) {
    step = n;
    patchDraft({ step: n });

    $$('.bk-step').forEach(panel => {
        panel.classList.toggle('active', +panel.dataset.bkStep === n);
    });

    renderStepper();
    renderSummary();

    // Scroll the panel into view without yanking the whole page on desktop.
    const panel = $('.booking-panel');
    const top = panel.getBoundingClientRect().top + window.scrollY - 180;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
}

function goNext() {
    // Persist the current step's inputs before validating.
    collectStep(step);

    const { valid, errors } = validateStep(draft, step);
    if (!valid) {
        toast(errors[0], 'error', 'Check your details');
        markInvalidFields(step);
        return;
    }

    if (step === TOTAL_STEPS) {
        if (!$('#bkTerms').checked) {
            toast('Please accept the terms to continue', 'warning');
            $('#bkTerms').closest('.check').classList.add('shake');
            setTimeout(() => $('#bkTerms').closest('.check').classList.remove('shake'), 500);
            return;
        }
        location.href = 'booking-summary.html';
        return;
    }

    showStep(step + 1);
}

function goBack() {
    if (step === 1) return;
    collectStep(step);
    showStep(step - 1);
}

function markInvalidFields(n) {
    if (n !== 5) return;
    const checks = [
        ['#bkName',    v => v.trim().length > 1],
        ['#bkEmail',   v => v.includes('@')],
        ['#bkPhone',   v => /^[\d\s+()-]{10,}$/.test(v)],
        ['#bkLicence', v => v.trim().length > 4]
    ];
    checks.forEach(([sel, test]) => {
        const input = $(sel);
        const ok = test(input.value);
        input.classList.toggle('error', !ok);
        input.closest('.field').querySelector('.field-error')?.classList.toggle('show', !ok);
    });
}

/* ------------------------------------------------------------------ */
/* Collect inputs per step                                             */
/* ------------------------------------------------------------------ */

function collectStep(n) {
    switch (n) {
        case 2:
            draft = patchDraft({
                pickupDate: $('#bkPickupDate').value,
                pickupTime: $('#bkPickupTime').value,
                returnDate: $('#bkReturnDate').value,
                returnTime: $('#bkReturnTime').value
            });
            break;

        case 3:
            draft = patchDraft({
                pickupAddress: $('#bkAddress').value,
                sameReturn: $('#bkSameReturn').checked,
                dropLocationId: $('#bkDropLocation').value || null
            });
            break;

        case 5:
            draft = patchDraft({
                driver: {
                    name: $('#bkName').value,
                    email: $('#bkEmail').value,
                    phone: $('#bkPhone').value,
                    licence: $('#bkLicence').value
                }
            });
            break;
    }
}

/* ------------------------------------------------------------------ */
/* Step 1 — vehicle picker                                             */
/* ------------------------------------------------------------------ */

function renderPicker() {
    const list = $('#pickerList');
    let vehicles = Store.getVehicles().filter(v => v.status === 'available');

    if (pickerQuery) {
        const q = pickerQuery.toLowerCase();
        vehicles = vehicles.filter(v =>
            `${v.name} ${v.brand} ${v.model} ${v.category}`.toLowerCase().includes(q));
    }

    vehicles = sortVehicles(vehicles, pickerSort);

    if (!vehicles.length) {
        list.innerHTML = `
        <div class="empty">
            <div class="empty-icon"><i data-lucide="car-front"></i></div>
            <h4>No vehicles match that search</h4>
            <p>Try a different model, or clear the search to see everything available.</p>
        </div>`;
        icons();
        return;
    }

    list.innerHTML = vehicles.map(v => `
        <button type="button" class="picker-card ${draft.vehicleId === v.id ? 'selected' : ''}"
                data-pick="${esc(v.id)}">
            <img src="${esc(v.image)}" alt="${esc(v.name)}" data-fallback="${esc(v.brand)}">
            <div class="picker-body">
                <strong>${esc(v.name)}</strong>
                <span class="text-muted" style="font-size:.79rem">${esc(v.brand)} · ${esc(v.drive)} · ${v.seats} seats</span>
                <div class="picker-meta">
                    <span><i data-lucide="battery-charging"></i> ${Math.round(v.battery)}%</span>
                    <span><i data-lucide="gauge"></i> ${v.range} km</span>
                    <span><i data-lucide="map-pin"></i> ${esc(v.area)}</span>
                    <span><i data-lucide="star"></i> ${v.rating}</span>
                </div>
            </div>
            <div class="picker-price">
                <strong>${fmt.money(v.price)}</strong>
                <span>per day</span>
            </div>
            <span class="picker-check"><i data-lucide="check"></i></span>
        </button>`).join('');

    icons();

    $$('[data-pick]', list).forEach(btn => {
        btn.addEventListener('click', () => {
            draft = patchDraft({ vehicleId: btn.dataset.pick });
            $$('.picker-card').forEach(c => c.classList.remove('selected'));
            btn.classList.add('selected');
            renderSummary();
            // Nudge forward — selecting a car is an unambiguous intent to proceed.
            setTimeout(() => showStep(2), 340);
        });
    });
}

/* ------------------------------------------------------------------ */
/* Step 2 — schedule                                                   */
/* ------------------------------------------------------------------ */

function initSchedule() {
    const today = new Date().toISOString().split('T')[0];

    $('#bkPickupDate').value = draft.pickupDate;
    $('#bkPickupTime').value = draft.pickupTime;
    $('#bkReturnDate').value = draft.returnDate;
    $('#bkReturnTime').value = draft.returnTime;
    $('#bkPickupDate').min = today;
    $('#bkReturnDate').min = draft.pickupDate;

    const onChange = () => {
        collectStep(2);
        $('#bkReturnDate').min = $('#bkPickupDate').value;
        if ($('#bkReturnDate').value < $('#bkPickupDate').value) {
            $('#bkReturnDate').value = $('#bkPickupDate').value;
            collectStep(2);
        }
        updateDurationCallout();
        renderSummary();
    };

    ['#bkPickupDate', '#bkPickupTime', '#bkReturnDate', '#bkReturnTime']
        .forEach(sel => $(sel).addEventListener('change', onChange));

    $$('[data-dur]').forEach(chip => {
        chip.addEventListener('click', () => {
            $$('[data-dur]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const days = +chip.dataset.dur;
            const start = new Date($('#bkPickupDate').value || today);
            const end = new Date(start.getTime() + days * 86400000);
            $('#bkReturnDate').value = end.toISOString().split('T')[0];
            onChange();
        });
    });

    updateDurationCallout();
}

function updateDurationCallout() {
    const { days, hours } = tripDuration(draft);
    const text = hours && days === 1
        ? `${days} day` : fmt.plural(days, 'day');

    $('#durationText').textContent = text;

    const hint = $('#durationHint');
    if (days >= 15) {
        hint.innerHTML = 'Long-term rental — <strong class="text-green">12% discount applied</strong>, plus free scheduled maintenance.';
    } else if (days >= 7) {
        hint.innerHTML = '<strong class="text-green">12% long rental discount applied</strong> automatically at checkout.';
    } else {
        const needed = 7 - days;
        hint.textContent = `Add ${fmt.plural(needed, 'more day')} to unlock a 12% discount.`;
    }
}

/* ------------------------------------------------------------------ */
/* Step 3 — location                                                   */
/* ------------------------------------------------------------------ */

function initLocation() {
    // Hub list.
    const hubs = LOCATIONS.filter(l => l.type !== 'depot');
    $('#hubList').innerHTML = hubs.map(l => `
        <button type="button" class="hub-opt ${draft.pickupLocationId === l.id ? 'selected' : ''}" data-hub="${esc(l.id)}">
            <span class="hub-opt-icon">
                <i data-lucide="${l.type === 'airport' ? 'plane' : 'building-2'}"></i>
            </span>
            <span class="hub-opt-body">
                <strong>${esc(l.name)}</strong>
                <span>${esc(l.area)} · ${l.vehicles} EVs · ${l.chargers} chargers</span>
            </span>
            <span class="picker-check"><i data-lucide="check"></i></span>
        </button>`).join('');

    // Drop-off select.
    $('#bkDropLocation').innerHTML =
        '<option value="">Select a location</option>' +
        LOCATIONS.map(l => `<option value="${esc(l.id)}" ${draft.dropLocationId === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('');

    icons();

    $$('[data-hub]').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.hub-opt').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            draft = patchDraft({ pickupLocationId: btn.dataset.hub });
            renderSummary();
        });
    });

    // Delivery mode.
    $$('[data-delivery]').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.delivery-opt').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            const mode = btn.dataset.delivery;
            draft = patchDraft({ deliveryMode: mode });
            $('#hubSection').style.display = mode === 'hub' ? '' : 'none';
            $('#addressSection').style.display = mode === 'doorstep' ? '' : 'none';
            renderSummary();
        });
    });

    // Restore mode.
    $$('[data-delivery]').forEach(b => b.classList.toggle('selected', b.dataset.delivery === draft.deliveryMode));
    $('#hubSection').style.display = draft.deliveryMode === 'hub' ? '' : 'none';
    $('#addressSection').style.display = draft.deliveryMode === 'doorstep' ? '' : 'none';
    $('#bkAddress').value = draft.pickupAddress || '';

    // Same-return toggle.
    $('#bkSameReturn').checked = draft.sameReturn;
    $('#dropSection').style.display = draft.sameReturn ? 'none' : '';
    $('#bkSameReturn').addEventListener('change', e => {
        draft = patchDraft({ sameReturn: e.target.checked });
        $('#dropSection').style.display = e.target.checked ? 'none' : '';
        renderSummary();
    });

    $('#bkDropLocation').addEventListener('change', () => { collectStep(3); renderSummary(); });
    $('#bkAddress').addEventListener('input', () => { collectStep(3); renderSummary(); });
}

/* ------------------------------------------------------------------ */
/* Step 4 — add-ons                                                    */
/* ------------------------------------------------------------------ */

function renderAddons() {
    const { days } = tripDuration(draft);

    $('#addonList').innerHTML = ADDONS.map(a => {
        const on = draft.addons.includes(a.id);
        const total = a.unit === 'day' ? a.price * days : a.price;
        return `
        <label class="addon ${on ? 'checked' : ''}" data-addon="${esc(a.id)}">
            <input type="checkbox" ${on ? 'checked' : ''} style="display:none">
            <span class="stat-icon" style="width:36px;height:36px">
                <i data-lucide="${esc(a.icon)}"></i>
            </span>
            <span class="addon-body">
                <strong>
                    ${esc(a.name)}
                    ${a.recommended ? '<span class="badge badge-green" style="margin-left:6px">Recommended</span>' : ''}
                </strong>
                <span>${esc(a.desc)}</span>
            </span>
            <span class="addon-price">
                ${fmt.money(total)}
                <span style="display:block;font-size:.68rem;color:var(--text-muted);font-weight:400;text-align:right">
                    ${a.unit === 'day' ? `${fmt.money(a.price)}/day` : 'one-off'}
                </span>
            </span>
        </label>`;
    }).join('');

    icons();

    $$('[data-addon]').forEach(label => {
        label.addEventListener('click', e => {
            e.preventDefault();
            const id = label.dataset.addon;
            const addons = [...draft.addons];
            const i = addons.indexOf(id);
            if (i > -1) addons.splice(i, 1); else addons.push(id);
            draft = patchDraft({ addons });
            label.classList.toggle('checked', i === -1);
            label.querySelector('input').checked = i === -1;
            renderSummary();
        });
    });
}

/* ------------------------------------------------------------------ */
/* Step 5 — driver details                                             */
/* ------------------------------------------------------------------ */

function initDriver() {
    const user = Store.getUser();
    const d = draft.driver || {};

    $('#bkName').value = d.name || user?.name || '';
    $('#bkEmail').value = d.email || user?.email || '';
    $('#bkPhone').value = d.phone || user?.phone || '';
    $('#bkLicence').value = d.licence || '';

    ['#bkName', '#bkEmail', '#bkPhone', '#bkLicence'].forEach(sel => {
        $(sel).addEventListener('input', () => {
            $(sel).classList.remove('error');
            $(sel).closest('.field').querySelector('.field-error')?.classList.remove('show');
            collectStep(5);
        });
    });
}

/* ------------------------------------------------------------------ */
/* Summary panel                                                       */
/* ------------------------------------------------------------------ */

function renderSummary() {
    const quote = renderSummaryPanel($('#summaryPanel'), draft);
    icons();
    bindPromo();
    return quote;
}

function bindPromo() {
    $('#promoApply')?.addEventListener('click', () => {
        const code = $('#promoInput').value.trim();
        if (!code) return;

        const quote = calculateQuote({ ...draft, promoCode: null });
        const result = validatePromo(code, quote.subtotal, quote.days);

        if (!result || !result.valid) {
            toast(result?.reason || 'That promo code was not recognised.', 'error', 'Invalid code');
            $('#promoInput').classList.add('error', 'shake');
            setTimeout(() => $('#promoInput').classList.remove('shake'), 500);
            return;
        }

        draft = patchDraft({ promoCode: code.toUpperCase() });
        renderSummary();
        toast(`${result.offer.code} applied — you saved ${fmt.money(result.amount)}`, 'success', 'Promo applied');
    });

    $('#promoInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); $('#promoApply').click(); }
    });

    $('#promoRemove')?.addEventListener('click', () => {
        draft = patchDraft({ promoCode: null });
        renderSummary();
        toast('Promo code removed', 'info');
    });
}

/* ------------------------------------------------------------------ */
/* Live guard: the chosen vehicle may be taken while you book          */
/* ------------------------------------------------------------------ */

RT.on('vehicles', () => {
    if (!draft.vehicleId) return;
    const v = Store.getVehicle(draft.vehicleId);
    if (!v) return;

    // Refresh live figures in the summary without a full re-render flicker.
    const battery = $('#summaryPanel .bsp-vehicle-info span');
    if (battery) {
        battery.textContent = `${v.brand} · ${v.plate} · ${Math.round(v.battery)}% charged`;
    }

    // If someone else reserved it mid-flow, say so rather than failing at payment.
    if (v.status !== 'available' && v.status !== 'reserved' && step < TOTAL_STEPS) {
        if (!sessionStorage.getItem('evride:warnedTaken:' + v.id)) {
            sessionStorage.setItem('evride:warnedTaken:' + v.id, '1');
            toast(`${v.name} just went ${fmt.statusLabel(v.status).toLowerCase()}. You may want to pick another vehicle.`,
                'warning', 'Vehicle no longer free');
        }
    }
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

$('#bkNext').addEventListener('click', goNext);
$('#bkBack').addEventListener('click', goBack);

$('#pickerSearch').addEventListener('input', e => {
    pickerQuery = e.target.value;
    renderPicker();
});

$('#pickerSort').addEventListener('change', e => {
    pickerSort = e.target.value;
    renderPicker();
});

renderPicker();
initSchedule();
initLocation();
renderAddons();
initDriver();
showStep(step);

// Add-on prices depend on trip length, so re-render them when dates change.
['#bkPickupDate', '#bkReturnDate'].forEach(sel =>
    $(sel).addEventListener('change', renderAddons));
