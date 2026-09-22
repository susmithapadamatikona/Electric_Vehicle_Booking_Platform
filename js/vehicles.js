/* ==========================================================================
   EVRide — vehicles.js
   Vehicle card rendering, filtering, sorting and the live-update binding that
   keeps rendered cards in sync with the real-time engine.
   ========================================================================== */

import Store from './storage.js';
import RT from './realtime.js';
import { CATEGORIES, BRANDS } from './data.js';
import { $, $$, esc, fmt, icons, toast } from './main.js';

/* ------------------------------------------------------------------ */
/* Card templates                                                      */
/* ------------------------------------------------------------------ */

export function statusChip(status) {
    return `<span class="status status-${esc(status)}">
        <span class="status-dot"></span>${esc(fmt.statusLabel(status))}
    </span>`;
}

export function batteryBlock(v, compact = false) {
    const cls = fmt.batteryClass(v.battery);
    const pct = Math.round(v.battery);
    if (compact) {
        return `<span class="battery" data-battery="${esc(v.id)}">
            <span class="battery-shell"><span class="battery-fill ${cls}" style="width:${pct}%"></span></span>
            <span class="battery-val">${pct}%</span>
        </span>`;
    }
    return `
    <div class="v-battery" data-battery="${esc(v.id)}">
        <div class="v-battery-head">
            <span><i data-lucide="battery-charging"></i> Battery</span>
            <span class="battery-val">${pct}%</span>
        </div>
        <div class="bar bar-sm"><div class="bar-fill ${cls === 'low' ? 'danger' : cls === 'mid' ? 'warn' : 'green'}" style="width:${pct}%"></div></div>
    </div>`;
}

/**
 * Grid card. `variant` may be 'grid' (default), 'list' or 'compact'.
 */
