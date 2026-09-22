/* ==========================================================================
   EVRide — auth.js
   Shared controller for login.html, register.html and forgot-password.html.
   Each page only wires up the parts it actually contains.

   NOTE ON CREDENTIALS
   -------------------
   This is a front-end demo with no backend. "Authentication" here means
   validating the shape of the input and writing a session flag to
   LocalStorage. No password is ever checked, hashed or transmitted, and
   nothing here should be mistaken for a real auth implementation.
   ========================================================================== */

import Store from './storage.js';
import { TESTIMONIALS } from './data.js';
import { boot, fmt, $, $$, esc, icons, toast } from './main.js';

boot({ realtime: false, toTop: false });

/* ------------------------------------------------------------------ */
/* Shared: password reveal                                             */
/* ------------------------------------------------------------------ */

$$('[data-toggle-pw]').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = $('#' + btn.dataset.togglePw);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}"></i>`;
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        icons();
    });
});

/* ------------------------------------------------------------------ */
/* Shared: field error helpers                                         */
/* ------------------------------------------------------------------ */

function showError(input, show = true) {
    if (!input) return;
    input.classList.toggle('error', show);
    const err = input.closest('.field')?.querySelector('.field-error');
    if (err) err.classList.toggle('show', show);
}

function clearOnInput(ids) {
    ids.forEach(id => {
        $('#' + id)?.addEventListener('input', () => showError($('#' + id), false));
    });
}

const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim());
const isPhone = v => /^[\d\s+()-]{10,}$/.test(String(v).trim());

/* ------------------------------------------------------------------ */
/* Shared: social buttons                                              */
/* ------------------------------------------------------------------ */

$$('[data-social]').forEach(btn => {
    btn.addEventListener('click', () => {
        const provider = btn.dataset.social === 'google' ? 'Google' : 'Apple';
        toast(`${provider} sign-in needs a backend OAuth flow — use the email form in this demo.`,
            'info', 'Not available offline');
    });
});

/* ------------------------------------------------------------------ */
/* Rotating testimonial (login page)                                   */
/* ------------------------------------------------------------------ */

const quoteText = $('#quoteText');
if (quoteText) {
    let qi = 0;
    setInterval(() => {
        qi = (qi + 1) % TESTIMONIALS.length;
        const t = TESTIMONIALS[qi];

        quoteText.style.opacity = '0';
        setTimeout(() => {
            quoteText.textContent = t.text;
            $('#quoteName').textContent = t.name;
            $('#quoteRole').textContent = t.role;
            $('#quoteAvatar').textContent = t.initials;
            quoteText.style.opacity = '1';
        }, 320);
    }, 6500);
}

/* ------------------------------------------------------------------ */
/* LOGIN                                                               */
/* ------------------------------------------------------------------ */

const loginForm = $('#loginForm');

