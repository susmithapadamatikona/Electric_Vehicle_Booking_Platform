/* ==========================================================================
   EVRide — corporate.js
   Controller for corporate.html: savings calculator, plan table, enquiry form.
   ========================================================================== */

import { boot, fmt, $, $$, esc, icons, toast, initAccordions } from './main.js';
import mountChrome from './navbar.js';

boot();
mountChrome({ solidNav: true });

/* ------------------------------------------------------------------ */
/* Client marquee                                                      */
/* ------------------------------------------------------------------ */

const CLIENTS = ['Meridian Logistics', 'Northpoint Tech', 'Caldera Systems', 'Orbit Consulting',
    'Vertex Health', 'Blueline Media', 'Arcadia Retail', 'Summit Financial'];

const track = $('#clientTrack');
if (track) {
    const items = CLIENTS.map(c => `<span class="brand-item">${esc(c)}</span>`).join('');
    track.innerHTML = items + items;
}

/* ------------------------------------------------------------------ */
/* Savings calculator                                                  */
/* ------------------------------------------------------------------ */

// Assumptions, stated on the page so the numbers are auditable.
const PETROL_PRICE = 105;      // ₹ per litre
const PETROL_ECONOMY = 15;     // km per litre
const PETROL_MAINTENANCE = 1.8;// ₹ per km servicing/wear on an ICE car
const EVRide_PER_KM = 2.4;      // ₹ per km all-in on a corporate contract
const CO2_PER_LITRE = 2.31;    // kg CO₂ per litre of petrol burned

function calcState() {
    return {
        vehicles: +$('#calcVehicles').value,
        km: +$('#calcKm').value,
        months: +$('#calcMonths').value
    };
}

function updateCalculator() {
    const { vehicles, km, months } = calcState();

    $('#calcVehiclesLabel').textContent = vehicles;
    $('#calcKmLabel').textContent = fmt.num(km) + ' km';
    $('#calcMonthsLabel').textContent = `${months} ${months === 1 ? 'month' : 'months'}`;

    const totalKm = vehicles * km * months;

    const petrolFuel = totalKm / PETROL_ECONOMY * PETROL_PRICE;
    const petrolUpkeep = totalKm * PETROL_MAINTENANCE;
    const petrolTotal = petrolFuel + petrolUpkeep;

    const voltaTotal = totalKm * EVRide_PER_KM;

    const saving = Math.max(0, petrolTotal - voltaTotal);
    const litresAvoided = totalKm / PETROL_ECONOMY;
    const co2 = litresAvoided * CO2_PER_LITRE;

    $('#calcSaving').textContent = fmt.money(saving);
    $('#calcPetrol').textContent = fmt.money(petrolTotal);
    $('#calcEVRide').textContent = fmt.money(voltaTotal);
    $('#calcMonthly').textContent = fmt.money(saving / months) + ' / month';
    $('#calcCo2').textContent = co2 >= 1000
        ? (co2 / 1000).toFixed(1) + ' tonnes'
        : Math.round(co2) + ' kg';
    $('#calcPerKm').textContent = `₹${EVRide_PER_KM.toFixed(2)} vs ₹${(petrolTotal / totalKm).toFixed(2)}`;
}

['#calcVehicles', '#calcKm', '#calcMonths'].forEach(sel => {
    $(sel)?.addEventListener('input', updateCalculator);
});

updateCalculator();

/* ------------------------------------------------------------------ */
/* Plan comparison table                                               */
/* ------------------------------------------------------------------ */

const PLAN_ROWS = [
    { feature: 'Discount off standard rates',      starter: '10%',      business: '20%',     enterprise: 'Custom' },
    { feature: 'Employee accounts',                starter: 'Up to 25', business: 'Up to 150', enterprise: 'Unlimited' },
    { feature: 'Consolidated monthly invoice',     starter: true,       business: true,      enterprise: true },
    { feature: 'Cost-centre breakdown',            starter: true,       business: true,      enterprise: true },
    { feature: 'Spend controls &amp; approvals',   starter: false,      business: true,      enterprise: true },
    { feature: 'Unlimited network charging',       starter: false,      business: true,      enterprise: true },
    { feature: 'Utilisation analytics',            starter: 'Basic',    business: 'Full',    enterprise: 'Full + API' },
    { feature: 'ESG / Scope 3 reporting',          starter: false,      business: true,      enterprise: true },
    { feature: 'Dedicated account manager',        starter: false,      business: true,      enterprise: true },
    { feature: 'Priority vehicle allocation',      starter: false,      business: true,      enterprise: true },
    { feature: 'Replacement vehicle SLA',          starter: '4 hours',  business: '90 min',  enterprise: '60 min' },
    { feature: 'On-site charger installation',     starter: false,      business: 'Cost-share', enterprise: 'Included' },
    { feature: 'Payment terms',                    starter: 'Net 30',   business: 'Net 30',  enterprise: 'Net 45' },
    { feature: 'API &amp; SSO integration',        starter: false,      business: false,     enterprise: true }
];