export function vehicleCard(v, variant = 'grid') {
    const fav = Store.isFavorite(v.id);
    const cat = CATEGORIES.find(c => c.id === v.category);
    const disabled = v.status !== 'available';

    if (variant === 'list') {
        return `
        <article class="v-card v-card-list ${disabled ? 'is-unavailable' : ''}" data-vehicle="${esc(v.id)}" data-reveal="fade">
            <a href="ev-details.html?id=${esc(v.id)}" class="v-media">
                <img src="${esc(v.image)}" alt="${esc(v.brand)} ${esc(v.name)} electric vehicle" data-fallback="${esc(v.brand)} ${esc(v.model)}" data-vehicle-art="${esc(v.artFallback || '')}" loading="lazy">
                <span class="v-status" data-status-slot="${esc(v.id)}">${statusChip(v.status)}</span>
            </a>
            <div class="v-body">
                <div class="v-head">
                    <div>
                        <span class="v-brand">${esc(v.brand)}</span>
                        <h3 class="v-name"><a href="ev-details.html?id=${esc(v.id)}">${esc(v.name)}</a></h3>
                    </div>
                    <button class="v-fav ${fav ? 'active' : ''}" data-fav="${esc(v.id)}" aria-label="Save to wishlist" aria-pressed="${fav}">
                        <i data-lucide="heart"></i>
                    </button>
                </div>
                <div class="v-tags">
                    <span class="badge badge-muted">${esc(cat ? cat.name : v.category)}</span>
                    <span class="badge badge-muted">${v.seats} seats</span>
                    <span class="badge badge-muted">${esc(v.drive)}</span>
                    <span class="badge badge-muted">${esc(v.connector)}</span>
                </div>
                <div class="v-metrics">
                    ${batteryBlock(v)}
                    <div class="v-metric">
                        <span class="v-metric-k"><i data-lucide="gauge"></i> Live range</span>
                        <span class="v-metric-v" data-range="${esc(v.id)}">${v.range} km</span>
                    </div>
                    <div class="v-metric">
                        <span class="v-metric-k"><i data-lucide="map-pin"></i> Location</span>
                        <span class="v-metric-v" data-distance="${esc(v.id)}">${esc(v.area)} · ${v.distance} km</span>
                    </div>
                </div>
            </div>
            <div class="v-aside">
                <div class="rating"><i data-lucide="star"></i> ${v.rating} <span>(${v.reviews})</span></div>
                <div class="v-price">
                    <strong>${fmt.money(v.price)}</strong>
                    <span>/ day</span>
                </div>
                <a href="404.html" class="btn btn-primary btn-sm btn-block ${disabled ? 'is-disabled' : ''}">
                    ${disabled ? fmt.statusLabel(v.status) : 'Book Now'}
                </a>
                <a href="ev-details.html?id=${esc(v.id)}" class="btn btn-secondary btn-sm btn-block">View Details</a>
            </div>
        </article>`;
    }

    return `
    <article class="v-card ${disabled ? 'is-unavailable' : ''}" data-vehicle="${esc(v.id)}" data-reveal>
        <a href="ev-details.html?id=${esc(v.id)}" class="v-media">
            <img src="${esc(v.image)}" alt="${esc(v.brand)} ${esc(v.name)} electric vehicle" data-fallback="${esc(v.brand)} ${esc(v.model)}" data-vehicle-art="${esc(v.artFallback || '')}" loading="lazy">
            <span class="v-status" data-status-slot="${esc(v.id)}">${statusChip(v.status)}</span>
            <span class="v-cat">${esc(cat ? cat.name : v.category)}</span>
            ${v.price > 10000 ? '<span class="v-ribbon">Premium</span>' : ''}
        </a>
        <div class="v-body">
            <div class="v-head">
                <div style="min-width:0">
                    <span class="v-brand">${esc(v.brand)} · ${v.year}</span>
                    <h3 class="v-name"><a href="ev-details.html?id=${esc(v.id)}">${esc(v.name)}</a></h3>
                </div>
                <button class="v-fav ${fav ? 'active' : ''}" data-fav="${esc(v.id)}" aria-label="Save to wishlist" aria-pressed="${fav}">
                    <i data-lucide="heart"></i>
                </button>
            </div>

            ${batteryBlock(v)}

            <div class="v-stats">
                <div class="v-stat">
                    <i data-lucide="gauge"></i>
                    <span data-range="${esc(v.id)}">${v.range} km</span>
                    <small>Live range</small>
                </div>
                <div class="v-stat">
                    <i data-lucide="users"></i>
                    <span>${v.seats}</span>
                    <small>Seats</small>
                </div>
                <div class="v-stat">
                    <i data-lucide="zap"></i>
                    <span>${v.accel}s</span>
                    <small>0–100</small>
                </div>
            </div>

            <div class="v-loc">
                <i data-lucide="map-pin"></i>
                <span data-distance="${esc(v.id)}">${esc(v.area)} · <strong>${v.distance} km</strong> away</span>
            </div>

            <div class="v-foot">
                <div class="v-price">
                    <strong>${fmt.money(v.price)}</strong>
                    <span>/ day</span>
                </div>
                <div class="rating"><i data-lucide="star"></i> ${v.rating} <span>(${v.reviews})</span></div>
            </div>

            <div class="v-actions">
                <a href="${disabled ? '#' : `booking.html?vehicle=${esc(v.id)}`}" class="btn btn-primary btn-sm flex-1 ${disabled ? 'is-disabled' : ''}">
                    <i data-lucide="${disabled ? 'clock' : 'zap'}"></i>
                    ${disabled ? fmt.statusLabel(v.status) : 'Book Now'}
                </a>
                <a href="ev-details.html?id=${esc(v.id)}" class="btn btn-secondary btn-sm btn-icon" aria-label="View ${esc(v.name)} details">
                    <i data-lucide="arrow-right"></i>
                </a>
            </div>
        </div>
    </article>`;
}

