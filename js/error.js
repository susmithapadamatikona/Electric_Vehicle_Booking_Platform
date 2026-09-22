/* ==========================================================================
   EVRide — error.js
   Controller for 404.html.
   ========================================================================== */

import { boot, $ } from './main.js';

// No mountChrome() here: this page deliberately has no site header or footer,
// so the 404 message is the only thing on it.
boot({ realtime: false });

/* ------------------------------------------------------------------ */
/* Back button                                                         */
/* ------------------------------------------------------------------ */

$('#goBack')?.addEventListener('click', () => {
    // history.back() on a direct visit does nothing; fall back to home.
    if (document.referrer && new URL(document.referrer).origin === location.origin) {
        history.back();
    } else {
        location.href = 'index.html';
    }
});
