/* ==========================================================================
   EVRide — details.js
   Controller for ev-details.html: gallery, live telemetry, specs, booking
   panel, reviews and the location map.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { CATEGORIES, LOCATIONS } from './data.js';
import { boot, fmt, $, $$, esc, icons, toast, openModal, closeModal, initAccordions, refreshReveal } from './main.js';
import mountChrome from './navbar.js';
import { renderGrid, bindFavorites, sortVehicles } from './vehicles.js';
import { ADDONS, getDraft, patchDraft, tripDuration, calculateQuote } from './booking.js';
import { createMap } from './map.js';

boot();
mountChrome({ solidNav: true });
bindFavorites(document);

/* ------------------------------------------------------------------ */
/* Resolve vehicle                                                     */
/* ------------------------------------------------------------------ */

const id = new URLSearchParams(location.search).get('id');
const vehicle = id ? Store.getVehicle(id) : Store.getVehicles()[0];

if (!vehicle) {
    $('#detailLayout').innerHTML = `
    <div class="empty" style="grid-column:1/-1;padding:80px 20px">
        <div class="empty-icon"><i data-lucide="car-front"></i></div>
        <h4>Vehicle not found</h4>
        <p>That vehicle is no longer in the fleet, or the link is incomplete.</p>
        <a href="explore-evs.html" class="btn btn-primary mt-6">Browse available EVs</a>
    </div>`;
    icons();
} else {
    Store.addRecentlyViewed(vehicle.id);
    document.title = `${vehicle.name} — ${vehicle.brand} | EVRide`;
    $('#crumbName').textContent = vehicle.name;
    // render() is called at the end of this module, not here: it reads the
    // `today` / `local` consts declared below, and a const is not hoisted.
}

/* ------------------------------------------------------------------ */
/* Local booking state (feeds the draft on reserve)                    */
/* ------------------------------------------------------------------ */

const today = new Date().toISOString().split('T')[0];
const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

const local = {
    pickupDate: today,
    pickupTime: '09:00',
    returnDate: tomorrow,
    returnTime: '18:00',
    pickupLocationId: vehicle?.locationId || null,
    addons: ['insurance'],
    deliveryMode: 'hub',
    sameReturn: true,
    vehicleId: vehicle?.id,
    driver: {},
    promoCode: null
};

