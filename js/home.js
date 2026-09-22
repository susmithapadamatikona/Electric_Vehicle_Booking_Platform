/* ==========================================================================
   EVRide — home.js
   Homepage controller: hero live card, search panel, and every dynamic
   section on the landing page.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { LOCATIONS, CATEGORIES, BRANDS, TESTIMONIALS, FAQS, locationImage } from './data.js';
import { boot, fmt, $, $$, esc, icons, toast, countUp, refreshReveal } from './main.js';
import mountChrome from './navbar.js';
import { vehicleCard, renderGrid, renderSkeletons, bindLiveCards, bindFavorites, sortVehicles } from './vehicles.js';

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

boot();
mountChrome();
bindFavorites(document);

/* ------------------------------------------------------------------ */
/* 1. Hero live vehicle card                                           */
/* ------------------------------------------------------------------ */

let heroVehicleId = null;

function pickHeroVehicle() {
    const vehicles = Store.getVehicles();
    const available = vehicles.filter(v => v.status === 'available');
    const pool = available.length ? available : vehicles;
    // Prefer a recognisable flagship for the hero.
    const preferred = pool.find(v => v.id === 'ev-001') || pool[0];
    return preferred || null;
}

function renderHeroCard(v) {
    if (!v) return;
    heroVehicleId = v.id;

    const pct = Math.round(v.battery);

    // Every lookup is guarded so the hero keeps working if a field is removed.
    const img = $('#hlImage');
    if (img) {
        img.src = v.image;
        img.alt = `${v.brand} ${v.name}`;
        if (v.artFallback) img.dataset.vehicleArt = v.artFallback;
    }

    const name = $('#hlName');
    if (name) name.textContent = `${v.brand} ${v.name}`;

    const meta = $('#hlMeta');
    if (meta) {
        meta.textContent = v.status === 'available'
            ? `${v.locationName || v.area} · ${Math.round(v.range)} km range`
            : fmt.statusLabel(v.status);
    }

    const ring = $('#hlRing');
    if (ring) {
        // r=42 -> circumference 2*pi*42 = 263.9
        const C = 2 * Math.PI * 42;
        ring.setAttribute('stroke-dasharray', C.toFixed(1));
        ring.setAttribute('stroke-dashoffset', (C - (pct / 100) * C).toFixed(1));
    }

    const ringVal = $('#hlRingVal');
    if (ringVal) ringVal.textContent = pct + '%';

    const price = $('#hlPrice');
    if (price) price.textContent = fmt.money(v.price);
}

renderHeroCard(pickHeroVehicle());

// Keep the hero card in sync, and rotate to a different vehicle periodically
// so the page feels alive even without interaction.
RT.on('vehicles', vehicles => {
    const v = vehicles.find(x => x.id === heroVehicleId);
    if (v) renderHeroCard(v);
    updateHeroCount(vehicles);
});

// Rotate the featured vehicle so the ring and price tag keep moving. The
// cross-fade that used to accompany this went with the live-vehicle card;
// the ring animates its own stroke, so a direct swap is enough.
setInterval(() => {
    const available = Store.getVehicles().filter(v => v.status === 'available' && v.id !== heroVehicleId);
    if (!available.length) return;
    renderHeroCard(available[Math.floor(Math.random() * available.length)]);
}, 11000);

function updateHeroCount(vehicles) {
    const n = vehicles.filter(v => v.status === 'available').length;
    // Scale the demo fleet up to a believable network-wide figure.
    const display = n * 6 + 21;
    const node = $('#heroLiveCount');
    if (node && node.textContent !== String(display)) {
        node.textContent = display;
        node.classList.add('count-tick');
        setTimeout(() => node.classList.remove('count-tick'), 340);
    }
    const availNode = $('#spAvailCount');
    if (availNode) availNode.textContent = display;
}

updateHeroCount(Store.getVehicles());

/* ------------------------------------------------------------------ */
/* 2. Search panel                                                     */
/* ------------------------------------------------------------------ */