if (loginForm) {
    clearOnInput(['loginEmail', 'loginPassword']);

    // Arriving from register.html: confirm the account and prefill what we
    // already know, so signing in is one click rather than a retype.
    const params = new URLSearchParams(location.search);
    if (params.get('registered')) {
        const email = params.get('email');
        const role = params.get('role');
        if (email) $('#loginEmail').value = email;
        if (role && $('#loginRole')) {
            const opt = [...$('#loginRole').options].find(o => o.value === role);
            if (opt) $('#loginRole').value = role;
        }
        toast('Account created — sign in to continue', 'success', 'Welcome to EVRide');
        $('#loginPassword')?.focus();
    }

    loginForm.addEventListener('submit', e => {
        e.preventDefault();

        const email = $('#loginEmail');
        const password = $('#loginPassword');

        // This is a front-end demo with no accounts and no backend: whatever
        // is typed signs you in, and an empty form works too. Nothing is
        // validated or checked because there is nothing to check against.
        const typed = email.value.trim();
        // The picker is explicit, so it wins; fall back to guessing from the
        // address only when the field is somehow absent.
        const picked = $('#loginRole')?.value || roleFromEmail(typed);

        const btn = $('#loginBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Signing in…';

        setTimeout(() => {
            signIn({
                name: typed ? nameFromEmail(typed) : 'EVRide Member',
                email: typed || 'member@evride.in',
                role: picked
            });
        }, 900);
    });
}

/**
 * Pick a dashboard from whatever was typed, so "admin", "fleet" or "driver"
 * anywhere in the address lands on that console. Anything else — including
 * an empty field — is treated as a customer.
 */
function roleFromEmail(email) {
    const v = String(email).toLowerCase();
    if (v.includes('admin')) return 'admin';
    if (v.includes('fleet')) return 'fleet';
    if (v.includes('driver') || v.includes('owner')) return 'driver';
    return 'customer';
}

function nameFromEmail(email) {
    const local = String(email).split('@')[0];
    const name = local
        .split(/[._\-\s]+/)
        .filter(Boolean)
        // Lowercase the rest so ALL-CAPS input does not shout in the header.
        .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
        .trim();
    // Fall back when the field held only punctuation or symbols.
    return /[a-z0-9]/i.test(name) ? name : 'EVRide Member';
}

function signIn(profile, destination) {
    const existing = Store.getUser();

    const user = {
        id: existing?.id || 'u-' + Date.now().toString(36),
        name: profile.name,
        email: profile.email,
        phone: existing?.phone || '+91 98450 12345',
        city: existing?.city || 'Bengaluru',
        role: profile.role,
        joined: existing?.joined || Date.now(),
        tier: existing?.tier || 'Gold'
    };

    Store.login(user);

    const dest = destination || ({
        admin: 'admin-dashboard.html',
        fleet: 'fleet-dashboard.html',
        driver: 'driver-dashboard.html',
        owner: 'driver-dashboard.html'
    })[profile.role] || 'customer-dashboard.html';

    // Honour ?next= so a redirect back to a protected page works.
    const next = new URLSearchParams(location.search).get('next');

    toast(`Welcome back, ${user.name.split(' ')[0]}`, 'success');
    setTimeout(() => { location.href = next || dest; }, 700);
}

/* ------------------------------------------------------------------ */
/* REGISTER                                                            */
/* ------------------------------------------------------------------ */

const registerForm = $('#registerForm');

if (registerForm) {
    let selectedRole = 'customer';

    clearOnInput(['regName', 'regEmail', 'regPhone', 'regPassword', 'regConfirm']);

    // Role picker.
    $$('[data-role]').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.role-opt').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedRole = btn.dataset.role;
        });
    });

    /* --- Password strength --- */
    const pw = $('#regPassword');

    function scorePassword(value) {
        const checks = {
            length: value.length >= 8,
            upper:  /[A-Z]/.test(value),
            number: /\d/.test(value),
            symbol: /[^A-Za-z0-9]/.test(value)
        };
        const met = Object.values(checks).filter(Boolean).length;

        // A long passphrase without symbols is still strong; don't punish it.
        const bonus = value.length >= 14 ? 1 : 0;
        const score = Math.min(4, met + bonus);

        return { checks, met, score };
    }

    pw?.addEventListener('input', () => {
        const { checks, score } = scorePassword(pw.value);

        // Requirement checklist.
        Object.entries(checks).forEach(([key, ok]) => {
            const node = $(`[data-req="${key}"]`);
            if (node) node.classList.toggle('met', ok);
        });

        // Bars + label.
        const levels = ['', 'weak', 'fair', 'good', 'strong'];
        const labels = ['—', 'Weak', 'Fair', 'Good', 'Strong'];
        const level = levels[score];

        $$('.strength-bar').forEach((bar, i) => {
            bar.className = 'strength-bar' + (i < score && level ? ` on-${level}` : '');
        });

        const text = $('#strengthText');
        if (text) {
            text.textContent = pw.value ? labels[score] : '—';
            text.className = level || '';
        }

        // Re-check the confirmation field as the password changes.
        const confirm = $('#regConfirm');
        if (confirm?.value) {
            showError(confirm, confirm.value !== pw.value);
        }
    });

    $('#regConfirm')?.addEventListener('input', e => {
        showError(e.target, e.target.value !== pw.value && e.target.value.length > 0);
    });

    /* --- Submit --- */
    registerForm.addEventListener('submit', e => {
        e.preventDefault();

        const name = $('#regName');
        const email = $('#regEmail');
        const phone = $('#regPhone');
        const confirm = $('#regConfirm');
        const terms = $('#regTerms');

        let valid = true;

        if (name.value.trim().length < 2) { showError(name); valid = false; }
        if (!isEmail(email.value)) { showError(email); valid = false; }
        if (!isPhone(phone.value)) { showError(phone); valid = false; }

        const { score } = scorePassword(pw.value);
        if (pw.value.length < 8 || score < 2) {
            showError(pw);
            toast('Choose a stronger password — at least 8 characters with a mix of types', 'error');
            valid = false;
        }
        if (confirm.value !== pw.value) { showError(confirm); valid = false; }

        if (!terms.checked) {
            terms.closest('.check').classList.add('shake');
            setTimeout(() => terms.closest('.check').classList.remove('shake'), 500);
            toast('Please accept the terms to continue', 'warning');
            valid = false;
        }

        if (!valid) {
            registerForm.querySelector('.input.error')?.focus();
            return;
        }

        const btn = $('#registerBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Creating account…';

        setTimeout(() => {
            const user = {
                id: 'u-' + Date.now().toString(36),
                name: name.value.trim(),
                email: email.value.trim(),
                phone: phone.value.trim(),
                city: 'Bengaluru',
                role: selectedRole === 'owner' ? 'driver' : selectedRole,
                joined: Date.now(),
                tier: 'New'
            };

            // Store the account but do NOT sign in: registration hands off to
            // the login page, so signing in here would make that step pointless.
            Store.setUser(user);

            // Carry the email and role over so the login form arrives prefilled.
            const dest = 'login.html?registered=1'
                + '&email=' + encodeURIComponent(user.email)
                + '&role=' + encodeURIComponent(user.role);

            $('#regSuccessText').textContent =
                `Your account is ready, ${user.name.split(' ')[0]}. Taking you to the login page…`;
            $('#regSuccess').classList.add('show');
            document.body.classList.add('no-scroll');

            setTimeout(() => { location.href = dest; }, 1900);
        }, 1100);
    });
}

