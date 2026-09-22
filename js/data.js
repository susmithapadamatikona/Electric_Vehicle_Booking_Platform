/* ==========================================================================
   EVRide — data.js
   Mock dataset + seeding. Shaped to mirror a REST payload so that replacing
   these exports with `await fetch('/api/vehicles')` requires no downstream
   changes: every consumer reads through Store, which this module populates.
   ========================================================================== */

import Store from './storage.js';
import { carArt } from './car-art.js';

/* ------------------------------------------------------------------ */
/* Static reference data                                               */
/* ------------------------------------------------------------------ */

export const CITY = { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 };

export const LOCATIONS = [
    { id: 'loc-01', name: 'Indiranagar Hub',        area: 'Indiranagar',      city: 'Bengaluru', lat: 12.9784, lng: 77.6408, vehicles: 24, chargers: 12, type: 'hub' },
    { id: 'loc-02', name: 'Koramangala Station',    area: 'Koramangala',      city: 'Bengaluru', lat: 12.9352, lng: 77.6245, vehicles: 31, chargers: 16, type: 'hub' },
    { id: 'loc-03', name: 'Whitefield Tech Park',   area: 'Whitefield',       city: 'Bengaluru', lat: 12.9698, lng: 77.7500, vehicles: 28, chargers: 20, type: 'hub' },
    { id: 'loc-04', name: 'MG Road Central',        area: 'MG Road',          city: 'Bengaluru', lat: 12.9756, lng: 77.6068, vehicles: 19, chargers: 8,  type: 'pickup' },
    { id: 'loc-05', name: 'HSR Layout Point',       area: 'HSR Layout',       city: 'Bengaluru', lat: 12.9121, lng: 77.6446, vehicles: 22, chargers: 10, type: 'hub' },
    { id: 'loc-06', name: 'Airport Terminal 2',     area: 'Devanahalli',      city: 'Bengaluru', lat: 13.1986, lng: 77.7066, vehicles: 38, chargers: 24, type: 'airport' },
    { id: 'loc-07', name: 'Electronic City Hub',    area: 'Electronic City',  city: 'Bengaluru', lat: 12.8452, lng: 77.6602, vehicles: 26, chargers: 14, type: 'hub' },
    { id: 'loc-08', name: 'Jayanagar Point',        area: 'Jayanagar',        city: 'Bengaluru', lat: 12.9250, lng: 77.5938, vehicles: 17, chargers: 8,  type: 'pickup' },
    { id: 'loc-09', name: 'Hebbal Interchange',     area: 'Hebbal',           city: 'Bengaluru', lat: 13.0358, lng: 77.5970, vehicles: 20, chargers: 12, type: 'hub' },
    { id: 'loc-10', name: 'Marathahalli Bridge',    area: 'Marathahalli',     city: 'Bengaluru', lat: 12.9591, lng: 77.6974, vehicles: 23, chargers: 10, type: 'pickup' },
    { id: 'loc-11', name: 'Yelahanka Depot',        area: 'Yelahanka',        city: 'Bengaluru', lat: 13.1007, lng: 77.5963, vehicles: 15, chargers: 8,  type: 'depot' },
    { id: 'loc-12', name: 'Bannerghatta Road',      area: 'Bannerghatta',     city: 'Bengaluru', lat: 12.8890, lng: 77.5970, vehicles: 18, chargers: 9,  type: 'pickup' }
];

export const CATEGORIES = [
    { id: 'sedan',       name: 'Electric Sedan',     icon: 'car',          desc: 'Refined comfort for city and highway',      from: 2400, count: 42 },
    { id: 'suv',         name: 'Electric SUV',       icon: 'truck',        desc: 'Space, range and commanding presence',      from: 3200, count: 38 },
    { id: 'hatchback',   name: 'Electric Hatchback', icon: 'car-front',    desc: 'Compact, agile, effortless in traffic',     from: 1500, count: 51 },
    { id: 'luxury',      name: 'Luxury EV',          icon: 'gem',          desc: 'Flagship cabins and silent power',          from: 8900, count: 16 },
    { id: 'performance', name: 'Performance EV',     icon: 'zap',          desc: 'Sub-4s acceleration, track-ready',          from: 12500, count: 9 },
    { id: 'compact',     name: 'Compact EV',         icon: 'minimize-2',   desc: 'Budget-friendly urban mobility',            from: 1200, count: 47 },
    { id: 'van',         name: 'Electric Van',       icon: 'bus',          desc: 'Group travel and cargo capacity',           from: 4100, count: 14 },
    { id: 'premium',     name: 'Premium EV',         icon: 'star',         desc: 'Executive travel, premium finish',          from: 6200, count: 21 }
];

/**
 * Photograph for a pickup location card.
 *
 * Files live in assets/images/locations/<id>.webp (JPG fallback), sourced
 * from Wikimedia Commons — see CREDITS.json there for author and licence.
 * Ten are of the named neighbourhood; two (loc-03, loc-12) use wider
 * Bengaluru city imagery where Commons had no usable street photo.
 */
export function locationImage(locationOrId) {
    const id = typeof locationOrId === 'string' ? locationOrId : locationOrId.id;
    return `assets/images/locations/${id}.webp`;
}

export const BRANDS = ['Tesla', 'BMW', 'Mercedes-Benz', 'Audi', 'Hyundai', 'Kia', 'Tata', 'MG', 'BYD', 'Volvo', 'Porsche', 'Mahindra'];

export const CONNECTORS = ['CCS2', 'Type 2', 'CHAdeMO', 'GB/T'];

/* ------------------------------------------------------------------ */
/* Vehicle catalogue                                                   */
/* ------------------------------------------------------------------ */