function initSearchPanel() {
    const form = $('#heroSearch');
    if (!form) return;

    // Populate vehicle types.
    const typeSel = $('#spType');
    CATEGORIES.forEach(c => {
        typeSel.insertAdjacentHTML('beforeend', `<option value="${esc(c.id)}">${esc(c.name)}</option>`);
    });

    // Default dates: today + tomorrow.
    const today = new Date();
    const tomorrow = new Date(Date.now() + 86400000);
    const iso = d => d.toISOString().split('T')[0];
    $('#spPickupDate').value = iso(today);
    $('#spPickupDate').min = iso(today);
    $('#spReturnDate').value = iso(tomorrow);
    $('#spReturnDate').min = iso(today);

    // Restore the last search if there is one.
    const history = Store.getSearchHistory();
    if (history.length) {
        const last = history[0].params;
        if (last.pickupLocation) $('#spPickup').value = last.pickupLocation;
        if (last.dropLocation) $('#spDrop').value = last.dropLocation;
        if (last.vehicleType) typeSel.value = last.vehicleType;
    }

    // Keep return date at or after pickup date.
    $('#spPickupDate').addEventListener('change', e => {
        const ret = $('#spReturnDate');
        ret.min = e.target.value;
        if (ret.value < e.target.value) ret.value = e.target.value;
    });

    /* --- Location autocomplete --- */
    ['spPickup', 'spDrop'].forEach(id => {
        const input = $('#' + id);
        const box = $(`[data-suggest="${id}"]`);

        const show = (query) => {
            const q = query.trim().toLowerCase();
            const matches = LOCATIONS
                .filter(l => !q || `${l.name} ${l.area} ${l.city}`.toLowerCase().includes(q))
                .slice(0, 6);

            if (!matches.length) { box.classList.remove('show'); return; }

            box.innerHTML = matches.map(l => `
                <button type="button" data-val="${esc(l.name)}">
                    <i data-lucide="${l.type === 'airport' ? 'plane' : l.type === 'depot' ? 'warehouse' : 'map-pin'}"></i>
                    <span>
                        ${esc(l.name)}
                        <small>${esc(l.area)}, ${esc(l.city)} · ${l.vehicles} EVs · ${l.chargers} chargers</small>
                    </span>
                </button>`).join('');
            box.classList.add('show');
            icons();

            $$('button', box).forEach(b => {
                b.addEventListener('mousedown', e => {
                    e.preventDefault();
                    input.value = b.dataset.val;
                    box.classList.remove('show');
                    input.closest('.sf').classList.remove('invalid');
                });
            });
        };

        input.addEventListener('focus', () => show(input.value));
        input.addEventListener('input', () => show(input.value));
        input.addEventListener('blur', () => setTimeout(() => box.classList.remove('show'), 160));
    });

    /* --- Quick date picks --- */
    $$('[data-quick]').forEach(chip => {
        chip.addEventListener('click', () => {
            $$('[data-quick]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const now = new Date();
            const set = (startOffset, days) => {
                const s = new Date(Date.now() + startOffset * 86400000);
                const e = new Date(Date.now() + (startOffset + days) * 86400000);
                $('#spPickupDate').value = iso(s);
                $('#spReturnDate').value = iso(e);
            };

            switch (chip.dataset.quick) {
                case 'today':    set(0, 1); break;
                case 'tomorrow': set(1, 1); break;
                case 'weekend': {
                    const day = now.getDay();
                    const toFriday = (5 - day + 7) % 7 || 7;
                    set(toFriday, 2);
                    break;
                }
                case 'week':     set(0, 7); break;
            }
        });
    });

    /* --- Panel tabs --- */
    $$('.sp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.sp-tab').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');

            const mode = tab.dataset.spTab;
            const submit = $('#spSubmit');
            const labels = {
                rent:      '<i data-lucide="search"></i> Search Available EVs',
                ride:      '<i data-lucide="navigation"></i> Find a Ride Now',
                charge:    '<i data-lucide="zap"></i> Find Charging Stations',
                subscribe: '<i data-lucide="calendar-range"></i> View Monthly Plans'
            };
            submit.innerHTML = labels[mode] || labels.rent;

            // Charging mode hides the return fields — they make no sense there.
            const hideForCharge = ['returnDate', 'returnTime'];
            $$('.sf').forEach(sf => {
                sf.style.display = (mode === 'charge' && hideForCharge.includes(sf.dataset.field))
                    ? 'none' : '';
            });
            icons();
        });
    });

    /* --- Submit --- */
    form.addEventListener('submit', e => {
        e.preventDefault();

        const mode = $('.sp-tab.active').dataset.spTab;
        if (mode === 'charge') { location.href = 'charging-stations.html'; return; }
        if (mode === 'subscribe') { location.href = 'offers.html#subscription'; return; }

        // Validate.
        let valid = true;
        const required = mode === 'ride' ? ['pickupLocation'] : ['pickupLocation', 'pickupDate', 'returnDate'];
        required.forEach(name => {
            const field = form.querySelector(`[name="${name}"]`);
            const wrap = field.closest('.sf');
            const ok = !!field.value.trim();
            wrap.classList.toggle('invalid', !ok);
            if (!ok) valid = false;
        });

        if (!valid) {
            toast('Please fill in your pickup location and dates', 'error', 'Missing details');
            form.querySelector('.sf.invalid input')?.focus();
            return;
        }

        const params = Object.fromEntries(new FormData(form).entries());
        Store.addSearch({ params, mode });

        runSearch(params);
    });
}

