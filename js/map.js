/* ==========================================================================
   EVRide — map.js
   Leaflet wrapper with a graceful CSS fallback when the library or tiles are
   unavailable (offline demo, blocked CDN). Every page that shows a map calls
   createMap() and gets back the same API either way.
   ========================================================================== */

import { CITY } from './data.js';
import { esc, fmt, icons } from './main.js';

const hasLeaflet = () => typeof window !== 'undefined' && typeof window.L !== 'undefined';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{x}/{y}/{z}.png'
    .replace('{x}/{y}/{z}', '{z}/{x}/{y}');
const TILE_ATTR = '&copy; OpenStreetMap contributors';

/* ------------------------------------------------------------------ */
/* Marker icons                                                        */
/* ------------------------------------------------------------------ */

const MARKER_GLYPH = {
    available:   'car',
    on_trip:     'navigation',
    charging:    'zap',
    reserved:    'clock',
    maintenance: 'wrench',
    station:     'zap',
    user:        'user',
    pickup:      'map-pin',
    destination: 'flag'
};

function markerHTML(status, pulsing = false) {
    const glyph = MARKER_GLYPH[status] || 'map-pin';
    return `<div class="ev-marker m-${esc(status)} ${pulsing ? 'pulsing' : ''}" style="position:relative">
        <i data-lucide="${glyph}"></i>
    </div>`;
}

function leafletIcon(status, pulsing) {
    return window.L.divIcon({
        html: markerHTML(status, pulsing),
        className: 'ev-marker-wrap',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -18]
    });
}

/* ------------------------------------------------------------------ */
/* Popup builders                                                      */
/* ------------------------------------------------------------------ */

export function vehiclePopup(v) {
    return `
    <div class="map-popup">
        <img src="${esc(v.image)}" alt="${esc(v.name)}" onerror="this.style.display='none'">
        <h6>${esc(v.name)}</h6>
        <div class="map-popup-meta">
            <span>${Math.round(v.battery)}% battery</span>
            <span>${v.range} km</span>
            <span>${v.distance} km away</span>
        </div>
        <div class="map-popup-meta">
            <span style="color:var(--primary);font-weight:600">${fmt.money(v.price)}/day</span>
            <span>${esc(fmt.statusLabel(v.status))}</span>
        </div>
        <a href="ev-details.html?id=${esc(v.id)}" class="btn btn-primary btn-xs btn-block">View details</a>
    </div>`;
}