/** Slim card used in the hero, sidebars and dashboards. */
export function vehicleMini(v) {
    return `
    <a href="ev-details.html?id=${esc(v.id)}" class="v-mini" data-vehicle="${esc(v.id)}">
        <img src="${esc(v.image)}" alt="${esc(v.name)}" data-fallback="${esc(v.brand)}" data-vehicle-art="${esc(v.artFallback || '')}" loading="lazy">
        <div class="v-mini-body">
            <strong>${esc(v.name)}</strong>
            <span>${esc(v.brand)} · ${esc(v.area)}</span>
            <div class="v-mini-meta">
                ${batteryBlock(v, true)}
                <span class="text-muted">${v.range} km</span>
            </div>
        </div>
        <div class="v-mini-price">
            <strong>${fmt.money(v.price)}</strong>
            <span>/day</span>
        </div>
    </a>`;
}

/* ------------------------------------------------------------------ */
/* Live binding                                                        */
/* ------------------------------------------------------------------ */

/**
 * Patch already-rendered cards in place instead of re-rendering the grid.
 * Avoids destroying scroll position, focus and CSS transitions.
 */
export function bindLiveCards(root = document) {
    return RT.on('vehicles', vehicles => {
        vehicles.forEach(v => patchCard(v, root));
    });
}

export function patchCard(v, root = document) {
    const pct = Math.round(v.battery);

    $$(`[data-battery="${v.id}"]`, root).forEach(node => {
        const fill = node.querySelector('.battery-fill, .bar-fill');
        const val = node.querySelector('.battery-val');
        if (fill) {
            fill.style.width = pct + '%';
            const cls = fmt.batteryClass(v.battery);
            fill.className = fill.classList.contains('bar-fill')
                ? `bar-fill ${cls === 'low' ? 'danger' : cls === 'mid' ? 'warn' : 'green'}`
                : `battery-fill ${cls}`;
        }
        if (val) val.textContent = pct + '%';
    });

    $$(`[data-range="${v.id}"]`, root).forEach(n => { n.textContent = v.range + ' km'; });

    $$(`[data-distance="${v.id}"]`, root).forEach(n => {
        n.innerHTML = `${esc(v.area)} · <strong>${v.distance} km</strong> away`;
    });

    $$(`[data-status-slot="${v.id}"]`, root).forEach(n => {
        if (n.dataset.lastStatus === v.status) return;
        n.dataset.lastStatus = v.status;
        n.innerHTML = statusChip(v.status);
        n.classList.add('flash');
        setTimeout(() => n.classList.remove('flash'), 900);
    });

    $$(`[data-vehicle="${v.id}"]`, root).forEach(card => {
        card.classList.toggle('is-unavailable', v.status !== 'available');
        const bookBtn = card.querySelector('.v-actions .btn-primary, .v-aside .btn-primary');
        if (bookBtn) {
            const disabled = v.status !== 'available';
            bookBtn.classList.toggle('is-disabled', disabled);
            bookBtn.href = disabled ? '#' : `booking.html?vehicle=${v.id}`;
            const label = bookBtn.childNodes[bookBtn.childNodes.length - 1];
            if (label && label.nodeType === 3) label.textContent = disabled ? fmt.statusLabel(v.status) : ' Book Now';
        }
    });
}

/* ------------------------------------------------------------------ */
/* Favorites                                                           */
/* ------------------------------------------------------------------ */