function runSearch(params) {
    const panel = $('#spResults');
    const grid = $('#spResultsGrid');
    const btn = $('#spSubmit');

    // Loading state.
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Searching…';
    panel.classList.add('show');
    renderSkeletons(grid, 3);
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    setTimeout(() => {
        let results = Store.getVehicles().filter(v => v.status === 'available');
        if (params.vehicleType) results = results.filter(v => v.category === params.vehicleType);
        results = sortVehicles(results, 'recommended');

        const days = Math.max(1, Math.round(
            (new Date(params.returnDate) - new Date(params.pickupDate)) / 86400000
        ));

        $('#spResultsTitle').textContent = `${results.length} ${results.length === 1 ? 'vehicle' : 'vehicles'} available`;
        $('#spResultsSub').textContent =
            `${params.pickupLocation}${params.dropLocation ? ' → ' + params.dropLocation : ''} · ` +
            `${fmt.date(params.pickupDate)} – ${fmt.date(params.returnDate)} · ${fmt.plural(days, 'day')}`;

        if (!results.length) {
            grid.innerHTML = `
                <div class="empty" style="grid-column:1/-1">
                    <div class="empty-icon"><i data-lucide="car-front"></i></div>
                    <h4>No vehicles free in that window</h4>
                    <p>Try a different date range, or browse the full fleet to see what's coming back soon.</p>
                    <a href="explore-evs.html" class="btn btn-primary btn-sm mt-4">Browse all EVs</a>
                </div>`;
        } else {
            grid.innerHTML = results.slice(0, 3).map(v => vehicleCard(v)).join('');
        }

        icons();
        refreshReveal(grid);

        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="search"></i> Search Available EVs';
        icons();

        toast(`Found ${results.length} available ${results.length === 1 ? 'vehicle' : 'vehicles'}`, 'success', 'Search complete');
    }, 950);
}

initSearchPanel();

/* ------------------------------------------------------------------ */
/* 3. Brand marquee                                                    */
/* ------------------------------------------------------------------ */

function renderBrands() {
    const track = $('#brandTrack');
    if (!track) return;
    const items = BRANDS.map(b => `<span class="brand-item">${esc(b)}</span>`).join('');
    // Duplicated so the -50% translate loops seamlessly.
    track.innerHTML = items + items;
}

renderBrands();

/* ------------------------------------------------------------------ */
/* 4. Popular vehicles                                                 */
/* ------------------------------------------------------------------ */

function renderPopular() {
    const grid = $('#popularGrid');
    if (!grid) return;
    const top = sortVehicles(Store.getVehicles(), 'rating')
        .filter(v => v.reviews > 80)
        .slice(0, 6);
    renderGrid(grid, top);
}

renderPopular();

/* ------------------------------------------------------------------ */
/* 5. Categories                                                       */
/* ------------------------------------------------------------------ */

function renderCategories() {
    const grid = $('#catGrid');
    if (!grid) return;
    const vehicles = Store.getVehicles();

    grid.innerHTML = CATEGORIES.map((c, i) => {
        const inFleet = vehicles.filter(v => v.category === c.id);
        const available = inFleet.filter(v => v.status === 'available').length;
        return `
        <a href="explore-evs.html?cat=${esc(c.id)}" class="cat-card" data-reveal data-reveal-delay="${i * 60}">
            <div class="cat-icon"><i data-lucide="${esc(c.icon)}"></i></div>
            <div>
                <h3 class="cat-name">${esc(c.name)}</h3>
                <p class="cat-desc">${esc(c.desc)}</p>
            </div>
            <div class="cat-foot">
                <span class="cat-count"><strong>${available || c.count}</strong> available</span>
                <span class="cat-from">from <strong>${fmt.money(c.from)}</strong></span>
            </div>
        </a>`;
    }).join('');

    icons();
    // These cards are injected after boot() ran initReveal(), so the
    // IntersectionObserver never saw them — without this they stay at
    // opacity:0 and the section renders as a blank band.
    refreshReveal(grid);
}

