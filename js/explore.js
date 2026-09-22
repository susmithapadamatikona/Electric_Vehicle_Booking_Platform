/* ==========================================================================
   EVRide — explore.js
   Explore / search page: filters, sorting, pagination, view modes, compare.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { CATEGORIES, BRANDS, CONNECTORS, LOCATIONS } from './data.js';
import { boot, fmt, $, $$, esc, icons, toast, debounce, openModal, closeModal } from './main.js';
import mountChrome from './navbar.js';
import {
    renderGrid, renderSkeletons, applyFilters, sortVehicles,
    bindLiveCards, bindFavorites, DEFAULT_FILTERS, patchCard
} from './vehicles.js';
import { createMap, plotVehicles } from './map.js';

boot();
mountChrome({ solidNav: true });
bindFavorites(document);

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const PER_PAGE = 9;

const state = {
    filters: { ...DEFAULT_FILTERS },
    sort: 'recommended',
    view: 'grid',
    page: 1,
    results: [],
    compare: []
};

let exploreMap = null;

/* ------------------------------------------------------------------ */
/* URL params → initial filters                                        */
/* ------------------------------------------------------------------ */

function readUrl() {
    const p = new URLSearchParams(location.search);
    if (p.get('cat')) state.filters.categories = [p.get('cat')];
    if (p.get('brand')) state.filters.brands = [p.get('brand')];
    if (p.get('q')) state.filters.q = p.get('q');
    if (p.get('available') === '1') state.filters.availableOnly = true;
    if (p.get('sort')) state.sort = p.get('sort');
    if (p.get('view')) state.view = p.get('view');

    // A location filter narrows to vehicles parked at that hub.
    const loc = p.get('loc');
    if (loc) {
        const l = LOCATIONS.find(x => x.id === loc);
        if (l) state.filters.q = l.area;
    }
}