export function bindFavorites(root = document) {
    root.addEventListener('click', e => {
        const btn = e.target.closest('[data-fav]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.fav;
        const added = Store.toggleFavorite(id);
        // Sync every instance of this vehicle's heart on the page.
        $$(`[data-fav="${id}"]`).forEach(b => {
            b.classList.toggle('active', added);
            b.setAttribute('aria-pressed', String(added));
        });
        const v = Store.getVehicle(id);
        toast(
            added ? `${v ? v.name : 'Vehicle'} saved to your wishlist` : `Removed from wishlist`,
            added ? 'success' : 'info'
        );
    });
}

/* ------------------------------------------------------------------ */
/* Filtering & sorting                                                 */
/* ------------------------------------------------------------------ */

export const DEFAULT_FILTERS = {
    q: '',
    categories: [],
    brands: [],
    priceMin: 0,
    priceMax: 25000,
    rangeMin: 0,
    seats: [],
    drive: [],
    connectors: [],
    availableOnly: false,
    minRating: 0,
    batteryMin: 0
};

export function applyFilters(vehicles, f) {
    const q = (f.q || '').trim().toLowerCase();

    return vehicles.filter(v => {
        if (q && !`${v.name} ${v.brand} ${v.model} ${v.category} ${v.area} ${v.tags.join(' ')}`.toLowerCase().includes(q)) return false;
        if (f.categories.length && !f.categories.includes(v.category)) return false;
        if (f.brands.length && !f.brands.includes(v.brand)) return false;
        if (v.price < f.priceMin || v.price > f.priceMax) return false;
        if (v.rangeMax < f.rangeMin) return false;
        if (f.seats.length && !f.seats.includes(String(v.seats))) return false;
        if (f.drive.length && !f.drive.some(d => v.drive.includes(d))) return false;
        if (f.connectors.length && !f.connectors.includes(v.connector)) return false;
        if (f.availableOnly && v.status !== 'available') return false;
        if (f.minRating && v.rating < f.minRating) return false;
        if (f.batteryMin && v.battery < f.batteryMin) return false;
        return true;
    });
}

export const SORTS = {
    recommended: (a, b) => (b.rating * 20 + (b.status === 'available' ? 60 : 0) - b.distance * 2)
                         - (a.rating * 20 + (a.status === 'available' ? 60 : 0) - a.distance * 2),
    'price-asc':  (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    range:        (a, b) => b.rangeMax - a.rangeMax,
    rating:       (a, b) => b.rating - a.rating,
    battery:      (a, b) => b.battery - a.battery,
    distance:     (a, b) => a.distance - b.distance,
    newest:       (a, b) => b.addedAt - a.addedAt
};

export function sortVehicles(list, key = 'recommended') {
    return [...list].sort(SORTS[key] || SORTS.recommended);
}

/* ------------------------------------------------------------------ */
/* Grid renderer                                                       */
/* ------------------------------------------------------------------ */

export function renderGrid(container, vehicles, variant = 'grid') {
    if (!container) return;

    if (!vehicles.length) {
        container.innerHTML = `
        <div class="empty" style="grid-column:1/-1">
            <div class="empty-icon"><i data-lucide="search-x"></i></div>
            <h4>No vehicles match your filters</h4>
            <p>Try widening your price range, clearing a brand filter, or switching off "Available now".</p>
            <button class="btn btn-secondary btn-sm mt-4" data-clear-filters>
                <i data-lucide="rotate-ccw"></i> Reset all filters
            </button>
        </div>`;
        icons();
        return;
    }

    container.innerHTML = vehicles.map(v => vehicleCard(v, variant)).join('');
    icons();
    // Cards inserted after the IntersectionObserver ran — reveal immediately.
    requestAnimationFrame(() => $$('[data-reveal]', container).forEach((n, i) => {
        setTimeout(() => n.classList.add('revealed'), Math.min(i * 40, 400));
    }));
}

/** Skeleton placeholders while a "search" is in flight. */
export function renderSkeletons(container, n = 6) {
    if (!container) return;
    container.innerHTML = Array.from({ length: n }, () => `
        <div class="card" style="padding:0;overflow:hidden">
            <div class="skeleton sk-img" style="margin:0;border-radius:0"></div>
            <div style="padding:20px">
                <div class="skeleton sk-text w-40"></div>
                <div class="skeleton sk-text w-60" style="height:18px"></div>
                <div class="skeleton sk-text"></div>
                <div class="skeleton sk-text w-60"></div>
            </div>
        </div>`).join('');
}

export default {
    vehicleCard, vehicleMini, statusChip, batteryBlock,
    renderGrid, renderSkeletons, applyFilters, sortVehicles,
    bindLiveCards, bindFavorites, patchCard, DEFAULT_FILTERS, SORTS
};