export function stationPopup(s) {
    return `
    <div class="map-popup">
        <h6>${esc(s.name)}</h6>
        <div class="map-popup-meta">
            <span><strong style="color:var(--primary)">${s.available}</strong> of ${s.total} free</span>
            <span>${s.speed} kW</span>
        </div>
        <div class="map-popup-meta">
            <span>${fmt.money(s.price)}/kWh</span>
            <span>${esc(s.hours)}</span>
        </div>
        <a href="charging-details.html?id=${esc(s.id)}" class="btn btn-primary btn-xs btn-block">View station</a>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* CSS fallback map                                                    */
/* ------------------------------------------------------------------ */

class FallbackMap {
    constructor(container, opts) {
        this.container = container;
        this.center = opts.center || [CITY.lat, CITY.lng];
        this.zoom = opts.zoom || 12;
        this.markers = new Map();
        this.isFallback = true;

        this.surface = document.createElement('div');
        this.surface.className = 'map-fallback';
        this.surface.innerHTML = `
            <svg class="map-fallback-roads" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0,38 Q28,32 52,44 T100,36" stroke="rgba(0,230,118,.22)" stroke-width="0.7" fill="none"/>
                <path d="M0,66 Q34,74 62,58 T100,68" stroke="rgba(0,200,255,.18)" stroke-width="0.7" fill="none"/>
                <path d="M22,0 Q30,34 20,58 T28,100" stroke="rgba(255,255,255,.08)" stroke-width="0.5" fill="none"/>
                <path d="M72,0 Q66,38 78,62 T70,100" stroke="rgba(255,255,255,.08)" stroke-width="0.5" fill="none"/>
            </svg>
            <div class="map-fallback-note">Interactive preview — live map unavailable offline</div>`;

        // Insert behind any overlay children already in the container.
        container.insertBefore(this.surface, container.firstChild);
    }

    /** Project lat/lng into a percentage position within the container. */
    _project(lat, lng) {
        const spread = 0.22 / Math.max(1, this.zoom / 12);
        const x = 50 + ((lng - this.center[1]) / spread) * 50;
        const y = 50 - ((lat - this.center[0]) / spread) * 50;
        return {
            x: Math.max(4, Math.min(96, x)),
            y: Math.max(5, Math.min(95, y))
        };
    }

    addMarker(id, lat, lng, { status = 'available', popup = '', pulsing = false } = {}) {
        const { x, y } = this._project(lat, lng);
        let node = this.markers.get(id);

        if (!node) {
            node = document.createElement('div');
            node.className = 'fallback-marker';
            node.innerHTML = markerHTML(status, pulsing);
            node.style.transition = 'left 1.8s linear, top 1.8s linear';
            if (popup) {
                node.style.cursor = 'pointer';
                node.title = node.textContent.trim();
                node.addEventListener('click', () => this._showPopup(node, popup));
            }
            this.surface.appendChild(node);
            this.markers.set(id, node);
            icons();
        } else {
            const inner = node.querySelector('.ev-marker');
            if (inner) inner.className = `ev-marker m-${status} ${pulsing ? 'pulsing' : ''}`;
        }

        node.style.left = x + '%';
        node.style.top = y + '%';
        return node;
    }

    _showPopup(anchor, html) {
        this.surface.querySelectorAll('.fallback-popup').forEach(p => p.remove());
        const pop = document.createElement('div');
        pop.className = 'fallback-popup';
        pop.style.cssText = `position:absolute;left:${anchor.style.left};top:${anchor.style.top};
            transform:translate(-50%,calc(-100% - 22px));z-index:20;background:rgba(16,31,39,.98);
            border:1px solid var(--border);border-radius:14px;padding:12px;width:210px;
            box-shadow:var(--shadow-lg)`;
        pop.innerHTML = html;
        pop.addEventListener('click', e => { if (e.target.closest('a')) return; pop.remove(); });
        this.surface.appendChild(pop);
        icons();
    }

    removeMarker(id) {
        const node = this.markers.get(id);
        if (node) { node.remove(); this.markers.delete(id); }
    }

    clearMarkers() {
        this.markers.forEach(n => n.remove());
        this.markers.clear();
    }

    setView(lat, lng, zoom) {
        this.center = [lat, lng];
        if (zoom) this.zoom = zoom;
    }

    fitMarkers() { /* no-op in fallback — projection already spreads them */ }
    drawRoute() { /* routes are decorative in fallback */ }
    invalidate() {}
    destroy() { this.surface.remove(); }
}

/* ------------------------------------------------------------------ */
/* Leaflet map wrapper                                                 */
/* ------------------------------------------------------------------ */

class LeafletMap {
    constructor(container, opts) {
        this.isFallback = false;
        this.markers = new Map();
        this.routeLine = null;

        this.map = window.L.map(container, {
            center: opts.center || [CITY.lat, CITY.lng],
            zoom: opts.zoom || 12,
            zoomControl: opts.zoomControl !== false,
            scrollWheelZoom: opts.scrollWheelZoom !== false,
            attributionControl: true
        });

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: TILE_ATTR,
            maxZoom: 19
        }).addTo(this.map);
    }

    addMarker(id, lat, lng, { status = 'available', popup = '', pulsing = false } = {}) {
        let m = this.markers.get(id);
        if (m) {
            m.setLatLng([lat, lng]);
            m.setIcon(leafletIcon(status, pulsing));
            if (popup) m.setPopupContent(popup);
        } else {
            m = window.L.marker([lat, lng], { icon: leafletIcon(status, pulsing) }).addTo(this.map);
            if (popup) m.bindPopup(popup);
            m.on('popupopen', () => icons());
            this.markers.set(id, m);
        }
        icons();
        return m;
    }

    removeMarker(id) {
        const m = this.markers.get(id);
        if (m) { this.map.removeLayer(m); this.markers.delete(id); }
    }

    clearMarkers() {
        this.markers.forEach(m => this.map.removeLayer(m));
        this.markers.clear();
    }

    setView(lat, lng, zoom) {
        this.map.setView([lat, lng], zoom || this.map.getZoom());
    }

    panTo(lat, lng) {
        this.map.panTo([lat, lng], { animate: true, duration: 1.2 });
    }

    fitMarkers(padding = 50) {
        if (!this.markers.size) return;
        const group = window.L.featureGroup([...this.markers.values()]);
        this.map.fitBounds(group.getBounds(), { padding: [padding, padding], maxZoom: 15 });
    }

    drawRoute(points, { color = '#00E676', dashed = false } = {}) {
        if (this.routeLine) this.map.removeLayer(this.routeLine);
        this.routeLine = window.L.polyline(points, {
            color,
            weight: 4,
            opacity: 0.85,
            dashArray: dashed ? '8 10' : null,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(this.map);
        return this.routeLine;
    }

    addCircle(lat, lng, radiusM, color = '#00C8FF') {
        return window.L.circle([lat, lng], {
            radius: radiusM,
            color,
            fillColor: color,
            fillOpacity: 0.07,
            weight: 1.5,
            dashArray: '5 6'
        }).addTo(this.map);
    }

    invalidate() {
        // Leaflet needs this after the container becomes visible or resizes.
        setTimeout(() => this.map.invalidateSize(), 60);
    }

    destroy() { this.map.remove(); }
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

export function createMap(containerOrId, opts = {}) {
    const container = typeof containerOrId === 'string'
        ? document.getElementById(containerOrId)
        : containerOrId;

    if (!container) return null;

    if (hasLeaflet()) {
        try {
            return new LeafletMap(container, opts);
        } catch (err) {
            console.warn('[map] Leaflet failed, using fallback:', err);
        }
    }
    return new FallbackMap(container, opts);
}

/** Convenience: plot a whole fleet and keep it updated. */
export function plotVehicles(map, vehicles, { pulseAvailable = true } = {}) {
    if (!map) return;
    const seen = new Set();
    vehicles.forEach(v => {
        seen.add(v.id);
        map.addMarker(v.id, v.lat, v.lng, {
            status: v.status,
            popup: vehiclePopup(v),
            pulsing: pulseAvailable && v.status === 'available'
        });
    });
    // Drop markers for vehicles no longer in the filtered set.
    [...map.markers.keys()].forEach(id => { if (!seen.has(id)) map.removeMarker(id); });
}

export function plotStations(map, stations) {
    if (!map) return;
    stations.forEach(s => {
        map.addMarker('st-' + s.id, s.lat, s.lng, {
            status: s.status === 'available' ? 'charging' : s.status === 'busy' ? 'reserved' : 'maintenance',
            popup: stationPopup(s),
            pulsing: s.status === 'available'
        });
    });
}

export default { createMap, plotVehicles, plotStations, vehiclePopup, stationPopup };