const VEHICLE_SPECS = [
    {
        id: 'ev-001', name: 'Model 3 Long Range', brand: 'Tesla', model: 'Model 3', year: 2024,
        category: 'sedan', price: 4200, batteryCapacity: 75, rangeMax: 602, chargeTime: '8h / 30m DC',
        topSpeed: 233, accel: 4.4, seats: 5, drive: 'AWD Dual Motor', connector: 'CCS2', boot: 594,
        power: 366, peakCharge: 250, rating: 4.9, reviews: 342, tags: ['Autopilot', 'Glass Roof', 'Premium Audio'],
        color: '#E8EAED', colorName: 'Pearl White'
    },
    {
        id: 'ev-002', name: 'Model Y Performance', brand: 'Tesla', model: 'Model Y', year: 2024,
        category: 'suv', price: 5400, batteryCapacity: 82, rangeMax: 533, chargeTime: '9h / 28m DC',
        topSpeed: 250, accel: 3.7, seats: 5, drive: 'AWD Dual Motor', connector: 'CCS2', boot: 854,
        power: 456, peakCharge: 250, rating: 4.8, reviews: 289, tags: ['Performance', 'Track Mode', '21" Wheels'],
        color: '#1A1A1A', colorName: 'Solid Black'
    },
    {
        id: 'ev-003', name: 'iX xDrive50', brand: 'BMW', model: 'iX', year: 2024,
        category: 'luxury', price: 11800, batteryCapacity: 111, rangeMax: 635, chargeTime: '11h / 35m DC',
        topSpeed: 200, accel: 4.6, seats: 5, drive: 'AWD xDrive', connector: 'CCS2', boot: 500,
        power: 523, peakCharge: 195, rating: 4.9, reviews: 156, tags: ['Panoramic Sky Lounge', 'Bowers & Wilkins', 'Massage Seats'],
        color: '#2C3E50', colorName: 'Storm Bay'
    },
    {
        id: 'ev-004', name: 'EQS 580 4MATIC', brand: 'Mercedes-Benz', model: 'EQS', year: 2024,
        category: 'luxury', price: 14500, batteryCapacity: 108, rangeMax: 857, chargeTime: '10h / 31m DC',
        topSpeed: 210, accel: 4.3, seats: 5, drive: 'AWD 4MATIC', connector: 'CCS2', boot: 610,
        power: 516, peakCharge: 200, rating: 5.0, reviews: 98, tags: ['MBUX Hyperscreen', 'Rear Axle Steering', 'Burmester 4D'],
        color: '#0D1B2A', colorName: 'Obsidian Black'
    },
    {
        id: 'ev-005', name: 'e-tron GT quattro', brand: 'Audi', model: 'e-tron GT', year: 2024,
        category: 'performance', price: 16200, batteryCapacity: 93, rangeMax: 488, chargeTime: '9h / 23m DC',
        topSpeed: 245, accel: 4.1, seats: 4, drive: 'AWD quattro', connector: 'CCS2', boot: 405,
        power: 530, peakCharge: 270, rating: 4.9, reviews: 74, tags: ['800V Architecture', 'Carbon Roof', 'Sport Sound'],
        color: '#7B2D26', colorName: 'Tactical Green'
    },
    {
        id: 'ev-006', name: 'IONIQ 5 Long Range', brand: 'Hyundai', model: 'IONIQ 5', year: 2024,
        category: 'suv', price: 3800, batteryCapacity: 72.6, rangeMax: 631, chargeTime: '7h / 18m DC',
        topSpeed: 185, accel: 5.2, seats: 5, drive: 'RWD', connector: 'CCS2', boot: 527,
        power: 225, peakCharge: 350, rating: 4.7, reviews: 412, tags: ['V2L Power Out', '800V Ultra-Fast', 'Relaxation Seats'],
        color: '#9AA5B1', colorName: 'Cyber Grey'
    },
    {
        id: 'ev-007', name: 'EV6 GT-Line', brand: 'Kia', model: 'EV6', year: 2024,
        category: 'suv', price: 3600, batteryCapacity: 77.4, rangeMax: 708, chargeTime: '7h / 18m DC',
        topSpeed: 192, accel: 5.2, seats: 5, drive: 'RWD', connector: 'CCS2', boot: 490,
        power: 229, peakCharge: 350, rating: 4.8, reviews: 367, tags: ['Meridian Audio', 'Augmented HUD', 'V2L'],
        color: '#1F3A5F', colorName: 'Runway Red'
    },
    {
        id: 'ev-008', name: 'Nexon EV Max', brand: 'Tata', model: 'Nexon EV', year: 2024,
        category: 'compact', price: 1650, batteryCapacity: 40.5, rangeMax: 453, chargeTime: '6.5h / 56m DC',
        topSpeed: 140, accel: 8.9, seats: 5, drive: 'FWD', connector: 'CCS2', boot: 350,
        power: 143, peakCharge: 50, rating: 4.5, reviews: 891, tags: ['Multi-Mode Regen', 'Air Purifier', 'Sunroof'],
        color: '#1B7A5A', colorName: 'Intensi-Teal'
    },
    {
        id: 'ev-009', name: 'Tiago EV XZ+', brand: 'Tata', model: 'Tiago EV', year: 2024,
        category: 'hatchback', price: 1200, batteryCapacity: 24, rangeMax: 315, chargeTime: '5h / 58m DC',
        topSpeed: 120, accel: 5.7, seats: 5, drive: 'FWD', connector: 'CCS2', boot: 240,
        power: 74, peakCharge: 50, rating: 4.4, reviews: 623, tags: ['Cruise Control', 'Harman Audio', 'Compact'],
        color: '#3B82C4', colorName: 'Teal Blue'
    },
    {
        id: 'ev-010', name: 'ZS EV Excite Pro', brand: 'MG', model: 'ZS EV', year: 2024,
        category: 'suv', price: 2900, batteryCapacity: 50.3, rangeMax: 461, chargeTime: '8.5h / 60m DC',
        topSpeed: 175, accel: 8.5, seats: 5, drive: 'FWD', connector: 'CCS2', boot: 448,
        power: 174, peakCharge: 76, rating: 4.6, reviews: 278, tags: ['Panoramic Sunroof', 'i-Smart 2.0', 'Rotary Shifter'],
        color: '#C0392B', colorName: 'Currant Red'
    },
    {
        id: 'ev-011', name: 'Atto 3 Extended', brand: 'BYD', model: 'Atto 3', year: 2024,
        category: 'suv', price: 3100, batteryCapacity: 60.5, rangeMax: 521, chargeTime: '9.5h / 50m DC',
        topSpeed: 160, accel: 7.3, seats: 5, drive: 'FWD', connector: 'CCS2', boot: 440,
        power: 201, peakCharge: 88, rating: 4.6, reviews: 194, tags: ['Blade Battery', 'Rotating Screen', 'V2L'],
        color: '#2E86AB', colorName: 'Surf Blue'
    },
    {
        id: 'ev-012', name: 'XC40 Recharge Twin', brand: 'Volvo', model: 'XC40', year: 2024,
        category: 'premium', price: 7200, batteryCapacity: 78, rangeMax: 505, chargeTime: '8h / 28m DC',
        topSpeed: 180, accel: 4.9, seats: 5, drive: 'AWD Twin Motor', connector: 'CCS2', boot: 452,
        power: 408, peakCharge: 150, rating: 4.8, reviews: 143, tags: ['Harman Kardon', 'Pilot Assist', 'Google Built-in'],
        color: '#4A5859', colorName: 'Fjord Blue'
    },
    {
        id: 'ev-013', name: 'Taycan 4S', brand: 'Porsche', model: 'Taycan', year: 2024,
        category: 'performance', price: 22400, batteryCapacity: 93.4, rangeMax: 512, chargeTime: '9h / 22m DC',
        topSpeed: 250, accel: 4.0, seats: 4, drive: 'AWD', connector: 'CCS2', boot: 407,
        power: 530, peakCharge: 270, rating: 5.0, reviews: 52, tags: ['800V', 'Launch Control', 'Adaptive Air Suspension'],
        color: '#DFE3E6', colorName: 'Frozen Blue'
    },
    {
        id: 'ev-014', name: 'XUV400 EL Pro', brand: 'Mahindra', model: 'XUV400', year: 2024,
        category: 'compact', price: 1850, batteryCapacity: 39.4, rangeMax: 456, chargeTime: '6.5h / 50m DC',
        topSpeed: 150, accel: 8.3, seats: 5, drive: 'FWD', connector: 'CCS2', boot: 378,
        power: 148, peakCharge: 50, rating: 4.3, reviews: 207, tags: ['Dual Zone AC', 'Adrenox Connect', 'Fast Charge'],
        color: '#E67E22', colorName: 'Everest White'
    },
    {
        id: 'ev-015', name: 'ID. Buzz Pro', brand: 'BYD', model: 'e6 Van', year: 2024,
        category: 'van', price: 4600, batteryCapacity: 71.7, rangeMax: 522, chargeTime: '10h / 45m DC',
        topSpeed: 130, accel: 10.2, seats: 7, drive: 'FWD', connector: 'CCS2', boot: 1200,
        power: 94, peakCharge: 60, rating: 4.4, reviews: 88, tags: ['7 Seats', 'Flat Floor', 'Fleet Ready'],
        color: '#5D6D7E', colorName: 'Silver Grey'
    },
    {
        id: 'ev-016', name: 'i4 eDrive40 M Sport', brand: 'BMW', model: 'i4', year: 2024,
        category: 'premium', price: 8400, batteryCapacity: 83.9, rangeMax: 590, chargeTime: '9h / 31m DC',
        topSpeed: 190, accel: 5.7, seats: 5, drive: 'RWD', connector: 'CCS2', boot: 470,
        power: 340, peakCharge: 205, rating: 4.9, reviews: 121, tags: ['Curved Display', 'Harman Kardon', 'M Sport Package'],
        color: '#34495E', colorName: 'Mineral White'
    },
    {
        id: 'ev-017', name: 'Comet EV Plush', brand: 'MG', model: 'Comet', year: 2024,
        category: 'compact', price: 950, batteryCapacity: 17.3, rangeMax: 230, chargeTime: '7h AC only',
        topSpeed: 100, accel: 8.0, seats: 4, drive: 'RWD', connector: 'Type 2', boot: 150,
        power: 41, peakCharge: 0, rating: 4.2, reviews: 445, tags: ['City Car', 'Tight Turning', 'Digital Twin Screens'],
        color: '#F39C12', colorName: 'Candy White'
    },
    {
        id: 'ev-018', name: 'Q8 e-tron 55', brand: 'Audi', model: 'Q8 e-tron', year: 2024,
        category: 'luxury', price: 12900, batteryCapacity: 114, rangeMax: 582, chargeTime: '11h / 31m DC',
        topSpeed: 200, accel: 5.6, seats: 5, drive: 'AWD quattro', connector: 'CCS2', boot: 569,
        power: 408, peakCharge: 170, rating: 4.8, reviews: 67, tags: ['Virtual Mirrors', 'Bang & Olufsen', 'Air Suspension'],
        color: '#16A085', colorName: 'Plasma Blue'
    },
    {
        id: 'ev-019', name: 'Punch EV Empowered', brand: 'Tata', model: 'Punch EV', year: 2024,
        category: 'hatchback', price: 1450, batteryCapacity: 35, rangeMax: 421, chargeTime: '5.7h / 56m DC',
        topSpeed: 140, accel: 9.5, seats: 5, drive: 'FWD', connector: 'CCS2', boot: 366,
        power: 122, peakCharge: 50, rating: 4.5, reviews: 312, tags: ['360 Camera', 'Arcade.ev Apps', 'Voice Assist'],
        color: '#8E44AD', colorName: 'Fearless Red'
    },
    {
        id: 'ev-020', name: 'EQB 350 4MATIC', brand: 'Mercedes-Benz', model: 'EQB', year: 2024,
        category: 'premium', price: 9100, batteryCapacity: 70.5, rangeMax: 423, chargeTime: '8.5h / 32m DC',
        topSpeed: 160, accel: 6.2, seats: 7, drive: 'AWD 4MATIC', connector: 'CCS2', boot: 495,
        power: 292, peakCharge: 100, rating: 4.7, reviews: 89, tags: ['7 Seater', 'MBUX', 'Ambient Lighting'],
        color: '#2C3E50', colorName: 'Digital White'
    },
    {
        id: 'ev-021', name: 'Model S Plaid', brand: 'Tesla', model: 'Model S', year: 2024,
        category: 'performance', price: 24800, batteryCapacity: 100, rangeMax: 634, chargeTime: '10h / 27m DC',
        topSpeed: 322, accel: 2.1, seats: 5, drive: 'AWD Tri Motor', connector: 'CCS2', boot: 793,
        power: 1020, peakCharge: 250, rating: 5.0, reviews: 41, tags: ['Tri-Motor', 'Yoke Steering', '1020 hp'],
        color: '#1C2833', colorName: 'Midnight Silver'
    },
    {
        id: 'ev-022', name: 'C40 Recharge', brand: 'Volvo', model: 'C40', year: 2024,
        category: 'premium', price: 7800, batteryCapacity: 82, rangeMax: 530, chargeTime: '8h / 27m DC',
        topSpeed: 180, accel: 4.7, seats: 5, drive: 'AWD Twin Motor', connector: 'CCS2', boot: 413,
        power: 408, peakCharge: 150, rating: 4.7, reviews: 96, tags: ['Leather-Free Interior', 'Coupe SUV', 'Pilot Assist'],
        color: '#27AE60', colorName: 'Sage Green'
    },
    {
        id: 'ev-023', name: 'IONIQ 6 Ultimate', brand: 'Hyundai', model: 'IONIQ 6', year: 2024,
        category: 'sedan', price: 4400, batteryCapacity: 77.4, rangeMax: 614, chargeTime: '7h / 18m DC',
        topSpeed: 185, accel: 5.1, seats: 5, drive: 'RWD', connector: 'CCS2', boot: 401,
        power: 225, peakCharge: 350, rating: 4.8, reviews: 178, tags: ['0.21 Drag Coefficient', 'Dual 12.3" Displays', 'V2L'],
        color: '#5DADE2', colorName: 'Serenity White'
    },
    {
        id: 'ev-024', name: 'e6 Fleet Edition', brand: 'BYD', model: 'e6', year: 2024,
        category: 'van', price: 4100, batteryCapacity: 71.7, rangeMax: 520, chargeTime: '10h / 45m DC',
        topSpeed: 130, accel: 10.2, seats: 6, drive: 'FWD', connector: 'CCS2', boot: 580,
        power: 94, peakCharge: 60, rating: 4.3, reviews: 134, tags: ['Corporate Fleet', 'Blade Battery', 'Low TCO'],
        color: '#7F8C8D', colorName: 'Corporate Silver'
    },
    {
        id: 'ev-025', name: 'BE 6 Pack Three', brand: 'Mahindra', model: 'BE 6', year: 2025,
        category: 'suv', price: 3400, batteryCapacity: 79, rangeMax: 682, chargeTime: '8h / 20m DC',
        topSpeed: 202, accel: 6.7, seats: 5, drive: 'RWD', connector: 'CCS2', boot: 455,
        power: 281, peakCharge: 175, rating: 4.6, reviews: 92, tags: ['INGLO Platform', 'Level 2 ADAS', 'Panoramic Sunroof'],
        color: '#2C3E50', colorName: 'Firestorm Black'
    }
];

