/* ==========================================================================
   EVRide — credits.js
   Controller for credits.html. Static page; just mounts the shared chrome.
   ========================================================================== */

import { boot } from './main.js';
import mountChrome from './navbar.js';

boot({ realtime: false });
mountChrome({ solidNav: true });