let activeImage = 0;

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function render() {
    const v = vehicle;
    const cat = CATEGORIES.find(c => c.id === v.category);
    const fav = Store.isFavorite(v.id);
    const reviews = Store.getReviewsFor(v.id);

    $('#detailLayout').innerHTML = `
    <!-- ============ LEFT COLUMN ============ -->
    <div>
        <!-- Gallery -->
        <div class="gallery mb-8">
            <div class="gallery-main">
                <img src="${esc(v.imageLarge || v.image)}" alt="${esc(v.brand)} ${esc(v.name)}"
                     data-fallback="${esc(v.brand)} ${esc(v.model)}" id="galleryMain" fetchpriority="high">
                <div class="gallery-badges">
                    <span class="v-status" data-status-slot="${esc(v.id)}">
                        <span class="status status-${esc(v.status)}"><span class="status-dot"></span>${esc(fmt.statusLabel(v.status))}</span>
                    </span>
                    <span class="badge badge-muted">${esc(cat ? cat.name : v.category)}</span>
                </div>
                <button class="gallery-360" id="open360">
                    <i data-lucide="rotate-3d"></i> 360° View
                </button>
            </div>
            <div class="gallery-thumbs" id="galleryThumbs">
                ${(v.gallery || [v.image]).concat([v.image]).slice(0, 4).map((src, i) => `
                <button class="gallery-thumb ${i === 0 ? 'active' : ''}" data-thumb="${i}" data-src="${esc(src)}"
                        aria-label="View image ${i + 1}">
                    <img src="${esc(src)}" alt="" data-fallback="${esc(v.brand)}" loading="lazy">
                </button>`).join('')}
            </div>
        </div>

        <!-- Header -->
        <div class="detail-head">
            <div>
                <span class="v-brand">${esc(v.brand)} · ${v.year} · ${esc(v.colorName)}</span>
                <h1 class="detail-title" style="font-size:clamp(1.9rem,3.6vw,2.7rem)">${esc(v.name)}</h1>
                <div class="detail-meta">
                    <span class="detail-meta-item">
                        <i data-lucide="star" style="fill:currentColor"></i>
                        <strong class="text-primary">${v.rating}</strong> (${v.reviews} reviews)
                    </span>
                    <span class="detail-meta-item"><i data-lucide="map-pin"></i> ${esc(v.locationName)}</span>
                    <span class="detail-meta-item"><i data-lucide="hash"></i> ${esc(v.plate)}</span>
                    <span class="detail-meta-item"><i data-lucide="route"></i> ${fmt.num(v.odometer)} km driven</span>
                    <span class="detail-meta-item"><i data-lucide="repeat"></i> ${v.trips} trips</span>
                </div>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-secondary btn-icon ${fav ? 'active' : ''}" data-fav="${esc(v.id)}"
                        aria-label="Save to wishlist" aria-pressed="${fav}">
                    <i data-lucide="heart" ${fav ? 'style="fill:currentColor;color:#FF6B6B"' : ''}></i>
                </button>
                <button class="btn btn-secondary btn-icon" id="shareBtn" aria-label="Share">
                    <i data-lucide="share-2"></i>
                </button>
            </div>
        </div>

        <!-- Live telemetry -->
        <div class="telemetry">
            <div class="telemetry-cell">
                <div class="telemetry-k"><i data-lucide="battery-charging"></i> Battery</div>
                <div class="telemetry-v" data-live="battery">${Math.round(v.battery)}<small>%</small></div>
                <div class="bar bar-sm mt-3">
                    <div class="bar-fill ${fmt.batteryClass(v.battery) === 'low' ? 'danger' : fmt.batteryClass(v.battery) === 'mid' ? 'warn' : 'green'}"
                         data-live="batteryBar" style="width:${Math.round(v.battery)}%"></div>
                </div>
            </div>
            <div class="telemetry-cell">
                <div class="telemetry-k"><i data-lucide="gauge"></i> Live range</div>
                <div class="telemetry-v" data-live="range">${v.range}<small>km</small></div>
                <div class="telemetry-sub">${v.rangeMax} km at full charge</div>
            </div>
            <div class="telemetry-cell">
                <div class="telemetry-k"><i data-lucide="map-pin"></i> Location</div>
                <div class="telemetry-v" style="font-size:1.15rem">${esc(v.area)}</div>
                <div class="telemetry-sub" data-live="distance">${v.distance} km from you</div>
            </div>
            <div class="telemetry-cell">
                <div class="telemetry-k"><i data-lucide="activity"></i> Status</div>
                <div class="telemetry-v" style="font-size:1.15rem" data-live="statusText">${esc(fmt.statusLabel(v.status))}</div>
                <div class="telemetry-sub">Updated <span data-live="updated">just now</span></div>
            </div>
        </div>

        <!-- Specifications -->
        <div class="detail-section">
            <h2 class="detail-section-title"><i data-lucide="settings-2"></i> Specifications</h2>
            <div class="spec-grid">
                ${[
                    ['battery-charging', 'Battery capacity', `${v.batteryCapacity} kWh`],
                    ['gauge',            'Range (WLTP)',     `${v.rangeMax} km`],
                    ['plug-zap',         'Charging time',    v.chargeTime],
                    ['zap',              'Peak charge rate', v.peakCharge ? `${v.peakCharge} kW` : 'AC only'],
                    ['rocket',           '0–100 km/h',       `${v.accel} s`],
                    ['wind',             'Top speed',        `${v.topSpeed} km/h`],
                    ['cpu',              'Power output',     `${v.power} hp`],
                    ['users',            'Seating',          `${v.seats} seats`],
                    ['car',              'Drive type',       v.drive],
                    ['plug',             'Charging port',    v.connector],
                    ['package',          'Boot space',       `${v.boot} L`],
                    ['heart-pulse',      'Health score',     `${v.healthScore}%`]
                ].map(([icon, label, value]) => `
                <div class="spec">
                    <div class="spec-icon"><i data-lucide="${icon}"></i></div>
                    <div class="spec-label">${esc(label)}</div>
                    <div class="spec-value">${esc(value)}</div>
                </div>`).join('')}
            </div>
        </div>

        <!-- Features -->
        <div class="detail-section">
            <h2 class="detail-section-title"><i data-lucide="sparkles"></i> Features &amp; highlights</h2>
            <div class="feature-tags">
                ${v.tags.map(t => `<span class="feature-tag"><i data-lucide="check"></i> ${esc(t)}</span>`).join('')}
                <span class="feature-tag"><i data-lucide="check"></i> Bluetooth &amp; Apple CarPlay</span>
                <span class="feature-tag"><i data-lucide="check"></i> Reverse camera</span>
                <span class="feature-tag"><i data-lucide="check"></i> Climate control</span>
                <span class="feature-tag"><i data-lucide="check"></i> Keyless entry</span>
                <span class="feature-tag"><i data-lucide="check"></i> Regenerative braking</span>
            </div>
        </div>

        <!-- Location map -->
        <div class="detail-section">
            <h2 class="detail-section-title"><i data-lucide="map"></i> Where it is right now</h2>
            <div class="map map-sm" id="vehicleMap"></div>
            <div class="flex gap-4 mt-4 flex-wrap items-center text-muted" style="font-size:.85rem">
                <span><i data-lucide="map-pin" style="width:14px;height:14px;color:var(--primary)"></i> ${esc(v.locationName)}, ${esc(v.area)}</span>
                <span><i data-lucide="navigation" style="width:14px;height:14px;color:var(--electric-blue)"></i>
                      <span data-live="distanceText">${v.distance} km</span> from your location</span>
                <span class="live-tag">Live position</span>
            </div>
        </div>

        <!-- Charging info -->
        <div class="detail-section">
            <h2 class="detail-section-title"><i data-lucide="zap"></i> Charging this vehicle</h2>
            <div class="grid grid-2 gap-4">
                <div class="card">
                    <div class="stat-icon blue mb-4"><i data-lucide="plug-zap"></i></div>
                    <h5 class="mb-2">DC fast charging</h5>
                    <p style="font-size:.87rem;color:var(--text-secondary);line-height:1.7">
                        ${v.peakCharge
                            ? `Accepts up to <strong class="text-primary">${v.peakCharge} kW</strong> on a ${v.connector} connector —
                               roughly 10% to 80% in ${Math.round(v.batteryCapacity * 0.7 / (v.peakCharge * 0.75) * 60)} minutes at a compatible hyperhub.`
                            : `This model charges on AC only. A full charge takes about ${v.chargeTime}.`}
                    </p>
                </div>
                <div class="card">
                    <div class="stat-icon mb-4"><i data-lucide="home"></i></div>
                    <h5 class="mb-2">Home &amp; destination</h5>
                    <p style="font-size:.87rem;color:var(--text-secondary);line-height:1.7">
                        A 7.4 kW home wallbox fills the ${v.batteryCapacity} kWh pack in about
                        <strong class="text-primary">${Math.ceil(v.batteryCapacity / 7.4)} hours</strong>.
                        Every EVRide hub has destination charging included.
                    </p>
                </div>
            </div>
            <a href="charging-stations.html" class="btn btn-secondary mt-5">
                <i data-lucide="map-pin"></i> Find compatible chargers nearby
            </a>
        </div>

        <!-- Reviews -->
        <div class="detail-section">
            <div class="flex items-center justify-between gap-4 mb-5 flex-wrap">
                <h2 class="detail-section-title" style="margin:0"><i data-lucide="message-square"></i> Reviews</h2>
                <button class="btn btn-secondary btn-sm" data-modal-open="reviewModal">
                    <i data-lucide="pen-line"></i> Write a review
                </button>
            </div>
            ${renderReviews(v, reviews)}
        </div>

        <!-- Policies -->
        <div class="detail-section">
            <h2 class="detail-section-title"><i data-lucide="file-text"></i> Rental terms</h2>
            <div class="accordion" data-single="true">
                <div class="acc-item">
                    <button class="acc-head"><span>What's included</span>
                        <span class="acc-icon"><i data-lucide="chevron-down"></i></span></button>
                    <div class="acc-body"><div class="acc-body-inner">
                        Third-party and basic collision insurance, 24/7 roadside assistance,
                        300 km per day, a vehicle charged above 80% at handover, and free
                        cancellation up to 24 hours before pickup.
                    </div></div>
                </div>
                <div class="acc-item">
                    <button class="acc-head"><span>Driver requirements</span>
                        <span class="acc-icon"><i data-lucide="chevron-down"></i></span></button>
                    <div class="acc-body"><div class="acc-body-inner">
                        Minimum age ${v.price > 8000 ? '25' : '21'}, a licence held for at least one year,
                        one government photo ID, and the payment card used for the booking.
                        ${v.price > 8000 ? 'Luxury and performance models carry the higher age limit and deposit.' : ''}
                    </div></div>
                </div>
                <div class="acc-item">
                    <button class="acc-head"><span>Security deposit</span>
                        <span class="acc-icon"><i data-lucide="chevron-down"></i></span></button>
                    <div class="acc-body"><div class="acc-body-inner">
                        A refundable hold of ${fmt.money(v.deposit)} is placed on your card at pickup
                        and released automatically within five to seven working days after return.
                    </div></div>
                </div>
                <div class="acc-item">
                    <button class="acc-head"><span>Charge level on return</span>
                        <span class="acc-icon"><i data-lucide="chevron-down"></i></span></button>
                    <div class="acc-body"><div class="acc-body-inner">
                        Return with 20% or more and there is nothing to pay. Below that, a
                        recharge fee of ₹16 per kWh applies.
                    </div></div>
                </div>
            </div>
        </div>
    </div>

    <!-- ============ BOOKING PANEL ============ -->
    <aside class="book-panel" aria-label="Reserve this vehicle">
        <div class="book-panel-head">
            <div class="book-price">
                <strong>${fmt.money(v.price)}</strong>
                <span>per day</span>
            </div>
            <div class="flex items-center gap-3 flex-wrap">
                <span class="rating"><i data-lucide="star" style="fill:currentColor"></i> ${v.rating} <span>(${v.reviews})</span></span>
                <span class="text-muted" style="font-size:.82rem">·</span>
                <span class="text-muted" style="font-size:.82rem">${v.trips} completed trips</span>
            </div>
        </div>

        <div class="book-panel-body">
            <div class="book-grid-2">
                <div class="field">
                    <label class="label" for="dPickupDate">Pickup date</label>
                    <input type="date" class="input" id="dPickupDate" value="${today}" min="${today}">
                </div>
                <div class="field">
                    <label class="label" for="dPickupTime">Time</label>
                    <input type="time" class="input" id="dPickupTime" value="09:00">
                </div>
                <div class="field">
                    <label class="label" for="dReturnDate">Return date</label>
                    <input type="date" class="input" id="dReturnDate" value="${tomorrow}" min="${today}">
                </div>
                <div class="field">
                    <label class="label" for="dReturnTime">Time</label>
                    <input type="time" class="input" id="dReturnTime" value="18:00">
                </div>
            </div>

            <div class="field">
                <label class="label" for="dPickupLoc">Pickup location</label>
                <select class="select" id="dPickupLoc">
                    ${LOCATIONS.map(l => `
                    <option value="${esc(l.id)}" ${l.id === v.locationId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
                </select>
            </div>

            <div class="divider" style="margin:4px 0"></div>

            <div>
                <div class="label mb-3">Add-ons</div>
                <div class="addon-list" id="dAddons">
                    ${ADDONS.slice(0, 3).map(a => `
                    <label class="addon ${local.addons.includes(a.id) ? 'checked' : ''}" data-daddon="${esc(a.id)}">
                        <span class="addon-body">
                            <strong>${esc(a.name)}</strong>
                            <span>${esc(a.desc)}</span>
                        </span>
                        <span class="addon-price">+${fmt.money(a.price)}<span style="display:block;font-size:.66rem;color:var(--text-muted);font-weight:400">/${a.unit}</span></span>
                    </label>`).join('')}
                </div>
            </div>

            <div class="divider" style="margin:4px 0"></div>

            <div class="meta-list" id="dQuote"></div>

            <a href="booking.html?vehicle=${esc(v.id)}" class="btn btn-primary btn-lg btn-block" id="reserveBtn">
                <i data-lucide="zap"></i> Reserve This EV
            </a>

            <p class="text-center text-muted" style="font-size:.78rem">
                You won't be charged yet — review everything on the next screen.
            </p>
        </div>

        <div class="trust-strip">
            <div class="trust-row"><i data-lucide="shield-check"></i> Insurance included as standard</div>
            <div class="trust-row"><i data-lucide="calendar-x"></i> Free cancellation up to 24h before</div>
            <div class="trust-row"><i data-lucide="battery-charging"></i> Delivered above 80% charge</div>
            <div class="trust-row"><i data-lucide="life-buoy"></i> 24/7 roadside assistance</div>
        </div>
    </aside>`;

    icons();
    initAccordions();
    bindGallery();
    bindBookingPanel();
    bindShare();
    bindReviewModal();
    initVehicleMap();
    renderSimilar();
    updateQuote();
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

function renderReviews(v, reviews) {
    if (!reviews.length) {
        return `
        <div class="empty" style="padding:40px 20px">
            <div class="empty-icon"><i data-lucide="message-square-off"></i></div>
            <h4>No reviews yet</h4>
            <p>Be the first to review this vehicle after your trip.</p>
        </div>`;
    }

    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const dist = [5, 4, 3, 2, 1].map(star => ({
        star,
        count: reviews.filter(r => r.rating === star).length
    }));

    const subScores = ['cleanliness', 'comfort', 'value', 'battery'].map(k => ({
        key: k,
        label: k === 'battery' ? 'Battery accuracy' : k[0].toUpperCase() + k.slice(1),
        score: (reviews.reduce((s, r) => s + (r[k] || 4), 0) / reviews.length).toFixed(1)
    }));

    return `
    <div class="review-summary">
        <div class="review-score">
            <div class="review-score-val">${avg.toFixed(1)}</div>
            <div class="stars" style="justify-content:center">
                ${Array.from({ length: 5 }, (_, i) =>
                    `<i data-lucide="star" class="${i < Math.round(avg) ? '' : 'star-empty'}"
                        ${i < Math.round(avg) ? 'style="fill:currentColor"' : ''}></i>`).join('')}
            </div>
            <small>Based on ${fmt.plural(reviews.length, 'review')}</small>
        </div>
        <div>
            <div class="review-bars mb-5">
                ${dist.map(d => `
                <div class="review-bar-row">
                    <span>${d.star} star${d.star === 1 ? '' : 's'}</span>
                    <div class="bar bar-sm"><div class="bar-fill green" style="width:${reviews.length ? d.count / reviews.length * 100 : 0}%"></div></div>
                    <span>${d.count}</span>
                </div>`).join('')}
            </div>
            <div class="grid grid-4 gap-3">
                ${subScores.map(s => `
                <div style="text-align:center">
                    <div style="font-family:var(--font-display);font-size:1.3rem;color:var(--text-primary)">${s.score}</div>
                    <div style="font-size:.73rem;color:var(--text-muted)">${esc(s.label)}</div>
                </div>`).join('')}
            </div>
        </div>
    </div>

    <div id="reviewList">
        ${reviews.map(r => reviewHTML(r)).join('')}
    </div>`;
}

function reviewHTML(r) {
    return `
    <article class="review">
        <div class="review-head">
            <div class="avatar avatar-sm">${esc(r.initials || fmt.initials(r.name))}</div>
            <div class="review-head-info">
                <strong>${esc(r.name)}</strong>
                <span>${fmt.ago(r.date)}</span>
            </div>
            <div class="stars">
                ${Array.from({ length: 5 }, (_, i) =>
                    `<i data-lucide="star" class="${i < r.rating ? '' : 'star-empty'}"
                        ${i < r.rating ? 'style="fill:currentColor"' : ''}></i>`).join('')}
            </div>
        </div>
        <p class="review-text">${esc(r.text)}</p>
        <div class="review-foot">
            <button><i data-lucide="thumbs-up"></i> Helpful (${r.helpful || 0})</button>
            <button><i data-lucide="flag"></i> Report</button>
        </div>
    </article>`;
}

/* ------------------------------------------------------------------ */
/* Gallery                                                             */
/* ------------------------------------------------------------------ */

function bindGallery() {
    $$('[data-thumb]').forEach(thumb => {
        thumb.addEventListener('click', () => {
            $$('.gallery-thumb').forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
            const main = $('#galleryMain');
            main.style.opacity = '0';
            setTimeout(() => {
                main.src = thumb.dataset.src;
                main.style.opacity = '1';
            }, 180);
            activeImage = +thumb.dataset.thumb;
        });
    });

    $('#open360')?.addEventListener('click', () => {
        $('#view360Img').src = vehicle.imageLarge || vehicle.image;
        openModal('view360Modal');
        bind360Drag();
    });
}

/** A light parallax drag — conveys "rotatable" without a real 360 sprite set. */
function bind360Drag() {
    const stage = $('#view360Stage');
    const img = $('#view360Img');
    if (!stage || stage.dataset.bound) return;
    stage.dataset.bound = '1';

    let dragging = false, startX = 0, offset = 0;

    const onDown = e => {
        dragging = true;
        startX = (e.touches ? e.touches[0].clientX : e.clientX);
        stage.style.cursor = 'grabbing';
    };
    const onMove = e => {
        if (!dragging) return;
        const x = (e.touches ? e.touches[0].clientX : e.clientX);
        const delta = (x - startX) * 0.35;
        img.style.transform = `translateX(${Math.max(-40, Math.min(40, offset + delta))}px) scale(1.12)`;
    };
    const onUp = e => {
        if (!dragging) return;
        dragging = false;
        stage.style.cursor = 'grab';
        const x = (e.changedTouches ? e.changedTouches[0].clientX : e.clientX);
        offset = Math.max(-40, Math.min(40, offset + (x - startX) * 0.35));
    };

    stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
}

/* ------------------------------------------------------------------ */
/* Booking panel                                                       */
/* ------------------------------------------------------------------ */

function bindBookingPanel() {
    const sync = () => {
        local.pickupDate = $('#dPickupDate').value;
        local.pickupTime = $('#dPickupTime').value;
        local.returnDate = $('#dReturnDate').value;
        local.returnTime = $('#dReturnTime').value;
        local.pickupLocationId = $('#dPickupLoc').value;

        $('#dReturnDate').min = local.pickupDate;
        if (local.returnDate < local.pickupDate) {
            $('#dReturnDate').value = local.pickupDate;
            local.returnDate = local.pickupDate;
        }
        updateQuote();
    };

    ['#dPickupDate', '#dPickupTime', '#dReturnDate', '#dReturnTime', '#dPickupLoc']
        .forEach(sel => $(sel).addEventListener('change', sync));

    $$('[data-daddon]').forEach(label => {
        label.addEventListener('click', e => {
            e.preventDefault();
            const aid = label.dataset.daddon;
            const i = local.addons.indexOf(aid);
            if (i > -1) local.addons.splice(i, 1); else local.addons.push(aid);
            label.classList.toggle('checked', i === -1);
            updateQuote();
        });
    });

    // Carry the panel's choices into the booking draft.
    $('#reserveBtn').addEventListener('click', e => {
        if (vehicle.status !== 'available') {
            e.preventDefault();
            toast(`${vehicle.name} is currently ${fmt.statusLabel(vehicle.status).toLowerCase()}. Browse available EVs instead.`,
                'warning', 'Not available');
            return;
        }
        patchDraft({
            ...local,
            vehicleId: vehicle.id,
            step: 2
        });
    });
}

function updateQuote() {
    const quote = calculateQuote({ ...local, vehicleId: vehicle.id });
    const { days } = tripDuration(local);

    $('#dQuote').innerHTML = `
        <div class="meta-row">
            <span class="meta-k">${fmt.money(vehicle.price)} × ${fmt.plural(days, 'day')}</span>
            <span class="meta-v">${fmt.money(quote.base)}</span>
        </div>
        ${quote.addonLines.map(l => `
        <div class="meta-row">
            <span class="meta-k">${esc(l.name)}</span>
            <span class="meta-v">${fmt.money(l.amount)}</span>
        </div>`).join('')}
        ${quote.autoDiscount ? `
        <div class="meta-row">
            <span class="meta-k text-green">Long rental discount</span>
            <span class="meta-v text-green">− ${fmt.money(quote.autoDiscount)}</span>
        </div>` : ''}
        <div class="meta-row">
            <span class="meta-k">GST (18%)</span>
            <span class="meta-v">${fmt.money(quote.taxes)}</span>
        </div>
        <div class="meta-row total">
            <span class="meta-k">Total</span>
            <span class="meta-v">${fmt.money(quote.total)}</span>
        </div>`;
}

/* ------------------------------------------------------------------ */
/* Share                                                               */
/* ------------------------------------------------------------------ */

function bindShare() {
    $('#shareBtn')?.addEventListener('click', async () => {
        const data = {
            title: `${vehicle.name} on EVRide`,
            text: `${vehicle.name} — ${Math.round(vehicle.battery)}% charged, ${vehicle.range} km range, ${fmt.money(vehicle.price)}/day`,
            url: location.href
        };
        if (navigator.share) {
            try { await navigator.share(data); } catch (_) { /* user dismissed */ }
        } else {
            try {
                await navigator.clipboard.writeText(location.href);
                toast('Link copied to clipboard', 'success');
            } catch (_) {
                toast('Copy this page URL to share', 'info');
            }
        }
    });
}

/* ------------------------------------------------------------------ */
/* Review modal                                                        */
/* ------------------------------------------------------------------ */

function bindReviewModal() {
    let picked = 5;

    const paint = () => {
        $$('[data-star]').forEach(btn => {
            const on = +btn.dataset.star <= picked;
            const icon = btn.querySelector('i, svg');
            btn.style.color = on ? 'var(--warning)' : 'var(--text-muted)';
            if (icon) icon.style.fill = on ? 'currentColor' : 'none';
        });
    };

    $$('[data-star]').forEach(btn => {
        btn.addEventListener('click', () => { picked = +btn.dataset.star; paint(); });
    });
    paint();

    $('#reviewPhotos')?.addEventListener('click', () => {
        toast('Photo upload is available in the EVRide mobile app', 'info');
    });

    $('#submitReview')?.addEventListener('click', () => {
        const name = $('#reviewName').value.trim();
        const text = $('#reviewText').value.trim();

        if (!name) { toast('Please add your name', 'error'); $('#reviewName').focus(); return; }
        if (text.length < 12) { toast('Tell us a little more — at least a sentence', 'error'); $('#reviewText').focus(); return; }

        const review = {
            id: 'rv-' + Date.now().toString(36),
            vehicleId: vehicle.id,
            name,
            initials: fmt.initials(name),
            rating: picked,
            text,
            date: Date.now(),
            helpful: 0,
            cleanliness: picked, comfort: picked, value: picked, battery: picked
        };

        Store.saveReview(review);
        closeModal('reviewModal');
        toast('Thanks — your review is live', 'success', 'Review posted');

        const list = $('#reviewList');
        if (list) {
            list.insertAdjacentHTML('afterbegin', reviewHTML(review));
            icons();
        }

        $('#reviewName').value = '';
        $('#reviewText').value = '';
    });
}

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

let vMap = null;

function initVehicleMap() {
    vMap = createMap('vehicleMap', { center: [vehicle.lat, vehicle.lng], zoom: 14 });
    if (!vMap) return;
    vMap.addMarker(vehicle.id, vehicle.lat, vehicle.lng, {
        status: vehicle.status,
        popup: `<div class="map-popup"><h6>${esc(vehicle.name)}</h6>
                <div class="map-popup-meta"><span>${Math.round(vehicle.battery)}%</span>
                <span>${vehicle.range} km</span></div></div>`,
        pulsing: true
    });
    if (!vMap.isFallback) vMap.addCircle(vehicle.lat, vehicle.lng, 900);
    vMap.invalidate();
}

/* ------------------------------------------------------------------ */
/* Similar vehicles                                                    */
/* ------------------------------------------------------------------ */

function renderSimilar() {
    const similar = sortVehicles(
        Store.getVehicles().filter(v =>
            v.id !== vehicle.id &&
            (v.category === vehicle.category || Math.abs(v.price - vehicle.price) < vehicle.price * 0.4)
        ), 'recommended'
    ).slice(0, 3);

    if (!similar.length) return;

    $('#similarSection').hidden = false;
    renderGrid($('#similarGrid'), similar);
}

/* ------------------------------------------------------------------ */
/* Live telemetry updates                                              */
/* ------------------------------------------------------------------ */

if (vehicle) {
    RT.on('vehicle:' + vehicle.id, v => {
        Object.assign(vehicle, v);

        const set = (key, value) => {
            const node = $(`[data-live="${key}"]`);
            if (node && node.innerHTML !== value) {
                node.innerHTML = value;
                node.classList.add('value-flash');
                setTimeout(() => node.classList.remove('value-flash'), 900);
            }
        };

        set('battery', `${Math.round(v.battery)}<small>%</small>`);
        set('range', `${v.range}<small>km</small>`);
        set('distance', `${v.distance} km from you`);
        set('statusText', fmt.statusLabel(v.status));

        const bar = $('[data-live="batteryBar"]');
        if (bar) {
            bar.style.width = Math.round(v.battery) + '%';
            const cls = fmt.batteryClass(v.battery);
            bar.className = `bar-fill ${cls === 'low' ? 'danger' : cls === 'mid' ? 'warn' : 'green'}`;
        }

        const dText = $('[data-live="distanceText"]');
        if (dText) dText.textContent = `${v.distance} km`;

        const updated = $('[data-live="updated"]');
        if (updated) updated.textContent = 'just now';

        const slot = $(`[data-status-slot="${v.id}"]`);
        if (slot) {
            slot.innerHTML = `<span class="status status-${v.status}"><span class="status-dot"></span>${fmt.statusLabel(v.status)}</span>`;
        }

        // Move the map marker with the vehicle.
        if (vMap) {
            vMap.addMarker(v.id, v.lat, v.lng, { status: v.status, pulsing: true });
        }

        // Reserve button reflects live availability.
        const btn = $('#reserveBtn');
        if (btn) {
            const ok = v.status === 'available';
            btn.classList.toggle('is-disabled', !ok);
            btn.innerHTML = ok
                ? '<i data-lucide="zap"></i> Reserve This EV'
                : `<i data-lucide="clock"></i> Currently ${fmt.statusLabel(v.status)}`;
            icons();
        }
    });

    // "Updated N ago" ticks independently of data changes.
    let lastUpdate = Date.now();
    RT.on('vehicle:' + vehicle.id, () => { lastUpdate = Date.now(); });
    setInterval(() => {
        const node = $('[data-live="updated"]');
        if (node) node.textContent = fmt.ago(lastUpdate);
    }, 5000);
}

/* ------------------------------------------------------------------ */
/* Initial paint — after every const above has been initialised.       */
/* ------------------------------------------------------------------ */

if (vehicle) render();