function writeUrl() {
    const p = new URLSearchParams();
    if (state.filters.categories.length === 1) p.set('cat', state.filters.categories[0]);
    if (state.filters.q) p.set('q', state.filters.q);
    if (state.filters.availableOnly) p.set('available', '1');
    if (state.sort !== 'recommended') p.set('sort', state.sort);
    if (state.view !== 'grid') p.set('view', state.view);
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

readUrl();

/* ------------------------------------------------------------------ */
/* Build filter controls                                               */
/* ------------------------------------------------------------------ */

function buildFilters() {
    const vehicles = Store.getVehicles();

    // Categories — checkbox list with counts.
    $('#fCategories').innerHTML = CATEGORIES.map(c => {
        const n = vehicles.filter(v => v.category === c.id).length;
        if (!n) return '';
        return `
        <label class="check">
            <input type="checkbox" value="${esc(c.id)}" data-filter="categories"
                   ${state.filters.categories.includes(c.id) ? 'checked' : ''}>
            <span>${esc(c.name)}</span>
            <span class="filter-count">${n}</span>
        </label>`;
    }).join('');

    // Brands.
    $('#fBrands').innerHTML = BRANDS.map(b => {
        const n = vehicles.filter(v => v.brand === b).length;
        if (!n) return '';
        return `
        <label class="check">
            <input type="checkbox" value="${esc(b)}" data-filter="brands"
                   ${state.filters.brands.includes(b) ? 'checked' : ''}>
            <span>${esc(b)}</span>
            <span class="filter-count">${n}</span>
        </label>`;
    }).join('');

    // Seats.
    const seats = [...new Set(vehicles.map(v => v.seats))].sort((a, b) => a - b);
    $('#fSeats').innerHTML = seats.map(s =>
        `<button class="chip" data-chip="seats" data-val="${s}">${s} seats</button>`).join('');

    // Drive types.
    const drives = ['AWD', 'RWD', 'FWD'];
    $('#fDrive').innerHTML = drives.map(d =>
        `<button class="chip" data-chip="drive" data-val="${esc(d)}">${esc(d)}</button>`).join('');

    // Connectors.
    const used = [...new Set(vehicles.map(v => v.connector))];
    $('#fConnectors').innerHTML = CONNECTORS.filter(c => used.includes(c)).map(c =>
        `<button class="chip" data-chip="connectors" data-val="${esc(c)}">${esc(c)}</button>`).join('');

    // Restore search box.
    if (state.filters.q) $('#fQuery').value = state.filters.q;
    $('#fAvailable').checked = state.filters.availableOnly;
    $('#sortBy').value = state.sort;

    icons();
}

/* ------------------------------------------------------------------ */
/* Filter bindings                                                     */
/* ------------------------------------------------------------------ */

function bindFilterControls() {
    // Keyword.
    $('#fQuery').addEventListener('input', debounce(e => {
        state.filters.q = e.target.value;
        state.page = 1;
        update();
    }, 280));

    // Availability toggle.
    $('#fAvailable').addEventListener('change', e => {
        state.filters.availableOnly = e.target.checked;
        state.page = 1;
        update();
    });

    // Checkbox groups (categories, brands).
    document.addEventListener('change', e => {
        const input = e.target.closest('[data-filter]');
        if (!input) return;
        const key = input.dataset.filter;
        const val = input.value;
        const arr = state.filters[key];
        const i = arr.indexOf(val);
        if (input.checked && i === -1) arr.push(val);
        if (!input.checked && i > -1) arr.splice(i, 1);
        state.page = 1;
        update();
    });

    // Chip groups (seats, drive, connectors).
    document.addEventListener('click', e => {
        const chip = e.target.closest('[data-chip]');
        if (!chip) return;
        const key = chip.dataset.chip;
        const val = chip.dataset.val;
        const arr = state.filters[key];
        const i = arr.indexOf(val);
        if (i > -1) { arr.splice(i, 1); chip.classList.remove('active'); }
        else { arr.push(val); chip.classList.add('active'); }
        state.page = 1;
        update();
    });

    // Price slider.
    const priceMax = $('#fPriceMax');
    priceMax.addEventListener('input', e => {
        state.filters.priceMax = +e.target.value;
        $('#fPriceMaxLabel').textContent = fmt.money(e.target.value);
        $$('[data-price]').forEach(c => c.classList.remove('active'));
    });
    priceMax.addEventListener('change', () => { state.page = 1; update(); });

    $$('[data-price]').forEach(chip => {
        chip.addEventListener('click', () => {
            const active = chip.classList.contains('active');
            $$('[data-price]').forEach(c => c.classList.remove('active'));
            state.filters.priceMax = active ? 25000 : +chip.dataset.price;
            if (!active) chip.classList.add('active');
            priceMax.value = state.filters.priceMax;
            $('#fPriceMaxLabel').textContent = fmt.money(state.filters.priceMax);
            state.page = 1;
            update();
        });
    });

    // Range slider.
    const rangeSlider = $('#fRange');
    rangeSlider.addEventListener('input', e => {
        state.filters.rangeMin = +e.target.value;
        $('#fRangeLabel').textContent = +e.target.value === 0 ? 'Any' : `${e.target.value}+ km`;
    });
    rangeSlider.addEventListener('change', () => { state.page = 1; update(); });

    // Battery slider.
    const batterySlider = $('#fBattery');
    batterySlider.addEventListener('input', e => {
        state.filters.batteryMin = +e.target.value;
        $('#fBatteryLabel').textContent = +e.target.value === 0 ? 'Any' : `${e.target.value}%+`;
    });
    batterySlider.addEventListener('change', () => { state.page = 1; update(); });

    // Rating chips.
    $$('[data-rating]').forEach(chip => {
        chip.addEventListener('click', () => {
            const active = chip.classList.contains('active');
            $$('[data-rating]').forEach(c => c.classList.remove('active'));
            state.filters.minRating = active ? 0 : +chip.dataset.rating;
            if (!active) chip.classList.add('active');
            state.page = 1;
            update();
        });
    });

    // Collapsible groups.
    $$('.filter-title').forEach(title => {
        title.addEventListener('click', () => title.closest('.filter-group').classList.toggle('collapsed'));
    });

    // Sort.
    $('#sortBy').addEventListener('change', e => {
        state.sort = e.target.value;
        state.page = 1;
        update();
    });

    // View mode.
    $$('[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('[data-view]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.view = btn.dataset.view;
            update();
        });
    });

    // Clear all.
    $('#clearFilters').addEventListener('click', clearAll);
    document.addEventListener('click', e => {
        if (e.target.closest('[data-clear-filters]')) clearAll();
    });

    // Mobile filter panel.
    const panel = $('#filterPanel');
    const scrim = $('#filterScrim');
    const openPanel = () => {
        panel.classList.add('open');
        scrim.classList.add('open');
        document.body.classList.add('no-scroll');
        $('#filterClose').style.display = 'grid';
    };
    const closePanel = () => {
        panel.classList.remove('open');
        scrim.classList.remove('open');
        document.body.classList.remove('no-scroll');
    };
    $('#filterOpen').addEventListener('click', openPanel);
    $('#filterClose').addEventListener('click', closePanel);
    $('#applyFilters').addEventListener('click', closePanel);
    scrim.addEventListener('click', closePanel);
}

