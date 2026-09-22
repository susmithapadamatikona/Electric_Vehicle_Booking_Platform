/* ==========================================================================
   EVRide — about.js
   Controller for about.html.
   ========================================================================== */

import { boot, $, $$, esc, icons, toast, refreshReveal } from './main.js';
import mountChrome from './navbar.js';

boot();
mountChrome({ solidNav: true });

/* ------------------------------------------------------------------ */
/* Team                                                                */
/* ------------------------------------------------------------------ */

const TEAM = [
    { name: 'Nikhil Varma',    role: 'Co-founder & CEO',        bio: 'Previously led mobility ops at a national logistics firm.', tone: '' },
    { name: 'Aditi Raghavan',  role: 'Co-founder & CTO',        bio: 'Built real-time telematics systems for commercial fleets.', tone: 'avatar-blue' },
    { name: 'Suresh Iyengar',  role: 'Head of Charging',        bio: 'Fifteen years in grid infrastructure and power distribution.', tone: 'avatar-purple' },
    { name: 'Leela Krishnan',  role: 'Head of Operations',      bio: 'Scaled field operations across eleven Indian cities.', tone: '' },
    { name: 'Danish Qureshi',  role: 'Head of Product',         bio: 'Designs the parts of the app you never have to think about.', tone: 'avatar-blue' },
    { name: 'Rhea Fernandes',  role: 'Head of Sustainability',  bio: 'Carbon accounting and energy policy background.', tone: 'avatar-purple' },
    { name: 'Manoj Pillai',    role: 'Head of Fleet',           bio: 'Keeps 18,500 vehicles healthy, charged and where they should be.', tone: '' },
    { name: 'Tara Sengupta',   role: 'Head of Customer',        bio: 'Answers the phone at 2am so you do not have to worry.', tone: 'avatar-blue' },
    { name: 'Vikram Shetty',   role: 'Head of Engineering',     bio: 'Keeps the booking platform fast on a patchy 4G connection.', tone: 'avatar-purple' },
    { name: 'Ananya Bose',     role: 'Head of Data',            bio: "Turns trip and charge telemetry into tomorrow's fleet plan.", tone: '' }
];

/** Illustrated portrait for a team member (see assets/images/team/). */
function teamPhoto(name) {
    return `assets/images/team/${name.toLowerCase().replace(/ /g, '-')}.webp`;
}

$('#teamGrid').innerHTML = TEAM.map((m, i) => `
    <div class="team-card" data-reveal data-reveal-delay="${i * 50}">
        <img class="team-avatar" src="${esc(teamPhoto(m.name))}" alt=""
             width="84" height="84" loading="lazy" decoding="async">
        <h5>${esc(m.name)}</h5>
        <div class="team-role">${esc(m.role)}</div>
        <p>${esc(m.bio)}</p>
    </div>`).join('');

/* ------------------------------------------------------------------ */
/* Open roles                                                          */
/* ------------------------------------------------------------------ */

const JOBS = [
    { title: 'Senior Frontend Engineer',   team: 'Engineering',    location: 'Bengaluru / Remote', type: 'Full-time' },
    { title: 'Fleet Operations Manager',   team: 'Operations',     location: 'Mumbai',             type: 'Full-time' },
    { title: 'Charging Network Engineer',  team: 'Infrastructure', location: 'Bengaluru',          type: 'Full-time' },
    { title: 'Data Scientist, Demand',     team: 'Data',           location: 'Remote',             type: 'Full-time' },
    { title: 'Corporate Account Executive',team: 'Sales',          location: 'Delhi NCR',          type: 'Full-time' },
    { title: 'Product Designer',           team: 'Design',         location: 'Bengaluru / Remote', type: 'Full-time' }
];

$('#jobGrid').innerHTML = JOBS.map((j, i) => `
    <a href="contact.html" class="card card-hover" data-reveal data-reveal-delay="${i * 50}">
        <div class="flex items-start justify-between gap-4">
            <div style="flex:1;min-width:0">
                <h4 style="font-size:1.05rem;margin-bottom:8px">${esc(j.title)}</h4>
                <div class="flex gap-3 flex-wrap" style="font-size:.8rem;color:var(--text-muted)">
                    <span class="flex items-center gap-1">
                        <i data-lucide="users" style="width:12px;height:12px"></i> ${esc(j.team)}
                    </span>
                    <span class="flex items-center gap-1">
                        <i data-lucide="map-pin" style="width:12px;height:12px"></i> ${esc(j.location)}
                    </span>
                    <span class="flex items-center gap-1">
                        <i data-lucide="clock" style="width:12px;height:12px"></i> ${esc(j.type)}
                    </span>
                </div>
            </div>
            <i data-lucide="arrow-up-right" style="width:18px;height:18px;color:var(--primary);flex-shrink:0"></i>
        </div>
    </a>`).join('');

/* ------------------------------------------------------------------ */
/* Press & blog                                                        */
/* ------------------------------------------------------------------ */

const POSTS = [
    {
        tag: 'Engineering',
        title: 'Why we show live range instead of WLTP',
        excerpt: 'Manufacturer range figures are measured in conditions almost nobody drives in. Here is how we compute a number you can actually plan around.',
        date: '12 Aug 2026',
        read: '6 min',
        tone: 'badge-green'
    },
    {
        tag: 'Infrastructure',
        title: 'Building 350 kW hyperhubs in Indian cities',
        excerpt: 'Grid connections, land costs and the unglamorous logistics of putting a megawatt of charging where people actually stop.',
        date: '28 Jul 2026',
        read: '9 min',
        tone: 'badge-blue'
    },
    {
        tag: 'Sustainability',
        title: 'Our 2026 carbon methodology, in full',
        excerpt: 'Every assumption behind the CO₂ numbers on this site, including the ones that make our figures look worse.',
        date: '03 Jul 2026',
        read: '11 min',
        tone: 'badge-purple'
    }
];

$('#pressGrid').innerHTML = POSTS.map((p, i) => `
    <article class="card card-hover" data-reveal data-reveal-delay="${i * 70}">
        <span class="badge ${esc(p.tone)} mb-4">${esc(p.tag)}</span>
        <h4 style="font-size:1.08rem;margin-bottom:10px;line-height:1.35">${esc(p.title)}</h4>
        <p style="font-size:.88rem;color:var(--text-secondary);line-height:1.7;margin-bottom:18px">
            ${esc(p.excerpt)}
        </p>
        <div class="flex items-center justify-between gap-3 pt-4" style="border-top:1px solid var(--border-faint)">
            <span class="text-muted" style="font-size:.78rem">${esc(p.date)} · ${esc(p.read)} read</span>
            <span class="btn-link" style="font-size:.83rem">Read <i data-lucide="arrow-right"></i></span>
        </div>
    </article>`).join('');

icons();
refreshReveal(document);