function cell(value) {
    if (value === true)  return '<i data-lucide="check" class="compare-yes" style="width:18px;height:18px"></i>';
    if (value === false) return '<i data-lucide="minus" class="compare-no" style="width:18px;height:18px"></i>';
    return `<span style="font-size:.86rem;color:var(--text-primary);font-weight:600">${value}</span>`;
}

$('#planTable').innerHTML = PLAN_ROWS.map(r => `
    <tr>
        <td style="color:var(--text-secondary);font-size:.88rem">${r.feature}</td>
        <td>${cell(r.starter)}</td>
        <td style="background:rgba(0,230,118,.03)">${cell(r.business)}</td>
        <td>${cell(r.enterprise)}</td>
    </tr>`).join('') + `
    <tr>
        <td></td>
        <td><a href="#enquiry" class="btn btn-secondary btn-sm">Choose</a></td>
        <td style="background:rgba(0,230,118,.03)"><a href="#enquiry" class="btn btn-primary btn-sm">Choose</a></td>
        <td><a href="#enquiry" class="btn btn-secondary btn-sm">Contact us</a></td>
    </tr>`;

icons();

/* ------------------------------------------------------------------ */
/* Enquiry form                                                        */
/* ------------------------------------------------------------------ */

const FREE_EMAIL = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'proton.me'];

function showError(input, show = true) {
    input.classList.toggle('error', show);
    input.closest('.field')?.querySelector('.field-error')?.classList.toggle('show', show);
}

['#cpCompany', '#cpName', '#cpEmail', '#cpPhone'].forEach(sel => {
    $(sel)?.addEventListener('input', () => showError($(sel), false));
});

$('#corpForm')?.addEventListener('submit', e => {
    e.preventDefault();

    const company = $('#cpCompany');
    const name = $('#cpName');
    const email = $('#cpEmail');
    const phone = $('#cpPhone');

    let valid = true;

    if (company.value.trim().length < 2) { showError(company); valid = false; }
    if (name.value.trim().length < 2) { showError(name); valid = false; }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
    if (!emailOk) { showError(email); valid = false; }

    if (!/^[\d\s+()-]{10,}$/.test(phone.value.trim())) { showError(phone); valid = false; }

    if (!valid) {
        toast('Please complete the highlighted fields', 'error');
        $('#corpForm .input.error')?.focus();
        return;
    }

    // A free-mail address isn't fatal, but it's worth flagging for B2B.
    const domain = email.value.trim().split('@')[1]?.toLowerCase();
    if (FREE_EMAIL.includes(domain)) {
        toast('A work email helps us verify your business faster, but we\'ll take it from here.',
            'info', 'Heads up');
    }

    const btn = $('#corpSubmit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending…';

    setTimeout(() => {
        const { vehicles, km, months } = calcState();

        $('#corpForm').innerHTML = `
        <div style="text-align:center;padding-block:24px">
            <div class="auth-success-icon success-pop" style="width:76px;height:76px;margin-bottom:24px">
                <svg viewBox="0 0 52 52" fill="none" stroke="currentColor" stroke-width="3.5"
                     stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 27l8 8 16-16" class="check-draw"/>
                </svg>
            </div>
            <h3 style="font-size:1.3rem;margin-bottom:10px">Proposal on its way</h3>
            <p class="text-secondary" style="font-size:.92rem;line-height:1.7;margin-bottom:24px">
                Thanks, ${esc(name.value.trim().split(' ')[0])}. We'll email
                <strong class="text-primary">${esc(email.value.trim())}</strong> within one
                working day with pricing for ${esc($('#cpSize').value)}.
            </p>
            <div class="card-glass" style="text-align:left">
                <div class="meta-list">
                    <div class="meta-row">
                        <span class="meta-k">Company</span>
                        <span class="meta-v">${esc(company.value.trim())}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Team size</span>
                        <span class="meta-v">${esc($('#cpSize').value)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Reference</span>
                        <span class="meta-v mono">CORP-${Date.now().toString(36).toUpperCase().slice(-6)}</span>
                    </div>
                </div>
            </div>
            <p class="text-muted mt-6" style="font-size:.82rem">
                Need to talk sooner? Call <a href="tel:+918045678900" class="text-green">+91 80 4567 8900</a>.
            </p>
        </div>`;

        icons();
        toast('Proposal request received — we\'ll be in touch within one working day', 'success', 'Thanks!');
    }, 1200);
});

/* ------------------------------------------------------------------ */
/* Smooth anchor scrolling for the in-page CTAs                        */
/* ------------------------------------------------------------------ */

$$('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
        const id = link.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top, behavior: 'smooth' });
    });
});

initAccordions();