/* ------------------------------------------------------------------ */
/* Charging network                                                    */
/* ------------------------------------------------------------------ */

const STATION_SPECS = [
    { id: 'cs-01', name: 'EVRide Supercharge — Indiranagar', operator: 'EVRide Network', address: '100 Feet Road, Indiranagar, Bengaluru 560038', lat: 12.9784, lng: 77.6408, total: 12, speed: 180, connectors: ['CCS2', 'Type 2'], price: 18.5, hours: '24/7', rating: 4.8, reviews: 214, amenities: ['Café', 'Restroom', 'WiFi', 'Lounge'], type: 'dc' },
    { id: 'cs-02', name: 'EVRide Hyperhub — Koramangala', operator: 'EVRide Network', address: '80 Feet Road, 4th Block, Koramangala, Bengaluru 560034', lat: 12.9352, lng: 77.6245, total: 16, speed: 350, connectors: ['CCS2', 'CHAdeMO'], price: 22.0, hours: '24/7', rating: 4.9, reviews: 331, amenities: ['Café', 'Restroom', 'WiFi', 'Shopping', 'Lounge'], type: 'dc' },
    { id: 'cs-03', name: 'ChargeGrid — Whitefield', operator: 'ChargeGrid', address: 'ITPL Main Road, Whitefield, Bengaluru 560066', lat: 12.9698, lng: 77.7500, total: 20, speed: 120, connectors: ['CCS2', 'Type 2', 'GB/T'], price: 16.0, hours: '24/7', rating: 4.6, reviews: 189, amenities: ['Restroom', 'WiFi', 'Parking'], type: 'dc' },
    { id: 'cs-04', name: 'EVRide Point — MG Road', operator: 'EVRide Network', address: 'Brigade Road Junction, MG Road, Bengaluru 560001', lat: 12.9756, lng: 77.6068, total: 8, speed: 60, connectors: ['Type 2', 'CCS2'], price: 12.5, hours: '06:00 – 23:00', rating: 4.4, reviews: 97, amenities: ['Restroom', 'Shopping'], type: 'ac' },
    { id: 'cs-05', name: 'PowerLane — HSR Layout', operator: 'PowerLane', address: '27th Main, Sector 2, HSR Layout, Bengaluru 560102', lat: 12.9121, lng: 77.6446, total: 10, speed: 150, connectors: ['CCS2', 'Type 2'], price: 17.5, hours: '24/7', rating: 4.7, reviews: 156, amenities: ['Café', 'WiFi', 'Restroom'], type: 'dc' },
    { id: 'cs-06', name: 'EVRide Airport Hyperhub', operator: 'EVRide Network', address: 'Terminal 2 Parking, Kempegowda Intl Airport, Bengaluru 560300', lat: 13.1986, lng: 77.7066, total: 24, speed: 350, connectors: ['CCS2', 'CHAdeMO', 'Type 2'], price: 24.0, hours: '24/7', rating: 4.9, reviews: 428, amenities: ['Café', 'Restroom', 'WiFi', 'Lounge', 'Valet'], type: 'dc' },
    { id: 'cs-07', name: 'ChargeGrid — Electronic City', operator: 'ChargeGrid', address: 'Phase 1, Electronic City, Bengaluru 560100', lat: 12.8452, lng: 77.6602, total: 14, speed: 120, connectors: ['CCS2', 'Type 2'], price: 15.5, hours: '24/7', rating: 4.5, reviews: 203, amenities: ['Restroom', 'Parking', 'WiFi'], type: 'dc' },
    { id: 'cs-08', name: 'EVRide Point — Jayanagar', operator: 'EVRide Network', address: '4th Block, Jayanagar, Bengaluru 560011', lat: 12.9250, lng: 77.5938, total: 8, speed: 60, connectors: ['Type 2'], price: 11.0, hours: '07:00 – 22:00', rating: 4.3, reviews: 71, amenities: ['Shopping', 'Restroom'], type: 'ac' },
    { id: 'cs-09', name: 'PowerLane — Hebbal', operator: 'PowerLane', address: 'Outer Ring Road, Hebbal, Bengaluru 560024', lat: 13.0358, lng: 77.5970, total: 12, speed: 180, connectors: ['CCS2', 'CHAdeMO'], price: 18.0, hours: '24/7', rating: 4.6, reviews: 142, amenities: ['Café', 'Restroom', 'WiFi'], type: 'dc' },
    { id: 'cs-10', name: 'ChargeGrid — Marathahalli', operator: 'ChargeGrid', address: 'Varthur Road, Marathahalli, Bengaluru 560037', lat: 12.9591, lng: 77.6974, total: 10, speed: 100, connectors: ['CCS2', 'Type 2', 'GB/T'], price: 14.5, hours: '24/7', rating: 4.4, reviews: 118, amenities: ['Restroom', 'Parking'], type: 'dc' },
    { id: 'cs-11', name: 'EVRide Depot — Yelahanka', operator: 'EVRide Network', address: 'New Town, Yelahanka, Bengaluru 560064', lat: 13.1007, lng: 77.5963, total: 8, speed: 150, connectors: ['CCS2', 'Type 2'], price: 16.5, hours: '24/7', rating: 4.5, reviews: 63, amenities: ['Restroom', 'Fleet Bay'], type: 'dc' },
    { id: 'cs-12', name: 'PowerLane — Bannerghatta', operator: 'PowerLane', address: 'Bannerghatta Main Road, Bengaluru 560076', lat: 12.8890, lng: 77.5970, total: 9, speed: 120, connectors: ['CCS2', 'Type 2'], price: 15.0, hours: '06:00 – 00:00', rating: 4.4, reviews: 88, amenities: ['Café', 'Restroom'], type: 'dc' }
];