/* ------------------------------------------------------------------ */
/* FORGOT PASSWORD                                                     */
/* ------------------------------------------------------------------ */

const forgotForm = $('#forgotForm');

if (forgotForm) {
    let step = 1;

    const goStep = n => {
        step = n;
        $$('[data-fp-step]').forEach(panel => {
            panel.hidden = +panel.dataset.fpStep !== n;
        });
        icons();
    };

    clearOnInput(['fpEmail', 'fpPassword', 'fpConfirm']);

    /* Step 1 — request a code */
    forgotForm.addEventListener('submit', e => {
        e.preventDefault();
        const email = $('#fpEmail');

        if (!isEmail(email.value)) {
            showError(email);
            toast('Enter the email address on your account', 'error');
            return;
        }

        const btn = $('#fpSubmit');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Sending…';

        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="send"></i> Send reset code';
            $('#fpEmailEcho').textContent = email.value.trim();
            goStep(2);
            startResendTimer();
            toast('Reset code sent — check your inbox', 'success');
            $('.otp-input')?.focus();
        }, 1000);
    });

    /* Step 2 — OTP entry */
    const otpInputs = $$('.otp-input');

    otpInputs.forEach((input, i) => {
        input.addEventListener('input', e => {
            // Keep a single digit per box and advance.
            e.target.value = e.target.value.replace(/\D/g, '').slice(-1);
            e.target.classList.toggle('filled', !!e.target.value);
            if (e.target.value && i < otpInputs.length - 1) otpInputs[i + 1].focus();
            maybeVerify();
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Backspace' && !e.target.value && i > 0) {
                otpInputs[i - 1].focus();
                otpInputs[i - 1].value = '';
                otpInputs[i - 1].classList.remove('filled');
            }
            if (e.key === 'ArrowLeft' && i > 0) otpInputs[i - 1].focus();
            if (e.key === 'ArrowRight' && i < otpInputs.length - 1) otpInputs[i + 1].focus();
        });

        // Pasting the whole code should fill every box.
        input.addEventListener('paste', e => {
            e.preventDefault();
            const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, otpInputs.length);
            digits.split('').forEach((d, j) => {
                if (otpInputs[j]) {
                    otpInputs[j].value = d;
                    otpInputs[j].classList.add('filled');
                }
            });
            otpInputs[Math.min(digits.length, otpInputs.length - 1)]?.focus();
            maybeVerify();
        });
    });

    function maybeVerify() {
        const code = otpInputs.map(i => i.value).join('');
        if (code.length !== otpInputs.length) return;

        const btn = $('#fpVerify');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Verifying…';

        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="check"></i> Verify code';
            goStep(3);
            toast('Code verified — choose a new password', 'success');
            $('#fpPassword')?.focus();
        }, 800);
    }

    $('#fpVerify')?.addEventListener('click', maybeVerify);

    /* Resend timer */
    let resendLeft = 0;
    let resendTimer = null;

    function startResendTimer() {
        resendLeft = 45;
        const btn = $('#fpResend');
        clearInterval(resendTimer);

        const tick = () => {
            if (!btn) return;
            if (resendLeft <= 0) {
                clearInterval(resendTimer);
                btn.disabled = false;
                btn.textContent = 'Resend code';
                return;
            }
            btn.disabled = true;
            btn.textContent = `Resend in ${resendLeft}s`;
            resendLeft--;
        };

        tick();
        resendTimer = setInterval(tick, 1000);
    }

    $('#fpResend')?.addEventListener('click', () => {
        startResendTimer();
        toast('A new code is on its way', 'info');
    });

    /* Step 3 — new password */
    $('#fpReset')?.addEventListener('click', () => {
        const pwNew = $('#fpPassword');
        const confirm = $('#fpConfirm');

        if (pwNew.value.length < 8) {
            showError(pwNew);
            toast('Password must be at least 8 characters', 'error');
            return;
        }
        if (pwNew.value !== confirm.value) {
            showError(confirm);
            toast('Passwords do not match', 'error');
            return;
        }

        const btn = $('#fpReset');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Updating…';

        setTimeout(() => {
            goStep(4);
            toast('Password updated — you can sign in now', 'success');
        }, 900);
    });

    goStep(1);
}