renderCategories();

/* ------------------------------------------------------------------ */
/* 6. Live availability band + grid                                    */
/* ------------------------------------------------------------------ */

const BAND_CELLS = [
    { key: 'available',   label: 'Available',   cls: 'c-available' },
    { key: 'onTrip',      label: 'On Trip',     cls: 'c-on_trip',   dot: 'on_trip' },
    { key: 'charging',    label: 'Charging',    cls: 'c-charging',  dot: 'charging' },
    { key: 'reserved',    label: 'Reserved',    cls: 'c-reserved',  dot: 'reserved' },
    { key: 'maintenance', label: 'Maintenance', cls: 'c-maintenance', dot: 'maintenance' }
];

function renderBands() {
    const stats = RT.fleetStats();
    const html = BAND_CELLS.map(c => `
        <div class="live-cell ${c.cls}">
            <div class="live-cell-v" data-band="${c.key}">${stats[c.key]}</div>
            <div class="live-cell-k">
                <span class="status-dot ${c.dot || c.key}"></span>${c.label}
            </div>
        </div>`).join('');

    const band = $('#liveBand');
    const bento = $('#bentoBand');
    if (band) band.innerHTML = html;
    if (bento) bento.innerHTML = html;
}

function patchBands() {
    const stats = RT.fleetStats();
    BAND_CELLS.forEach(c => {
        $$(`[data-band="${c.key}"]`).forEach(node => {
            if (node.textContent !== String(stats[c.key])) {
                node.textContent = stats[c.key];
                node.classList.add('count-tick');
                setTimeout(() => node.classList.remove('count-tick'), 340);
            }
        });
    });
}

function renderLiveGrid() {
    const grid = $('#liveGrid');
    if (!grid) return;
    const live = Store.getVehicles()
        .filter(v => v.status === 'available')
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);
    renderGrid(grid, live.length ? live : Store.getVehicles().slice(0, 3));
}

renderBands();
renderLiveGrid();
bindLiveCards(document);

RT.on('vehicles', patchBands);

// Live clock in the section header.
const clock = $('#liveClock');
function tickClock() {
    if (clock) clock.textContent = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
}
tickClock();
setInterval(tickClock, 1000);

/* ------------------------------------------------------------------ */
/* 7. Station preview                                                  */
/* ------------------------------------------------------------------ */

function renderStations() {
    const wrap = $('#stationPreview');
    if (!wrap) return;

    const stations = Store.getStations()
        .slice()
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 4);

    wrap.innerHTML = stations.map(s => `
        <a href="charging-details.html?id=${esc(s.id)}" class="station-card" data-station="${esc(s.id)}">
            <div class="station-icon ${s.status === 'busy' ? 'busy' : s.status === 'offline' ? 'offline' : ''}">
                <i data-lucide="zap"></i>
            </div>
            <div class="station-body">
                <div class="station-name">${esc(s.name)}</div>
                <div class="station-meta">
                    <span><i data-lucide="map-pin"></i> ${s.distance} km</span>
                    <span><i data-lucide="gauge"></i> ${s.speed} kW</span>
                    <span><i data-lucide="indian-rupee"></i> ${s.price}/kWh</span>
                </div>
            </div>
            <div class="station-slots">
                <strong data-station-avail="${esc(s.id)}">${s.available}</strong>
                <span>of ${s.total} free</span>
            </div>
        </a>`).join('');

    icons();
}

renderStations();

RT.on('stations', stations => {
    stations.forEach(s => {
        const node = $(`[data-station-avail="${s.id}"]`);
        if (node && node.textContent !== String(s.available)) {
            node.textContent = s.available;
            node.classList.add('count-tick');
            setTimeout(() => node.classList.remove('count-tick'), 340);
        }
        const card = $(`[data-station="${s.id}"] .station-icon`);
        if (card) {
            card.className = `station-icon ${s.status === 'busy' ? 'busy' : s.status === 'offline' ? 'offline' : ''}`;
        }
    });
});

/* ------------------------------------------------------------------ */
/* 8. Locations                                                        */
/* ------------------------------------------------------------------ */