/* ------------------------------------------------------------------ */
/* Reviews, offers, FAQ, testimonials                                  */
/* ------------------------------------------------------------------ */

export const OFFERS = [
    { id: 'off-01', title: 'First Ride Free Charge',  code: 'EVRIDEFIRST', discount: '40% OFF', cap: '₹1,200', desc: 'Flat 40% off on your very first EVRide booking, plus a complimentary full charge on pickup.', expires: '2026-12-31', color: 'green',  badge: 'New Users', terms: ['Valid on first booking only', 'Max discount ₹1,200', 'Cannot be combined with other offers'] },
    { id: 'off-02', title: 'Weekend Electric Escape', code: 'WEEKEND25',  discount: '25% OFF', cap: '₹2,500', desc: 'Book Friday to Sunday and save a quarter on all SUV and premium EVs.', expires: '2026-10-31', color: 'blue',   badge: 'Weekends', terms: ['Valid Fri–Sun pickups', 'Minimum 2-day rental', 'SUV & Premium categories'] },
    { id: 'off-03', title: 'Long-Term Rental Saver',  code: 'LONG30',     discount: '30% OFF', cap: 'No cap',  desc: 'Rent for 15 days or more and unlock our deepest fleet discount with free maintenance.', expires: '2026-12-31', color: 'purple', badge: 'Monthly',  terms: ['Minimum 15-day booking', 'Free scheduled maintenance', 'Unlimited kilometres'] },
    { id: 'off-04', title: 'Corporate Fleet Package', code: 'CORP20',     discount: '20% OFF', cap: '₹50,000', desc: 'Dedicated account manager, monthly billing and priority vehicle allocation for teams.', expires: '2026-12-31', color: 'green',  badge: 'Business', terms: ['Registered businesses only', 'Minimum 5 employees', 'Monthly consolidated invoice'] },
    { id: 'off-05', title: 'Charging Network Credit', code: 'CHARGE15',   discount: '15% OFF', cap: '₹800',    desc: 'Save on every kWh across 2,400+ EVRide and partner charging points nationwide.', expires: '2026-11-30', color: 'blue',   badge: 'Charging', terms: ['Applies to charging sessions', 'EVRide & partner network', 'Max ₹800 per month'] },
    { id: 'off-06', title: 'Referral Bonus',          code: 'REFER500',   discount: '₹500',    cap: 'Per ref', desc: 'Give ₹500, get ₹500. Credit lands the moment your friend completes their first trip.', expires: '2026-12-31', color: 'purple', badge: 'Referral', terms: ['Credit after friend\'s first trip', 'Unlimited referrals', 'Valid 90 days'] }
];