function clearAll() {
    state.filters = { ...DEFAULT_FILTERS, categories: [], brands: [], seats: [], drive: [], connectors: [] };
    state.page = 1;

    $('#fQuery').value = '';
    $('#fAvailable').checked = false;
    $('#fPriceMax').value = 25000;
    $('#fPriceMaxLabel').textContent = '₹25,000';
    $('#fRange').value = 0;
    $('#fRangeLabel').textContent = 'Any';
    $('#fBattery').value = 0;
    $('#fBatteryLabel').textContent = 'Any';
    $$('.filters .chip').forEach(c => c.classList.remove('active'));
    $$('[data-filter]').forEach(i => { i.checked = false; });

    update();
    toast('All filters cleared', 'info');
}

/* ------------------------------------------------------------------ */
/* Active filter pills                                                 */
/* ------------------------------------------------------------------ */

function renderActivePills() {
    const wrap = $('#activeFilters');
    const pills = [];

    const add = (label, onRemove) => pills.push({ label, onRemove });

    if (state.filters.q) add(`"${state.filters.q}"`, () => { state.filters.q = ''; $('#fQuery').value = ''; });
    if (state.filters.availableOnly) add('Available now', () => { state.filters.availableOnly = false; $('#fAvailable').checked = false; });

    state.filters.categories.forEach(c => {
        const cat = CATEGORIES.find(x => x.id === c);
        add(cat ? cat.name : c, () => {
            state.filters.categories = state.filters.categories.filter(x => x !== c);
            const input = $(`[data-filter="categories"][value="${c}"]`);
            if (input) input.checked = false;
        });
    });

    state.filters.brands.forEach(b => add(b, () => {
        state.filters.brands = state.filters.brands.filter(x => x !== b);
        const input = $(`[data-filter="brands"][value="${b}"]`);
        if (input) input.checked = false;
    }));

    state.filters.seats.forEach(s => add(`${s} seats`, () => {
        state.filters.seats = state.filters.seats.filter(x => x !== s);
        $(`[data-chip="seats"][data-val="${s}"]`)?.classList.remove('active');
    }));

    state.filters.drive.forEach(d => add(d, () => {
        state.filters.drive = state.filters.drive.filter(x => x !== d);
        $(`[data-chip="drive"][data-val="${d}"]`)?.classList.remove('active');
    }));

    state.filters.connectors.forEach(c => add(c, () => {
        state.filters.connectors = state.filters.connectors.filter(x => x !== c);
        $(`[data-chip="connectors"][data-val="${c}"]`)?.classList.remove('active');
    }));

    if (state.filters.priceMax < 25000) add(`Under ${fmt.money(state.filters.priceMax)}`, () => {
        state.filters.priceMax = 25000;
        $('#fPriceMax').value = 25000;
        $('#fPriceMaxLabel').textContent = '₹25,000';
        $$('[data-price]').forEach(c => c.classList.remove('active'));
    });

    if (state.filters.rangeMin > 0) add(`${state.filters.rangeMin}+ km range`, () => {
        state.filters.rangeMin = 0;
        $('#fRange').value = 0;
        $('#fRangeLabel').textContent = 'Any';
    });

    if (state.filters.batteryMin > 0) add(`${state.filters.batteryMin}%+ battery`, () => {
        state.filters.batteryMin = 0;
        $('#fBattery').value = 0;
        $('#fBatteryLabel').textContent = 'Any';
    });

    if (state.filters.minRating > 0) add(`${state.filters.minRating}+ rating`, () => {
        state.filters.minRating = 0;
        $$('[data-rating]').forEach(c => c.classList.remove('active'));
    });

    // Badge on the mobile trigger.
    const badge = $('#filterBadge');
    badge.textContent = pills.length;
    badge.hidden = pills.length === 0;

    if (!pills.length) { wrap.innerHTML = ''; return; }

    wrap.innerHTML = pills.map((p, i) => `
        <span class="pill-remove">
            ${esc(p.label)}
            <button data-pill="${i}" aria-label="Remove ${esc(p.label)} filter"><i data-lucide="x"></i></button>
        </span>`).join('') +
        `<button class="btn-link" style="font-size:.79rem" data-clear-filters>Clear all</button>`;

    icons();

    $$('[data-pill]', wrap).forEach(btn => {
        btn.addEventListener('click', () => {
            pills[+btn.dataset.pill].onRemove();
            state.page = 1;
            update();
        });
    });
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

function renderPagination() {
    const wrap = $('#pagination');
    const pages = Math.ceil(state.results.length / PER_PAGE);

    if (pages <= 1 || state.view === 'map') { wrap.innerHTML = ''; return; }

    const p = state.page;
    const nums = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - p) <= 1) nums.push(i);
        else if (nums[nums.length - 1] !== '…') nums.push('…');
    }

    wrap.innerHTML = `
        <button class="page-btn" data-page="${p - 1}" ${p === 1 ? 'disabled' : ''} aria-label="Previous page">
            <i data-lucide="chevron-left"></i>
        </button>
        ${nums.map(n => n === '…'
            ? `<span class="page-btn" style="border:none;background:none;pointer-events:none">…</span>`
            : `<button class="page-btn ${n === p ? 'active' : ''}" data-page="${n}" ${n === p ? 'aria-current="page"' : ''}>${n}</button>`
        ).join('')}
        <button class="page-btn" data-page="${p + 1}" ${p === pages ? 'disabled' : ''} aria-label="Next page">
            <i data-lucide="chevron-right"></i>
        </button>`;

    icons();

    $$('[data-page]', wrap).forEach(btn => {
        btn.addEventListener('click', () => {
            const n = +btn.dataset.page;
            if (n < 1 || n > pages || n === p) return;
            state.page = n;
            update();
            $('.results-bar').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

/* ------------------------------------------------------------------ */
/* Map view                                                            */
/* ------------------------------------------------------------------ */

function showMap() {
    $('#mapView').hidden = false;
    $('#vehicleGrid').hidden = true;

    if (!exploreMap) {
        exploreMap = createMap('exploreMap', { zoom: 12 });
    }
    exploreMap.invalidate();
    plotVehicles(exploreMap, state.results);
    if (!exploreMap.isFallback) exploreMap.fitMarkers();
}

function hideMap() {
    $('#mapView').hidden = true;
    $('#vehicleGrid').hidden = false;
}

/* ------------------------------------------------------------------ */
/* Compare                                                             */
/* ------------------------------------------------------------------ */

function bindCompare() {
    document.addEventListener('click', e => {
        const btn = e.target.closest('[data-compare]');
        if (!btn) return;
        e.preventDefault();
        toggleCompare(btn.dataset.compare);
    });

    $('#compareClear').addEventListener('click', () => {
        state.compare = [];
        renderCompareBar();
    });

    $('#compareGo').addEventListener('click', () => {
        if (state.compare.length < 2) {
            toast('Pick at least two vehicles to compare', 'warning');
            return;
        }
        renderCompareModal();
        openModal('compareModal');
    });
}

function toggleCompare(id) {
    const i = state.compare.indexOf(id);
    if (i > -1) state.compare.splice(i, 1);
    else {
        if (state.compare.length >= 3) {
            toast('You can compare up to three vehicles at a time', 'warning');
            return;
        }
        state.compare.push(id);
    }
    renderCompareBar();
}

function renderCompareBar() {
    const bar = $('#compareBar');
    const items = $('#compareItems');

    $('#compareCount').textContent = state.compare.length;
    bar.classList.toggle('show', state.compare.length > 0);

    items.innerHTML = state.compare.map(id => {
        const v = Store.getVehicle(id);
        if (!v) return '';
        return `
        <div class="compare-item">
            <img src="${esc(v.image)}" alt="" data-fallback="${esc(v.brand)}">
            <span>${esc(v.name)}</span>
            <button data-compare="${esc(v.id)}" aria-label="Remove ${esc(v.name)}"><i data-lucide="x"></i></button>
        </div>`;
    }).join('');

    icons();
}

function renderCompareModal() {
    const vehicles = state.compare.map(id => Store.getVehicle(id)).filter(Boolean);

    const rows = [
        ['Price per day',   v => fmt.money(v.price)],
        ['Live battery',    v => `${Math.round(v.battery)}%`],
        ['Live range',      v => `${v.range} km`],
        ['Max range (WLTP)',v => `${v.rangeMax} km`],
        ['Battery capacity',v => `${v.batteryCapacity} kWh`],
        ['0–100 km/h',      v => `${v.accel}s`],
        ['Top speed',       v => `${v.topSpeed} km/h`],
        ['Power',           v => `${v.power} hp`],
        ['Seats',           v => v.seats],
        ['Drive',           v => v.drive],
        ['Charging port',   v => v.connector],
        ['Peak charge',     v => v.peakCharge ? `${v.peakCharge} kW` : 'AC only'],
        ['Boot space',      v => `${v.boot} L`],
        ['Rating',          v => `${v.rating} ★ (${v.reviews})`],
        ['Status',          v => fmt.statusLabel(v.status)]
    ];

    $('#compareBody').innerHTML = `
    <div class="table-wrap" style="border:none">
        <table class="table" style="min-width:${180 + vehicles.length * 170}px">
            <thead>
                <tr>
                    <th style="width:180px">Specification</th>
                    ${vehicles.map(v => `
                    <th style="text-align:left">
                        <div style="display:flex;flex-direction:column;gap:8px;text-transform:none;letter-spacing:0">
                            <img src="${esc(v.image)}" alt="${esc(v.name)}" data-fallback="${esc(v.brand)}"
                                 style="width:100%;height:76px;object-fit:cover;border-radius:8px">
                            <strong style="color:var(--text-primary);font-size:.86rem">${esc(v.name)}</strong>
                        </div>
                    </th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${rows.map(([label, fn]) => `
                <tr>
                    <td class="cell-strong">${esc(label)}</td>
                    ${vehicles.map(v => `<td>${esc(String(fn(v)))}</td>`).join('')}
                </tr>`).join('')}
                <tr>
                    <td class="cell-strong">Book</td>
                    ${vehicles.map(v => `
                    <td>
                        <a href="${v.status === 'available' ? `booking.html?vehicle=${esc(v.id)}` : '#'}"
                           class="btn btn-primary btn-xs ${v.status === 'available' ? '' : 'is-disabled'}">
                            ${v.status === 'available' ? 'Book' : esc(fmt.statusLabel(v.status))}
                        </a>
                    </td>`).join('')}
                </tr>
            </tbody>
        </table>
    </div>`;

    icons();
}

/* ------------------------------------------------------------------ */
/* Main update loop                                                    */
/* ------------------------------------------------------------------ */

function update() {
    const all = Store.getVehicles();

    state.results = sortVehicles(applyFilters(all, state.filters), state.sort);

    // Counts.
    $('#resultCount').textContent = state.results.length;
    $('#filterResultCount').textContent = state.results.length;
    $('#headAvail').textContent = all.filter(v => v.status === 'available').length;
    $('#headTotal').textContent = all.length;

    renderActivePills();
    writeUrl();

    if (state.view === 'map') {
        showMap();
        renderPagination();
        return;
    }

    hideMap();

    const grid = $('#vehicleGrid');
    grid.classList.toggle('list-view', state.view === 'list');

    // Clamp page after a filter change shrinks the result set.
    const pages = Math.max(1, Math.ceil(state.results.length / PER_PAGE));
    if (state.page > pages) state.page = pages;

    const start = (state.page - 1) * PER_PAGE;
    const pageItems = state.results.slice(start, start + PER_PAGE);

    renderGrid(grid, pageItems, state.view === 'list' ? 'list' : 'grid');

    // Inject compare buttons into each rendered card.
    pageItems.forEach(v => {
        const card = grid.querySelector(`[data-vehicle="${v.id}"] .v-head`);
        if (!card || card.querySelector('[data-compare]')) return;
        const btn = document.createElement('button');
        btn.className = 'v-fav' + (state.compare.includes(v.id) ? ' active' : '');
        btn.dataset.compare = v.id;
        btn.setAttribute('aria-label', `Compare ${v.name}`);
        btn.innerHTML = '<i data-lucide="git-compare"></i>';
        card.appendChild(btn);
    });
    icons();

    renderPagination();
}

/* ------------------------------------------------------------------ */
/* Live updates                                                        */
/* ------------------------------------------------------------------ */

RT.on('vehicles', vehicles => {
    // Patch visible cards without re-rendering.
    vehicles.forEach(v => patchCard(v));

    $('#headAvail').textContent = vehicles.filter(v => v.status === 'available').length;

    // Keep the map in step.
    if (state.view === 'map' && exploreMap) {
        const filtered = sortVehicles(applyFilters(vehicles, state.filters), state.sort);
        plotVehicles(exploreMap, filtered);
    }

    // If "available only" is on, a status change alters the result set —
    // re-run the filter so the grid stays truthful.
    if (state.filters.availableOnly) {
        const next = sortVehicles(applyFilters(vehicles, state.filters), state.sort);
        if (next.length !== state.results.length) update();
    }
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

buildFilters();
bindFilterControls();
bindCompare();

// Restore chip states that came from the URL.
state.filters.seats.forEach(s => $(`[data-chip="seats"][data-val="${s}"]`)?.classList.add('active'));
state.filters.drive.forEach(d => $(`[data-chip="drive"][data-val="${d}"]`)?.classList.add('active'));
state.filters.connectors.forEach(c => $(`[data-chip="connectors"][data-val="${c}"]`)?.classList.add('active'));

// Set the active view button from the URL.
$$('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));

// Brief skeleton so the first paint feels like a real query.
renderSkeletons($('#vehicleGrid'), 6);
setTimeout(update, 420);