function renderLocations() {
    const grid = $('#locGrid');
    if (!grid) return;

    grid.innerHTML = LOCATIONS.slice(0, 8).map((l, i) => `
        <a href="explore-evs.html?loc=${esc(l.id)}" class="loc-card" data-reveal data-reveal-delay="${i * 50}">
            <img class="loc-photo" src="${esc(locationImage(l))}"
                 alt="${esc(l.area)}, ${esc(l.city)}"
                 data-fallback="${esc(l.city)} pickup location" loading="lazy" decoding="async">
            <div class="loc-card-top">
                <span class="loc-pin">
                    <i data-lucide="${l.type === 'airport' ? 'plane' : l.type === 'depot' ? 'warehouse' : 'map-pin'}"></i>
                </span>
                <span class="badge badge-green">${l.vehicles} EVs</span>
            </div>
            <div class="loc-body">
                <h3 class="loc-name">${esc(l.name)}</h3>
                <p class="loc-area">${esc(l.area)}, ${esc(l.city)}</p>
                <div class="loc-stats">
                    <div class="loc-stat"><strong>${l.vehicles}</strong> Vehicles</div>
                    <div class="loc-stat"><strong>${l.chargers}</strong> Chargers</div>
                </div>
            </div>
        </a>`).join('');

    icons();
    refreshReveal(grid);
}

renderLocations();

/* ------------------------------------------------------------------ */
/* 9. Testimonials                                                     */
/* ------------------------------------------------------------------ */

function renderTestimonials() {
    const grid = $('#testiGrid');
    if (!grid) return;

    grid.innerHTML = TESTIMONIALS.map((t, i) => `
        <article class="testi" data-reveal data-reveal-delay="${i * 70}">
            <span class="testi-quote" aria-hidden="true">"</span>
            <div class="stars" aria-label="${t.rating} out of 5 stars">
                ${Array.from({ length: 5 }, (_, s) =>
                    `<i data-lucide="star" class="${s < t.rating ? '' : 'star-empty'}" ${s < t.rating ? 'style="fill:currentColor"' : ''}></i>`
                ).join('')}
            </div>
            <p class="testi-text">${esc(t.text)}</p>
            <div class="testi-foot">
                <div class="avatar ${i % 3 === 1 ? 'avatar-blue' : i % 3 === 2 ? 'avatar-purple' : ''}">${esc(t.initials)}</div>
                <div class="testi-info">
                    <strong>${esc(t.name)}</strong>
                    <span>${esc(t.role)}</span>
                    <span class="testi-vehicle"><i data-lucide="car"></i> ${esc(t.vehicle)}</span>
                </div>
                <span class="text-muted" style="font-size:.74rem;white-space:nowrap">${esc(t.date)}</span>
            </div>
        </article>`).join('');

    icons();
    refreshReveal(grid);
}

renderTestimonials();

/* ------------------------------------------------------------------ */
/* 10. FAQ                                                             */
/* ------------------------------------------------------------------ */

function renderFaq() {
    const wrap = $('#homeFaq');
    if (!wrap) return;

    // One representative question per major category, capped at seven.
    const picked = [];
    const seen = new Set();
    FAQS.forEach(f => {
        if (picked.length >= 7) return;
        if (seen.has(f.cat)) return;
        seen.add(f.cat);
        picked.push(f);
    });
    // Top up with extras from Booking / Charging if short.
    FAQS.forEach(f => {
        if (picked.length < 7 && !picked.includes(f)) picked.push(f);
    });

    wrap.innerHTML = picked.map((f, i) => `
        <div class="acc-item ${i === 0 ? 'open' : ''}">
            <button class="acc-head" aria-expanded="${i === 0}">
                <span>${esc(f.q)}</span>
                <span class="acc-icon"><i data-lucide="chevron-down"></i></span>
            </button>
            <div class="acc-body" ${i === 0 ? 'style="max-height:400px"' : ''}>
                <div class="acc-body-inner">${esc(f.a)}</div>
            </div>
        </div>`).join('');

    icons();

    // Re-bind after dynamic insert, then size the first open panel correctly.
    import('./main.js').then(m => {
        m.initAccordions(wrap);
        const first = wrap.querySelector('.acc-item.open .acc-body');
        if (first) first.style.maxHeight = first.scrollHeight + 'px';
    });
}

renderFaq();