export const TESTIMONIALS = [
    { id: 't1', name: 'Ananya Sharma',  role: 'Product Designer, Bengaluru',  rating: 5, text: 'I booked an IONIQ 5 for a weekend trip to Coorg. The live battery and range readout in the app meant I never once worried about running out. Charging stops were planned for me along the route.', initials: 'AS', date: '2 weeks ago', vehicle: 'IONIQ 5 Long Range' },
    { id: 't2', name: 'Rahul Menon',    role: 'Founder, Logistics Startup',   rating: 5, text: 'We moved our entire sales fleet to EVRide corporate. Monthly billing, one dashboard, and fuel costs down 68%. The fleet utilisation reports alone paid for the switch.', initials: 'RM', date: '1 month ago', vehicle: 'Fleet — 12 vehicles' },
    { id: 't3', name: 'Priya Iyer',     role: 'Software Engineer, Whitefield', rating: 5, text: 'Delivery to my apartment gate, spotless car, 94% battery. Returned it four days later through the app in about forty seconds. This is what rental should have always been.', initials: 'PI', date: '3 weeks ago', vehicle: 'Model 3 Long Range' },
    { id: 't4', name: 'Vikram Desai',   role: 'Consultant, Mumbai',           rating: 4, text: 'The live tracking during pickup is genuinely useful — I could see the driver approaching in real time. Only wish there were more Taycans in the fleet.', initials: 'VD', date: '1 week ago', vehicle: 'Taycan 4S' },
    { id: 't5', name: 'Sneha Kulkarni', role: 'Marketing Lead, Pune',          rating: 5, text: 'Reserved a charging slot at the airport hub before landing. Walked out, plugged in, 80% by the time I finished my coffee. Zero queue.', initials: 'SK', date: '5 days ago', vehicle: 'EV6 GT-Line' },
    { id: 't6', name: 'Arjun Nair',     role: 'Doctor, Kochi',                 rating: 5, text: 'Booked for a month while my car was in service. The long-term discount made it cheaper than my fuel bill, and I genuinely enjoyed driving electric every day.', initials: 'AN', date: '2 months ago', vehicle: 'XC40 Recharge' }
];

