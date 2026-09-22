/* ==========================================================================
   EVRide — invoices.js
   Controller for invoices.html: list, filter, detail view, print and export.
   ========================================================================== */

import Store from './storage.js';
import { boot, fmt, $, $$, esc, icons, toast, debounce } from './main.js';
import mountDash, { statTile, statusBadge } from './dashboard.js';

boot({ realtime: false });
mountDash({ role: 'customer', active: 'invoices', searchPlaceholder: 'Search invoices…' });

let search = '';
let statusFilter = '';

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

function allInvoices() {
    let list = Store.getInvoices();

    if (search) {
        const q = search.toLowerCase();
        list = list.filter(i =>
            `${i.id} ${i.bookingId} ${i.vehicle} ${i.customer}`.toLowerCase().includes(q));
    }
    if (statusFilter) list = list.filter(i => i.status === statusFilter);

    return list.sort((a, b) => b.date - a.date);
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

function renderStats() {
    const invoices = Store.getInvoices();
    const paid = invoices.filter(i => i.status === 'paid');
    const total = paid.reduce((a, i) => a + i.amount, 0);
    const refunded = invoices.filter(i => i.status === 'refunded').reduce((a, i) => a + i.amount, 0);
    const thisYear = paid.filter(i => new Date(i.date).getFullYear() === new Date().getFullYear());

    $('#invoiceStats').innerHTML = [
        statTile({ label: 'Total invoices', value: invoices.length, icon: 'file-text', meta: 'all time' }),
        statTile({ label: 'Total paid', value: fmt.money(total), icon: 'wallet', tone: 'blue', meta: `${paid.length} settled` }),
        statTile({ label: 'This year', value: fmt.money(thisYear.reduce((a, i) => a + i.amount, 0)), icon: 'calendar', tone: 'purple', meta: `${thisYear.length} invoices` }),
        statTile({ label: 'Refunded', value: fmt.money(refunded), icon: 'rotate-ccw', tone: 'warn', meta: 'processed in full' })
    ].join('');

    icons();
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

function renderList() {
    const list = allInvoices();
    $('#invCount').textContent = list.length;

    if (!list.length) {
        $('#invoiceList').innerHTML = `
        <div class="empty" style="padding:70px 20px">
            <div class="empty-icon"><i data-lucide="file-x"></i></div>
            <h4>No invoices ${search || statusFilter ? 'match' : 'yet'}</h4>
            <p>${search || statusFilter
                ? 'Try a different search term or clear the status filter.'
                : 'Invoices appear here automatically after each completed booking.'}</p>
            ${search || statusFilter
                ? '<button class="btn btn-secondary btn-sm mt-4" id="clearInvFilters"><i data-lucide="rotate-ccw"></i> Clear filters</button>'
                : '<a href="404.html" class="btn btn-primary mt-6">Book an EV</a>'}
        </div>`;
        icons();
        $('#clearInvFilters')?.addEventListener('click', () => {
            search = ''; statusFilter = '';
            $('#invSearch').value = '';
            $('#invStatusFilter').value = '';
            renderList();
        });
        return;
    }

    $('#invoiceList').innerHTML = list.map(inv => `
        <div class="invoice-row">
            <span class="invoice-icon"><i data-lucide="file-text"></i></span>
            <div style="flex:1;min-width:0">
                <div class="flex items-center gap-3 flex-wrap mb-1">
                    <strong style="font-size:.92rem;color:var(--text-primary)">${esc(inv.id)}</strong>
                    ${statusBadge(inv.status)}
                </div>
                <span style="font-size:.79rem;color:var(--text-muted)">
                    ${esc(inv.vehicle)} · Booking ${esc(inv.bookingId)} · ${fmt.date(inv.date)}
                </span>
            </div>
            <div style="text-align:right;flex-shrink:0">
                <strong style="display:block;font-family:var(--font-display);font-size:1.1rem;color:var(--text-primary);letter-spacing:-.03em">
                    ${fmt.money(inv.amount)}
                </strong>
                <span style="font-size:.74rem;color:var(--text-muted)">${esc(inv.method)}</span>
            </div>
            <div class="flex gap-2 flex-shrink-0">
                <button class="btn btn-secondary btn-xs" data-view-inv="${esc(inv.id)}">
                    <i data-lucide="eye"></i> View
                </button>
                <button class="btn btn-secondary btn-xs" data-print-inv="${esc(inv.id)}" aria-label="Print">
                    <i data-lucide="printer"></i>
                </button>
            </div>
        </div>`).join('');

    icons();

    $$('[data-view-inv]').forEach(btn => {
        btn.addEventListener('click', () => showDetail(btn.dataset.viewInv));
    });

    $$('[data-print-inv]').forEach(btn => {
        btn.addEventListener('click', () => {
            showDetail(btn.dataset.printInv);
            setTimeout(() => window.print(), 500);
        });
    });
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

function showDetail(id) {
    const inv = Store.getInvoice(id);
    if (!inv) { toast('Invoice not found', 'error'); return; }

    const booking = Store.getBooking(inv.bookingId);
    const payment = Store.getPayments().find(p => p.invoiceId === inv.id);

    $('#detailTitle').textContent = inv.id;
    $('#detailSub').textContent = `${fmt.date(inv.date)} · ${fmt.money(inv.amount)} · ${fmt.statusLabel(inv.status)}`;

    const subtotal = inv.base + (inv.insurance || 0);
    const taxable = Math.max(0, subtotal - (inv.discount || 0));

    $('#invoiceDoc').innerHTML = `
    <div class="invoice-doc">
        <!-- Header -->
        <div class="invoice-head">
            <div>
                <div class="logo mb-4">
                    <img src="assets/images/stackly-whitish_blue-logo.webp" alt="Stackly"
                         class="logo-img" width="320" height="132">
                </div>
                <p style="font-size:.84rem;line-height:1.75;color:var(--text-secondary)">
                    EVRide Electric Mobility Pvt. Ltd.<br>
                    100 Feet Road, Indiranagar<br>
                    Bengaluru 560038, Karnataka<br>
                    GSTIN: 29AABCV1234E1Z5
                </p>
            </div>

            <div class="invoice-meta">
                <h3>Tax Invoice</h3>
                <p style="font-size:.85rem;line-height:1.9;color:var(--text-secondary)">
                    <strong class="mono" style="color:var(--electric-blue);font-size:.95rem">${esc(inv.id)}</strong><br>
                    Issued ${fmt.date(inv.date)}<br>
                    Booking <span class="mono">${esc(inv.bookingId)}</span>
                </p>
                <div class="mt-4">${statusBadge(inv.status)}</div>
            </div>
        </div>

        <!-- Parties -->
        <div class="invoice-parties">
            <div class="invoice-party">
                <h6>Billed to</h6>
                <p>
                    <strong>${esc(inv.customer)}</strong>
                    ${esc(inv.email)}<br>
                    ${booking?.driver?.phone ? esc(booking.driver.phone) + '<br>' : ''}
                    Bengaluru, Karnataka
                </p>
            </div>
            <div class="invoice-party">
                <h6>Rental period</h6>
                <p>
                    ${booking ? `
                    <strong>${fmt.plural(booking.days, 'day')}</strong>
                    ${fmt.date(booking.pickupDate)} — ${fmt.date(booking.returnDate)}<br>
                    Pickup: ${esc(booking.pickupLocation)}<br>
                    Return: ${esc(booking.dropLocation)}
                    ` : '<strong>—</strong>'}
                </p>
            </div>
        </div>

        <!-- Line items -->
        <div class="table-wrap" style="border:none">
            <table class="table" style="min-width:0">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th style="text-align:center">Qty</th>
                        <th style="text-align:right">Rate</th>
                        <th style="text-align:right">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <strong style="color:var(--text-primary);display:block">${esc(inv.vehicle)}</strong>
                            <span class="text-muted" style="font-size:.78rem">
                                EV rental${booking ? ` · ${esc(booking.plate || '')}` : ''}
                            </span>
                        </td>
                        <td style="text-align:center">${booking ? booking.days : 1}</td>
                        <td style="text-align:right">${fmt.money(booking ? Math.round(inv.base / booking.days) : inv.base)}</td>
                        <td style="text-align:right" class="cell-strong">${fmt.money(inv.base)}</td>
                    </tr>

                    ${inv.insurance ? `
                    <tr>
                        <td>
                            <strong style="color:var(--text-primary);display:block">Premium Protection</strong>
                            <span class="text-muted" style="font-size:.78rem">Zero-excess insurance</span>
                        </td>
                        <td style="text-align:center">${booking ? booking.days : 1}</td>
                        <td style="text-align:right">${fmt.money(299)}</td>
                        <td style="text-align:right" class="cell-strong">${fmt.money(inv.insurance)}</td>
                    </tr>` : ''}

                    ${booking?.deliveryFee ? `
                    <tr>
                        <td>
                            <strong style="color:var(--text-primary);display:block">Doorstep delivery</strong>
                            <span class="text-muted" style="font-size:.78rem">Delivery and collection</span>
                        </td>
                        <td style="text-align:center">1</td>
                        <td style="text-align:right">${fmt.money(booking.deliveryFee)}</td>
                        <td style="text-align:right" class="cell-strong">${fmt.money(booking.deliveryFee)}</td>
                    </tr>` : ''}
                </tbody>
            </table>
        </div>

        <!-- Totals -->
        <div class="invoice-totals">
            <div class="meta-list">
                <div class="meta-row">
                    <span class="meta-k">Subtotal</span>
                    <span class="meta-v">${fmt.money(subtotal)}</span>
                </div>
                ${inv.discount ? `
                <div class="meta-row">
                    <span class="meta-k text-green">Discount${booking?.promoCode ? ` (${esc(booking.promoCode)})` : ''}</span>
                    <span class="meta-v text-green">− ${fmt.money(inv.discount)}</span>
                </div>` : ''}
                <div class="meta-row">
                    <span class="meta-k">Taxable value</span>
                    <span class="meta-v">${fmt.money(taxable)}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-k">CGST (9%)</span>
                    <span class="meta-v">${fmt.money(Math.round(inv.taxes / 2))}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-k">SGST (9%)</span>
                    <span class="meta-v">${fmt.money(inv.taxes - Math.round(inv.taxes / 2))}</span>
                </div>
                <div class="meta-row total">
                    <span class="meta-k">Total ${inv.status === 'refunded' ? 'refunded' : 'paid'}</span>
                    <span class="meta-v">${fmt.money(inv.amount)}</span>
                </div>
            </div>
        </div>

        <div class="divider"></div>

        <!-- Payment -->
        <div class="grid grid-2 gap-8">
            <div>
                <h6 style="font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;font-family:var(--font-body)">
                    Payment details
                </h6>
                <div class="meta-list">
                    <div class="meta-row">
                        <span class="meta-k">Method</span>
                        <span class="meta-v">${esc(inv.method)}</span>
                    </div>
                    ${payment ? `
                    <div class="meta-row">
                        <span class="meta-k">Transaction</span>
                        <span class="meta-v mono" style="font-size:.82rem">${esc(payment.ref)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-k">Gateway</span>
                        <span class="meta-v">${esc(payment.gateway)}</span>
                    </div>` : ''}
                    <div class="meta-row">
                        <span class="meta-k">Status</span>
                        <span class="meta-v ${inv.status === 'paid' ? 'text-green' : ''}">${esc(fmt.statusLabel(inv.status))}</span>
                    </div>
                </div>
            </div>

            <div>
                <h6 style="font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;font-family:var(--font-body)">
                    Notes
                </h6>
                <p style="font-size:.82rem;line-height:1.8;color:var(--text-secondary)">
                    This is a computer-generated invoice and does not require a signature.
                    Security deposits are held separately and refunded to the original
                    payment method within 5–7 working days of vehicle return.
                </p>
            </div>
        </div>

        <div class="divider"></div>

        <p class="text-center text-muted" style="font-size:.79rem;line-height:1.8">
            Questions about this invoice? Email
            <a href="mailto:billing@evride.in" class="text-green">billing@evride.in</a>
            or call +91 80 4567 8900, quoting <strong class="mono">${esc(inv.id)}</strong>.<br>
            Thank you for driving electric. 🌱
        </p>
    </div>`;

    location.hash = 'detail';
    icons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

$('#backToList')?.addEventListener('click', () => { location.hash = 'invoices'; });
$('#printInvoice')?.addEventListener('click', () => window.print());

$('#downloadInvoice')?.addEventListener('click', () => {
    // No PDF library here, and the browser's print-to-PDF produces a better
    // document than anything we could hand-roll — so route to it explicitly.
    toast('Opening print dialogue — choose "Save as PDF" as the destination', 'info', 'Download invoice');
    setTimeout(() => window.print(), 700);
});

$('#invSearch')?.addEventListener('input', debounce(e => {
    search = e.target.value;
    renderList();
}, 250));

$('#invStatusFilter')?.addEventListener('change', e => {
    statusFilter = e.target.value;
    renderList();
});

$('#exportInvoices')?.addEventListener('click', () => {
    const list = allInvoices();
    const headers = ['Invoice', 'Booking', 'Date', 'Vehicle', 'Base', 'Insurance', 'Discount', 'Tax', 'Total', 'Method', 'Status'];
    const rows = list.map(i => [
        i.id, i.bookingId, fmt.date(i.date), i.vehicle,
        i.base, i.insurance || 0, i.discount || 0, i.taxes, i.amount, i.method, i.status
    ]);

    const csv = [headers, ...rows]
        .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evride-invoices-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    toast(`${rows.length} invoices exported`, 'success', 'Download ready');
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

renderStats();
renderList();

// Deep links: ?id=INV-2026-0418, ?booking=EV2048, &print=1
const params = new URLSearchParams(location.search);
const byId = params.get('id');
const byBooking = params.get('booking');

if (byId) {
    showDetail(byId);
    if (params.get('print') === '1') setTimeout(() => window.print(), 900);
} else if (byBooking) {
    const inv = Store.getInvoices().find(i => i.bookingId === byBooking);
    if (inv) showDetail(inv.id);
    else toast(`No invoice found for booking ${byBooking}`, 'info');
}