export const FAQS = [
    { cat: 'Booking',      q: 'How do I book an electric vehicle on EVRide?',              a: 'Enter your pickup and drop-off locations along with dates and times on the home page, then hit Search Available EVs. You will see every vehicle available in that window with its live battery level and real range. Pick one, choose your add-ons, and pay — the whole flow takes under two minutes.' },
    { cat: 'Booking',      q: 'What documents do I need to rent an EV?',                   a: 'A valid driving licence held for at least one year, one government photo ID (Aadhaar, passport or voter ID), and the payment card used for booking. Everything is uploaded once to your profile and verified within fifteen minutes.' },
    { cat: 'Booking',      q: 'Can I modify or extend my booking after confirming?',      a: 'Yes. Open My Bookings in your dashboard and choose Modify. Extensions are subject to the vehicle not being reserved by someone else afterwards; the system checks availability in real time and quotes the difference instantly.' },
    { cat: 'EVs',          q: 'What happens if the battery runs low during my trip?',     a: 'The app continuously tracks your state of charge against your route and warns you well before range becomes a concern. Tap Find Charging and we route you to the nearest available charger. Below 10% you can also request our roadside mobile-charging unit at no cost.' },
    { cat: 'EVs',          q: 'Are the advertised ranges realistic?',                     a: 'We publish both the manufacturer WLTP figure and a live estimated range calculated from the current charge level, recent driving conditions and ambient temperature. The live figure on each vehicle card is the one to plan around.' },
    { cat: 'EVs',          q: 'Do I need to return the vehicle fully charged?',           a: 'No. Return it with at least 20% charge and there is nothing to pay. Below 20% a recharge fee applies at ₹16 per kWh, which is roughly what a public charger would cost you anyway.' },
    { cat: 'Charging',     q: 'How much does charging cost on the EVRide network?',        a: 'Between ₹11 and ₹24 per kWh depending on the station and charging speed. AC points are cheapest, 350 kW hyperhubs the most expensive. Every price is shown on the station card before you commit.' },
    { cat: 'Charging',     q: 'Can I reserve a charging slot in advance?',                a: 'Yes, up to seven days ahead. Reserving holds the bay for fifteen minutes past your slot start. A small reservation fee of ₹40 applies and is credited back against your charging session.' },
    { cat: 'Charging',     q: 'Which connector types are supported?',                     a: 'CCS2 is standard across almost the entire fleet and network. We also support Type 2 AC, CHAdeMO at selected hyperhubs, and GB/T at a handful of partner sites. Each vehicle page lists its port type.' },
    { cat: 'Payments',     q: 'Which payment methods can I use?',                         a: 'Credit and debit cards, UPI, net banking from 50+ banks, and major digital wallets. Corporate accounts can additionally be set up for consolidated monthly invoicing on credit terms.' },
    { cat: 'Payments',     q: 'Is a security deposit required?',                          a: 'A refundable hold of ₹5,000 for standard vehicles and ₹15,000 for luxury and performance models is placed on your card at pickup. It is released automatically within five to seven working days after return.' },
    { cat: 'Cancellation', q: 'What is the cancellation policy?',                         a: 'Free cancellation up to 24 hours before pickup with a full refund. Between 24 and 6 hours, 75% is refunded. Under 6 hours, 50%. No-shows are not refunded. Cancelling is one tap in My Bookings.' },
    { cat: 'Cancellation', q: 'How long do refunds take to arrive?',                      a: 'Refunds are initiated immediately on cancellation. Cards typically show the credit in five to seven working days; UPI and wallets are usually same-day.' },
    { cat: 'Safety',       q: 'What insurance is included with my booking?',              a: 'Every booking includes third-party liability and basic collision damage waiver as standard. Premium Protection is available at ₹299 per day and reduces your excess to zero, including tyres, glass and battery pack.' },
    { cat: 'Safety',       q: 'What do I do in an accident or breakdown?',                a: 'Press the SOS button in the app or call 1800-EVRIDE-911. Our team sees your live vehicle location immediately and dispatches assistance. Roadside support is included with every booking, 24 hours a day.' },
    { cat: 'Fleet',        q: 'Can I list my own EV on the EVRide platform?',              a: 'Yes. Register as an EV Owner, submit your registration certificate, insurance and a vehicle inspection. Once approved you control availability and pricing from the Owner Dashboard and receive payouts weekly.' },
    { cat: 'Fleet',        q: 'How does corporate fleet management work?',                a: 'Corporate accounts get a dedicated dashboard covering employee bookings, spend controls, utilisation analytics and a single monthly invoice. Your account manager handles vehicle allocation and any swaps you need.' },
    { cat: 'Account',      q: 'How do I delete my account and data?',                     a: 'Settings → Account → Delete Account. We remove your personal data within thirty days, retaining only the transaction records that tax law requires us to keep.' }
];

export const SUPPORT_CATEGORIES = [
    { id: 'booking',   name: 'Booking Help',      icon: 'calendar-check', desc: 'Reservations, changes, extensions',      articles: 24 },
    { id: 'payment',   name: 'Payments',          icon: 'credit-card',    desc: 'Billing, refunds, invoices, deposits',   articles: 18 },
    { id: 'vehicle',   name: 'Vehicle Problems',  icon: 'alert-triangle', desc: 'Faults, damage, cleanliness, swaps',     articles: 31 },
    { id: 'charging',  name: 'Charging',          icon: 'zap',            desc: 'Stations, connectors, sessions, pricing', articles: 27 },
    { id: 'cancel',    name: 'Cancellation',      icon: 'x-circle',       desc: 'Policies, refunds, no-show rules',       articles: 12 },
    { id: 'account',   name: 'Account',           icon: 'user',           desc: 'Profile, documents, verification',       articles: 16 },
    { id: 'emergency', name: 'Emergency',         icon: 'life-buoy',      desc: 'Accidents, breakdowns, SOS support',     articles: 9 }
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const rand  = (min, max) => Math.random() * (max - min) + min;
const randI = (min, max) => Math.floor(rand(min, max + 1));
const pick  = arr => arr[Math.floor(Math.random() * arr.length)];

/** Weighted status so the fleet looks plausible, not uniformly random. */
function weightedStatus() {
    const r = Math.random();
    if (r < 0.52) return 'available';
    if (r < 0.70) return 'on_trip';
    if (r < 0.84) return 'charging';
    if (r < 0.94) return 'reserved';
    return 'maintenance';
}

/** Scatter a coordinate a realistic distance around the city centre. */
function scatter(lat, lng, kmRadius = 14) {
    const r = kmRadius / 111;
    const u = Math.random(), v = Math.random();
    const w = r * Math.sqrt(u);
    const t = 2 * Math.PI * v;
    return {
        lat: +(lat + w * Math.cos(t)).toFixed(6),
        lng: +(lng + w * Math.sin(t) / Math.cos(lat * Math.PI / 180)).toFixed(6)
    };
}

export function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return +(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
}

/**
 * Real photograph for a vehicle.
 *
 * Images live in assets/images/vehicles/<id>.webp (JPG fallback) and were
 * sourced from Wikimedia Commons, where files are titled with the actual
 * make and model — so every one was *verified* to show the right car before
 * being downloaded. See CREDITS.json in that folder for author and licence.
 *
 * This replaced hardcoded Unsplash IDs, of which 4 returned 404 and most of
 * the rest showed an unrelated car. carArt() in car-art.js remains as the
 * offline fallback, wired up via the `onerror` handler in main.js.
 */
export function vehicleImage(vehicleOrModel) {
    const v = typeof vehicleOrModel === 'string' ? { id: vehicleOrModel } : vehicleOrModel;
    return `assets/images/vehicles/${v.id}.webp`;
}

/** Generated SVG used when a photo cannot be loaded (offline, blocked). */
export function vehicleArtFallback(vehicle) {
    return carArt(vehicle);
}

export const STATION_IMG = 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=75';

/* ------------------------------------------------------------------ */
/* Seeding                                                             */
/* ------------------------------------------------------------------ */

function buildVehicles() {
    return VEHICLE_SPECS.map((spec, i) => {
        const loc = LOCATIONS[i % LOCATIONS.length];
        const pos = scatter(loc.lat, loc.lng, 3);
        const status = i === 0 ? 'available' : weightedStatus();
        const battery = status === 'charging' ? randI(22, 68)
                      : status === 'maintenance' ? randI(10, 90)
                      : randI(46, 98);

        return {
            ...spec,
            image: vehicleImage(spec),
            imageLarge: vehicleImage(spec),
            // Same photo plus two generated frames, so the details-page
            // gallery has more than one thumbnail to show.
            gallery: [
                vehicleImage(spec),
                carArt({ ...spec, id: spec.id + '-b' }),
                carArt({ ...spec, id: spec.id + '-c' })
            ],
            artFallback: carArt(spec),
            status,
            battery,
            range: Math.round(spec.rangeMax * battery / 100 * rand(0.86, 0.97)),
            lat: pos.lat,
            lng: pos.lng,
            locationId: loc.id,
            locationName: loc.name,
            area: loc.area,
            city: loc.city,
            distance: +rand(0.4, 9.8).toFixed(1),
            speed: status === 'on_trip' ? randI(18, 62) : 0,
            heading: randI(0, 359),
            odometer: randI(4200, 68000),
            plate: `KA ${randI(1, 59).toString().padStart(2, '0')} ${pick(['AB','MH','EV','ZX','KL'])} ${randI(1000, 9999)}`,
            trips: randI(38, 640),
            available: status === 'available',
            insurance: 299,
            deposit: spec.price > 8000 ? 15000 : 5000,
            owner: i % 4 === 0 ? 'EVRide Fleet' : pick(['Arun Prakash', 'Meera Reddy', 'Fleet Partner Ltd', 'EVRide Fleet', 'Kiran Rao']),
            addedAt: Date.now() - randI(30, 700) * 86400000,
            updatedAt: Date.now(),
            healthScore: randI(82, 99),
            lastService: Date.now() - randI(5, 120) * 86400000,
            utilization: randI(41, 94)
        };
    });
}

function buildStations() {
    return STATION_SPECS.map(spec => {
        const busy = randI(0, spec.total);
        const offline = Math.random() < 0.08 ? randI(1, 2) : 0;
        const available = Math.max(0, spec.total - busy - offline);
        return {
            ...spec,
            image: STATION_IMG,
            available,
            busy,
            offline,
            status: offline >= spec.total ? 'offline' : available === 0 ? 'busy' : 'available',
            distance: +rand(0.6, 18.4).toFixed(1),
            sessionsToday: randI(24, 186),
            energyToday: randI(420, 2840),
            queue: available === 0 ? randI(1, 4) : 0,
            updatedAt: Date.now()
        };
    });
}

function buildNotifications() {
    const base = Date.now();
    return [
        { id: 'n1', type: 'success', icon: 'check-circle',  title: 'Booking confirmed',        msg: 'Your Tesla Model 3 Long Range is reserved for tomorrow, 09:00 at Indiranagar Hub.', time: base - 4 * 60000,   read: false, link: 'customer-dashboard.html' },
        { id: 'n2', type: 'info',    icon: 'battery-charging', title: 'Charging session complete', msg: 'IONIQ 5 charged to 92% at Koramangala Hyperhub. 46.2 kWh added for ₹1,016.',  time: base - 46 * 60000,  read: false, link: 'charging-dashboard.html' },
        { id: 'n3', type: 'warning', icon: 'alert-triangle', title: 'Low battery alert',        msg: 'Your Nexon EV Max is at 18%. Nearest fast charger is 2.4 km away.',              time: base - 2 * 3600000,  read: false, link: 'charging-stations.html' },
        { id: 'n4', type: 'info',    icon: 'clock',          title: 'Trip starts in 30 minutes', msg: 'Booking #EV2048 pickup at MG Road Central. The vehicle is ready and unlocked.', time: base - 5 * 3600000,  read: true,  link: 'live-tracking.html' },
        { id: 'n5', type: 'success', icon: 'zap',            title: 'Charging slot reserved',    msg: 'Bay 07 at EVRide Airport Hyperhub is held for you until 18:15 today.',            time: base - 9 * 3600000,  read: true,  link: 'charging-reservation.html' },
        { id: 'n6', type: 'info',    icon: 'gift',           title: 'Offer unlocked',            msg: 'WEEKEND25 is live — 25% off all SUV bookings this Friday to Sunday.',            time: base - 26 * 3600000, read: true,  link: 'offers.html' },
        { id: 'n7', type: 'success', icon: 'file-text',      title: 'Invoice ready',             msg: 'Invoice INV-2026-0418 for ₹8,742 is available to download.',                     time: base - 2 * 86400000, read: true,  link: 'invoices.html' }
    ];
}

function buildBookings(vehicles) {
    const now = Date.now();
    const d = ms => new Date(now + ms).toISOString();
    const v = id => vehicles.find(x => x.id === id) || vehicles[0];

    const mk = (id, vid, status, startOffset, days, amount, extra = {}) => {
        const veh = v(vid);
        return {
            id,
            vehicleId: veh.id,
            vehicleName: veh.name,
            vehicleBrand: veh.brand,
            vehicleImage: veh.image,
            plate: veh.plate,
            pickupLocation: veh.locationName,
            dropLocation: pick(LOCATIONS).name,
            pickupDate: d(startOffset),
            returnDate: d(startOffset + days * 86400000),
            days,
            status,
            amount,
            basePrice: Math.round(amount * 0.78),
            insurance: 299 * days,
            taxes: Math.round(amount * 0.18),
            discount: extra.discount || 0,
            paymentStatus: status === 'cancelled' ? 'refunded' : 'paid',
            paymentMethod: pick(['Visa •••• 4821', 'UPI — evride@okhdfc', 'Mastercard •••• 9037']),
            createdAt: now + startOffset - randI(1, 10) * 86400000,
            distance: status === 'completed' ? randI(64, 480) : 0,
            energyUsed: status === 'completed' ? randI(18, 92) : 0,
            co2Saved: status === 'completed' ? randI(12, 84) : 0,
            rated: status === 'completed' && Math.random() > 0.4,
            ...extra
        };
    };

    return [
        mk('EV2048', 'ev-001', 'active',    -2 * 3600000,  3, 14760, { progress: 34 }),
        mk('EV2047', 'ev-006', 'upcoming',   2 * 86400000, 2,  8740),
        mk('EV2046', 'ev-012', 'upcoming',   9 * 86400000, 5, 39600),
        mk('EV2041', 'ev-007', 'completed', -12 * 86400000, 4, 16920),
        mk('EV2038', 'ev-002', 'completed', -21 * 86400000, 2, 12840),
        mk('EV2035', 'ev-008', 'completed', -34 * 86400000, 7, 13580),
        mk('EV2031', 'ev-016', 'cancelled', -45 * 86400000, 3, 27600, { cancelReason: 'Plans changed' }),
        mk('EV2028', 'ev-010', 'completed', -58 * 86400000, 1,  3420),
        mk('EV2024', 'ev-023', 'completed', -72 * 86400000, 3, 14520)
    ];
}

function buildInvoices(bookings) {
    return bookings
        .filter(b => b.status !== 'cancelled' || b.paymentStatus === 'refunded')
        .map((b, i) => ({
            id: `INV-2026-${(418 - i * 7).toString().padStart(4, '0')}`,
            bookingId: b.id,
            date: b.createdAt,
            customer: 'Susmitha Padamati',
            email: 'susmitha@example.com',
            vehicle: b.vehicleName,
            amount: b.amount,
            base: b.basePrice,
            insurance: b.insurance,
            taxes: b.taxes,
            discount: b.discount,
            status: b.status === 'cancelled' ? 'refunded' : b.status === 'completed' ? 'paid' : 'paid',
            method: b.paymentMethod
        }));
}

function buildPayments(invoices) {
    return invoices.map((inv, i) => ({
        id: `PAY-${90412 - i * 13}`,
        invoiceId: inv.id,
        bookingId: inv.bookingId,
        date: inv.date,
        amount: inv.amount,
        method: inv.method,
        status: inv.status === 'refunded' ? 'refunded' : 'paid',
        gateway: 'EVRide Secure Pay',
        ref: `TXN${randI(100000000, 999999999)}`
    }));
}

function buildReviews(vehicles) {
    const bodies = [
        'Immaculate condition and the range held up exactly as advertised. Pickup took under five minutes.',
        'Comfortable, quiet and genuinely quick. The regen braking took a day to get used to but I miss it now.',
        'Battery was at 94% on pickup which was more than enough for the whole weekend. No complaints at all.',
        'Great car, though the charging port cover was a bit stiff. Support swapped the vehicle within the hour.',
        'Third time booking this exact model. Consistently clean, consistently charged, consistently on time.',
        'The infotainment is superb and the live range estimate was accurate to within about eight kilometres.',
        'Perfect city car. Parked it in spaces I would never attempt in my own sedan.',
        'Handled the highway run to Mysuru beautifully. One twenty-minute charging stop and we were done.'
    ];
    const names = ['Deepak V.', 'Nisha R.', 'Karthik S.', 'Aisha B.', 'Rohan M.', 'Tanvi J.', 'Suresh K.', 'Lakshmi N.', 'Farhan A.', 'Divya P.'];
    const out = [];
    vehicles.slice(0, 14).forEach((v, vi) => {
        const n = randI(2, 4);
        for (let i = 0; i < n; i++) {
            out.push({
                id: `rv-${vi}-${i}`,
                vehicleId: v.id,
                name: names[(vi + i) % names.length],
                initials: names[(vi + i) % names.length].split(' ').map(s => s[0]).join(''),
                rating: randI(4, 5),
                text: bodies[(vi + i) % bodies.length],
                date: Date.now() - randI(2, 90) * 86400000,
                helpful: randI(0, 34),
                cleanliness: randI(4, 5),
                comfort: randI(4, 5),
                value: randI(3, 5),
                battery: randI(4, 5)
            });
        }
    });
    return out;
}

/* ------------------------------------------------------------------ */
/* Public seed entry point                                             */
/* ------------------------------------------------------------------ */

export function seed(force = false) {
    if (Store.isSeeded() && !force) {
        // Repair: if a key got cleared independently, rebuild just that slice.
        if (!Store.getVehicles().length) Store.setVehicles(buildVehicles());
        if (!Store.getStations().length) Store.setStations(buildStations());
        return;
    }

    const vehicles = buildVehicles();
    const stations = buildStations();
    const bookings = buildBookings(vehicles);
    const invoices = buildInvoices(bookings);

    Store.setVehicles(vehicles);
    Store.setStations(stations);
    Store.write(Store.KEYS.bookings, bookings);
    Store.write(Store.KEYS.invoices, invoices);
    Store.write(Store.KEYS.payments, buildPayments(invoices));
    Store.write(Store.KEYS.notifications, buildNotifications());
    Store.write(Store.KEYS.reviews, buildReviews(vehicles));

    if (!Store.getFavorites().length) {
        Store.write(Store.KEYS.favorites, ['ev-001', 'ev-006', 'ev-012']);
    }

    // Mark the in-progress booking as the active trip for live tracking.
    const active = bookings.find(b => b.status === 'active');
    if (active && !Store.getActiveTrip()) {
        Store.setActiveTrip({
            bookingId: active.id,
            vehicleId: active.vehicleId,
            phase: 'approaching',
            progress: 12,
            etaMin: 8,
            startedAt: Date.now() - 6 * 60000,
            origin:      { lat: 12.9784, lng: 77.6408, label: 'Indiranagar Hub' },
            destination: { lat: 12.9352, lng: 77.6245, label: 'Koramangala Station' }
        });
    }

    Store.markSeeded();
}

export const Data = {
    CITY, LOCATIONS, CATEGORIES, BRANDS, CONNECTORS, OFFERS,
    TESTIMONIALS, FAQS, SUPPORT_CATEGORIES,
    seed, haversine, vehicleImage, STATION_IMG
};

export default Data;
