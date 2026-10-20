/* ============================================================
   i-DASH v5.0 — SQL-ready SPA
   Persistence: HTTP API (/api/*) — no localStorage.
   Auth: server-side sessions (httpOnly cookie).
   ============================================================ */
(function () {
  'use strict';

  const COOLDOWN_MS = 1500;
  const MAX_QTY = 500;
  const PAGE_MARGIN = 10, GAP = 1;
  const PAPER = { a4: { w: 210, h: 297, css: 'A4' }, letter: { w: 215.9, h: 279.4, css: 'Letter' } };
  const ROLE_LABELS = { admin: 'Administrator', sales: 'Sales Staff', inventory: 'Inventory Staff', production: 'Production Staff', marketing: 'Marketing Staff' };
  const STATUS_BADGE = {
    'in stock': 'outline', 'low stock': 'filled', 'out of stock': 'solid', 'overstock': 'dashed',
    'Pending': 'filled', 'In Production': 'g700', 'Ready for Delivery': 'outline',
    'Completed': 'solid', 'Cancelled': 'solid', 'Waiting': 'filled', 'Being Served': 'g700',
    'Queued': 'filled', 'In Progress': 'g700', 'Done': 'solid'
  };

  const API = {
    state:      () => '/api/state',
    login:      () => '/api/auth/login',
    logout:     () => '/api/auth/logout',
    me:         () => '/api/auth/me',
    activeScan: () => '/api/count-sessions/active',
    finishScan: (id) => '/api/count-sessions/' + encodeURIComponent(id) + '/finish'
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const uid = (p = '') => p + Math.random().toString(36).slice(2, 10).toUpperCase();
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (d) => { if (!d) return ''; const dt = new Date(d); return isNaN(dt) ? '' : dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }); };
  const fmtDateTime = (d) => { if (!d) return ''; const dt = new Date(d); return isNaN(dt) ? '' : dt.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }); };
  const monthName = (m) => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m];
  const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
  const sanitizeSku = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9_-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const makeUnitId = (sku, n) => sku + '-' + String(n).padStart(4, '0');

  const EYE_OPEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const EYE_OFF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

  let toastTimer;
  function toast(msg, kind) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.className = 'toast ' + (kind || ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const downloadText = (text, name, mime) => downloadBlob(new Blob([text], { type: mime }), name);
  const canvasToBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));
  const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

  function csvCell(v) { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  const csvRow = (arr) => arr.map(csvCell).join(',');

  const DEFAULT_IMG = 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80';

  const IMG = {
    blinds: ['https://images.unsplash.com/photo-1595872018818-97555653a011?w=800&q=80', 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80', 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&q=80'],
    roller: ['https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=800&q=80', 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?w=800&q=80'],
    curtains: ['https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=800&q=80', 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&q=80'],
    doors: ['https://images.unsplash.com/photo-1615874959474-d609969a20ed?w=800&q=80'],
    cabinets: ['https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=800&q=80', 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=800&q=80']
  };

  const pickImg = (category, sku) => {
    const key = (category || '').toLowerCase();
    let pool = IMG.blinds;
    if (key.includes('roller')) pool = IMG.roller;
    else if (key.includes('curtain')) pool = IMG.curtains;
    else if (key.includes('door')) pool = IMG.doors;
    else if (key.includes('cabinet')) pool = IMG.cabinets;
    let h = 0; for (const c of String(sku || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
    return pool[h % pool.length];
  };

  const SEED_PRODUCTS = [
    { name: 'Natural Basic Color Window Blind', sku: 'B500', category: 'Window Blinds', price: 1450, cost: 950, stock: 24, reorder: 8, featured: true, isNew: false, bestFor: 'Best for bedrooms, living areas, and afternoon sun control.' },
    { name: 'Primewood Window Blind', sku: 'W300', category: 'Window Blinds', price: 1620, cost: 1100, stock: 18, reorder: 6, featured: false, isNew: false, bestFor: 'Best for elegant living rooms and warm interior palettes.' },
    { name: 'Woodlook Eluxe', sku: 'W800', category: 'Window Blinds', price: 1780, cost: 1200, stock: 12, reorder: 6, featured: true, isNew: false, bestFor: 'Best for studies, dining rooms, and rustic interiors.' },
    { name: 'Vega Window Blind', sku: 'V500', category: 'Window Blinds', price: 1350, cost: 900, stock: 4, reorder: 8, featured: false, isNew: false, bestFor: 'Best for everyday use, casual rooms, and budget-friendly projects.' },
    { name: 'Silk Window Blind', sku: 'S300', category: 'Window Blinds', price: 1520, cost: 1000, stock: 0, reorder: 5, featured: false, isNew: false, bestFor: 'Best for soft, filtered light in bedrooms and dining areas.' },
    { name: 'Natural Linen', sku: 'L700', category: 'Window Blinds', price: 1490, cost: 980, stock: 22, reorder: 8, featured: false, isNew: false, bestFor: 'Best for coastal, minimalist, and natural-light living rooms.' },
    { name: 'Trilogy', sku: 'T620', category: 'Window Blinds', price: 1550, cost: 1020, stock: 16, reorder: 6, featured: false, isNew: false, bestFor: 'Best for modern offices and contemporary homes.' },
    { name: 'Timber', sku: 'T500', category: 'Window Blinds', price: 1680, cost: 1120, stock: 30, reorder: 8, featured: false, isNew: false, bestFor: 'Best for high-traffic rooms, kitchens, and family homes.' },
    { name: 'Trinity', sku: 'T800', category: 'Window Blinds', price: 1420, cost: 940, stock: 14, reorder: 6, featured: false, isNew: true, bestFor: 'Best for casual outings, hobbies, and cold-weather interiors.' },
    { name: 'Sunscreen A4501', sku: 'A4501', category: 'Roller Blinds', price: 1250, cost: 820, stock: 35, reorder: 10, featured: true, isNew: false, bestFor: 'Best for west-facing windows, offices, and sun-heavy rooms.' },
    { name: 'Sunscreen T3501', sku: 'T3501', category: 'Roller Blinds', price: 1180, cost: 780, stock: 28, reorder: 10, featured: false, isNew: false, bestFor: 'Best for daytime privacy with natural light preservation.' },
    { name: 'Blackout S2600', sku: 'S2600', category: 'Roller Blinds', price: 1420, cost: 950, stock: 15, reorder: 8, featured: false, isNew: false, bestFor: 'Best for bedrooms, media rooms, and shift workers.' },
    { name: 'Blackout R8210', sku: 'R8210', category: 'Roller Blinds', price: 1380, cost: 920, stock: 6, reorder: 8, featured: false, isNew: true, bestFor: 'Best for nurseries and rooms needing total darkness.' },
    { name: 'Aphrodite Curtain', sku: 'AP100', category: 'Curtains', price: 1850, cost: 1200, stock: 10, reorder: 5, featured: true, isNew: false, bestFor: 'Best for elegant living rooms and formal dining spaces.' },
    { name: 'Athena Curtain', sku: 'AT200', category: 'Curtains', price: 1950, cost: 1280, stock: 8, reorder: 5, featured: false, isNew: false, bestFor: 'Best for hotels, reception areas, and luxurious interiors.' },
    { name: 'Victoria Curtain', sku: 'VT300', category: 'Curtains', price: 2100, cost: 1400, stock: 12, reorder: 5, featured: false, isNew: false, bestFor: 'Best for classic homes and event venues.' },
    { name: 'Accordion Door Standard', sku: 'ACC-STD', category: 'Accordion Doors', price: 3200, cost: 2100, stock: 8, reorder: 3, featured: true, isNew: false, bestFor: 'Best for patios, room dividers, and space-saving solutions.' },
    { name: 'Accordion Door Premium', sku: 'ACC-PRM', category: 'Accordion Doors', price: 4200, cost: 2800, stock: 5, reorder: 3, featured: false, isNew: true, bestFor: 'Best for commercial spaces, terraces, and premium homes.' },
    { name: 'Modular Cabinet Small', sku: 'CAB-S', category: 'Modular Cabinets', price: 5500, cost: 3800, stock: 4, reorder: 2, featured: false, isNew: false, bestFor: 'Best for compact bedrooms and small storage areas.' },
    { name: 'Modular Cabinet Medium', sku: 'CAB-M', category: 'Modular Cabinets', price: 7800, cost: 5400, stock: 3, reorder: 2, featured: false, isNew: false, bestFor: 'Best for living rooms, kitchens, and household storage.' },
    { name: 'Modular Cabinet Large', sku: 'CAB-L', category: 'Modular Cabinets', price: 10500, cost: 7300, stock: 2, reorder: 2, featured: true, isNew: false, bestFor: 'Best for walk-in closets, offices, and full-wall storage.' }
  ];
  const SEED_CUSTOMERS = [
    { name: 'Maria Santos', phone: '0917-555-0101', email: 'maria.santos@email.com', leadSource: 'Facebook', totalOrders: 3, lifetimeValue: 45800 },
    { name: 'San Jose Elementary School', phone: '(044) 555-0202', email: 'admin@sjes.edu.ph', leadSource: 'Referral', totalOrders: 2, lifetimeValue: 128500 },
    { name: 'Interior by Design Co.', phone: '0918-555-0303', email: 'hello@interiorbydesign.ph', leadSource: 'Referral', totalOrders: 5, lifetimeValue: 312000 },
    { name: 'Brgy. San Isidro Hall', phone: '(044) 555-0404', email: 'sanisidro@bgry.gov.ph', leadSource: 'Walk-in', totalOrders: 1, lifetimeValue: 89000 },
    { name: 'John Reyes', phone: '0920-555-0505', email: 'jreyes@gmail.com', leadSource: 'Facebook', totalOrders: 1, lifetimeValue: 15600 }
  ];
  // SEED_USERS: no passwords — the server seeds them with hashed credentials
  const SEED_USERS = [
    { id: 'U1', name: 'Hans David Cruz', email: 'admin@rgca.ph', role: 'admin', active: true },
    { id: 'U2', name: 'Hans Daniel Cruz', email: 'sales@rgca.ph', role: 'sales', active: true },
    { id: 'U3', name: 'John Lloyd De Leon', email: 'inv@rgca.ph', role: 'inventory', active: true },
    { id: 'U4', name: 'Jhon Seal Serva', email: 'prod@rgca.ph', role: 'production', active: true },
    { id: 'U5', name: 'Renz Jimenez', email: 'mkt@rgca.ph', role: 'marketing', active: true }
  ];

  const state = {
    products: [], customers: [], users: [], orders: [], stockMovements: [],
    queue: [], expenses: [], inquiries: [],
    units: [], unitCounters: {}, labelSheet: [],
    countSessions: [], materialRequests: [], finishedGoods: [], notifications: [],
    ads: [], archive: [], logs: [],
    productionJobs: [], materials: []
  };
  let session = null;
  let unitIndex = new Map();

  /* ---------------- PERSISTENCE ---------------- */
  let saveTimer = null;
  let saveInFlight = false;
  let saveQueued = false;

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  }

  async function flushSave() {
    if (saveInFlight) { saveQueued = true; return; }
    saveInFlight = true;
    try {
      const res = await fetch(API.state(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      console.error('Persist failed:', e);
      toast('Could not save to server — changes kept in memory.', 'bad');
    } finally {
      saveInFlight = false;
      if (saveQueued) { saveQueued = false; flushSave(); }
    }
  }

  function flushSaveBeacon() {
    try {
      const payload = JSON.stringify(state);
      navigator.sendBeacon(API.state(), new Blob([payload], { type: 'application/json' }));
    } catch (e) { /* ignore */ }
  }

  async function load() {
    try {
      const res = await fetch(API.state(), { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        Object.assign(state, data);
        migrate();
        rebuildUnitIndex();
        return;
      }
    } catch (e) { console.warn('Load failed:', e); }
    // First run — initialise in-memory state and persist
    seed();
    rebuildUnitIndex();
    await flushSave();
  }

  function migrate() {
    state.countSessions   = state.countSessions   || [];
    state.materialRequests= state.materialRequests|| [];
    state.finishedGoods   = state.finishedGoods   || [];
    state.notifications   = state.notifications   || [];
    state.ads             = state.ads             || [];
    state.archive         = state.archive         || [];
    state.logs            = state.logs            || [];
    state.inquiries       = state.inquiries       || [];
    state.productionJobs  = state.productionJobs  || [];
    state.expenses        = state.expenses        || [];
    state.materials       = state.materials       || [
      { id: 'MAT1', name: 'Bracket Screws', unit: 'pcs', stock: 120, reorder: 50 },
      { id: 'MAT2', name: 'Hinges', unit: 'pcs', stock: 45, reorder: 50 },
      { id: 'MAT3', name: 'Rollers', unit: 'pcs', stock: 80, reorder: 40 },
      { id: 'MAT4', name: 'Aluminum Track (1m)', unit: 'pc', stock: 30, reorder: 15 },
      { id: 'MAT5', name: 'Fabric Roll (10m)', unit: 'roll', stock: 18, reorder: 10 }
    ];
    state.products.forEach(p => {
      if (!p.image) p.image = pickImg(p.category, p.sku);
      if (!p.sizes) p.sizes = ['Small', 'Medium', 'Large', 'Custom'];
      if (!p.colors) p.colors = ['Black', 'White', 'Brown', 'Beige'];
      if (!p.reviews) p.reviews = [];
      if (!p.bestFor) p.bestFor = 'Best for everyday use and casual settings.';
      if (typeof p.reserved !== 'number') p.reserved = 0;
    });
    state.orders.forEach(o => {
      if (!Array.isArray(o.payments)) {
        o.payments = [];
        if (Number(o.amountPaid) > 0) {
          o.payments.push({ id: uid('PM'), date: o.createdAt || new Date().toISOString(), amount: Number(o.amountPaid) || 0, method: o.paymentMode || 'Cash', ref: 'Migrated', recordedBy: o.createdBy || 'system' });
        }
      }
      o.amountPaid = o.payments.filter(p => !p.refunded).reduce((s, p) => s + Number(p.amount || 0), 0);
      o.remainingBalance = Math.max(0, Number(o.totalAmount || 0) - o.amountPaid);
      if (!Array.isArray(o.items)) o.items = [];
      o.items.forEach(it => {
        if (typeof it.needsProduction !== 'boolean') it.needsProduction = false;
        if (typeof it.reservedQty !== 'number') it.reservedQty = 0;
        if (!Array.isArray(it.unitIds)) it.unitIds = [];
      });
    });
    state.queue.forEach(q => {
      if (!('orderId' in q)) q.orderId = null;
      if (!('customerId' in q)) q.customerId = null;
    });
    state.units.forEach(u => {
      if (!u.status) u.status = 'in stock';
      if (!('productId' in u)) { const p = state.products.find(x => x.sku === u.sku); u.productId = p ? p.id : null; }
      if (!('receivedAt' in u)) u.receivedAt = u.created || null;
      if (!('source' in u)) u.source = '';
      if (!('orderId' in u)) u.orderId = null;
      if (!('soldAt' in u)) u.soldAt = null;
    });
    state.ads.forEach(ad => {
      if (!Array.isArray(ad.productIds)) ad.productIds = [];
      if (ad.discountPercent == null) ad.discountPercent = Number(ad.discount) || 10;
      if (ad.startDate == null) ad.startDate = '';
      if (ad.endDate == null) ad.endDate = '';
      if (ad.active == null) ad.active = true;
    });
    state.logs.forEach(l => {
      if (typeof l.entityType === 'undefined') l.entityType = null;
      if (typeof l.entityId   === 'undefined') l.entityId   = null;
    });
  }

  function seed() {
    state.products = SEED_PRODUCTS.map((p, i) => ({
      id: 'P' + (i + 1), ...p, unit: 'pc', reserved: 0,
      description: 'Premium quality ' + p.name + ' designed for interior projects. Custom-cut to your specifications.',
      sizes: ['Small', 'Medium', 'Large', 'Custom'],
      colors: ['Black', 'White', 'Brown', 'Beige'],
      reviews: [],
      image: pickImg(p.category, p.sku),
      images: [pickImg(p.category, p.sku)],
      isActive: true, createdAt: new Date().toISOString()
    }));
    state.customers = SEED_CUSTOMERS.map((c, i) => ({ id: 'C' + (i + 1), clientCode: 'CL-' + String(i + 1).padStart(4, '0'), ...c, isActive: true, createdAt: new Date().toISOString() }));
    state.users = [...SEED_USERS];
    state.expenses = [
      { id: 'E1', date: '2026-06-01', category: 'Utilities', description: 'Electricity', amount: 8500 },
      { id: 'E2', date: '2026-06-05', category: 'Rent', description: 'Warehouse rent', amount: 25000 }
    ];
    state.ads = [{
      id: 'AD1', title: 'Summer Sale',
      subtitle: 'On selected window blinds and roller blinds. Limited time only.',
      discount: 10, discountPercent: 10, productIds: [], startDate: '', endDate: '',
      ctaText: 'Shop Now', ctaLink: 'products', bgImage: IMG.blinds[0],
      active: true, createdAt: new Date().toISOString()
    }];
    state.materials = [
      { id: 'MAT1', name: 'Bracket Screws', unit: 'pcs', stock: 120, reorder: 50 },
      { id: 'MAT2', name: 'Hinges', unit: 'pcs', stock: 45, reorder: 50 },
      { id: 'MAT3', name: 'Rollers', unit: 'pcs', stock: 80, reorder: 40 },
      { id: 'MAT4', name: 'Aluminum Track (1m)', unit: 'pc', stock: 30, reorder: 15 },
      { id: 'MAT5', name: 'Fabric Roll (10m)', unit: 'roll', stock: 18, reorder: 10 }
    ];
  }

  function rebuildUnitIndex() { unitIndex = new Map(state.units.map(u => [u.id, u])); }

  function autoGenerateUnitsForProduct(product, qty, sourceLabel) {
    if (!product || !(qty > 0)) return [];
    state.unitCounters = state.unitCounters || {};
    const ids = [];
    const now = new Date().toISOString();
    for (let i = 0; i < qty; i++) {
      let n = (state.unitCounters[product.sku] || 0) + 1;
      while (unitIndex.has(makeUnitId(product.sku, n))) n++;
      state.unitCounters[product.sku] = n;
      const unit = {
        id: makeUnitId(product.sku, n),
        name: product.name, sku: product.sku, category: product.category,
        productId: product.id, notes: '',
        created: now, receivedAt: now,
        source: sourceLabel || '',
        status: 'in stock', orderId: null, soldAt: null
      };
      state.units.push(unit);
      unitIndex.set(unit.id, unit);
      ids.push(unit.id);
    }
    return ids;
  }

  /* ---------------- LOOKUPS ---------------- */
  const productById = (id) => state.products.find(p => p.id === id);
  const customerById = (id) => state.customers.find(c => c.id === id);
  const userById = (id) => state.users.find(u => u.id === id);
  const orderById = (id) => state.orders.find(o => o.id === id);
  const unitById = (id) => unitIndex.get(id);
  const expenseById = (id) => state.expenses.find(e => e.id === id);
  const productStock = (p) => Number(p.stock || 0);
  function productStatus(p) {
    const s = productStock(p);
    if (s <= 0) return 'out of stock';
    if (s <= p.reorder) return 'low stock';
    if (s >= (p.reorder * 4) || s >= 50) return 'overstock';
    return 'in stock';
  }
  const availableStock = (p) => Math.max(0, productStock(p) - (Number(p.reserved) || 0));

  /* ---------------- LOGGING + NOTIFICATIONS ---------------- */
  function logActivity(action, details, entity) {
    if (!session) return;
    const rec = { id: uid('L'), date: new Date().toISOString(), user: session.name, role: session.role, action, details };
    if (entity) { rec.entityType = entity.type || null; rec.entityId = entity.id || null; }
    state.logs.unshift(rec);
    if (state.logs.length > 500) state.logs.length = 500;
    save();
  }
  function pushNotification(roles, message, nav) {
    state.notifications.unshift({
      id: uid('N'), date: new Date().toISOString(),
      roles: Array.isArray(roles) ? roles : [roles],
      message, read: false,
      page: nav && nav.page ? nav.page : null,
      entityId: nav && nav.entityId ? nav.entityId : null
    });
    if (state.notifications.length > 200) state.notifications.length = 200;
    save(); updateNotifDot();
  }
  const notificationsFor = (role) => state.notifications.filter(n => n.roles.includes(role));
  const unreadCount = (role) => notificationsFor(role).filter(n => !n.read).length;
  function updateNotifDot() { if (!session) return; const el = $('#notifDot'); if (el) el.hidden = unreadCount(session.role) === 0; }
  function markAllNotificationsRead() {
    if (!session) return;
    state.notifications.forEach(n => { if (n.roles.includes(session.role)) n.read = true; });
    save(); updateNotifDot();
  }

  /* ---------------- AUTH (server-backed) ---------------- */
  async function login(email, password) {
    try {
      const res = await fetch(API.login(), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const msg = res.status === 401 ? 'Invalid email or password.' : 'Login failed (' + res.status + ').';
        return { ok: false, error: msg };
      }
      const user = await res.json();
      session = { userId: user.id, name: user.name, role: user.role, email: user.email, startedAt: new Date().toISOString() };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Network error: ' + e.message };
    }
  }
  async function logout() {
    try { await fetch(API.logout(), { method: 'POST', credentials: 'same-origin' }); } catch (e) {}
    session = null;
    $('#app').hidden = true; $('#showroom').hidden = false; $('#loginModal').hidden = true;
    window.scrollTo(0, 0);
  }
  async function restoreSession() {
    try {
      const res = await fetch(API.me(), { credentials: 'same-origin' });
      session = res.ok ? await res.json() : null;
    } catch (e) { session = null; }
  }

  const PERMS = {
    admin:      ['dashboard','insights','inquiries','orders','queue','inventory','qrcodes','scan','countlogs','production','sales','reports','products','ads','customers','users','archive','logs'],
    sales:      ['inquiries','orders','queue','customers','sales'],
    inventory:  ['inventory','qrcodes','scan','countlogs','production'],
    production: ['production'],
    marketing:  ['products','ads','archive']
  };
  const can = (m) => session && (PERMS[session.role] || []).includes(m);

  const NAV = [
    { module: 'dashboard', label: 'Dashboard', icon: '▤' },
    { module: 'insights', label: 'DSS Insights', icon: '📈' },
    { module: 'inquiries', label: 'Inquiries', icon: '📬' },
    { module: 'orders', label: 'Orders & Queue', icon: '▦' },
    { module: 'inventory', label: 'Inventory', icon: '▥' },
    { module: 'qrcodes', label: 'QR Labels', icon: '⌗' },
    { module: 'scan', label: 'QR Scan & Count', icon: '◉' },
    { module: 'countlogs', label: 'Count Logs', icon: '☰' },
    { module: 'production', label: 'Production', icon: '⚒' },
    { module: 'sales', label: 'Sales Ledger', icon: '₱' },
    { module: 'reports', label: 'Reports', icon: '▧' },
    { module: 'products', label: 'Manage Products', icon: '📦' },
    { module: 'ads', label: 'Ads Manager', icon: '📣' },
    { module: 'customers', label: 'Customers', icon: '☺' },
    { module: 'users', label: 'Users', icon: '⚙' },
    { module: 'logs', label: 'Activity Log', icon: '📋' },
    { module: 'archive', label: 'Archive', icon: '🗄' }
  ];
  let currentPage = 'dashboard';
  let orderPrefill = null;
  let inquiryProductRef = null;
  let trackFails = 0, trackLockUntil = 0;

  function normPhone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.startsWith('63') && d.length === 12) d = '0' + d.slice(2);
    if (d.length === 10 && d.startsWith('9')) d = '0' + d;
    return d;
  }
  function findCustomerByContact(phone, email) {
    const np = normPhone(phone); const em = String(email || '').trim().toLowerCase();
    return state.customers.find(c => (np && normPhone(c.phone) === np) || (em && c.email && c.email.toLowerCase() === em)) || null;
  }
  function newCustomerFrom(name, phone, email, leadSource) {
    const cust = { id: uid('C'), clientCode: 'CL-' + String(state.customers.length + 1).padStart(4, '0'), name, phone: phone || '', email: email || '', leadSource, totalOrders: 0, lifetimeValue: 0, isActive: true, createdAt: new Date().toISOString() };
    state.customers.push(cust); return cust;
  }
  function inquiryToCustomer(inq) {
    let cust = inq.customerId ? customerById(inq.customerId) : null;
    if (!cust) cust = findCustomerByContact(inq.phone, inq.email);
    if (!cust) { cust = newCustomerFrom(inq.name, inq.phone, inq.email, 'Website'); logActivity('Add Customer', `Customer ${cust.name} created from inquiry`, { type: 'customer', id: cust.id }); }
    inq.customerId = cust.id;
    if (inq.status === 'New' || inq.status === 'Contacted') inq.status = 'Converted';
    return cust;
  }
  function flashRecord(id) {
    if (!id) return;
    const root = document.getElementById('content'); if (!root) return;
    const hit = Array.from(root.querySelectorAll('*')).find(el => el.dataset && Object.values(el.dataset).includes(id));
    if (!hit) return;
    const target = hit.closest('tr') || hit;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add('rec-flash'); setTimeout(() => target.classList.remove('rec-flash'), 2600);
  }
  function openRecord(page, id) {
    if (!id) return;
    if (page === 'orders' && orderById(id)) { openOrderView(id); return; }
    if (page === 'production') {
      if (state.finishedGoods.some(f => f.id === id)) prodTab = 'fg';
      else if (state.productionJobs.some(j => j.id === id)) prodTab = 'jobs';
      else if (state.materialRequests.some(m => m.id === id)) prodTab = 'req';
      renderPage();
    }
    flashRecord(id);
  }

  function renderNav() {
    const nav = $('#sbNav'); if (!nav) return;
    nav.innerHTML = NAV.filter(n => can(n.module)).map(n => {
      let label = n.label;
      if (n.module === 'inquiries') {
        const newInqs = state.inquiries.filter(i => i.status === 'New').length;
        if (newInqs > 0) label += ` <span class="badge badge-solid" style="background:var(--bad);color:var(--white);padding:2px 6px;font-size:10px;margin-left:auto">${newInqs}</span>`;
      }
      return `
      <button class="sb-nav-item ${currentPage === n.module ? 'active' : ''}" data-page="${n.module}">
        <span class="nav-icon">${n.icon}</span>
        <span class="sb-nav-label" style="display:flex;justify-content:space-between;width:100%">${label}</span>
      </button>`;
    }).join('');
    nav.querySelectorAll('.sb-nav-item').forEach(b => {
      b.addEventListener('click', () => {
        currentPage = b.dataset.page;
        renderNav(); renderPage();
        if (window.innerWidth < 900) $('#sidebar').classList.remove('open');
      });
    });
  }

  function renderPage() {
    const el = $('#content');
    const map = {
      dashboard: renderDashboard, insights: renderInsightsPage, inquiries: renderInquiries, orders: renderOrders, queue: renderQueue,
      inventory: renderInventory, qrcodes: renderQRCodes, scan: renderScan,
      countlogs: renderCountLogs, production: renderProduction, sales: renderSales,
      reports: renderReports, products: renderProductsManager, ads: renderAdsManager,
      customers: renderCustomers, users: renderUsers, archive: renderArchive, logs: renderLogs
    };
    if (!can(currentPage)) {
      el.innerHTML = `<div class="card"><h2>Access Restricted</h2><p class="muted">Your role (${ROLE_LABELS[session.role]}) does not have access to this module.</p></div>`;
      return;
    }
    (map[currentPage] || renderDashboard)(el);
  }

  function bindPasswordToggles() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.pw-toggle'); if (!btn) return;
      const target = document.getElementById(btn.dataset.pw); if (!target) return;
      const showing = target.type === 'text';
      target.type = showing ? 'password' : 'text';
      btn.classList.toggle('on', !showing);
      btn.innerHTML = showing ? EYE_OPEN_SVG : EYE_OFF_SVG;
    });
  }
  function initPasswordToggleIcons() { document.querySelectorAll('.pw-toggle').forEach(btn => { if (!btn.innerHTML.trim()) btn.innerHTML = EYE_OPEN_SVG; }); }

  function showStockAlertPopup() {
    const alerts = state.products.filter(p => ['low stock', 'out of stock', 'overstock'].includes(productStatus(p)));
    if (!alerts.length) return;
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-box alert-modal">
        <div class="modal-head"><h3>⚠ Stock Level Alert</h3><button data-close>✕</button></div>
        <div class="modal-body">
          <p class="muted" style="margin-top:0">The following products need attention:</p>
          ${alerts.map(p => `
            <div class="stock-alert-item ${productStatus(p) === 'out of stock' ? 'crit' : ''}">
              <div style="display:flex;align-items:center;gap:12px">
                <img class="thumb" src="${esc(p.image || pickImg(p.category, p.sku))}" onerror="this.style.visibility='hidden'">
                <div><div class="a-name">${esc(p.name)}</div><div class="a-sku">${esc(p.sku)} · ${esc(p.category)}</div></div>
              </div>
              <div style="text-align:right">${badge(productStatus(p))}<div class="muted" style="font-size:12px;margin-top:4px">${productStock(p)} on hand (${availableStock(p)} avail)</div></div>
            </div>
          `).join('')}
        </div>
        <div class="modal-foot"><button class="btn btn-primary" data-close>Understood</button></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
  }

  function showPopupAd() {
    const showroom = $('#showroom'), app = $('#app');
    if (!showroom || showroom.hidden || (app && !app.hidden)) return;
    if (window.__idashAdShown) return;
    const active = state.ads.filter(a => isAdActive(a)); if (!active.length) return;
    const ad = active[0];
    const popup = $('#adPopup'), content = $('#adPopupContent');
    if (!popup || !content) return;
    content.style.backgroundImage = ad.bgImage ? `url('${ad.bgImage}')` : '';
    content.innerHTML = `
      <button class="ad-popup-close" id="adPopupClose" aria-label="Close ad">✕</button>
      <div class="ad-popup-badge"><span class="pb-pct">${Number(ad.discountPercent) || 10}%</span><span>OFF</span></div>
      <div class="ad-popup-middle"><h2 class="ad-popup-title">${esc(ad.title)}</h2><p class="ad-popup-sub">${esc(ad.subtitle || '')}</p></div>
      <button class="ad-popup-cta" id="adPopupCta">${esc(ad.ctaText || 'Shop Now')} →</button>`;
    popup.hidden = false; document.body.style.overflow = 'hidden';
    const close = () => { popup.hidden = true; document.body.style.overflow = ''; window.__idashAdShown = true; };
    content.querySelector('#adPopupClose').addEventListener('click', close);
    popup.addEventListener('click', (e) => { if (e.target === popup) close(); });
    content.querySelector('#adPopupCta').addEventListener('click', () => { Showroom.go(ad.ctaLink || 'products'); close(); });
  }

  /* ---------------- QR ---------------- */
  const qrCache = new Map();
  async function qrDataUrl(text) {
    if (qrCache.has(text)) return qrCache.get(text);
    if (typeof QRCode === 'undefined') throw new Error('QR library not loaded.');
    const url = await QRCode.toDataURL(text, { errorCorrectionLevel: 'H', margin: 4, scale: 10, color: { dark: '#000000', light: '#ffffff' } });
    qrCache.set(text, url); return url;
  }
  function getLabelOpts() {
    const size = parseFloat($('#qrSize')?.value || 40);
    const paper = $('#qrPaper')?.value || 'a4';
    let perRow = parseInt($('#qrPerRow')?.value || 4, 10);
    if (!(perRow >= 1)) perRow = 1;
    if (perRow > 8) perRow = 8;
    const maxFit = Math.max(1, Math.floor((PAPER[paper].w - 2 * PAGE_MARGIN) / (size + GAP)));
    const limited = perRow > maxFit; if (limited) perRow = maxFit;
    return { size, paper, perRow, limited, maxFit, showText: $('#qrShowText')?.checked !== false };
  }
  const textHeight = (size) => (size <= 25 ? 6 : 8);
  const fontPt = (size) => (size <= 25 ? 5 : size <= 40 ? 7 : 8);
  function applySheetOpts() {
    const o = getLabelOpts(); const host = $('#qrSheet'); if (!host) return o;
    host.className = 'sheet' + (o.showText ? '' : ' notext');
    host.style.setProperty('--size', o.size + 'mm');
    host.style.setProperty('--cols', o.perRow);
    host.style.setProperty('--texth', textHeight(o.size) + 'mm');
    host.style.setProperty('--fs', fontPt(o.size) + 'pt');
    return o;
  }
  const sheetUnits = () => state.labelSheet.map(id => unitIndex.get(id)).filter(Boolean);
  let sheetToken = 0, sheetReady = true;
  async function renderSheet() {
    const token = ++sheetToken;
    const o = applySheetOpts();
    const units = sheetUnits();
    const host = $('#qrSheet'); if (!host) return;
    host.innerHTML = '';
    const emptyEl = $('#qrSheetEmpty'); if (emptyEl) emptyEl.hidden = units.length > 0;
    const infoEl = $('#qrSheetInfo'); if (infoEl) infoEl.textContent = units.length ? 'Rendering ' + units.length + ' label(s)…' : '';
    if (!units.length) { sheetReady = true; return; }
    sheetReady = false;
    try {
      const frag = document.createDocumentFragment();
      for (const u of units) {
        const url = await qrDataUrl(u.id);
        if (token !== sheetToken) return;
        const d = document.createElement('div');
        d.className = 'lbl';
        d.innerHTML = '<img alt="' + esc(u.id) + '" src="' + url + '">' + '<div class="lbl-text"><div class="lbl-name">' + esc(u.name) + '</div><div class="lbl-id">' + esc(u.id) + '</div></div>';
        frag.appendChild(d);
      }
      host.appendChild(frag);
      if (infoEl) infoEl.textContent = units.length + ' label(s) · ' + o.size + ' mm · ' + o.perRow + ' per row';
      sheetReady = true;
    } catch (err) { if (infoEl) infoEl.textContent = ''; toast(err.message, 'bad'); sheetReady = true; }
  }
  function doPrint() {
    const units = sheetUnits();
    if (!units.length) { toast('Nothing to print.', 'bad'); return; }
    if (!sheetReady) { toast('Labels still rendering.', 'bad'); return; }
    const o = getLabelOpts();
    let ps = $('#pageStyle');
    if (!ps) { ps = document.createElement('style'); ps.id = 'pageStyle'; document.head.appendChild(ps); }
    ps.textContent = `@media print { @page { size: ${PAPER[o.paper].css} portrait; margin: ${PAGE_MARGIN}mm; } body * { visibility: hidden !important; } #printRoot, #printRoot * { visibility: visible !important; } #printRoot { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; display: block !important; } }`;
    const clone = $('#qrSheet').cloneNode(true); clone.removeAttribute('id');
    const root = $('#printRoot'); root.innerHTML = ''; root.appendChild(clone);
    setTimeout(() => window.print(), 150);
  }
  window.addEventListener('afterprint', () => { const r = $('#printRoot'); if (r) r.innerHTML = ''; });

  function layout(units, o, paginate) {
    const p = PAPER[o.paper];
    const lw = o.size, lh = o.size + (o.showText ? textHeight(o.size) : 0);
    const gridW = o.perRow * lw + (o.perRow - 1) * GAP;
    const x0 = (p.w - gridW) / 2;
    const rowsPerPage = Math.max(1, Math.floor((p.h - 2 * PAGE_MARGIN + GAP) / (lh + GAP)));
    const pages = [];
    units.forEach((u, i) => {
      const row = Math.floor(i / o.perRow), col = i % o.perRow;
      const pg = paginate ? Math.floor(row / rowsPerPage) : 0;
      const r = paginate ? row % rowsPerPage : row;
      (pages[pg] = pages[pg] || []).push({ u, x: x0 + col * (lw + GAP), y: PAGE_MARGIN + r * (lh + GAP) });
    });
    const totalRows = Math.ceil(units.length / o.perRow);
    const pageH = paginate ? p.h : 2 * PAGE_MARGIN + totalRows * lh + (totalRows - 1) * GAP;
    return { pages, pageW: p.w, pageH, lw, lh };
  }

  async function downloadSheetPdf() {
    const units = sheetUnits();
    if (!units.length) { toast('Nothing to export.', 'bad'); return; }
    if (!window.jspdf) { toast('PDF library not loaded.', 'bad'); return; }
    const o = getLabelOpts();
    const L = layout(units, o, true);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: o.paper === 'a4' ? 'a4' : 'letter', orientation: 'portrait' });
    const fit = (s, maxW) => { if (doc.getTextWidth(s) <= maxW) return s; let t = s; while (t.length > 1 && doc.getTextWidth(t + '...') > maxW) t = t.slice(0, -1); return t + '...'; };
    try {
      for (let pi = 0; pi < L.pages.length; pi++) {
        if (pi > 0) doc.addPage();
        doc.setLineWidth(0.25); doc.setDrawColor(136); doc.setLineDashPattern([1, 1], 0);
        for (const it of L.pages[pi]) {
          const qrUrl = await qrDataUrl(it.u.id);
          doc.addImage(qrUrl, 'PNG', it.x, it.y, L.lw, L.lw);
          doc.rect(it.x, it.y, L.lw, L.lh, 'S');
          if (o.showText) {
            const th = textHeight(o.size); const cx = it.x + L.lw / 2; const ty = it.y + L.lw;
            doc.setTextColor(0); doc.setFontSize(fontPt(o.size)); doc.setFont('helvetica', 'normal');
            doc.text(fit(it.u.name, L.lw - 1.5), cx, ty + th * 0.4, { align: 'center' });
            doc.setFont('courier', 'bold'); doc.text(fit(it.u.id, L.lw - 1.5), cx, ty + th * 0.8, { align: 'center' });
          }
        }
      }
      doc.save('labels-' + stamp() + '.pdf'); toast('PDF downloaded.', 'ok');
    } catch (err) { toast('PDF export failed: ' + err.message, 'bad'); }
  }
  async function drawLabel(ctx, u, x, y, o, ppm) {
    const s = o.size * ppm, th = textHeight(o.size) * ppm;
    const img = await loadImg(await qrDataUrl(u.id));
    ctx.imageSmoothingEnabled = false; ctx.drawImage(img, x, y, s, s); ctx.imageSmoothingEnabled = true;
    ctx.strokeStyle = '#888'; ctx.lineWidth = 0.25 * ppm; ctx.setLineDash([ppm, ppm]);
    ctx.strokeRect(x, y, s, s + (o.showText ? th : 0)); ctx.setLineDash([]);
    if (o.showText) {
      const px = fontPt(o.size) * 25.4 / 72 * ppm;
      const fitText = (t, font) => { ctx.font = font; if (ctx.measureText(t).width <= s - 1.5 * ppm) return t; while (t.length > 1 && ctx.measureText(t + '...').width > s - 1.5 * ppm) t = t.slice(0, -1); return t + '...'; };
      ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const f1 = px + 'px Arial, Helvetica, sans-serif', f2 = 'bold ' + px + 'px "Courier New", monospace';
      ctx.font = f1; ctx.fillText(fitText(u.name, f1), x + s / 2, y + s + th * 0.38);
      ctx.font = f2; ctx.fillText(fitText(u.id, f2), x + s / 2, y + s + th * 0.74);
    }
  }
  async function downloadSheetPng() {
    const units = sheetUnits();
    if (!units.length) { toast('Nothing to export.', 'bad'); return; }
    const o = getLabelOpts();
    const L = layout(units, o, false);
    const ppm = Math.min(300 / 25.4, 16000 / L.pageH);
    if (ppm < 4) { toast('Too many labels for one PNG.', 'bad'); return; }
    try {
      const c = document.createElement('canvas');
      c.width = Math.round(L.pageW * ppm); c.height = Math.round(L.pageH * ppm);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      for (const it of L.pages[0]) await drawLabel(ctx, it.u, it.x * ppm, it.y * ppm, o, ppm);
      downloadBlob(await canvasToBlob(c), 'labels-' + stamp() + '.png'); toast('PNG downloaded.', 'ok');
    } catch (err) { toast('PNG export failed: ' + err.message, 'bad'); }
  }
  async function downloadSingleLabel(unitId) {
    const u = unitById(unitId); if (!u) return;
    const o = getLabelOpts(), ppm = 300 / 25.4;
    try {
      const c = document.createElement('canvas');
      c.width = Math.round(o.size * ppm) + 2;
      c.height = Math.round((o.size + (o.showText ? textHeight(o.size) : 0)) * ppm) + 2;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await drawLabel(ctx, u, 1, 1, o, ppm);
      downloadBlob(await canvasToBlob(c), unitId + '.png'); toast('Label downloaded.', 'ok');
    } catch (err) { toast('PNG export failed: ' + err.message, 'bad'); }
  }

  /* ---------------- QR LABELS page ---------------- */
  function renderQRCodes(el) {
    const isAdmin = session.role === 'admin';
    el.innerHTML = `
      <div class="page-title"><div><h1>QR Labels</h1><p>Generate unique QR-coded units and print labels.</p></div></div>
      <div class="card">
        <div class="card-title">Generate Units</div>
        <div class="form-grid">
          <label>Product<select id="qrProduct"><option value="">— Select —</option>${state.products.filter(p => p.isActive).map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.sku)})</option>`).join('')}</select></label>
          <label>Quantity<input id="qrQty" type="number" min="1" max="${MAX_QTY}" value="1" /></label>
          <label>Label size<select id="qrSize"><option value="25.4">1×1 inch</option><option value="40" selected>Medium (40 mm)</option><option value="50">Large (50 mm)</option></select></label>
          <label>Labels per row<input id="qrPerRow" type="number" min="1" max="8" value="4" /></label>
          <label>Paper<select id="qrPaper"><option value="a4">A4</option><option value="letter">Letter</option></select></label>
          <label class="check"><input id="qrShowText" type="checkbox" checked /> Show name & ID text</label>
        </div>
        <div class="toolbar" style="margin-top:16px">
          <button class="btn btn-primary" id="qrGenerate">+ Generate Units</button>
          <button class="btn" id="qrPrint">🖨 Print</button>
          <button class="btn" id="qrPdf">⬇ PDF</button>
          <button class="btn" id="qrPng">⬇ PNG</button>
          <button class="btn" id="qrClear">Clear Sheet</button>
          ${isAdmin ? '<button class="btn" id="qrIntegrity">🔍 Integrity Check</button>' : ''}
          <span class="muted" id="qrSheetInfo" style="margin-left:auto;font-size:12px"></span>
        </div>
      </div>
      <div class="card"><div class="card-title">Label Sheet</div><div class="sheetwrap"><div id="qrSheet" class="sheet"></div></div><p class="muted" id="qrSheetEmpty">No labels yet.</p></div>
      <div class="card">
        <div class="card-title"><span>Registered Units (${state.units.length})</span><button class="btn btn-sm" id="qrExportCsv">⬇ Export CSV</button></div>
        <div class="toolbar"><input class="grow" id="qrSearch" placeholder="Search units…" /><select id="qrStatusFilter"><option value="">All statuses</option><option value="in stock">In Stock</option><option value="sold">Sold</option><option value="missing">Missing</option></select></div>
        <div class="tablewrap"><table><thead><tr><th>Unit ID</th><th>Product</th><th>SKU</th><th>Received</th><th>Status</th><th>Order</th><th></th></tr></thead><tbody id="qrUnitsBody"></tbody></table></div>
      </div>
    `;
    const renderUnits = () => {
      const q = ($('#qrSearch')?.value || '').toLowerCase();
      const st = $('#qrStatusFilter')?.value || '';
      const list = state.units.filter(u => {
        if (st && u.status !== st) return false;
        return !q || (u.id + ' ' + u.name + ' ' + u.sku).toLowerCase().includes(q);
      });
      $('#qrUnitsBody').innerHTML = list.length ? list.slice(0, 300).map(u => {
        const prod = state.products.find(p => p.id === u.productId) || state.products.find(p => p.sku === u.sku);
        const img = prod?.image || pickImg(u.category, u.sku);
        const ord = u.orderId ? orderById(u.orderId) : null;
        const statusLabel = u.status === 'sold' ? 'Completed' : u.status === 'missing' ? 'Cancelled' : 'Completed';
        return `<tr>
          <td class="mono">${esc(u.id)}</td>
          <td><div class="name-cell"><img class="thumb" src="${esc(img)}" onerror="this.style.visibility='hidden'"><span>${esc(u.name)}</span></div></td>
          <td class="mono">${esc(u.sku)}</td>
          <td>${u.receivedAt ? fmtDate(u.receivedAt) : '—'}</td>
          <td>${badge(statusLabel).replace('Completed', u.status === 'sold' ? 'Sold' : 'In Stock').replace('Cancelled', 'Missing')}</td>
          <td>${ord ? `<span class="mono" style="font-size:11px">${esc(ord.orderNo)}</span>` : '—'}</td>
          <td>
            <button class="btn btn-sm" data-lbl="${u.id}">Label</button>
            <button class="btn btn-sm" data-png="${u.id}">PNG</button>
            ${isAdmin ? `<button class="btn btn-sm btn-danger" data-del="${u.id}">✕</button>` : ''}
          </td>
        </tr>`;
      }).join('') : '<tr><td colspan="7" class="empty-row">No units match.</td></tr>';
      $$('[data-lbl]').forEach(b => b.addEventListener('click', () => { state.labelSheet = [b.dataset.lbl]; save(); renderSheet(); $('#qrSheet').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
      $$('[data-png]').forEach(b => b.addEventListener('click', () => downloadSingleLabel(b.dataset.png)));
      $$('[data-del]').forEach(b => b.addEventListener('click', () => {
        if (!confirm('Delete unit ' + b.dataset.del + '?')) return;
        state.units = state.units.filter(u => u.id !== b.dataset.del);
        state.labelSheet = state.labelSheet.filter(id => id !== b.dataset.del);
        rebuildUnitIndex(); save(); renderQRCodes(el);
      }));
    };
    $('#qrGenerate').addEventListener('click', () => {
      const pid = $('#qrProduct').value; const qty = parseInt($('#qrQty').value, 10);
      if (!pid) { toast('Select a product.', 'bad'); return; }
      if (!(qty >= 1) || qty > MAX_QTY) { toast('Quantity 1–' + MAX_QTY + '.', 'bad'); return; }
      const p = productById(pid);
      const ids = autoGenerateUnitsForProduct(p, qty, 'Manual');
      state.labelSheet = ids; save(); renderSheet(); renderUnits();
      toast('Generated ' + qty + ' unit(s).', 'ok');
    });
    $('#qrPrint').addEventListener('click', doPrint);
    $('#qrPdf').addEventListener('click', downloadSheetPdf);
    $('#qrPng').addEventListener('click', downloadSheetPng);
    $('#qrClear').addEventListener('click', () => { state.labelSheet = []; save(); renderSheet(); });
    const integrityBtn = $('#qrIntegrity');
    if (integrityBtn) integrityBtn.addEventListener('click', runIntegrityCheck);
    ['qrSize', 'qrPaper', 'qrPerRow', 'qrShowText'].forEach(id => { const node = $('#' + id); if (node) { node.addEventListener('change', applySheetOpts); node.addEventListener('input', applySheetOpts); } });
    $('#qrSearch').addEventListener('input', renderUnits);
    $('#qrStatusFilter').addEventListener('change', renderUnits);
    $('#qrExportCsv').addEventListener('click', () => {
      const lines = [csvRow(['unit_id', 'product', 'sku', 'category', 'status', 'received', 'order_id', 'sold_at'])];
      state.units.forEach(u => lines.push(csvRow([u.id, u.name, u.sku, u.category, u.status, u.receivedAt || '', u.orderId || '', u.soldAt || ''])));
      downloadText('\uFEFF' + lines.join('\r\n'), 'units-' + stamp() + '.csv', 'text/csv'); toast('CSV downloaded.', 'ok');
    });
    renderSheet(); renderUnits();
  }

  function runIntegrityCheck() {
    const issues = [];
    state.products.forEach(p => {
      const inStockUnits = state.units.filter(u => u.productId === p.id && u.status === 'in stock').length;
      if (inStockUnits !== (p.stock || 0)) issues.push({ p, inStockUnits });
    });
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:720px">
        <div class="modal-head"><h3>Integrity Check</h3><button data-close>✕</button></div>
        <div class="modal-body">
          <p class="muted" style="margin-top:0">Compares product <code>stock</code> with the count of units currently marked <em>in stock</em>. Mismatches usually mean units were created outside the auto-generator or physical counts haven't been applied.</p>
          ${issues.length ? `
            <div class="alert-bad" style="background:#fce8e6;color:#a50e0e;border-color:#d93025">⚠ ${issues.length} product(s) have mismatches.</div>
            <div class="tablewrap"><table><thead><tr><th>SKU</th><th>Product</th><th>Stock</th><th>In-Stock Units</th><th>Diff</th><th></th></tr></thead>
              <tbody>${issues.map(({ p, inStockUnits }) => {
                const d = (p.stock || 0) - inStockUnits;
                return `<tr><td class="mono">${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${p.stock || 0}</td><td>${inStockUnits}</td><td class="${d !== 0 ? 'mismatch' : ''}">${d > 0 ? '+' : ''}${d}</td><td><button class="btn btn-sm" data-fix="${p.id}">Generate ${d > 0 ? d + ' units' : 'report only'}</button></td></tr>`;
              }).join('')}</tbody>
            </table></div>` : '<p class="muted">✔ No mismatches detected.</p>'}
        </div>
        <div class="modal-foot"><button class="btn" data-close>Close</button></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
    modal.querySelectorAll('[data-fix]').forEach(b => b.addEventListener('click', () => {
      const p = productById(b.dataset.fix); if (!p) return;
      const inStockUnits = state.units.filter(u => u.productId === p.id && u.status === 'in stock').length;
      const diff = (p.stock || 0) - inStockUnits;
      if (diff <= 0) { toast('Stock is less than or equal to units — resolve manually.', 'warn'); return; }
      if (!confirm(`Generate ${diff} unit(s) for ${p.name}?`)) return;
      autoGenerateUnitsForProduct(p, diff, 'Reconciled');
      save(); logActivity('Reconcile Units', `${diff} unit(s) generated for ${p.name}`);
      toast(`${diff} unit(s) generated.`, 'ok');
      modal.remove();
    }));
  }

  /* ---------------- SCANNER ---------------- */
  let html5 = null, scanning = false, cameras = [], camIdx = -1, audioCtx = null;
  const lastSeen = new Map();
  let scanSession = null, scanCounted = new Set();

  async function loadScanSession() {
    try {
      const res = await fetch(API.activeScan(), { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        scanSession = data && data.id ? data : null;
      } else scanSession = null;
    } catch (e) { scanSession = null; }
    scanCounted = new Set(scanSession ? scanSession.counted : []);
  }
  function saveScanSession() {
    if (!session) return;
    if (scanSession) {
      fetch(API.activeScan(), {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanSession)
      }).catch(() => {});
    } else {
      fetch(API.activeScan(), { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
    }
  }
  function ensureScanSession() {
    if (!scanSession) {
      scanSession = { id: uid('CS'), started: new Date().toISOString(), counted: [], dup: 0, unknown: [], log: [], finished: false, startedBy: session?.userId };
      scanCounted = new Set();
      saveScanSession();
    }
  }
  function ensureAudio() { try { if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtx = new AC(); } if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {} }
  function tone(freq, dur, type, delay) { if (!audioCtx) return; const t = audioCtx.currentTime + (delay || 0), o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = type || 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.02); }
  const vibrate = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  function signal(kind) { if (kind === 'ok') { tone(1000, 0.12, 'sine'); vibrate(120); } else if (kind === 'warn') { tone(500, 0.12, 'square'); tone(500, 0.12, 'square', 0.18); vibrate([60, 60, 60]); } else { tone(200, 0.35, 'sawtooth'); vibrate([200, 80, 200]); } }
  function setFeedback(kind, title, detail) { const f = $('#scanFeedback'); if (!f) return; f.className = 'feedback ' + (kind || ''); f.innerHTML = '<strong>' + esc(title) + '</strong>' + (detail ? '<br>' + esc(detail) : ''); }

  function processScannedCode(raw, source) {
    if (scanSession && scanSession.finished) { toast('Finish or clear the current count first.', 'bad'); return; }
    const code = String(raw || '').trim().toUpperCase(); if (!code) return;
    const now = Date.now();
    if (source === 'camera') { const last = lastSeen.get(code); lastSeen.set(code, now); if (last && now - last < COOLDOWN_MS) return; }
    ensureScanSession();
    const unit = unitIndex.get(code); let kind, title, msg;
    if (!unit) { if (!scanSession.unknown.includes(code)) scanSession.unknown.push(code); kind = 'bad'; title = '✖ Unknown code'; msg = code; }
    else if (scanCounted.has(unit.id)) { scanSession.dup++; kind = 'warn'; title = '⚠ Duplicate'; msg = unit.id + ' already counted'; }
    else { scanCounted.add(unit.id); scanSession.counted.push(unit.id); kind = 'ok'; title = '✔ Counted'; msg = unit.id + ' · ' + unit.name; }
    scanSession.log.unshift({ t: new Date().toISOString(), kind, msg });
    if (scanSession.log.length > 100) scanSession.log.length = 100;
    saveScanSession(); setFeedback(kind, title, msg); signal(kind); updateScanLive();
  }
  function updateScanLive() {
    const lvTotal = $('#lvTotal'), lvDup = $('#lvDup'), lvUnknown = $('#lvUnknown');
    if (lvTotal) lvTotal.textContent = scanSession ? scanSession.counted.length : 0;
    if (lvDup) lvDup.textContent = scanSession ? scanSession.dup : 0;
    if (lvUnknown) lvUnknown.textContent = scanSession ? scanSession.unknown.length : 0;
    const logEl = $('#scanLog');
    if (logEl) logEl.innerHTML = scanSession && scanSession.log.length ? scanSession.log.slice(0, 50).map(l => `<li class="${l.kind}"><time>${esc(new Date(l.t).toLocaleTimeString())}</time>${esc(l.msg)}</li>`).join('') : '<li class="muted">Nothing scanned yet.</li>';
  }
  function updateScanUI() {
    const has = !!scanSession, fin = has && scanSession.finished;
    const btnStart = $('#btnStart'); if (btnStart) { btnStart.disabled = scanning || fin; btnStart.textContent = has ? '▶ Resume' : '▶ Start Count'; }
    const btnStop = $('#btnStop'); if (btnStop) btnStop.disabled = !scanning;
    const btnSwitch = $('#btnSwitch'); if (btnSwitch) btnSwitch.disabled = !scanning;
    const btnFinish = $('#btnFinish'); if (btnFinish) btnFinish.disabled = !has || fin;
    const btnDiscard = $('#btnDiscard'); if (btnDiscard) btnDiscard.disabled = !has;
    const manual = $('#manualCode'); if (manual) manual.disabled = fin;
  }
  function explainCameraError(err) {
    const s = String((err && (err.name || '')) + ' ' + (err && err.message ? err.message : err));
    if (/NotAllowed|Permission|denied/i.test(s)) return 'Camera permission denied.';
    if (/NotFound|DevicesNotFound|no camera/i.test(s)) return 'No camera found.';
    if (/NotReadable|TrackStart|in use|Could not start video/i.test(s)) return 'Camera busy.';
    if (/Overconstrained/i.test(s)) return 'That camera is not available.';
    return 'Could not start camera: ' + s.trim();
  }
  function showCamError(msg) { const e = $('#camError'); if (e) { e.textContent = msg; e.hidden = false; } }
  function hideCamError() { const e = $('#camError'); if (e) e.hidden = true; }

  async function startCamera() {
    if (scanning) return;
    if (scanSession && scanSession.finished) { toast('Finish the count first.', 'bad'); return; }
    ensureAudio(); hideCamError();
    const readerEl = $('#reader'); if (readerEl) readerEl.style.display = 'block';
    if (typeof Html5Qrcode === 'undefined') { showCamError('Scanner library failed to load.'); return; }
    if (!window.isSecureContext || !navigator.mediaDevices) { showCamError('Camera needs HTTPS or localhost.'); return; }
    ensureScanSession(); updateScanUI();
    try {
      html5 = new Html5Qrcode('reader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
      const source = camIdx >= 0 && cameras[camIdx] ? { deviceId: { exact: cameras[camIdx].id } } : { facingMode: 'environment' };
      await html5.start(source, { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.75); return { width: s, height: s }; } }, (text) => processScannedCode(text, 'camera'), () => {});
      scanning = true;
      try { if (!cameras.length) cameras = await Html5Qrcode.getCameras(); const dev = html5.getRunningTrackSettings && html5.getRunningTrackSettings().deviceId; if (dev) camIdx = cameras.findIndex(c => c.id === dev); } catch (e) {}
      setFeedback('', 'Scanning…', 'Point the camera at a QR label.');
    } catch (err) { scanning = false; html5 = null; showCamError(explainCameraError(err)); }
    updateScanUI();
  }
  async function stopCamera() { if (html5 && scanning) { try { await html5.stop(); } catch (e) {} try { html5.clear(); } catch (e) {} } scanning = false; html5 = null; updateScanUI(); }
  async function switchCamera() { if (!scanning) return; if (cameras.length < 2) { toast('Only one camera found.', 'bad'); return; } await stopCamera(); camIdx = (camIdx + 1) % cameras.length; await startCamera(); }

  function buildCountReport() {
    const counted = new Set(scanSession.counted);
    const rows = new Map();
    state.products.forEach(p => {
      rows.set(p.sku, { sku: p.sku, name: p.name, productId: p.id, counted: 0, expected: 0, system: p.stock || 0 });
    });
    scanSession.counted.forEach(id => {
      const u = unitById(id); if (!u) return;
      const r = rows.get(u.sku); if (r) r.counted++;
    });
    state.units.forEach(u => {
      const r = rows.get(u.sku); if (r && u.status !== 'missing') r.expected++;
    });
    const missing = state.units.filter(u => u.status !== 'missing' && !counted.has(u.id)).map(u => u.id);
    return { date: new Date().toISOString(), rows: Array.from(rows.values()), countedIds: scanSession.counted.slice(), missing, unknown: scanSession.unknown.slice(), duplicates: scanSession.dup };
  }
  async function finishCount() {
    if (!scanSession || scanSession.finished) return;
    if (!scanSession.counted.length && !confirm('Nothing counted. Finish anyway?')) return;
    await stopCamera(); scanSession.finished = true; scanSession.report = buildCountReport(); saveScanSession(); renderCountReport(); updateScanUI();
    const rc = $('#reportCard'); if (rc) rc.scrollIntoView({ behavior: 'smooth' });
  }
  function renderCountReport() {
    if (!scanSession || !scanSession.report) return;
    const r = scanSession.report;
    const meta = $('#reportMeta'); if (meta) meta.textContent = fmtDateTime(r.date) + ' · counted ' + r.countedIds.length + ' · duplicates ' + r.duplicates;
    const tbody = $('#reportTable tbody');
    if (tbody) tbody.innerHTML = r.rows.map(x => { const d = x.counted - x.expected; return `<tr><td>${esc(x.name)}</td><td class="mono">${esc(x.sku)}</td><td>${x.counted}</td><td>${x.expected}</td><td class="${d < 0 ? 'neg' : d > 0 ? 'pos' : ''}">${d > 0 ? '+' : ''}${d}${d !== 0 ? ' ⚠' : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty-row">No products.</td></tr>';
    const mismatchCount = r.rows.filter(x => x.counted !== x.expected).length;
    const warnEl = $('#mismatchWarning');
    if (warnEl) { if (mismatchCount > 0) { warnEl.hidden = false; warnEl.innerHTML = `<strong>⚠ Mismatch detected</strong> — ${mismatchCount} product(s) differ from system stock.`; } else warnEl.hidden = true; }
    const missN = $('#repMissingN'); if (missN) missN.textContent = r.missing.length;
    const miss = $('#repMissing'); if (miss) miss.innerHTML = r.missing.map(id => `<span class="chip">${esc(id)}</span>`).join('') || '<span class="muted">None.</span>';
    const unkN = $('#repUnknownN'); if (unkN) unkN.textContent = r.unknown.length;
    const unk = $('#repUnknown'); if (unk) unk.innerHTML = r.unknown.map(c => `<span class="chip unk">${esc(c)}</span>`).join('') || '<span class="muted">None.</span>';
  }
  async function submitCountReport() {
    if (!scanSession || !scanSession.report) return;
    const r = scanSession.report;
    const mismatch = r.rows.filter(x => x.counted !== x.expected).length;
    if (!confirm(`Submit count log?\n\n• Counted: ${r.countedIds.length}\n• Missing: ${r.missing.length}\n• Unknown: ${r.unknown.length}\n• Mismatches: ${mismatch}`)) return;
    try {
      const res = await fetch(API.finishScan(scanSession.id), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: scanSession.report })
      });
      if (!res.ok) throw new Error(await res.text());
      toast('Count log submitted.', 'ok');
    } catch (e) {
      toast('Submit failed: ' + e.message, 'bad');
      return;
    }
    clearScanSession(); renderPage();
  }
  function clearScanSession() {
    stopCamera(); scanSession = null; scanCounted = new Set(); lastSeen.clear(); saveScanSession();
    setFeedback('', 'Ready', 'Press Start to begin scanning.');
    updateScanLive(); updateScanUI();
    const rc = $('#reportCard'); if (rc) rc.hidden = true;
  }
  function renderScan(el) {
    el.innerHTML = `
      <div class="page-title"><div><h1>QR Scan & Count</h1><p>Scan QR labels for a physical stock count, or look up any unit.</p></div></div>
      <div class="tabs">
        <button class="tab-btn active" data-stab="count">Stock Count</button>
        <button class="tab-btn" data-stab="lookup">Unit Lookup</button>
      </div>
      <div id="scanPane"></div>
    `;
    $$('.tab-btn[data-stab]').forEach(b => b.addEventListener('click', () => {
      $$('.tab-btn[data-stab]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderScanPane(b.dataset.stab);
    }));
    renderScanPane('count');
  }

  function renderScanPane(tab) {
    const el = $('#scanPane'); if (!el) return;
    if (tab === 'lookup') {
      el.innerHTML = `
        <div class="card">
          <div class="card-title">Look Up a Unit</div>
          <div class="toolbar">
            <input class="grow" id="luInput" placeholder="Enter unit ID (e.g. B500-0001)" autocomplete="off" />
            <button class="btn btn-primary" id="luBtn">Look Up</button>
          </div>
          <div id="luResult"><p class="muted">Enter a unit ID above.</p></div>
        </div>
      `;
      const doLookup = () => {
        const code = ($('#luInput').value || '').trim().toUpperCase();
        const box = $('#luResult');
        if (!code) { box.innerHTML = '<p class="muted">Enter a unit ID.</p>'; return; }
        const u = unitIndex.get(code);
        if (!u) { box.innerHTML = `<div class="alert-bad">No unit found for <strong>${esc(code)}</strong>.</div>`; return; }
        const p = state.products.find(x => x.id === u.productId) || state.products.find(x => x.sku === u.sku);
        const order = u.orderId ? orderById(u.orderId) : null;
        const cust = order ? customerById(order.customerId) : null;
        const img = p?.image || pickImg(u.category, u.sku);
        box.innerHTML = `
          <div style="display:flex;gap:16px;align-items:flex-start;padding:16px;border:1px solid var(--g300);border-radius:8px;background:var(--white);">
            <img class="thumb" style="width:80px;height:80px" src="${esc(img)}" onerror="this.style.visibility='hidden'">
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;color:var(--g500);text-transform:uppercase;letter-spacing:1px;font-weight:600">Unit ID</div>
              <div class="mono" style="font-weight:700;font-size:16px;margin-bottom:10px">${esc(u.id)}</div>
              <div style="font-size:11px;color:var(--g500);text-transform:uppercase;letter-spacing:1px;font-weight:600">Product</div>
              <div style="font-weight:600;margin-bottom:10px">${esc(u.name)} <span class="muted mono" style="font-size:12px">${esc(u.sku)}</span></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div><div style="font-size:11px;color:var(--g500)">Status</div>${badge(u.status === 'sold' ? 'Completed' : u.status === 'missing' ? 'Cancelled' : 'Completed').replace('Completed', u.status === 'sold' ? 'Sold' : 'In Stock').replace('Cancelled','Missing')}</div>
                <div><div style="font-size:11px;color:var(--g500)">Received</div>${u.receivedAt ? fmtDate(u.receivedAt) : '—'}</div>
                <div><div style="font-size:11px;color:var(--g500)">Source</div>${esc(u.source || '—')}</div>
                <div><div style="font-size:11px;color:var(--g500)">Category</div>${esc(u.category || '—')}</div>
              </div>
              ${order ? `
                <div style="margin-top:12px;padding:10px;background:var(--g50);border-radius:6px;border-left:3px solid var(--black)">
                  <div style="font-size:11px;color:var(--g500);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:4px">Linked Order</div>
                  <div><strong class="mono">${esc(order.orderNo)}</strong> · ${esc(cust?.name || '—')}</div>
                  <div class="muted" style="font-size:12px">Sold ${fmtDate(u.soldAt)} · Status ${esc(order.status)}</div>
                </div>
              ` : '<div class="muted" style="margin-top:12px;font-size:12px">Not linked to any order.</div>'}
            </div>
          </div>
        `;
      };
      $('#luBtn').addEventListener('click', doLookup);
      $('#luInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLookup(); });
      return;
    }

    const has = !!scanSession; const fin = has && scanSession.finished;
    el.innerHTML = `
      <div class="card">
        <div class="card-title">Scanner</div>
        <div class="toolbar">
          <button class="btn btn-primary" id="btnStart">${has ? '▶ Resume' : '▶ Start Count'}</button>
          <button class="btn" id="btnStop" disabled>⏸ Pause</button>
          <button class="btn" id="btnSwitch" disabled>🔄 Switch camera</button>
          <button class="btn btn-primary" id="btnFinish" ${(!has || fin) ? 'disabled' : ''}>✔ Finish Count</button>
          <button class="btn btn-danger" id="btnDiscard" ${!has ? 'disabled' : ''}>Discard</button>
        </div>
        <div id="reader"></div>
        <div id="camError" class="alert-bad" hidden></div>
        <div id="scanFeedback" class="feedback">${has ? 'Resume to continue scanning.' : 'Press Start to begin.'}</div>
        <form class="toolbar" id="manualForm" style="margin-top:8px">
          <input class="grow" id="manualCode" placeholder="Manual entry, e.g. B500-0001" autocomplete="off" ${fin ? 'disabled' : ''} />
          <button class="btn" type="submit">Add</button>
        </form>
      </div>
      <div class="card">
        <div class="card-title">Live Count</div>
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-label">Counted</div><div class="kpi-val" id="lvTotal">${has ? scanSession.counted.length : 0}</div></div>
          <div class="kpi"><div class="kpi-label">Duplicates</div><div class="kpi-val" id="lvDup">${has ? scanSession.dup : 0}</div></div>
          <div class="kpi"><div class="kpi-label">Unknown</div><div class="kpi-val" id="lvUnknown">${has ? scanSession.unknown.length : 0}</div></div>
        </div>
        <h3 style="margin-top:16px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--g500)">Latest scans</h3>
        <ul class="log" id="scanLog"><li class="muted">Nothing scanned yet.</li></ul>
      </div>
      <div class="card" id="reportCard" ${!fin ? 'hidden' : ''}>
        <div class="card-title">Count Report</div>
        <p class="muted" id="reportMeta"></p>
        <div id="mismatchWarning" class="alert-bad" hidden style="margin-bottom:12px"></div>
        <div class="tablewrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Counted</th><th>Expected</th><th>Diff</th></tr></thead><tbody></tbody></table></div>
        <h3 style="margin-top:16px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--g500)">Missing units (<span id="repMissingN">0</span>)</h3>
        <div id="repMissing"></div>
        <h3 style="margin-top:16px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--g500)">Unknown codes (<span id="repUnknownN">0</span>)</h3>
        <div id="repUnknown"></div>
        <div class="toolbar" style="margin-top:16px">
          <button class="btn btn-primary" id="repSubmit">✔ Submit Count Log</button>
          <button class="btn" id="repApply">⚖ Apply Adjustments</button>
          <button class="btn" id="repCsv">⬇ Export CSV</button>
          <button class="btn btn-danger" id="repClose">Close Report</button>
        </div>
      </div>
    `;
    $('#btnStart').addEventListener('click', startCamera);
    $('#btnStop').addEventListener('click', stopCamera);
    $('#btnSwitch').addEventListener('click', switchCamera);
    $('#btnFinish').addEventListener('click', finishCount);
    $('#btnDiscard').addEventListener('click', () => { if (confirm('Discard this count?')) { clearScanSession(); renderPage(); } });
    $('#manualForm').addEventListener('submit', (e) => { e.preventDefault(); ensureAudio(); processScannedCode($('#manualCode').value, 'manual'); $('#manualCode').value = ''; });
    $('#repSubmit').addEventListener('click', submitCountReport);
    $('#repApply').addEventListener('click', openAdjustmentModal);
    $('#repCsv').addEventListener('click', exportCountCsv);
    $('#repClose').addEventListener('click', () => { if (scanSession && !scanSession.applied && !confirm('Close without submitting?')) return; clearScanSession(); renderPage(); });
    if (fin) renderCountReport(); updateScanLive(); updateScanUI();
  }

  function openAdjustmentModal() {
    if (!scanSession || !scanSession.report) { toast('Finish the count first.', 'bad'); return; }
    const r = scanSession.report;
    const diffs = r.rows.filter(x => x.counted !== x.expected);
    if (!diffs.length) { toast('No mismatches to adjust.', 'ok'); return; }
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:640px">
        <div class="modal-head"><h3>Apply Adjustments</h3><button data-close>✕</button></div>
        <div class="modal-body">
          <p class="muted" style="margin-top:0">Adjust <code>product.stock</code> to match physical counts. Writes a Stock Movement of type <em>Adjustment</em>. Requires a reason.</p>
          <div class="tablewrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Counted</th><th>System Stock</th><th>Delta</th></tr></thead>
            <tbody>${diffs.map(x => {
              const p = productById(x.productId);
              const delta = x.counted - (p?.stock || 0);
              return `<tr><td>${esc(x.name)}</td><td class="mono">${esc(x.sku)}</td><td>${x.counted}</td><td>${p?.stock || 0}</td><td class="${delta !== 0 ? 'mismatch' : ''}">${delta > 0 ? '+' : ''}${delta}</td></tr>`;
            }).join('')}</tbody>
          </table></div>
          <label style="display:block;margin-top:14px;font-size:12px;font-weight:600;color:var(--g700)">Reason (required)<textarea id="adjReason" rows="3" style="width:100%;margin-top:6px;padding:10px 12px;border:1px solid var(--g300);border-radius:8px"></textarea></label>
        </div>
        <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="adjApply">Apply</button></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
    modal.querySelector('#adjApply').addEventListener('click', () => {
      const reason = modal.querySelector('#adjReason').value.trim();
      if (!reason) { toast('Reason is required.', 'bad'); return; }
      let applied = 0;
      diffs.forEach(x => {
        const p = productById(x.productId); if (!p) return;
        const before = p.stock || 0;
        const after = x.counted;
        if (before === after) return;
        p.stock = after;
        state.stockMovements.push({ id: uid('M'), productId: p.id, type: 'Adjustment', qty: after - before, before, after, reason: 'Count reconciliation: ' + reason, loggedBy: session.userId, date: new Date().toISOString() });
        applied++;
      });
      scanSession.applied = true;
      save();
      logActivity('Apply Adjustments', `${applied} product(s) reconciled — ${reason}`);
      pushNotification(['admin','inventory'], `Stock reconciled for ${applied} product(s) by ${session.name}`, { page: 'inventory' });
      toast(`${applied} product(s) adjusted.`, 'ok');
      modal.remove(); clearScanSession(); renderPage();
    });
  }

  function exportCountCsv() {
    if (!scanSession || !scanSession.report) return;
    const r = scanSession.report;
    const lines = [csvRow(['type', 'unit_id', 'product', 'sku', 'counted', 'expected', 'difference'])];
    r.rows.forEach(x => lines.push(csvRow(['SUMMARY', '', x.name, x.sku, x.counted, x.expected, x.counted - x.expected])));
    r.countedIds.forEach(id => { const u = unitById(id); lines.push(csvRow(['COUNTED', id, u ? u.name : '', u ? u.sku : '', '', '', ''])); });
    r.missing.forEach(id => { const u = unitById(id); lines.push(csvRow(['MISSING', id, u ? u.name : '', u ? u.sku : '', '', '', ''])); });
    r.unknown.forEach(c => lines.push(csvRow(['UNKNOWN', c, '', '', '', '', ''])));
    downloadText('\uFEFF' + lines.join('\r\n'), 'count-report-' + stamp() + '.csv', 'text/csv'); toast('Report CSV downloaded.', 'ok');
  }

  /* ---------------- COUNT LOGS ---------------- */
  function renderCountLogs(el) {
    const logs = [...state.countSessions].sort((a, b) => new Date(b.finished) - new Date(a.finished));
    el.innerHTML = `
      <div class="page-title"><div><h1>Count Logs</h1><p>Submitted count sessions with mismatch details.</p></div></div>
      <div class="card"><div class="tablewrap"><table><thead><tr><th>Started</th><th>Finished</th><th>By</th><th>Counted</th><th>Missing</th><th>Unknown</th><th>Mismatches</th><th></th></tr></thead>
        <tbody>${logs.length ? logs.map(cs => `<tr class="${cs.mismatch > 0 ? 'has-new' : ''}"><td>${fmtDateTime(cs.started)}</td><td>${fmtDateTime(cs.finished)}</td><td>${esc(userById(cs.startedBy)?.name || '—')}</td><td>${cs.countedIds.length}</td><td>${cs.missing.length}</td><td>${cs.unknown.length}</td><td>${cs.mismatch > 0 ? `<span class="mismatch">${cs.mismatch}</span>` : '0'}</td><td><button class="btn btn-sm" data-viewlog="${cs.id}">View</button></td></tr>`).join('') : '<tr><td colspan="8" class="empty-row">No count logs yet.</td></tr>'}</tbody>
      </table></div></div>
    `;
    $$('[data-viewlog]').forEach(b => b.addEventListener('click', () => viewCountLog(b.dataset.viewlog)));
  }
  function viewCountLog(id) {
    const cs = state.countSessions.find(c => c.id === id); if (!cs) return;
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:720px">
        <div class="modal-head"><h3>Count Log — ${fmtDateTime(cs.finished)}</h3><button data-close>✕</button></div>
        <div class="modal-body">
          <p class="muted">Started ${fmtDateTime(cs.started)} by ${esc(userById(cs.startedBy)?.name || '—')}</p>
          <div class="tablewrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Counted</th><th>Expected</th><th>Diff</th></tr></thead>
            <tbody>${cs.rows.map(x => { const d = x.counted - x.expected; return `<tr><td>${esc(x.name)}</td><td class="mono">${esc(x.sku)}</td><td>${x.counted}</td><td>${x.expected}</td><td class="${d !== 0 ? 'mismatch' : ''}">${d > 0 ? '+' : ''}${d}${d !== 0 ? ' ⚠' : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty-row">No rows.</td></tr>'}</tbody>
          </table></div>
        </div>
        <div class="modal-foot"><button class="btn" id="logCsv">⬇ Export CSV</button><button class="btn btn-primary" data-close>Close</button></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
    modal.querySelector('#logCsv').addEventListener('click', () => {
      const lines = [csvRow(['product', 'sku', 'counted', 'expected', 'diff'])];
      cs.rows.forEach(x => lines.push(csvRow([x.name, x.sku, x.counted, x.expected, x.counted - x.expected])));
      downloadText('\uFEFF' + lines.join('\r\n'), 'count-log-' + cs.id + '.csv', 'text/csv'); toast('Log exported.', 'ok');
    });
  }

  /* ---------------- PRODUCTION ---------------- */
  let prodTab = 'jobs';
  function renderProduction(el) {
    const isProduction = session.role === 'production';
    const tabs = [
      { id: 'jobs', label: `Jobs (${state.productionJobs.filter(j => j.status !== 'Done' && j.status !== 'Cancelled').length})` },
      { id: 'fg', label: `Finished Goods (${state.finishedGoods.filter(f => f.status === 'pending').length})` },
      { id: 'req', label: `Requests (${state.materialRequests.filter(m => (m.status || 'submitted') === 'submitted').length})` }
    ];
    if (isProduction) tabs.push({ id: 'new', label: 'New Submission' });
    if (!tabs.find(t => t.id === prodTab)) prodTab = 'jobs';

    el.innerHTML = `
      <div class="page-title"><div><h1>Production</h1><p>Jobs, finished goods, and material requests.</p></div></div>
      <div class="tabs">${tabs.map(t => `<button class="tab-btn ${prodTab === t.id ? 'active' : ''}" data-ptab="${t.id}">${t.label}</button>`).join('')}</div>
      <div id="prodPane"></div>
    `;
    $$('.tab-btn[data-ptab]').forEach(b => b.addEventListener('click', () => { prodTab = b.dataset.ptab; renderProduction(el); }));
    renderProdPane();
  }

  function renderProdPane() {
    const pane = $('#prodPane'); if (!pane) return;
    const isProduction = session.role === 'production';
    const isApprover = session.role === 'admin' || session.role === 'inventory';

    if (prodTab === 'jobs') {
      const jobs = [...state.productionJobs].sort((a, b) => {
        const rank = { 'In Progress': 0, 'Queued': 1, 'Done': 2, 'Cancelled': 3 };
        const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
        return r || new Date(b.createdAt) - new Date(a.createdAt);
      });
      pane.innerHTML = `<div class="card">
        <div class="card-title">Production Jobs</div>
        <div class="tablewrap"><table><thead><tr><th>Created</th><th>Order</th><th>Customer</th><th>Product</th><th>Qty</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${jobs.length ? jobs.map(j => {
            const c = customerById(j.customerId);
            const canAct = isProduction || isApprover;
            return `<tr><td>${fmtDateTime(j.createdAt)}</td><td class="mono">${esc(j.orderNo || '—')}</td><td>${esc(c?.name || '—')}</td><td>${esc(j.name)}<div class="muted mono" style="font-size:11px">${esc(j.sku)}</div></td><td>${j.qty}</td><td>${badge(j.status === 'Queued' ? 'Pending' : j.status === 'In Progress' ? 'In Production' : j.status === 'Done' ? 'Completed' : 'Cancelled').replace('Pending', 'Queued').replace('In Production', 'In Progress')}</td>
              <td>${canAct && j.status === 'Queued' ? `<button class="btn btn-sm" data-job-start="${j.id}">Start</button>` : ''}
                  ${canAct && j.status === 'In Progress' ? `<button class="btn btn-sm btn-primary" data-job-done="${j.id}">Mark Done</button>` : ''}
                  ${j.status === 'Done' ? `<span class="muted" style="font-size:11px">Completed ${fmtDate(j.completedAt)}</span>` : ''}
              </td></tr>`;
          }).join('') : '<tr><td colspan="7" class="empty-row">No jobs. Create an order with unavailable stock, or use Smart Reorder in DSS Insights.</td></tr>'}</tbody>
        </table></div>
      </div>`;
      $$('[data-job-start]').forEach(b => b.addEventListener('click', () => {
        const j = state.productionJobs.find(x => x.id === b.dataset.jobStart); if (!j) return;
        j.status = 'In Progress'; j.startedAt = new Date().toISOString();
        save(); logActivity('Start Job', `Job ${j.orderNo || j.id} ${j.name}`, { type: 'job', id: j.id }); renderProdPane();
      }));
      $$('[data-job-done]').forEach(b => b.addEventListener('click', () => {
        const j = state.productionJobs.find(x => x.id === b.dataset.jobDone); if (!j) return;
        const fg = {
          id: uid('FG'), date: new Date().toISOString(), name: j.name, sku: j.sku,
          category: productById(j.productId)?.category || '',
          qty: j.qty, notes: 'From job ' + j.id, status: 'pending',
          submittedBy: session.userId, jobId: j.id, orderId: j.orderId
        };
        state.finishedGoods.unshift(fg);
        j.finishedGoodId = fg.id;
        pushNotification(['inventory', 'admin'], `Finished goods from job ${j.id}: ${j.name} × ${j.qty}`, { page: 'production', entityId: fg.id });
        save(); logActivity('Job Done', `${j.name} × ${j.qty}`, { type: 'job', id: j.id }); toast('Marked Done. Inventory will confirm.', 'ok'); renderProdPane();
      }));
    } else if (prodTab === 'fg') {
      pane.innerHTML = `<div class="card">
        <div class="card-title">Finished Products Submissions</div>
        <div class="tablewrap"><table><thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>By</th><th>Job</th><th>Status</th><th></th></tr></thead>
          <tbody>${state.finishedGoods.length ? state.finishedGoods.map(f => {
            const job = f.jobId ? state.productionJobs.find(j => j.id === f.jobId) : null;
            const canConfirm = f.status === 'pending' && (isApprover || isProduction);
            return `<tr class="${f.status === 'pending' ? 'has-new' : ''}"><td>${fmtDateTime(f.date)}</td><td><div class="name-cell">${f.status === 'pending' ? '<span class="new-dot"></span>' : ''}<span>${esc(f.name)}</span></div></td><td>${f.qty}</td><td>${esc(userById(f.submittedBy)?.name || '—')}</td><td>${job ? `<span class="mono" style="font-size:11px">${esc(job.orderNo || '—')}</span>` : '—'}</td>
              <td>${f.status === 'pending' ? badge('Pending') : f.status === 'confirmed' ? badge('Completed').replace('Completed', 'Confirmed') : badge('Cancelled')}</td>
              <td>${canConfirm ? `<button class="btn btn-sm btn-primary" data-fgok="${f.id}">Confirm</button><button class="btn btn-sm btn-danger" data-fgno="${f.id}">Cancel</button>` : '—'}</td>
            </tr>`;
          }).join('') : '<tr><td colspan="7" class="empty-row">No submissions yet.</td></tr>'}</tbody>
        </table></div>
      </div>`;
      $$('[data-fgok]').forEach(b => b.addEventListener('click', () => confirmFinishedGood(b.dataset.fgok)));
      $$('[data-fgno]').forEach(b => b.addEventListener('click', () => cancelFinishedGood(b.dataset.fgno)));
    } else if (prodTab === 'req') {
      pane.innerHTML = `<div class="card">
        <div class="card-title">Material Requests</div>
        <div class="tablewrap"><table><thead><tr><th>Date</th><th>Product</th><th>Materials</th><th>By</th><th>Status</th><th></th></tr></thead>
          <tbody>${state.materialRequests.length ? state.materialRequests.map(m => {
            const st = m.status || 'submitted';
            const isPending = st === 'submitted';
            return `<tr><td>${fmtDateTime(m.date)}</td><td>${esc(m.product)}<div class="muted mono" style="font-size:11px">${esc(m.sku || '—')}</div></td>
              <td>${(m.materials || []).map(x => `<span class="chip">${esc(x.name)} ×${x.qty}</span>`).join(' ')}</td>
              <td>${esc(userById(m.requestedBy)?.name || '—')}</td>
              <td>${st === 'submitted' ? badge('Pending') : st === 'approved' ? badge('Completed').replace('Completed', 'Approved') : badge('Cancelled').replace('Cancelled', 'Rejected')}</td>
              <td>${isPending && isApprover ? `<button class="btn btn-sm btn-primary" data-req-ok="${m.id}">Approve</button><button class="btn btn-sm btn-danger" data-req-no="${m.id}">Reject</button>` : '—'}</td>
            </tr>`;
          }).join('') : '<tr><td colspan="6" class="empty-row">No requests.</td></tr>'}</tbody>
        </table></div>
      </div>`;
      $$('[data-req-ok]').forEach(b => b.addEventListener('click', () => approveMaterialRequest(b.dataset.reqOk)));
      $$('[data-req-no]').forEach(b => b.addEventListener('click', () => rejectMaterialRequest(b.dataset.reqNo)));
    } else if (prodTab === 'new' && isProduction) {
      pane.innerHTML = `
        <div class="card">
          <div class="card-title">Request Materials</div>
          <div class="form-grid">
            <label class="full">For Product / Order<input id="mrProduct" placeholder="e.g. Natural Basic Color Window Blind" /></label>
            <label>SKU (optional)<input id="mrSku" placeholder="e.g. B500" /></label>
          </div>
          <div style="margin-top:14px">
            <label style="font-size:12px;font-weight:600;color:var(--g700);display:block;margin-bottom:6px">Materials List</label>
            <div id="mrList"></div>
            <button class="btn btn-sm" id="mrAdd">+ Add Material</button>
          </div>
          <div class="toolbar" style="margin-top:14px"><input class="grow" id="mrNotes" placeholder="Notes (optional)" /><button class="btn btn-primary" id="mrSubmit">Submit Request</button></div>
        </div>
        <div class="card">
          <div class="card-title">Submit Finished Product</div>
          <div class="form-grid">
            <label class="full">Select Product *<select id="fgProduct"><option value="">— Select —</option>${state.products.filter(p => p.isActive).map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.sku)})</option>`).join('')}<option value="__new__">➕ Add new product…</option></select></label>
            <div id="fgNewFields" hidden style="display:contents">
              <label>New Product Name *<input id="fgName" /></label>
              <label>New SKU *<input id="fgSku" /></label>
              <label>Category<input id="fgCat" /></label>
            </div>
            <label>Quantity *<input id="fgQty" type="number" min="1" value="1" /></label>
            <label class="full">Notes<input id="fgNotes" placeholder="e.g. Finished for order ORD-…" /></label>
          </div>
          <div class="toolbar" style="margin-top:14px"><button class="btn btn-primary" id="fgSubmit">Submit Finished Product</button></div>
          <div class="fg-preview" id="fgPreview" hidden></div>
        </div>
      `;
      const list = $('#mrList');
      const addMatRow = () => {
        const row = document.createElement('div');
        row.className = 'mat-row';
        row.innerHTML = '<input placeholder="Material name" class="mat-name" /><input type="number" min="1" value="1" class="mat-qty" /><button class="btn btn-sm btn-danger" type="button">✕</button>';
        row.querySelector('.btn-danger').addEventListener('click', () => row.remove());
        list.appendChild(row);
      };
      addMatRow();
      $('#mrAdd').addEventListener('click', addMatRow);
      $('#mrSubmit').addEventListener('click', () => {
        const product = $('#mrProduct').value.trim();
        if (!product) { toast('Enter a product.', 'bad'); return; }
        const materials = Array.from(list.children).map(r => ({ name: r.querySelector('.mat-name').value.trim(), qty: Number(r.querySelector('.mat-qty').value) || 1 })).filter(m => m.name);
        if (!materials.length) { toast('Add at least one material.', 'bad'); return; }
        state.materialRequests.unshift({ id: uid('MR'), date: new Date().toISOString(), product, sku: sanitizeSku($('#mrSku').value), materials, notes: $('#mrNotes').value, status: 'submitted', requestedBy: session.userId });
        save(); pushNotification(['admin', 'inventory'], `Material request for ${product} by ${session.name}`, { page: 'production' }); toast('Material request submitted.', 'ok'); renderProduction($('#content'));
      });

      const fgProductSel = $('#fgProduct'), fgNewFields = $('#fgNewFields');
      const updatePreview = () => {
        const qty = Number($('#fgQty').value) || 0;
        const prev = $('#fgPreview'); let name = '', sku = '';
        if (fgProductSel.value === '__new__') { name = $('#fgName').value.trim(); sku = sanitizeSku($('#fgSku').value); }
        else if (fgProductSel.value) { const p = productById(fgProductSel.value); if (p) { name = p.name; sku = p.sku; } }
        if (!name || !sku || qty <= 0) { prev.hidden = true; return; }
        prev.hidden = false; prev.innerHTML = `Will submit: <strong>${esc(name)}</strong> (SKU <strong>${esc(sku)}</strong>) × <strong>${qty}</strong>.`;
      };
      fgProductSel.addEventListener('change', () => { fgNewFields.hidden = fgProductSel.value !== '__new__'; updatePreview(); });
      ['fgName', 'fgSku', 'fgQty'].forEach(id => $('#' + id)?.addEventListener('input', updatePreview));
      $('#fgSubmit').addEventListener('click', () => {
        const qty = Number($('#fgQty').value) || 0;
        if (qty <= 0) { toast('Quantity must be at least 1.', 'bad'); return; }
        let name, sku, category;
        if (fgProductSel.value === '__new__') { name = $('#fgName').value.trim(); sku = sanitizeSku($('#fgSku').value); category = $('#fgCat').value.trim(); if (!name || !sku) { toast('Name and SKU required.', 'bad'); return; } }
        else if (fgProductSel.value) { const p = productById(fgProductSel.value); if (!p) return; name = p.name; sku = p.sku; category = p.category; }
        else { toast('Select a product.', 'bad'); return; }
        state.finishedGoods.unshift({ id: uid('FG'), date: new Date().toISOString(), name, sku, category, qty, notes: $('#fgNotes').value, status: 'pending', submittedBy: session.userId });
        save(); pushNotification(['admin', 'inventory'], `New finished product: ${name} (${sku}) × ${qty} by ${session.name}`, { page: 'production' }); toast('Submitted for approval.', 'ok'); renderProduction($('#content'));
      });
    }
  }

  function confirmFinishedGood(id) {
    const fg = state.finishedGoods.find(f => f.id === id); if (!fg || fg.status !== 'pending') return;
    let p = state.products.find(x => x.sku === fg.sku);
    if (p) {
      const before = p.stock; p.stock += fg.qty;
      state.stockMovements.push({ id: uid('M'), productId: p.id, type: 'Stock-In', qty: fg.qty, before, after: p.stock, reason: 'Production: ' + fg.name, loggedBy: session.userId, date: new Date().toISOString() });
      toast(`Confirmed: ${p.name} +${fg.qty}`, 'ok');
    } else {
      p = { id: uid('P'), name: fg.name, sku: fg.sku, category: fg.category || 'Uncategorized', price: 0, cost: 0, stock: fg.qty, reorder: 5, reserved: 0, unit: 'pc', description: fg.notes || '', bestFor: 'Best for everyday use and casual settings.', sizes: ['Small','Medium','Large'], colors: ['Black','White'], reviews: [], image: pickImg(fg.category, fg.sku), images: [pickImg(fg.category, fg.sku)], isActive: true, featured: false, isNew: true, createdAt: new Date().toISOString() };
      state.products.push(p);
      state.stockMovements.push({ id: uid('M'), productId: p.id, type: 'Stock-In', qty: fg.qty, before: 0, after: fg.qty, reason: 'New from production', loggedBy: session.userId, date: new Date().toISOString() });
      toast(`New product created: ${p.name}`, 'ok');
    }
    if (confirm(`Generate ${fg.qty} QR unit(s) for ${p.name}?`)) {
      const ids = autoGenerateUnitsForProduct(p, fg.qty, 'Production');
      fg.generatedUnitIds = ids;
      if (ids.length && confirm(`Add ${ids.length} new label(s) to print sheet?`)) state.labelSheet = ids;
      toast(`${ids.length} unit(s) generated.`, 'ok');
    }
    fg.status = 'confirmed'; fg.confirmedBy = session.userId; fg.confirmedAt = new Date().toISOString();

    if (fg.jobId) {
      const job = state.productionJobs.find(j => j.id === fg.jobId);
      if (job) {
        job.status = 'Done'; job.finishedGoodId = fg.id; job.completedAt = new Date().toISOString();
        const order = orderById(job.orderId);
        if (order && order.status !== 'Completed' && order.status !== 'Cancelled') {
          p.reserved = (Number(p.reserved) || 0) + fg.qty;
          (order.items || []).forEach(it => { if (it.productId === p.id) it.reservedQty = (Number(it.reservedQty) || 0) + Math.min(fg.qty, it.qty); });
        }
        if (order) {
          const jobs = state.productionJobs.filter(j => j.orderId === order.id && j.status !== 'Cancelled');
          if (jobs.length && jobs.every(j => j.status === 'Done') && order.status === 'In Production') {
            order.status = 'Ready for Delivery';
            pushNotification(['sales'], `Order ${order.orderNo} is Ready for Delivery`, { page: 'orders', entityId: order.id });
            logActivity('Order Ready', `${order.orderNo} ready for delivery`, { type: 'order', id: order.id });
          }
        }
      }
    }

    save();
    logActivity('Confirm Finished Good', `Confirmed ${fg.name} (${fg.sku}) × ${fg.qty}`, { type: 'finishedGood', id: fg.id });
    pushNotification(['production'], `Your submission ${fg.name} was confirmed.`, { page: 'production', entityId: fg.id });
    renderPage();
  }

  function cancelFinishedGood(id) {
    const fg = state.finishedGoods.find(f => f.id === id); if (!fg || fg.status !== 'pending') return;
    if (!confirm(`Cancel: ${fg.name} × ${fg.qty}?`)) return;
    fg.status = 'cancelled'; fg.cancelledBy = session.userId; fg.cancelledAt = new Date().toISOString();
    if (fg.jobId) {
      const job = state.productionJobs.find(j => j.id === fg.jobId);
      if (job && job.status === 'Done') job.status = 'In Progress';
    }
    save();
    logActivity('Cancel Finished Good', `Cancelled ${fg.name} (${fg.sku}) × ${fg.qty}`, { type: 'finishedGood', id: fg.id });
    pushNotification(['production'], `Your submission ${fg.name} was cancelled.`, { page: 'production', entityId: fg.id });
    toast('Cancelled.', 'warn'); renderPage();
  }

  function approveMaterialRequest(id) {
    const m = state.materialRequests.find(x => x.id === id); if (!m || m.status === 'approved') return;
    if (!confirm('Approve this material request? Materials will be deducted from stock (if tracked).')) return;
    const warnings = [];
    (m.materials || []).forEach(req => {
      const mat = state.materials.find(x => x.name.toLowerCase() === req.name.toLowerCase());
      if (mat) {
        if (mat.stock < req.qty) warnings.push(`${mat.name}: only ${mat.stock} in stock (need ${req.qty})`);
        mat.stock = Math.max(0, mat.stock - req.qty);
        if (mat.stock <= mat.reorder) pushNotification(['admin', 'inventory'], `Low material: ${mat.name} (${mat.stock} left)`, { page: 'inventory' });
      }
    });
    m.status = 'approved'; m.approvedBy = session.userId; m.approvedAt = new Date().toISOString();
    save();
    logActivity('Approve Request', `Material request ${m.id} for ${m.product}`, { type: 'materialRequest', id: m.id });
    pushNotification(['production'], `Material request for ${m.product} was approved`, { page: 'production', entityId: m.id });
    toast('Approved.' + (warnings.length ? ' Warnings: ' + warnings.join('; ') : ''), warnings.length ? 'warn' : 'ok');
    renderPage();
  }
  function rejectMaterialRequest(id) {
    const m = state.materialRequests.find(x => x.id === id); if (!m || m.status === 'approved') return;
    if (!confirm('Reject this request?')) return;
    m.status = 'rejected'; m.rejectedBy = session.userId; m.rejectedAt = new Date().toISOString();
    save();
    logActivity('Reject Request', `Rejected request ${m.id}`, { type: 'materialRequest', id: m.id });
    pushNotification(['production'], `Material request for ${m.product} was rejected`, { page: 'production', entityId: m.id });
    toast('Rejected.', 'warn'); renderPage();
  }

  /* ---------------- DSS actions ---------------- */
  function createMaterialRequestForProduct(product, qty, reason) {
    state.materialRequests.unshift({
      id: uid('MR'), date: new Date().toISOString(),
      product: product.name, sku: product.sku,
      materials: [{ name: reason || 'Raw material', qty: Math.max(1, Math.round(qty)) }],
      notes: reason || '', status: 'submitted', requestedBy: session.userId
    });
    save();
    logActivity('Material Request', `For ${product.name} × ${qty}`, { type: 'materialRequest', id: product.id });
    pushNotification(['admin','inventory'], `Material request for ${product.name} (${product.sku}) × ${qty} — ${reason || 'from DSS'}`, { page: 'production' });
    toast('Material request created.', 'ok');
  }
  function createProductionJobForProduct(product, qty, reason) {
    state.productionJobs.unshift({
      id: uid('JOB'), orderId: null, orderNo: 'DSS-' + stamp(),
      customerId: null, productId: product.id,
      name: product.name, sku: product.sku, qty: Math.max(1, Math.round(qty)),
      dueDate: null, status: 'Queued',
      createdAt: new Date().toISOString(), createdBy: session.userId,
      finishedGoodId: null, reason: reason || ''
    });
    save();
    logActivity('Create Job', `DSS job for ${product.name} × ${qty}`, { type: 'job', id: product.id });
    pushNotification(['production','admin'], `Production job for ${product.name} × ${qty} — ${reason || 'from DSS'}`, { page: 'production' });
    toast('Production job created.', 'ok');
  }
  function openAdEditorWithProduct(productId, discountPct) {
    if (!state.ads.length) {
      state.ads.push({ id: 'AD1', title: 'Promo', subtitle: 'Limited time offer', discount: discountPct || 10, discountPercent: discountPct || 10, productIds: [productId], startDate: '', endDate: '', ctaText: 'Shop Now', ctaLink: 'products', bgImage: '', active: true, createdAt: new Date().toISOString() });
      save(); toast('Ad created with ' + productId + '.', 'ok'); return;
    }
    const ad = state.ads[0];
    ad.productIds = Array.from(new Set([...(ad.productIds || []), productId]));
    ad.discountPercent = discountPct || 10; ad.discount = ad.discountPercent;
    save();
    if (session.role === 'marketing' || session.role === 'admin') { currentPage = 'ads'; renderNav(); renderPage(); toast('Product added to ad. Edit to refine.', 'ok'); }
    else toast('Added to ad (Admin/Marketing can publish).', 'warn');
  }

  /* ---------------- DASHBOARD ---------------- */
  function renderDashboard(el) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = new Date(now.getTime() - 7 * 864e5);
    const finWeek = financials(weekStart, now);
    const finMonth = financials(monthStart, now);

    const openInquiries = state.inquiries.filter(i => i.status === 'New').length;
    const unpaidOrders = state.orders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled' && Number(o.remainingBalance) > 0);
    const unpaidTotal = unpaidOrders.reduce((s, o) => s + Number(o.remainingBalance || 0), 0);
    const overdueOrders = unpaidOrders.filter(o => (Date.now() - new Date(o.createdAt).getTime()) > 14 * 864e5);

    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const start = new Date(now.getFullYear(), i, 1);
      const end = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59);
      return financials(start, end).revenue;
    });
    const maxMonth = Math.max(...monthlyData, 1);
    const peakByMonth = Array.from({ length: 12 }, (_, i) => state.orders.filter(o => o.status === 'Completed' && new Date(o.completedAt || o.createdAt).getMonth() === i).length);
    const peakMax = Math.max(...peakByMonth, 1);
    const peakTop3 = peakByMonth.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 3);
    let peakLine = "Not enough data yet for a recommendation.";
    if (peakTop3[0] && peakTop3[0].v > 0) {
      const topMonths = peakTop3.filter(x => x.v > 0).map(x => monthName(x.i));
      peakLine = `Peak demand: <strong>${topMonths.join(', ')}</strong>. Place material orders 2 months in advance.`;
    }

    el.innerHTML = `
      <div class="page-title"><div><h1>Dashboard</h1><p>Business overview — ${now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</p></div></div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Weekly Sales</div><div class="kpi-val">${peso(finWeek.revenue)}</div></div>
        <div class="kpi"><div class="kpi-label">Monthly Sales</div><div class="kpi-val">${peso(finMonth.revenue)}</div></div>
        <div class="kpi"><div class="kpi-label">Est. Net Profit</div><div class="kpi-val">${peso(finMonth.net)}</div></div>
        <div class="kpi"><div class="kpi-label">Open Inquiries</div><div class="kpi-val" style="color:${openInquiries > 0 ? 'var(--warn)' : 'var(--black)'}">${openInquiries}</div></div>
        <div class="kpi"><div class="kpi-label">Unpaid Balances</div><div class="kpi-val">${peso(unpaidTotal)}</div><div class="kpi-delta">${unpaidOrders.length} open order(s)</div></div>
      </div>
      <div class="dash-charts-row">
        <div class="card">
          <div class="card-title">Monthly Sales — ${now.getFullYear()}</div>
          <div class="chart-bars">${monthlyData.map((v, i) => { const h = (v / maxMonth) * 100; const cur = i === now.getMonth(); return `<div class="chart-bar-wrap"><div class="chart-bar-val">${v > 0 ? peso(v) : ''}</div><div class="chart-bar ${cur ? 'current' : ''}" style="height:${Math.max(h, 2)}%"></div><div class="chart-bar-label">${monthName(i)}</div></div>`; }).join('')}</div>
        </div>
        <div class="card" style="display:flex;flex-direction:column;position:relative;">
          <div class="card-title">Peak Season to Order</div>
          <div class="peak-chart">${peakByMonth.map((v, i) => { const h = (v / peakMax) * 100; const isTop = peakTop3.some(x => x.i === i) && v > 0; return `<div class="peak-bar-wrap"><div class="peak-bar-val" style="font-size:11px;margin-bottom:4px">${v > 0 ? v : ''}</div><div class="peak-bar ${isTop ? 'top' : ''}" style="height:${Math.max(h, 2)}%"></div><div class="peak-label">${monthName(i)}</div></div>`; }).join('')}</div>
          <div class="muted" style="font-size:12px;margin-top:auto;padding-right:80px">${peakLine}</div>
          <button class="btn btn-primary btn-sm" id="btnViewInsights" style="position:absolute;bottom:20px;right:20px;">View Insights →</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Inventory Alert Console</div>
        <div class="alert-list">
          ${state.products.filter(p => ['low stock', 'out of stock', 'overstock'].includes(productStatus(p))).slice(0, 8).map(p => `
            <div class="alert-item ${productStatus(p) === 'out of stock' ? 'critical' : ''}">
              <div style="display:flex;align-items:center;gap:12px"><img class="thumb" src="${esc(p.image || pickImg(p.category, p.sku))}" onerror="this.style.visibility='hidden'"><div><div class="a-name">${esc(p.name)}</div><div class="a-sku">${esc(p.sku)} · ${esc(p.category)}</div></div></div>
              <div style="text-align:right">${badge(productStatus(p))}<div class="muted" style="font-size:12px;margin-top:4px">${productStock(p)} on hand (${availableStock(p)} avail)</div></div>
            </div>`).join('') || '<div class="muted">No alerts.</div>'}
        </div>
      </div>
      ${overdueOrders.length ? `
      <div class="card">
        <div class="card-title">Overdue Balances (${overdueOrders.length})</div>
        <div class="tablewrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Age</th><th>Balance</th></tr></thead>
          <tbody>${overdueOrders.slice(0, 10).map(o => { const c = customerById(o.customerId); const days = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 864e5); return `<tr><td class="mono">${esc(o.orderNo)}</td><td>${esc(c?.name || '—')}</td><td>${days} days</td><td><strong>${peso(o.remainingBalance)}</strong></td></tr>`; }).join('')}</tbody>
        </table></div>
      </div>` : ''}
    `;
    $('#btnViewInsights').addEventListener('click', () => { currentPage = 'insights'; renderNav(); renderPage(); });
  }

  /* ---------------- INSIGHTS ---------------- */
  let insightTab = '1';
  function renderInsightsPage(el) {
    el.innerHTML = `
      <div class="page-title"><div><h1>Decision Support Insights</h1><p>Data-driven recommendations with one-click actions.</p></div><button class="btn" id="insBack">← Back to Dashboard</button></div>
      <div class="tabs" id="insightsTabs">
        <button class="tab-btn ${insightTab==='1'?'active':''}" data-i="1">1. BOM Bundling</button>
        <button class="tab-btn ${insightTab==='2'?'active':''}" data-i="2">2. Lead-Time</button>
        <button class="tab-btn ${insightTab==='3'?'active':''}" data-i="3">3. Conversion</button>
        <button class="tab-btn ${insightTab==='4'?'active':''}" data-i="4">4. Lifespan</button>
        <button class="tab-btn ${insightTab==='5'?'active':''}" data-i="5">5. Smart Reorder</button>
        <button class="tab-btn ${insightTab==='6'?'active':''}" data-i="6">6. Dead Stock</button>
        <button class="tab-btn ${insightTab==='7'?'active':''}" data-i="7">7. Usage & Demand</button>
      </div>
      <div id="insightPane"></div>
    `;
    $('#insBack').addEventListener('click', () => { currentPage = 'dashboard'; renderNav(); renderPage(); });
    $$('.tab-btn[data-i]').forEach(b => b.addEventListener('click', () => { insightTab = b.dataset.i; $$('.tab-btn[data-i]').forEach(x => x.classList.remove('active')); b.classList.add('active'); renderInsightPane(b.dataset.i); }));
    renderInsightPane(insightTab);
  }
  function renderInsightPane(id) {
    const pane = $('#insightPane'); if (!pane) return;
    if (id === '1') return renderInsightBOM(pane);
    if (id === '2') return renderInsightLeadTime(pane);
    if (id === '3') return renderInsightConversion(pane);
    if (id === '4') return renderInsightLifespan(pane);
    if (id === '5') return renderInsightReorder(pane);
    if (id === '6') return renderInsightDeadStock(pane);
    if (id === '7') return renderInsightDemand(pane);
  }
  function renderInsightBOM(pane) {
    const blocked = [];
    state.orders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled').forEach(o => {
      shortItemsForOrder(o).forEach(s => blocked.push({ orderNo: o.orderNo, orderId: o.id, productId: s.productId, name: s.name, sku: s.sku, shortfall: s.shortfall }));
    });
    const partsFreq = {};
    blocked.forEach(b => { partsFreq[b.sku] = partsFreq[b.sku] || { sku: b.sku, name: b.name, count: 0, total: 0 }; partsFreq[b.sku].count++; partsFreq[b.sku].total += b.shortfall; });
    const topMissing = Object.values(partsFreq).sort((a, b) => b.total - a.total)[0];
    pane.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3>Component BOM Bundling</h3><span class="muted" style="font-size:12px">Data: live open orders — ${fmtDate(new Date())}</span></div>
        <p class="muted">Which sub-materials and hardware must be grouped for production or delivery?</p>
        ${blocked.length ? `<div class="alert-bad" style="background:#fce8e6;color:#a50e0e;border-color:#d93025;margin:14px 0"><strong>⚠ ${blocked.length} line(s) across ${new Set(blocked.map(b=>b.orderNo)).size} order(s) need production</strong></div>` : '<p class="muted" style="color:var(--ok)">✔ No blocked orders.</p>'}
        <div class="kpi-grid" style="margin-top:20px">
          <div class="kpi"><div class="kpi-label">Open Orders</div><div class="kpi-val">${state.orders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled').length}</div></div>
          <div class="kpi"><div class="kpi-label">Blocked Lines</div><div class="kpi-val" style="color:var(--bad)">${blocked.length}</div></div>
          <div class="kpi"><div class="kpi-label">Most Missing</div><div class="kpi-val" style="font-size:18px">${esc(topMissing ? topMissing.name : '—')}</div></div>
        </div>
        ${blocked.length ? `<div class="tablewrap" style="margin-top:20px"><table><thead><tr><th>Order</th><th>Product</th><th>Shortfall</th><th>Action</th></tr></thead>
          <tbody>${blocked.map(b => `<tr><td class="mono">${esc(b.orderNo)}</td><td>${esc(b.name)} <span class="muted mono" style="font-size:11px">${esc(b.sku)}</span></td><td>${b.shortfall}</td><td><button class="btn btn-sm" data-bom-prod="${b.productId}:${b.shortfall}">Create Job</button><button class="btn btn-sm btn-primary" data-bom-req="${b.productId}:${b.shortfall}">Request Materials</button></td></tr>`).join('')}</tbody></table></div>` : ''}
      </div>`;
    $$('[data-bom-prod]').forEach(btn => btn.addEventListener('click', () => { const [pid, qty] = btn.dataset.bomProd.split(':'); const p = productById(pid); if (!p) return; createProductionJobForProduct(p, Number(qty), 'BOM shortfall'); renderInsightBOM(pane); }));
    $$('[data-bom-req]').forEach(btn => btn.addEventListener('click', () => { const [pid, qty] = btn.dataset.bomReq.split(':'); const p = productById(pid); if (!p) return; createMaterialRequestForProduct(p, Number(qty), 'BOM shortfall'); }));
  }
  function renderInsightLeadTime(pane) {
    const doneJobs = state.productionJobs.filter(j => j.status === 'Done' && j.startedAt && j.completedAt);
    const durations = doneJobs.map(j => (new Date(j.completedAt) - new Date(j.startedAt)) / 864e5);
    const avgDays = durations.length ? (durations.reduce((a,b)=>a+b,0)/durations.length) : 0;
    const activeJobs = state.productionJobs.filter(j => j.status === 'In Progress');
    const overdueJobs = state.productionJobs.filter(j => j.status !== 'Done' && j.status !== 'Cancelled' && j.createdAt && (Date.now() - new Date(j.createdAt).getTime()) > 7*864e5);
    const byProduct = {};
    doneJobs.forEach(j => { byProduct[j.sku] = byProduct[j.sku] || { sku: j.sku, name: j.name, sum: 0, n: 0 }; byProduct[j.sku].sum += (new Date(j.completedAt) - new Date(j.startedAt)) / 864e5; byProduct[j.sku].n++; });
    const rows = Object.values(byProduct).sort((a, b) => (b.sum/b.n) - (a.sum/a.n));
    pane.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3>Lead-Time & Buffer</h3><span class="muted" style="font-size:12px">Data: ${doneJobs.length} completed job(s) · ${fmtDate(new Date())}</span></div>
        <p class="muted">Average time from job start to completion, by product.</p>
        <div class="kpi-grid" style="margin-top:20px">
          <div class="kpi"><div class="kpi-label">Avg Job Time</div><div class="kpi-val">${avgDays.toFixed(1)} days</div></div>
          <div class="kpi"><div class="kpi-label">Jobs In Progress</div><div class="kpi-val">${activeJobs.length}</div></div>
          <div class="kpi"><div class="kpi-label">Overdue (>7d)</div><div class="kpi-val" style="color:var(--bad)">${overdueJobs.length}</div></div>
        </div>
        ${rows.length ? `<div class="tablewrap" style="margin-top:20px"><table><thead><tr><th>Product</th><th>SKU</th><th>Jobs</th><th>Avg Days</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td><td class="mono">${esc(r.sku)}</td><td>${r.n}</td><td>${(r.sum/r.n).toFixed(1)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="margin-top:16px">Not enough completed jobs to compute lead times.</p>'}
        ${overdueJobs.length ? `<div style="margin-top:20px;padding:14px;background:var(--g50);border-radius:8px;border-left:3px solid var(--black)"><strong>Recommended Action:</strong> ${overdueJobs.length} job(s) open for more than 7 days.<div style="margin-top:8px"><button class="btn btn-sm btn-primary" id="ltGoto">Open Production</button></div></div>` : ''}
      </div>`;
    $('#ltGoto')?.addEventListener('click', () => { currentPage = 'production'; renderNav(); renderPage(); });
  }
  function renderInsightConversion(pane) {
    const totalInq = state.inquiries.length;
    const contacted = state.inquiries.filter(i => i.status !== 'New').length;
    const converted = state.inquiries.filter(i => i.status === 'Converted').length;
    const orders = state.orders.length;
    const completed = state.orders.filter(o => o.status === 'Completed').length;
    const inqToSale = totalInq ? (completed / totalInq * 100).toFixed(0) : '—';
    const biggestDrop = (() => {
      const stages = [
        { from: 'Inquiries', to: 'Contacted', val: totalInq ? (contacted / totalInq * 100) : 100 },
        { from: 'Contacted', to: 'Converted', val: contacted ? (converted / contacted * 100) : 100 },
        { from: 'Converted', to: 'Orders', val: converted ? (orders / converted * 100) : 100 },
        { from: 'Orders', to: 'Completed', val: orders ? (completed / orders * 100) : 100 }
      ];
      return stages.sort((a,b)=>a.val-b.val)[0];
    })();
    pane.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3>Conversion Analytics</h3><span class="muted" style="font-size:12px">Data: live inquiries + orders · ${fmtDate(new Date())}</span></div>
        <p class="muted">Where do potential customers drop off in the sales pipeline?</p>
        <div class="kpi-grid" style="margin-top:20px">
          <div class="kpi"><div class="kpi-label">Inquiry → Sale</div><div class="kpi-val">${inqToSale}%</div></div>
          <div class="kpi"><div class="kpi-label">Biggest Drop</div><div class="kpi-val" style="font-size:16px">${esc(biggestDrop.from)} → ${esc(biggestDrop.to)} (${biggestDrop.val.toFixed(0)}%)</div></div>
          <div class="kpi"><div class="kpi-label">Total Inquiries</div><div class="kpi-val">${totalInq}</div></div>
        </div>
        <div style="margin-top:30px;padding:20px;background:var(--g50);border-radius:8px;text-align:center">
          <div style="display:flex;justify-content:center;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="background:var(--black);color:var(--white);padding:20px;border-radius:8px;width:140px"><div style="font-size:24px;font-weight:bold">${totalInq}</div><div style="font-size:12px">Inquiries</div></div>
            <div style="font-size:24px;color:var(--g500)">→</div>
            <div style="background:var(--black);color:var(--white);padding:20px;border-radius:8px;width:140px"><div style="font-size:24px;font-weight:bold">${contacted}</div><div style="font-size:12px">Contacted</div></div>
            <div style="font-size:24px;color:var(--g500)">→</div>
            <div style="background:var(--bad);color:var(--white);padding:20px;border-radius:8px;width:140px;position:relative"><div style="position:absolute;top:-15px;left:50%;transform:translateX(-50%);font-size:10px;background:var(--bad);padding:2px 6px;border-radius:4px;white-space:nowrap">Biggest drop</div><div style="font-size:24px;font-weight:bold">${converted}</div><div style="font-size:12px">Converted</div></div>
            <div style="font-size:24px;color:var(--g500)">→</div>
            <div style="background:var(--black);color:var(--white);padding:20px;border-radius:8px;width:140px"><div style="font-size:24px;font-weight:bold">${completed}</div><div style="font-size:12px">Completed</div></div>
          </div>
        </div>
        <div style="margin-top:20px;padding:14px;background:var(--g50);border-radius:8px;border-left:3px solid var(--black)">
          <strong>Recommended Action:</strong> Biggest drop is <strong>${esc(biggestDrop.from)} → ${esc(biggestDrop.to)}</strong> at ${biggestDrop.val.toFixed(0)}%. Improve follow-up on new inquiries within 24 hours.
          <div style="margin-top:8px"><button class="btn btn-sm btn-primary" id="cvGo">Open Inquiries</button></div>
        </div>
      </div>`;
    $('#cvGo')?.addEventListener('click', () => { currentPage = 'inquiries'; renderNav(); renderPage(); });
  }
  function renderInsightLifespan(pane) {
    const soldUnits = state.units.filter(u => u.status === 'sold' && u.receivedAt && u.soldAt);
    const bySku = {};
    soldUnits.forEach(u => { const days = (new Date(u.soldAt) - new Date(u.receivedAt)) / 864e5; bySku[u.sku] = bySku[u.sku] || { sku: u.sku, name: u.name, sum: 0, n: 0 }; bySku[u.sku].sum += days; bySku[u.sku].n++; });
    const rows = Object.values(bySku).sort((a,b)=>(a.sum/a.n)-(b.sum/b.n));
    pane.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3>Product Lifespan</h3><span class="muted" style="font-size:12px">Data: ${soldUnits.length} sold unit(s)</span></div>
        <p class="muted">How long does a product sit before being sold?</p>
        <div class="kpi-grid" style="margin-top:20px">
          <div class="kpi"><div class="kpi-label">Fastest</div><div class="kpi-val" style="font-size:16px">${esc(rows[0]?.name || '—')}</div></div>
          <div class="kpi"><div class="kpi-label">Slowest</div><div class="kpi-val" style="font-size:16px">${esc(rows[rows.length-1]?.name || '—')}</div></div>
          <div class="kpi"><div class="kpi-label">Tracked</div><div class="kpi-val">${soldUnits.length}</div></div>
        </div>
        ${rows.length ? `<div class="tablewrap" style="margin-top:20px"><table><thead><tr><th>Product</th><th>SKU</th><th>Sold Units</th><th>Avg Days in Stock</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td><td class="mono">${esc(r.sku)}</td><td>${r.n}</td><td>${(r.sum/r.n).toFixed(1)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="margin-top:16px">Not enough sold units yet.</p>'}
      </div>`;
  }
  function renderInsightReorder(pane) {
    const soldLast30 = state.orders.filter(o => o.status === 'Completed' && new Date(o.completedAt || o.createdAt) > new Date(Date.now()-30*864e5));
    const velocity = {};
    soldLast30.forEach(o => (o.items || []).forEach(it => { velocity[it.productId] = (velocity[it.productId]||0) + it.qty; }));
    const reorderList = state.products.filter(p => p.isActive !== false).map(p => {
      const v = (velocity[p.id] || 0) / 30;
      const daysLeft = v > 0 ? (availableStock(p) / v) : null;
      const suggestedQty = Math.max(p.reorder * 2, Math.ceil(v * 30));
      return { p, v, daysLeft, suggestedQty };
    }).filter(x => x.daysLeft !== null && x.daysLeft < 15 || availableStock(x.p) <= x.p.reorder).sort((a,b)=>(a.daysLeft ?? 999)-(b.daysLeft ?? 999));
    pane.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3>Smart Reorder</h3><span class="muted" style="font-size:12px">Data: completed orders last 30 days</span></div>
        <p class="muted">When is the right time to buy more stock?</p>
        <div class="kpi-grid" style="margin-top:20px">
          <div class="kpi"><div class="kpi-label">Reorder Now</div><div class="kpi-val" style="color:var(--bad)">${reorderList.filter(r => r.daysLeft !== null && r.daysLeft < 7).length}</div></div>
          <div class="kpi"><div class="kpi-label">Near Reorder</div><div class="kpi-val" style="color:var(--warn)">${reorderList.filter(r => r.daysLeft !== null && r.daysLeft >= 7 && r.daysLeft < 15).length}</div></div>
          <div class="kpi"><div class="kpi-label">Fastest Depletion</div><div class="kpi-val">${reorderList.length && reorderList[0].daysLeft !== null ? reorderList[0].daysLeft.toFixed(1) + ' d' : '—'}</div></div>
        </div>
        ${reorderList.length ? `<div class="tablewrap" style="margin-top:20px"><table><thead><tr><th>Product</th><th>Available</th><th>Velocity/Day</th><th>Days Left</th><th>Suggested Qty</th><th>Actions</th></tr></thead>
          <tbody>${reorderList.map(r => `<tr><td>${esc(r.p.name)} <span class="muted mono" style="font-size:11px">${esc(r.p.sku)}</span></td><td>${availableStock(r.p)}</td><td>${r.v.toFixed(2)}</td><td class="${r.daysLeft !== null && r.daysLeft < 7 ? 'mismatch' : ''}">${r.daysLeft !== null ? r.daysLeft.toFixed(1) : '—'}</td><td>${r.suggestedQty}</td><td><button class="btn btn-sm btn-primary" data-req="${r.p.id}:${r.suggestedQty}">Request Materials</button><button class="btn btn-sm" data-prod="${r.p.id}:${r.suggestedQty}">Create Job</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="margin-top:16px">All products have healthy stock.</p>'}
      </div>`;
    $$('[data-req]').forEach(btn => btn.addEventListener('click', () => { const [pid, qty] = btn.dataset.req.split(':'); const p = productById(pid); if (!p) return; createMaterialRequestForProduct(p, Number(qty), 'Smart Reorder'); renderInsightReorder(pane); }));
    $$('[data-prod]').forEach(btn => btn.addEventListener('click', () => { const [pid, qty] = btn.dataset.prod.split(':'); const p = productById(pid); if (!p) return; createProductionJobForProduct(p, Number(qty), 'Smart Reorder'); renderInsightReorder(pane); }));
  }
  function renderInsightDeadStock(pane) {
    const days = 60, cutoff = Date.now() - days * 864e5;
    const moved = new Set();
    state.orders.filter(o => o.status === 'Completed').forEach(o => { if (new Date(o.completedAt || o.createdAt).getTime() >= cutoff) (o.items || []).forEach(it => moved.add(it.productId)); });
    const dead = state.products.filter(p => p.isActive !== false && !moved.has(p.id) && (p.stock || 0) > 0);
    const tiedUp = dead.reduce((s, p) => s + (p.stock || 0) * (p.cost || 0), 0);
    pane.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3>Overstock & Dead Stock</h3><span class="muted" style="font-size:12px">Data: ${days}-day window · ${fmtDate(new Date(Date.now()-days*864e5))} → today</span></div>
        <p class="muted">Products with no completed-order movement in the last ${days} days.</p>
        <div class="kpi-grid" style="margin-top:20px">
          <div class="kpi"><div class="kpi-label">Capital Tied Up</div><div class="kpi-val">${peso(tiedUp)}</div></div>
          <div class="kpi"><div class="kpi-label">Dead Items</div><div class="kpi-val" style="color:var(--warn)">${dead.length}</div></div>
          <div class="kpi"><div class="kpi-label">Avg Stock</div><div class="kpi-val">${dead.length ? Math.round(dead.reduce((s,p)=>s+(p.stock||0),0)/dead.length) : 0}</div></div>
        </div>
        ${dead.length ? `<div class="tablewrap" style="margin-top:20px"><table><thead><tr><th>Product</th><th>Stock</th><th>Cost Tied</th><th>Featured</th><th>Actions</th></tr></thead>
          <tbody>${dead.map(p => `<tr><td>${esc(p.name)} <span class="muted mono" style="font-size:11px">${esc(p.sku)}</span></td><td>${p.stock}</td><td>${peso((p.stock||0)*(p.cost||0))}</td><td>${p.featured ? '★' : '—'}</td><td><button class="btn btn-sm" data-disc="${p.id}">Apply 10% Discount</button><button class="btn btn-sm" data-feat="${p.id}">${p.featured ? 'Unfeature' : 'Feature'}</button><button class="btn btn-sm" data-noad="${p.id}">Mark New</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="margin-top:16px">No dead stock.</p>'}
      </div>`;
    $$('[data-disc]').forEach(btn => btn.addEventListener('click', () => { const p = productById(btn.dataset.disc); if (p) openAdEditorWithProduct(p.id, 10); }));
    $$('[data-feat]').forEach(btn => btn.addEventListener('click', () => { const p = productById(btn.dataset.feat); if (!p) return; p.featured = !p.featured; save(); logActivity('Toggle Featured', `${p.name} featured=${p.featured}`, { type: 'product', id: p.id }); renderInsightDeadStock(pane); }));
    $$('[data-noad]').forEach(btn => btn.addEventListener('click', () => { const p = productById(btn.dataset.noad); if (!p) return; p.isNew = true; save(); logActivity('Mark New', `${p.name} marked new`, { type: 'product', id: p.id }); toast('Marked as new.', 'ok'); renderInsightDeadStock(pane); }));
  }
  function renderInsightDemand(pane) {
    const completed = state.orders.filter(o => o.status === 'Completed');
    const unitsByProduct = {};
    completed.forEach(o => (o.items || []).forEach(it => { unitsByProduct[it.productId] = (unitsByProduct[it.productId] || 0) + it.qty; }));
    const ranked = Object.entries(unitsByProduct).map(([pid, units]) => ({ p: productById(pid), units })).filter(x => x.p).sort((a,b)=>b.units-a.units).slice(0, 10);
    const totalUnits = Object.values(unitsByProduct).reduce((a,b)=>a+b,0);
    const top3Units = ranked.slice(0,3).reduce((s,r)=>s+r.units,0);
    const share = totalUnits ? (top3Units/totalUnits*100).toFixed(0) : 0;
    const catUnits = {};
    completed.forEach(o => (o.items || []).forEach(it => { const p = productById(it.productId); if (!p) return; catUnits[p.category] = (catUnits[p.category] || 0) + it.qty; }));
    const topCat = Object.entries(catUnits).sort((a,b)=>b[1]-a[1])[0];
    pane.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3>Usage & Demand</h3><span class="muted" style="font-size:12px">Data: all Completed orders · ${completed.length}</span></div>
        <p class="muted">Which products are used the most?</p>
        <div class="kpi-grid" style="margin-top:20px">
          <div class="kpi"><div class="kpi-label">Top Product</div><div class="kpi-val" style="font-size:16px">${esc(ranked[0]?.p.name || '—')}</div></div>
          <div class="kpi"><div class="kpi-label">Top Category</div><div class="kpi-val" style="font-size:16px">${esc(topCat?.[0] || '—')}</div></div>
          <div class="kpi"><div class="kpi-label">Top 3 Share</div><div class="kpi-val">${share}%</div></div>
        </div>
        ${ranked.length ? `<div style="margin-top:20px"><div style="margin-bottom:10px;font-size:12px;font-weight:600">Top 10 Products (Units Sold)</div><div style="background:var(--g50);padding:16px;border-radius:8px;">${ranked.map((r, i) => { const w = ranked[0].units ? (r.units / ranked[0].units * 100) : 0; const bg = i===0 ? 'var(--black)' : i===1 ? 'var(--g700)' : i===2 ? 'var(--g500)' : 'var(--g400)'; return `<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px"><span>${esc(r.p.name)}</span><span>${r.units}</span></div><div style="width:100%;height:12px;background:var(--g200);border-radius:6px"><div style="width:${w}%;height:100%;background:${bg};border-radius:6px"></div></div></div>`; }).join('')}</div></div>
          <div style="margin-top:20px"><table><thead><tr><th>Product</th><th>Units Sold</th><th>Current Stock</th><th>Action</th></tr></thead><tbody>${ranked.map(r => `<tr><td>${esc(r.p.name)}</td><td>${r.units}</td><td>${availableStock(r.p)}</td><td><button class="btn btn-sm" data-adto="${r.p.id}">Add to Ad</button></td></tr>`).join('')}</tbody></table></div>
          <div style="margin-top:20px;padding:14px;background:var(--g50);border-radius:8px;border-left:3px solid var(--black)"><strong>Recommended Action:</strong> Negotiate bulk pricing for <strong>${esc(ranked[0]?.p.name || '—')}</strong>.</div>` : '<p class="muted" style="margin-top:16px">No completed orders yet.</p>'}
      </div>`;
    $$('[data-adto]').forEach(btn => btn.addEventListener('click', () => { const p = productById(btn.dataset.adto); if (p) openAdEditorWithProduct(p.id, 10); }));
  }

  /* ---------------- INQUIRIES ---------------- */
  function renderInquiries(el) {
    const inquiries = [...state.inquiries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    el.innerHTML = `
      <div class="page-title"><div><h1>Website Inquiries</h1><p>Leads from the public showroom.</p></div></div>
      <div class="card"><div class="tablewrap"><table><thead><tr><th>Date</th><th>Name</th><th>Contact</th><th>Interest</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${inquiries.length ? inquiries.map(i => `<tr class="${i.status === 'New' ? 'has-new' : ''}"><td>${fmtDateTime(i.createdAt)}</td><td><strong>${esc(i.name)}</strong></td><td>${esc(i.phone)}<br><span class="muted" style="font-size:11px">${esc(i.email)}</span></td><td>${esc(i.interest || '—')}${i.orderId ? `<br><span class="muted" style="font-size:11px">Order: ${esc(orderById(i.orderId)?.orderNo || '—')}</span>` : ''}</td><td><span class="inq-status inq-${(i.status || 'New').toLowerCase()}">${esc(i.status || 'New')}</span></td><td>${i.status === 'New' ? `<button class="btn btn-sm" data-inq-mark="${i.id}">Mark Contacted</button>` : ''}${i.status !== 'Converted' && i.status !== 'Closed' ? `<button class="btn btn-sm btn-primary" data-inq-convert="${i.id}">Convert to Customer</button>` : ''}${i.status !== 'Closed' && !i.orderId ? `<button class="btn btn-sm" data-inq-order="${i.id}">Create Order</button>` : ''}${i.status !== 'Closed' ? `<button class="btn btn-sm btn-danger" data-inq-close="${i.id}">Close</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-row">No inquiries yet.</td></tr>'}</tbody></table></div></div>`;
    $$('[data-inq-mark]').forEach(b => b.addEventListener('click', () => { const inq = state.inquiries.find(x => x.id === b.dataset.inqMark); if (inq) { inq.status = 'Contacted'; save(); logActivity('Update Inquiry', `Marked inquiry ${inq.id} as Contacted`); renderPage(); } }));
    $$('[data-inq-close]').forEach(b => b.addEventListener('click', () => { const inq = state.inquiries.find(x => x.id === b.dataset.inqClose); if (inq) { inq.status = 'Closed'; save(); logActivity('Update Inquiry', `Closed inquiry ${inq.id}`); renderPage(); } }));
    $$('[data-inq-convert]').forEach(b => b.addEventListener('click', () => {
      const inq = state.inquiries.find(x => x.id === b.dataset.inqConvert); if (!inq) return;
      const existed = !!(inq.customerId || findCustomerByContact(inq.phone, inq.email));
      const cust = inquiryToCustomer(inq); save();
      logActivity('Convert Inquiry', `Inquiry ${existed ? 'linked to existing' : 'converted to new'} customer ${cust.name}`, { type: 'inquiry', id: inq.id });
      toast(existed ? `Linked to existing customer ${cust.name}.` : 'Converted to customer.', 'ok'); renderPage();
    }));
    $$('[data-inq-order]').forEach(b => b.addEventListener('click', () => {
      const inq = state.inquiries.find(x => x.id === b.dataset.inqOrder); if (!inq) return;
      const cust = inquiryToCustomer(inq); save();
      orderPrefill = { customerId: cust.id, productId: inq.productId || null, inquiryId: inq.id, leadSource: 'Website', notes: inq.message ? 'Inquiry: ' + inq.message : '' };
      openOrderModal(null);
    }));
  }

  /* ---------------- PRODUCTS ---------------- */
  function renderProductsManager(el) {
    el.innerHTML = `
      <div class="page-title"><div><h1>Manage Products</h1><p>Add, edit, or archive products. Changes appear on the showroom.</p></div><button class="btn btn-primary" id="btnAddProduct">+ New Product</button></div>
      <div class="card"><div class="toolbar"><input class="grow" id="pmSearch" placeholder="Search products…" /><select id="pmCat"><option value="">All categories</option>${[...new Set(state.products.map(p => p.category))].map(c => `<option>${esc(c)}</option>`).join('')}</select></div><div id="pmList"></div></div>`;
    const renderList = () => {
      const q = ($('#pmSearch')?.value || '').toLowerCase();
      const cat = $('#pmCat')?.value || '';
      const list = state.products.filter(p => p.isActive !== false && (!cat || p.category === cat) && (!q || (p.name + ' ' + p.sku + ' ' + p.category).toLowerCase().includes(q)));
      $('#pmList').innerHTML = list.length ? list.map(p => {
        const ad = getActiveAdForProduct(p.id); const ep = effectivePrice(p);
        const priceHtml = ad ? `<span style="color:var(--bad);font-weight:700">${peso(ep)}</span> <span style="text-decoration:line-through;color:var(--g400);font-size:11px">${peso(p.price)}</span>` : peso(p.price);
        return `<div class="mgr-product-item"><img class="thumb" src="${esc(p.image || pickImg(p.category, p.sku))}" onerror="this.style.visibility='hidden'"><div class="mgr-product-info"><div class="name">${esc(p.name)}</div><div class="meta">${esc(p.sku)} · ${esc(p.category)} · ${priceHtml} · Stock ${productStock(p)} (${availableStock(p)} avail)${ad ? ' · <span class="badge badge-solid" style="background:var(--bad);font-size:10px">SALE</span>' : ''}</div></div><div class="mgr-product-actions"><button class="btn btn-sm" data-edit="${p.id}">Edit</button><button class="btn btn-sm btn-danger" data-del="${p.id}">Archive</button></div></div>`;
      }).join('') : '<div class="empty-row">No products match.</div>';
      $$('[data-edit]').forEach(b => b.addEventListener('click', () => openProductEditor(b.dataset.edit)));
      $$('[data-del]').forEach(b => b.addEventListener('click', () => archiveProduct(b.dataset.del)));
    };
    $('#pmSearch').addEventListener('input', renderList);
    $('#pmCat').addEventListener('change', renderList);
    $('#btnAddProduct').addEventListener('click', () => openProductEditor(null));
    renderList();
  }

  function openProductEditor(productId) {
    const p = productId ? productById(productId) : null;
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:680px">
        <div class="modal-head"><h3>${p ? 'Edit Product' : 'New Product'}</h3><button data-close>✕</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="full">Product Name *<input id="epName" value="${esc(p?.name || '')}" /></label>
            <label>Price<input id="epPrice" type="number" step="0.01" value="${p?.price || 0}" /></label>
            <label>SKU *<input id="epSku" value="${esc(p?.sku || '')}" /></label>
            <label>Category<input id="epCat" value="${esc(p?.category || '')}" /></label>
            <label>Reorder Level<input id="epReorder" type="number" value="${p?.reorder || 5}" /></label>
            <label class="full">Product Image</label>
            <div class="full" style="margin-top:-8px;margin-bottom:8px">
              <label class="prod-img-drop" for="epImgFile">
                <input type="file" id="epImgFile" accept="image/*" />
                <div class="prod-img-preview" id="epImgPreview">${p?.image ? `<img src="${esc(p.image)}" alt="preview" />` : '<span style="font-size:24px;opacity:.3">📷</span>'}</div>
                <div class="prod-img-text"><div class="prod-img-title">Click to upload image</div><div class="prod-img-sub">PNG, JPG, WEBP up to 5 MB</div></div>
              </label>
            </div>
            <label class="full">Full Description<textarea id="epDesc" rows="3">${esc(p?.description || '')}</textarea></label>
            <label class="full">Best Used For<input id="epBest" value="${esc(p?.bestFor || '')}" /></label>
            <label class="full">Sizes (comma-separated)<input id="epSizes" value="${(p?.sizes || ['Small','Medium','Large','Custom']).join(', ')}" /></label>
            <label class="full">Colors (comma-separated names)<input id="epColors" value="${(p?.colors || ['Black', 'White', 'Brown', 'Beige']).join(', ')}" /></label>
            <label class="check"><input type="checkbox" id="epFeatured" ${p?.featured ? 'checked' : ''} /> Featured</label>
            <label class="check"><input type="checkbox" id="epNew" ${p?.isNew ? 'checked' : ''} /> New Arrival</label>
          </div>
        </div>
        <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="epSave">${p ? 'Save' : 'Create'}</button></div>
      </div>`;
    document.body.appendChild(modal);
    let newImage = p?.image || '';
    modal.querySelector('#epImgFile').addEventListener('change', (e) => {
      const file = e.target.files[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5 MB.', 'bad'); return; }
      if (!/^image\//.test(file.type)) { toast('Please select an image file.', 'bad'); return; }
      const reader = new FileReader();
      reader.onload = () => { newImage = reader.result; modal.querySelector('#epImgPreview').innerHTML = `<img src="${newImage}" alt="preview" />`; };
      reader.readAsDataURL(file);
    });
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
    modal.querySelector('#epSave').addEventListener('click', () => {
      const data = {
        name: modal.querySelector('#epName').value.trim(),
        sku: sanitizeSku(modal.querySelector('#epSku').value),
        category: modal.querySelector('#epCat').value.trim(),
        price: Number(modal.querySelector('#epPrice').value) || 0,
        reorder: Number(modal.querySelector('#epReorder').value) || 5,
        description: modal.querySelector('#epDesc').value,
        bestFor: modal.querySelector('#epBest').value || 'Best for everyday use and casual settings.',
        image: newImage || DEFAULT_IMG,
        sizes: modal.querySelector('#epSizes').value.split(',').map(s => s.trim()).filter(Boolean),
        colors: modal.querySelector('#epColors').value.split(',').map(s => s.trim()).filter(Boolean),
        featured: modal.querySelector('#epFeatured').checked,
        isNew: modal.querySelector('#epNew').checked
      };
      if (!data.name || !data.sku) { toast('Name and SKU required.', 'bad'); return; }
      if (p) { Object.assign(p, data); p.images = [data.image]; logActivity('Edit Product', `Updated product ${p.name} (${p.sku})`, { type: 'product', id: p.id }); toast('Product updated.', 'ok'); }
      else { state.products.push({ id: uid('P'), ...data, cost: 0, stock: 0, reserved: 0, unit: 'pc', reviews: [], images: [data.image], isActive: true, createdAt: new Date().toISOString() }); logActivity('New Product', `Added new product ${data.name} (${data.sku})`); toast('Product created.', 'ok'); }
      save(); modal.remove(); Showroom.refresh(); renderPage();
    });
  }

  function archiveProduct(id) {
    const p = productById(id); if (!p) return;
    const openOrders = state.orders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled' && (o.items || []).some(it => it.productId === id));
    const openJobs = state.productionJobs.filter(j => j.productId === id && j.status !== 'Done' && j.status !== 'Cancelled');
    if (openOrders.length || openJobs.length) {
      toast(`Cannot archive: ${openOrders.length} open order(s), ${openJobs.length} open job(s).`, 'bad');
      return;
    }
    if (!confirm(`Archive "${p.name}"? Restore from the Archive page.`)) return;
    p.isActive = false;
    state.archive.unshift({ id: uid('AR'), type: 'product', entity: JSON.parse(JSON.stringify(p)), deletedBy: session.userId, deletedAt: new Date().toISOString() });
    save(); logActivity('Archive Product', `Archived ${p.name} (${p.sku})`, { type: 'product', id: p.id }); Showroom.refresh(); renderPage();
    toast('Product archived.', 'ok');
  }

  /* ---------------- ADS MANAGER ---------------- */
  function renderAdsManager(el) {
    if (!state.ads.length) {
      state.ads.push({ id: 'AD1', title: 'Summer Sale', subtitle: 'On selected window blinds and roller blinds.', discount: 10, discountPercent: 10, productIds: [], startDate: '', endDate: '', ctaText: 'Shop Now', ctaLink: 'products', bgImage: '', active: true, createdAt: new Date().toISOString() });
      save();
    }
    const ad = state.ads[0];
    const selectedProducts = (ad.productIds || []).map(id => productById(id)).filter(Boolean);
    const activeNow = isAdActive(ad);
    el.innerHTML = `
      <div class="page-title"><div><h1>Ads Manager</h1><p>Manage the promotional popup shown to visitors.</p></div><button class="btn btn-primary" id="btnEditAd">Edit Ad</button></div>
      <div class="card">
        <div class="ad-card ad-card-featured">
          <div class="ad-card-bg" style="${ad.bgImage ? `background-image:url('${esc(ad.bgImage)}')` : ''}"></div>
          <div class="ad-card-body">
            <div class="ad-discount-tag">${Number(ad.discountPercent) || 10}% OFF</div>
            <h4>${esc(ad.title)}</h4><p>${esc(ad.subtitle || '')}</p>
            <div class="toolbar" style="margin-top:10px;margin-bottom:0">
              <span class="badge ${activeNow ? 'badge-solid' : 'badge-outline'}">${activeNow ? 'Active' : (ad.active ? 'Scheduled/Expired' : 'Inactive')}</span>
              <button class="btn btn-sm" data-toggle-ad="${ad.id}">${ad.active ? 'Deactivate' : 'Activate'}</button>
              <button class="btn btn-sm" data-preview-ad="${ad.id}">Preview Popup</button>
            </div>
          </div>
        </div>
        <div style="margin-top:14px"><div class="card-title" style="margin-bottom:8px">Products on Sale (${selectedProducts.length})</div>
          ${selectedProducts.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${selectedProducts.map(p => { const ep = effectivePrice(p); const belowCost = ep < p.cost; return `<span class="chip" style="${belowCost ? 'background:#fce8e6;color:#a50e0e' : ''}">${esc(p.name)} (${esc(p.sku)}) — ${peso(ep)}${belowCost ? ' ⚠ below cost' : ''}</span>`; }).join('')}</div>` : '<p class="muted">No products selected.</p>'}
        </div>
      </div>`;
    $('#btnEditAd').addEventListener('click', () => openAdEditor(ad.id));
    $$('[data-toggle-ad]').forEach(b => b.addEventListener('click', () => { const a = state.ads.find(x => x.id === b.dataset.toggleAd); if (!a) return; a.active = !a.active; save(); logActivity('Toggle Ad', `${a.active ? 'Activated' : 'Deactivated'} popup ad`); renderPage(); }));
    $$('[data-preview-ad]').forEach(b => b.addEventListener('click', () => previewAdPopup(b.dataset.previewAd)));
  }

  function openAdEditor(adId) {
    const ad = adId ? state.ads.find(a => a.id === adId) : state.ads[0];
    if (!ad) { toast('No ad to edit.', 'bad'); return; }
    const activeProducts = state.products.filter(p => p.isActive !== false);
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:720px">
        <div class="modal-head"><h3>Edit Popup Ad</h3><button data-close>✕</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="full">Title *<input id="adTitle" value="${esc(ad.title || '')}" /></label>
            <label class="full">Subtitle<textarea id="adSub" rows="2">${esc(ad.subtitle || '')}</textarea></label>
            <label>Discount %<input id="adDiscount" type="number" min="0" max="90" value="${Number(ad.discountPercent) || 10}" /></label>
            <label>CTA Text<input id="adCta" value="${esc(ad.ctaText || 'Shop Now')}" /></label>
            <label>CTA Link<select id="adLink"><option value="products" ${ad.ctaLink === 'products' ? 'selected' : ''}>Products</option><option value="contact" ${ad.ctaLink === 'contact' ? 'selected' : ''}>Contact</option></select></label>
            <label>Start Date<input id="adStart" type="date" value="${esc(ad.startDate || '')}" /></label>
            <label>End Date<input id="adEnd" type="date" value="${esc(ad.endDate || '')}" /></label>
          </div>
          <div style="margin-top:16px">
            <label style="font-size:12px;font-weight:600;color:var(--g700);display:block;margin-bottom:6px">Products on Sale</label>
            <div id="adProdList" style="max-height:200px;overflow-y:auto;border:1px solid var(--g300);border-radius:var(--radius-sm);padding:8px;background:var(--white)">${activeProducts.map(p => { const checked = (ad.productIds || []).includes(p.id); return `<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;font-weight:400;font-size:13px;cursor:pointer"><input type="checkbox" class="ad-prod-check" value="${p.id}" ${checked ? 'checked' : ''} style="width:auto;margin:0" /><img class="thumb" style="width:28px;height:28px" src="${esc(p.image || pickImg(p.category, p.sku))}" onerror="this.style.visibility='hidden'"><span>${esc(p.name)} <span class="muted mono" style="font-size:11px">${esc(p.sku)}</span> · ${peso(p.price)}</span></label>`; }).join('')}</div>
            <div id="adMarginWarn" class="alert-bad" style="display:none;margin-top:10px;font-size:12px"></div>
          </div>
        </div>
        <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="adSave">Save</button></div>
      </div>`;
    document.body.appendChild(modal);
    const checkMargins = () => {
      const pct = Number(modal.querySelector('#adDiscount').value) || 0;
      const checked = Array.from(modal.querySelectorAll('.ad-prod-check:checked')).map(c => c.value);
      const warns = [];
      checked.forEach(id => { const p = productById(id); if (!p) return; const ep = Math.round(p.price * (1 - pct / 100)); if (ep < p.cost) warns.push(`${p.name}: ${peso(ep)} is below cost ${peso(p.cost)}`); });
      const warnEl = modal.querySelector('#adMarginWarn');
      if (warns.length) { warnEl.style.display = 'block'; warnEl.innerHTML = '<strong>⚠ Margin Warning</strong><br>' + warns.map(esc).join('<br>'); }
      else { warnEl.style.display = 'none'; warnEl.innerHTML = ''; }
    };
    modal.querySelector('#adDiscount').addEventListener('input', checkMargins);
    modal.querySelectorAll('.ad-prod-check').forEach(c => c.addEventListener('change', checkMargins));
    setTimeout(checkMargins, 50);
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
    modal.querySelector('#adSave').addEventListener('click', () => {
      const title = modal.querySelector('#adTitle').value.trim(); if (!title) { toast('Title is required.', 'bad'); return; }
      ad.title = title;
      ad.subtitle = modal.querySelector('#adSub').value.trim();
      ad.discountPercent = Number(modal.querySelector('#adDiscount').value) || 10;
      ad.discount = ad.discountPercent;
      ad.ctaText = modal.querySelector('#adCta').value.trim() || 'Shop Now';
      ad.ctaLink = modal.querySelector('#adLink').value;
      ad.startDate = modal.querySelector('#adStart').value;
      ad.endDate = modal.querySelector('#adEnd').value;
      ad.productIds = Array.from(modal.querySelectorAll('.ad-prod-check:checked')).map(c => c.value);
      ad.updatedAt = new Date().toISOString();
      save(); logActivity('Edit Ad', `Updated popup ad "${ad.title}"`, { type: 'ad', id: ad.id });
      modal.remove(); renderPage(); Showroom.refresh(); toast('Ad saved.', 'ok');
    });
  }

  function previewAdPopup(adId) {
    const ad = state.ads.find(a => a.id === adId) || state.ads[0];
    if (!ad) return;
    const popup = $('#adPopup'), content = $('#adPopupContent');
    if (!popup || !content) return;
    content.style.backgroundImage = ad.bgImage ? `url('${ad.bgImage}')` : '';
    content.innerHTML = `<button class="ad-popup-close" id="adPopupClose" aria-label="Close ad">✕</button><div class="ad-popup-badge"><span class="pb-pct">${Number(ad.discountPercent) || 10}%</span><span>OFF</span></div><div class="ad-popup-middle"><h2 class="ad-popup-title">${esc(ad.title)}</h2><p class="ad-popup-sub">${esc(ad.subtitle || '')}</p></div><button class="ad-popup-cta" id="adPopupCta">${esc(ad.ctaText || 'Shop Now')} →</button>`;
    popup.hidden = false; document.body.style.overflow = 'hidden';
    const close = () => { popup.hidden = true; document.body.style.overflow = ''; };
    content.querySelector('#adPopupClose').addEventListener('click', close);
    popup.addEventListener('click', (e) => { if (e.target === popup) close(); });
  }

  /* ---------------- ACTIVITY LOG ---------------- */
  function renderLogs(el) {
    el.innerHTML = `
      <div class="page-title"><div><h1>Activity Log</h1><p>Record of all critical changes. Rows with a linked record are clickable.</p></div></div>
      <div class="card"><div class="tablewrap"><table><thead><tr><th>Date & Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>${state.logs.length ? state.logs.map(l => {
          const clickable = l.entityType && l.entityId;
          const dataAttrs = clickable ? `data-log-type="${esc(l.entityType)}" data-log-id="${esc(l.entityId)}" style="cursor:pointer"` : '';
          return `<tr ${dataAttrs}><td>${fmtDateTime(l.date)}</td><td><strong>${esc(l.user)}</strong> <span class="muted">(${esc(l.role)})</span></td><td>${esc(l.action)}</td><td class="muted">${esc(l.details)}</td></tr>`;
        }).join('') : '<tr><td colspan="4" class="empty-row">No activity logs yet.</td></tr>'}</tbody></table></div></div>`;
    $$('tr[data-log-type]').forEach(tr => tr.addEventListener('click', () => {
      const type = tr.dataset.logType, id = tr.dataset.logId;
      const navMap = { order: 'orders', product: 'products', job: 'production', material: 'inventory', materialRequest: 'production', finishedGood: 'production', ad: 'ads' };
      const page = navMap[type];
      if (page && can(page)) { currentPage = page; renderNav(); renderPage(); toast(`Navigated to ${page}`); }
    }));
  }

  /* ---------------- ARCHIVE ---------------- */
  function renderArchive(el) {
    const visible = state.archive.filter(a => session.role === 'admin' ? true : (session.role === 'marketing' ? a.type === 'product' : false));
    el.innerHTML = `
      <div class="page-title"><div><h1>Archive</h1><p>Deleted items kept here until permanently removed.</p></div></div>
      <div class="card">${visible.length ? visible.map(a => `<div class="mgr-product-item"><div class="mgr-product-info"><div class="name">${esc(a.entity.name || a.entity.title || a.entity.email || '—')}</div><div class="meta">Type: ${esc(a.type)} · Deleted ${fmtDateTime(a.deletedAt)} by ${esc(userById(a.deletedBy)?.name || '—')}</div></div><div class="mgr-product-actions"><button class="btn btn-sm" data-restore="${a.id}">Restore</button><button class="btn btn-sm btn-danger" data-pdestroy="${a.id}">Delete Forever</button></div></div>`).join('') : '<div class="empty-row">Archive is empty.</div>'}</div>`;
    $$('[data-restore]').forEach(b => b.addEventListener('click', () => {
      const a = state.archive.find(x => x.id === b.dataset.restore); if (!a) return;
      if (a.type === 'product') { const prod = state.products.find(x => x.id === a.entity.id); if (prod) prod.isActive = true; else state.products.push(a.entity); }
      if (a.type === 'customer') { const c = state.customers.find(x => x.id === a.entity.id); if (c) c.isActive = true; else state.customers.push(a.entity); }
      if (a.type === 'ad') { const ad = state.ads.find(x => x.id === a.entity.id); if (!ad) state.ads.push(a.entity); else ad.active = true; }
      state.archive = state.archive.filter(x => x.id !== a.id);
      save(); logActivity('Restore Archive', `Restored item from archive`); Showroom.refresh(); renderPage(); toast('Restored.', 'ok');
    }));
    $$('[data-pdestroy]').forEach(b => b.addEventListener('click', () => { if (!confirm('Permanently delete? Cannot be undone.')) return; state.archive = state.archive.filter(x => x.id !== b.dataset.pdestroy); save(); logActivity('Delete Archive', `Permanently deleted item from archive`); renderPage(); toast('Permanently deleted.', 'warn'); }));
  }

  /* ---------------- ORDERS ---------------- */
  let orderFilter = 'All';
  function renderOrders(el) {
    const statuses = ['All', 'Pending', 'In Production', 'Ready for Delivery', 'Completed', 'Cancelled'];
    const filtered = orderFilter === 'All' ? state.orders : state.orders.filter(o => o.status === orderFilter);
    el.innerHTML = `
      <div class="page-title"><div><h1>Orders</h1><p>Manage customer orders.</p></div>${can('orders') ? '<button class="btn btn-primary" id="btnNewOrder">+ New Order</button>' : ''}</div>
      <div class="tabs">${statuses.map(s => `<button class="tab-btn ${orderFilter === s ? 'active' : ''}" data-of="${s}">${s} <span class="muted">(${s === 'All' ? state.orders.length : state.orders.filter(o => o.status === s).length})</span></button>`).join('')}</div>
      <div class="card"><div class="tablewrap"><table><thead><tr><th>Order No.</th><th>Client</th><th>Status</th><th>Delivery</th><th>Total</th><th>Balance</th><th></th></tr></thead>
        <tbody>${filtered.length ? filtered.map(o => { const c = customerById(o.customerId); return `<tr><td class="mono">${esc(o.orderNo)}</td><td>${esc(c?.name || '—')}</td><td>${badge(o.status)}</td><td>${esc(o.deliveryMethod || '—')}</td><td>${peso(o.totalAmount)}</td><td>${peso(o.remainingBalance)}</td><td><button class="btn btn-sm" data-view="${o.id}">View</button></td></tr>`; }).join('') : '<tr><td colspan="7" class="empty-row">No orders.</td></tr>'}</tbody></table></div></div>`;
    $$('.tab-btn[data-of]').forEach(b => b.addEventListener('click', () => { orderFilter = b.dataset.of; renderPage(); }));
    const nb = $('#btnNewOrder'); if (nb) nb.addEventListener('click', () => openOrderModal());
    $$('[data-view]').forEach(b => b.addEventListener('click', () => openOrderView(b.dataset.view)));
  }

  function openOrderModal(orderId) {
    const order = orderId ? orderById(orderId) : null;
    const prefill = !order ? orderPrefill : null; orderPrefill = null;
    const customers = state.customers.filter(c => c.isActive);
    const products = state.products.filter(p => p.isActive);
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:720px">
        <div class="modal-head"><h3>${order ? 'Edit ' + esc(order.orderNo) : 'New Order'}</h3><button data-close>✕</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Client *<select id="oClient"><option value="">— Select —</option>${customers.map(c => `<option value="${c.id}" ${(order && order.customerId === c.id) || (prefill && prefill.customerId === c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
            <label>Lead Source<select id="oLead"><option>Facebook</option><option>Walk-in</option><option>Referral</option><option>Website</option><option>Other</option></select></label>
            <label>Delivery<select id="oDelivery"><option>Pickup</option><option>Delivery</option><option>Installation</option></select></label>
            <label>Payment Mode<select id="oPayMode"><option>Cash</option><option>GCash</option><option>Bank Transfer</option><option>Card</option></select></label>
          </div>
          <h3 style="margin:20px 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--g500)">Order Items</h3>
          <div id="oItems"></div>
          <button class="btn btn-sm" id="oAddItem" style="margin-top:8px">+ Add Item</button>
          <div class="form-grid" style="margin-top:20px"><label>Amount Paid<input id="oPaid" type="number" min="0" step="0.01" value="0" /></label><label>Notes<textarea id="oNotes" rows="2"></textarea></label></div>
          <div style="margin-top:16px;padding:14px;background:var(--g50);border-radius:8px">
            <div style="display:flex;justify-content:space-between"><span>Total:</span><strong id="oTotal">₱0.00</strong></div>
            <div style="display:flex;justify-content:space-between"><span>Balance:</span><strong id="oBalance">₱0.00</strong></div>
          </div>
        </div>
        <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="oSave">${order ? 'Save' : 'Create'}</button></div>
      </div>`;
    document.body.appendChild(modal);
    const itemsEl = modal.querySelector('#oItems');
    const addItemRow = (productId = '', qty = 1, price = null) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:2fr 80px 110px 40px;gap:8px;margin-bottom:8px;align-items:center';
      row.innerHTML = `<select class="it-prod"><option value="">— Product —</option>${products.map(p => { const ep = effectivePrice(p); const ad = getActiveAdForProduct(p.id); const avail = availableStock(p); const statusTag = avail <= 0 ? ' — ⚠ NO AVAIL' : avail < p.reorder ? ' — low avail' : ''; const label = ad ? `${p.name} (${p.sku}) — ${peso(ep)} SALE` : `${p.name} (${p.sku})`; return `<option value="${p.id}" data-price="${ep}" data-avail="${avail}" ${productId === p.id ? 'selected' : ''}>${esc(label + ' [' + avail + ' avail' + statusTag + ']')}</option>`; }).join('')}</select><input class="it-qty" type="number" min="1" value="${qty}" /><input class="it-price" type="number" min="0" step="0.01" value="${price != null ? price : 0}" /><button class="btn btn-sm btn-danger">✕</button>`;
      row.querySelector('.it-prod').addEventListener('change', (e) => { const opt = e.target.selectedOptions[0]; if (opt && opt.dataset.price) row.querySelector('.it-price').value = opt.dataset.price; recalc(); });
      row.querySelector('.it-qty').addEventListener('input', recalc);
      row.querySelector('.it-price').addEventListener('input', recalc);
      row.querySelector('.btn-danger').addEventListener('click', () => { row.remove(); recalc(); });
      itemsEl.appendChild(row);
    };
    (order?.items || []).forEach(it => addItemRow(it.productId, it.qty, it.price));
    if (!order) {
      const pp = prefill && prefill.productId ? productById(prefill.productId) : null;
      if (pp && pp.isActive) addItemRow(pp.id, 1, effectivePrice(pp)); else addItemRow();
      if (prefill) {
        if (prefill.leadSource) modal.querySelector('#oLead').value = prefill.leadSource;
        if (prefill.notes) modal.querySelector('#oNotes').value = prefill.notes;
      }
    }
    function recalc() {
      const items = Array.from(itemsEl.children).map(r => ({ productId: r.querySelector('.it-prod').value, qty: Number(r.querySelector('.it-qty').value) || 0, price: Number(r.querySelector('.it-price').value) || 0 }));
      const total = items.reduce((s, it) => s + it.qty * it.price, 0);
      const paid = Number(modal.querySelector('#oPaid').value) || 0;
      modal.querySelector('#oTotal').textContent = peso(total);
      modal.querySelector('#oBalance').textContent = peso(total - paid);
    }
    modal.querySelector('#oPaid').addEventListener('input', recalc);
    modal.querySelector('#oAddItem').addEventListener('click', () => addItemRow());
    recalc();
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
    modal.querySelector('#oSave').addEventListener('click', () => {
      const customerId = modal.querySelector('#oClient').value; if (!customerId) { toast('Select a client.', 'bad'); return; }
      const items = Array.from(itemsEl.children).map(r => ({ productId: r.querySelector('.it-prod').value, qty: Number(r.querySelector('.it-qty').value) || 0, price: Number(r.querySelector('.it-price').value) || 0 })).filter(it => it.productId && it.qty > 0);
      if (!items.length) { toast('Add at least one item.', 'bad'); return; }
      const total = items.reduce((s, it) => s + it.qty * it.price, 0);
      const cogs = items.reduce((s, it) => { const p = productById(it.productId); return s + (p ? p.cost * it.qty : 0); }, 0);
      const paid = Number(modal.querySelector('#oPaid').value) || 0;
      if (order) {
        releaseReservation(order);
        Object.assign(order, { customerId, items, leadSource: modal.querySelector('#oLead').value, deliveryMethod: modal.querySelector('#oDelivery').value, paymentMode: modal.querySelector('#oPayMode').value, notes: modal.querySelector('#oNotes').value, totalAmount: total, cogs });
        if (paid > 0) { order.payments = order.payments || []; order.payments.push({ id: uid('PM'), date: new Date().toISOString(), amount: paid, method: modal.querySelector('#oPayMode').value, ref: 'Order edit', recordedBy: session.userId }); }
        recomputeOrderPayments(order); reserveForOrder(order);
        logActivity('Edit Order', `${order.orderNo} updated`, { type: 'order', id: order.id });
        toast('Order updated.', 'ok');
      } else {
        const newOrder = { id: uid('O'), orderNo: nextOrderNo(), customerId, items, leadSource: modal.querySelector('#oLead').value, deliveryMethod: modal.querySelector('#oDelivery').value, paymentMode: modal.querySelector('#oPayMode').value, notes: modal.querySelector('#oNotes').value, totalAmount: total, cogs, payments: paid > 0 ? [{ id: uid('PM'), date: new Date().toISOString(), amount: paid, method: modal.querySelector('#oPayMode').value, ref: 'Initial', recordedBy: session.userId }] : [], status: 'Pending', createdAt: new Date().toISOString(), createdBy: session.userId, sourceInquiryId: prefill ? (prefill.inquiryId || null) : null, sourceQueueId: prefill ? (prefill.queueId || null) : null };
        recomputeOrderPayments(newOrder);
        state.orders.push(newOrder);
        reserveForOrder(newOrder);
        if (newOrder.sourceInquiryId) { const inq = state.inquiries.find(x => x.id === newOrder.sourceInquiryId); if (inq) { inq.orderId = newOrder.id; inq.customerId = customerId; inq.status = 'Converted'; } }
        if (newOrder.sourceQueueId) { const q = state.queue.find(x => x.id === newOrder.sourceQueueId); if (q) { q.orderId = newOrder.id; q.customerId = customerId; q.status = 'Completed'; q.completedAt = new Date().toISOString(); } }
        logActivity('Create Order', `${newOrder.orderNo} for ${customerById(customerId)?.name || 'client'}`, { type: 'order', id: newOrder.id });
        pushNotification(['admin'], `New order ${newOrder.orderNo} (${peso(total)})`, { page: 'orders', entityId: newOrder.id });
        toast('Order created.', 'ok');
      }
      save(); modal.remove(); renderPage();
    });
  }

  function openOrderView(orderId) {
    const o = orderById(orderId); if (!o) return;
    const c = customerById(o.customerId);
    const statuses = ['Pending', 'In Production', 'Ready for Delivery', 'Completed', 'Cancelled'];
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:640px">
        <div class="modal-head"><h3>Order ${esc(o.orderNo)}</h3><button data-close>✕</button></div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">
            <div><div class="muted" style="font-size:11px;text-transform:uppercase">Client</div><strong>${esc(c?.name || '—')}</strong></div>
            <div><div class="muted" style="font-size:11px;text-transform:uppercase">Status</div>${badge(o.status)}</div>
            <div><div class="muted" style="font-size:11px;text-transform:uppercase">Created</div>${fmtDate(o.createdAt)}</div>
            <div><div class="muted" style="font-size:11px;text-transform:uppercase">Delivery</div>${esc(o.deliveryMethod || '—')}</div>
          </div>
          <div class="card-title">Items</div>
          <div class="tablewrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
            <tbody>${(o.items || []).map(it => {
              const p = productById(it.productId);
              const tags = [];
              if (it.needsProduction) tags.push('<span class="badge badge-dashed" style="font-size:10px">Will be produced</span>');
              if (Number(it.reservedQty) > 0) tags.push('<span class="badge badge-outline" style="font-size:10px">Reserved ' + it.reservedQty + '</span>');
              if ((it.unitIds || []).length) tags.push('<span class="badge badge-filled" style="font-size:10px">' + it.unitIds.length + ' unit(s) assigned</span>');
              return `<tr><td><div class="name-cell"><img class="thumb" src="${esc(p?.image || pickImg(p?.category, p?.sku))}" onerror="this.style.visibility='hidden'"><span>${esc(p?.name || '—')} ${tags.join(' ')}</span></div></td><td>${it.qty}</td><td>${peso(it.price)}</td><td>${peso(it.qty * it.price)}</td></tr>`;
            }).join('')}</tbody></table></div>
          <div style="margin-top:16px;padding:14px;background:var(--g50);border-radius:8px">
            <div style="display:flex;justify-content:space-between"><span>Total:</span><strong>${peso(o.totalAmount)}</strong></div>
            <div style="display:flex;justify-content:space-between"><span>Paid:</span><strong>${peso(o.amountPaid)}</strong></div>
            <div style="display:flex;justify-content:space-between"><span>Balance:</span><strong style="color:${o.remainingBalance > 0 ? 'var(--bad)' : 'var(--ok)'}">${peso(o.remainingBalance)}</strong></div>
          </div>
          <div class="card-title" style="margin-top:20px">Payments (${(o.payments || []).length})</div>
          <div class="tablewrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>By</th><th></th></tr></thead>
            <tbody>${(o.payments || []).length ? o.payments.map(p => `<tr style="${p.refunded ? 'opacity:.5' : ''}"><td>${fmtDateTime(p.date)}</td><td>${peso(p.amount)}</td><td>${esc(p.method)}</td><td>${esc(userById(p.recordedBy)?.name || '—')}</td><td>${!p.refunded && can('orders') ? `<button class="btn btn-sm btn-danger" data-refund-payment="${p.id}">Refund</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-row">No payments.</td></tr>'}</tbody></table></div>
          ${o.remainingBalance > 0 && o.status !== 'Cancelled' && can('orders') ? `<div class="toolbar" style="margin-top:12px"><input id="ovPayAmt" type="number" min="0.01" step="0.01" placeholder="Amount" style="max-width:130px" /><select id="ovPayMethod"><option>Cash</option><option>GCash</option><option>Bank Transfer</option><option>Card</option></select><button class="btn btn-primary" id="ovAddPay">+ Add Payment</button></div>` : ''}
          ${(can('orders') || session.role === 'production') ? `<div class="card-title" style="margin-top:20px">Update Status</div><div class="toolbar"><select id="ovStatus">${statuses.map(s => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="btn btn-primary" id="ovSaveStatus">Update</button></div>` : ''}
        </div>
        <div class="modal-foot">${o.status === 'Completed' && can('orders') ? `<button class="btn" id="ovAssignUnits">📦 Assign Units</button>` : ''}<button class="btn" data-close>Close</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
    const saveBtn = modal.querySelector('#ovSaveStatus');
    if (saveBtn) saveBtn.addEventListener('click', () => { updateOrderStatus(o.id, modal.querySelector('#ovStatus').value); modal.remove(); renderPage(); });
    const addPay = modal.querySelector('#ovAddPay');
    if (addPay) addPay.addEventListener('click', () => {
      const amt = Number(modal.querySelector('#ovPayAmt').value);
      if (!(amt > 0)) { toast('Amount must be > 0.', 'bad'); return; }
      if (amt > o.remainingBalance + 0.001) { toast('Amount exceeds balance.', 'bad'); return; }
      o.payments = o.payments || [];
      o.payments.push({ id: uid('PM'), date: new Date().toISOString(), amount: amt, method: modal.querySelector('#ovPayMethod').value, recordedBy: session.userId });
      recomputeOrderPayments(o); save();
      logActivity('Add Payment', `Payment ${peso(amt)} on ${o.orderNo}`, { type: 'order', id: o.id });
      toast('Payment recorded.', 'ok'); modal.remove(); openOrderView(o.id);
    });
    modal.querySelectorAll('[data-refund-payment]').forEach(b => b.addEventListener('click', () => {
      const pm = (o.payments || []).find(p => p.id === b.dataset.refundPayment); if (!pm || pm.refunded) return;
      if (!confirm(`Refund ${peso(pm.amount)}?`)) return;
      pm.refunded = true; pm.refundedAt = new Date().toISOString(); pm.refundedBy = session.userId;
      recomputeOrderPayments(o); save();
      logActivity('Refund Payment', `${peso(pm.amount)} refunded on ${o.orderNo}`, { type: 'order', id: o.id });
      toast('Payment refunded.', 'warn'); modal.remove(); openOrderView(o.id);
    }));
    const assignBtn = modal.querySelector('#ovAssignUnits');
    if (assignBtn) assignBtn.addEventListener('click', () => { modal.remove(); openUnitPickerForOrder(o.id); });
  }

  function updateOrderStatus(orderId, newStatus) {
    const o = orderById(orderId); if (!o) return;
    const prev = o.status;
    if (prev === newStatus) { toast('Already ' + newStatus); return; }

    if (newStatus === 'Cancelled' && prev !== 'Cancelled') {
      releaseReservation(o);
      state.productionJobs.filter(j => j.orderId === o.id && j.status !== 'Done').forEach(j => { j.status = 'Cancelled'; });
      o.cancelledAt = new Date().toISOString(); o.cancelledBy = session.userId; o.status = 'Cancelled';
      logActivity('Cancel Order', `Cancelled ${o.orderNo}`, { type: 'order', id: o.id });
      pushNotification(['sales', 'admin'], `Order ${o.orderNo} cancelled`, { page: 'orders', entityId: o.id });
      save(); toast('Order cancelled.', 'warn'); return;
    }

    if ((newStatus === 'In Production') && prev !== 'In Production' && prev !== 'Completed') {
      createProductionJobsForOrder(o);
    }

    if (newStatus === 'Completed' && prev !== 'Completed') {
      o.completedAt = new Date().toISOString();
      (o.items || []).forEach(it => {
        const p = productById(it.productId); if (!p) return;
        const rel = Number(it.reservedQty) || 0;
        p.reserved = Math.max(0, (Number(p.reserved) || 0) - rel);
        it.reservedQty = 0;
        const before = p.stock;
        p.stock = Math.max(0, p.stock - it.qty);
        state.stockMovements.push({ id: uid('M'), productId: p.id, type: 'Stock-Out', qty: -it.qty, before, after: p.stock, orderId: o.id, loggedBy: session.userId, date: new Date().toISOString(), reason: 'Order ' + o.orderNo });
      });
      const c = customerById(o.customerId);
      if (c) { c.totalOrders = (c.totalOrders || 0) + 1; c.lifetimeValue = (c.lifetimeValue || 0) + Number(o.totalAmount || 0); }
      let autoMarked = 0;
      (o.items || []).forEach(it => {
        const already = (it.unitIds || []).filter(id => unitIndex.has(id) && unitById(id).status === 'sold');
        if (already.length >= it.qty) return;
        const need = it.qty - already.length;
        const cands = state.units.filter(u => u.productId === it.productId && u.status === 'in stock').sort((a, b) => new Date(a.receivedAt || a.created) - new Date(b.receivedAt || b.created));
        const picked = cands.slice(0, need);
        picked.forEach(u => { u.status = 'sold'; u.orderId = o.id; u.soldAt = new Date().toISOString(); });
        it.unitIds = (it.unitIds || []).concat(picked.map(u => u.id));
        autoMarked += picked.length;
      });
      logActivity('Complete Order', `Completed ${o.orderNo}`, { type: 'order', id: o.id });
      pushNotification(['sales'], `Order ${o.orderNo} completed`, { page: 'orders', entityId: o.id });
      if (autoMarked > 0) {
        toast(`Order completed. ${autoMarked} unit(s) marked sold (FIFO).`, 'ok');
        if (confirm(`${autoMarked} unit(s) auto-marked via FIFO. Open unit picker to change?`)) setTimeout(() => openUnitPickerForOrder(o.id), 100);
      } else toast('Order completed. Stock deducted.', 'ok');
    } else {
      logActivity('Update Order', `Changed ${o.orderNo} → ${newStatus}`, { type: 'order', id: o.id });
      toast('Status: ' + newStatus);
    }
    o.status = newStatus; save();
  }

  function openUnitPickerForOrder(orderId) {
    const o = orderById(orderId); if (!o) return;
    if (o.status !== 'Completed') { toast('Assign units only after order is Completed.', 'bad'); return; }
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    const renderModal = () => {
      modal.innerHTML = `
        <div class="modal-box" style="max-width:720px">
          <div class="modal-head"><h3>Assign Units — ${esc(o.orderNo)}</h3><button data-close>✕</button></div>
          <div class="modal-body">
            <p class="muted" style="margin-top:0">For each line, select specific QR units. Leave blank to keep FIFO-assigned units.</p>
            ${(o.items || []).map((it, idx) => {
              const p = productById(it.productId);
              const assigned = (it.unitIds || []).filter(id => unitIndex.has(id));
              const inStock = state.units.filter(u => u.productId === it.productId && u.status === 'in stock').length;
              return `<div style="border:1px solid var(--g300);border-radius:8px;padding:12px;margin-bottom:10px"><div style="font-weight:600;margin-bottom:6px">${esc(p?.name || '—')} × ${it.qty} <span class="muted" style="font-size:12px;font-weight:400">(${inStock} in stock)</span></div><div class="toolbar" style="margin-bottom:6px"><input class="grow" placeholder="Scan or type unit ID, press Enter" data-scan-idx="${idx}" /><button class="btn btn-sm" data-fifo="${idx}">Auto-FIFO</button><button class="btn btn-sm btn-danger" data-clear="${idx}">Clear</button></div><div style="display:flex;flex-wrap:wrap;gap:6px">${assigned.length ? assigned.map(id => `<span class="chip">${esc(id)} <button data-rm="${idx}:${esc(id)}" style="border:0;background:none;cursor:pointer;color:var(--bad)">✕</button></span>`).join('') : '<span class="muted" style="font-size:12px">No units assigned.</span>'}</div></div>`;
            }).join('')}
          </div>
          <div class="modal-foot"><button class="btn" data-close>Close</button><button class="btn btn-primary" id="upSave">Save</button></div>
        </div>`;
      modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
      modal.querySelectorAll('[data-scan-idx]').forEach(inp => inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const idx = Number(inp.dataset.scanIdx); const code = inp.value.trim().toUpperCase(); const it = o.items[idx];
        const u = unitIndex.get(code);
        if (!u) { toast('Unknown unit: ' + code, 'bad'); return; }
        if (u.productId !== it.productId) { toast('Different product.', 'bad'); return; }
        if ((it.unitIds || []).includes(code)) { toast('Already assigned.', 'warn'); return; }
        if ((it.unitIds || []).length >= it.qty) { toast('Already has ' + it.qty + '.', 'bad'); return; }
        it.unitIds = (it.unitIds || []).concat(code); inp.value = ''; save(); renderModal();
      }));
      modal.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
        const [idxStr, id] = b.dataset.rm.split(':'); const idx = Number(idxStr); const it = o.items[idx];
        it.unitIds = (it.unitIds || []).filter(x => x !== id);
        const u = unitById(id);
        if (u && u.orderId === o.id && u.status === 'sold') { u.status = 'in stock'; u.orderId = null; u.soldAt = null; }
        save(); renderModal();
      }));
      modal.querySelectorAll('[data-fifo]').forEach(b => b.addEventListener('click', () => {
        const idx = Number(b.dataset.fifo); const it = o.items[idx];
        const existing = (it.unitIds || []).filter(id => unitIndex.has(id));
        const need = it.qty - existing.length;
        if (need <= 0) { toast('Already filled.', 'warn'); return; }
        const cands = state.units.filter(u => u.productId === it.productId && u.status === 'in stock').sort((a, b) => new Date(a.receivedAt || a.created) - new Date(b.receivedAt || b.created)).slice(0, need);
        it.unitIds = existing.concat(cands.map(u => u.id)); save(); renderModal();
      }));
      modal.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', () => {
        const idx = Number(b.dataset.clear); const it = o.items[idx];
        (it.unitIds || []).forEach(id => { const u = unitById(id); if (u && u.orderId === o.id) { u.status = 'in stock'; u.orderId = null; u.soldAt = null; } });
        it.unitIds = []; save(); renderModal();
      }));
      modal.querySelector('#upSave').addEventListener('click', () => {
        (o.items || []).forEach(it => { (it.unitIds || []).forEach(id => { const u = unitById(id); if (!u) return; u.status = 'sold'; u.orderId = o.id; u.soldAt = u.soldAt || new Date().toISOString(); }); });
        save(); logActivity('Assign Units', `Units assigned for ${o.orderNo}`, { type: 'order', id: o.id });
        toast('Unit assignments saved.', 'ok'); modal.remove(); renderPage();
      });
    };
    document.body.appendChild(modal);
    renderModal();
  }

  function createProductionJobsForOrder(o) {
    const shorts = shortItemsForOrder(o); if (!shorts.length) return;
    let created = 0;
    shorts.forEach(s => {
      const exists = state.productionJobs.find(j => j.orderId === o.id && j.sku === s.sku && j.status !== 'Done' && j.status !== 'Cancelled');
      if (exists) return;
      state.productionJobs.unshift({ id: uid('JOB'), orderId: o.id, orderNo: o.orderNo, customerId: o.customerId, productId: s.productId, name: s.name, sku: s.sku, qty: s.shortfall, dueDate: o.deliveryDate || null, status: 'Queued', createdAt: new Date().toISOString(), createdBy: session.userId, finishedGoodId: null });
      created++;
      (o.items || []).forEach(it => { if (it.productId === s.productId) it.needsProduction = true; });
    });
    if (created) {
      pushNotification(['production', 'admin'], `${created} production job(s) created for ${o.orderNo}`, { page: 'production', entityId: o.id });
      logActivity('Create Jobs', `${created} job(s) for ${o.orderNo}`, { type: 'order', id: o.id });
      toast(`${created} production job(s) queued.`, 'ok');
    }
  }

  /* ---------------- QUEUE ---------------- */
  function renderQueue(el) {
    const active = state.queue.filter(q => q.status !== 'Completed');
    const completed = state.queue.filter(q => q.status === 'Completed').slice(-10).reverse();
    el.innerHTML = `
      <div class="page-title"><div><h1>Customer Queue</h1><p>Walk-in and phone-in queue.</p></div><button class="btn btn-primary" id="btnAddQueue">+ Add to Queue</button></div>
      <div class="card"><div class="card-title">Active Queue (${active.length})</div>
        <div class="tablewrap"><table><thead><tr><th>Ticket</th><th>Customer</th><th>Contact</th><th>Assigned</th><th>Status</th><th>Wait</th><th></th></tr></thead><tbody>${active.length ? active.map(q => `<tr><td class="mono">${esc(q.ticketNo)}</td><td>${esc(q.customerName)}</td><td>${esc(q.contact || '—')}</td><td>${esc(userById(q.assignedStaffId)?.name || '—')}</td><td>${badge(q.status)}</td><td>${q.estWait || 10} min</td><td><button class="btn btn-sm" data-qs="${q.id}" data-qstatus="Being Served">Serve</button><button class="btn btn-sm btn-primary" data-qo="${q.id}">Create Order</button><button class="btn btn-sm" data-qs="${q.id}" data-qstatus="Completed">Done</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty-row">Queue is empty.</td></tr>'}</tbody></table></div>
      </div>
      <div class="card"><div class="card-title">Recently Completed</div>
        <div class="tablewrap"><table><thead><tr><th>Ticket</th><th>Customer</th><th>Assigned</th><th>Completed</th></tr></thead><tbody>${completed.length ? completed.map(q => `<tr><td class="mono">${esc(q.ticketNo)}</td><td>${esc(q.customerName)}</td><td>${esc(userById(q.assignedStaffId)?.name || '—')}</td><td>${fmtDateTime(q.completedAt)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty-row">No completed tickets.</td></tr>'}</tbody></table></div>
      </div>`;
    $('#btnAddQueue').addEventListener('click', () => openQueueModal());
    $$('[data-qs]').forEach(b => b.addEventListener('click', () => { const q = state.queue.find(x => x.id === b.dataset.qs); if (!q) return; q.status = b.dataset.qstatus; q.assignedStaffId = q.assignedStaffId || session.userId; if (q.status === 'Completed') q.completedAt = new Date().toISOString(); save(); renderPage(); toast('Ticket updated.', 'ok'); }));
    $$('[data-qo]').forEach(b => b.addEventListener('click', () => {
      const q = state.queue.find(x => x.id === b.dataset.qo); if (!q) return;
      let cust = (q.customerId && customerById(q.customerId)) || findCustomerByContact(q.contact, '') || state.customers.find(c => c.name.toLowerCase() === q.customerName.toLowerCase());
      if (!cust) cust = newCustomerFrom(q.customerName, q.contact || '', '', 'Walk-in');
      q.customerId = cust.id; save();
      orderPrefill = { customerId: cust.id, productId: null, queueId: q.id, leadSource: 'Walk-in', notes: '' };
      openOrderModal(null); toast('Order started for ' + cust.name, 'ok');
    }));
  }
  function openQueueModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `<div class="modal-box"><div class="modal-head"><h3>Add to Queue</h3><button data-close>✕</button></div><div class="modal-body"><div class="form-grid"><label>Customer Name *<input id="qName" required /></label><label>Contact<input id="qContact" /></label><label>Assigned Staff<select id="qStaff">${state.users.filter(u => u.active).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label><label>Est. Wait (min)<input id="qWait" type="number" value="10" min="1" /></label></div></div><div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="qSave">Add</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
    modal.querySelector('#qSave').addEventListener('click', () => {
      const name = modal.querySelector('#qName').value.trim(); if (!name) { toast('Name required.', 'bad'); return; }
      state.queue.push({ id: uid('Q'), ticketNo: nextTicketNo(), customerName: name, contact: modal.querySelector('#qContact').value.trim(), assignedStaffId: modal.querySelector('#qStaff').value, estWait: Number(modal.querySelector('#qWait').value) || 10, status: 'Waiting', createdAt: new Date().toISOString(), orderId: null, customerId: null });
      save(); modal.remove(); renderPage(); toast('Ticket added.', 'ok');
    });
  }

  /* ---------------- INVENTORY ---------------- */
  let invTab = 'list';
  function renderInventory(el) {
    el.innerHTML = `
      <div class="page-title"><div><h1>Inventory</h1><p>Stock list, movements, and raw materials.</p></div>${can('inventory') ? '<button class="btn btn-primary" id="btnStockIn">+ Stock-In</button>' : ''}</div>
      <div class="tabs">
        <button class="tab-btn ${invTab === 'list' ? 'active' : ''}" data-it="list">Stock List</button>
        <button class="tab-btn ${invTab === 'movements' ? 'active' : ''}" data-it="movements">Stock Movements</button>
        <button class="tab-btn ${invTab === 'materials' ? 'active' : ''}" data-it="materials">Raw Materials</button>
      </div>
      <div id="invPane"></div>`;
    $$('.tab-btn[data-it]').forEach(b => b.addEventListener('click', () => { invTab = b.dataset.it; renderPage(); }));
    const si = $('#btnStockIn'); if (si) si.addEventListener('click', openStockInModal);
    renderInvPane();
  }
  function renderInvPane() {
    const pane = $('#invPane');
    if (invTab === 'list') {
      pane.innerHTML = `<div class="card"><div class="toolbar"><input class="grow" id="invSearch" placeholder="Search products…" /><select id="invCat"><option value="">All categories</option>${[...new Set(state.products.map(p => p.category))].map(c => `<option>${esc(c)}</option>`).join('')}</select></div><div class="tablewrap"><table><thead><tr><th></th><th>Product</th><th>SKU</th><th>QTY</th><th>Reserved</th><th>Avail</th><th>Reorder</th><th>Status</th><th></th></tr></thead><tbody id="invBody"></tbody></table></div></div>`;
      const render = () => {
        const q = $('#invSearch').value.toLowerCase(); const cat = $('#invCat').value;
        const list = state.products.filter(p => { if (cat && p.category !== cat) return false; if (q && !(p.name + ' ' + p.sku).toLowerCase().includes(q)) return false; return true; });
        $('#invBody').innerHTML = list.map(p => `<tr><td><img class="thumb" src="${esc(p.image || pickImg(p.category, p.sku))}" onerror="this.style.visibility='hidden'"></td><td>${esc(p.name)}</td><td class="mono">${esc(p.sku)}</td><td><strong>${productStock(p)}</strong></td><td>${p.reserved || 0}</td><td><strong>${availableStock(p)}</strong></td><td>${p.reorder}</td><td>${badge(productStatus(p))}</td><td><button class="btn btn-sm" data-editp="${p.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty-row">No products.</td></tr>';
        $$('[data-editp]').forEach(b => b.addEventListener('click', () => openProductEditor(b.dataset.editp)));
      };
      $('#invSearch').addEventListener('input', render);
      $('#invCat').addEventListener('change', render);
      render();
    } else if (invTab === 'movements') {
      const moves = [...state.stockMovements].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 100);
      pane.innerHTML = `<div class="card"><div class="card-title">Recent Stock Movements</div><div class="tablewrap"><table><thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Before</th><th>After</th><th>Reference</th><th>By</th></tr></thead><tbody>${moves.length ? moves.map(m => { const p = productById(m.productId); return `<tr><td>${fmtDateTime(m.date)}</td><td>${esc(p?.name || '—')}</td><td>${esc(m.type)}</td><td><strong>${m.qty > 0 ? '+' : ''}${m.qty}</strong></td><td>${m.before}</td><td>${m.after}</td><td>${esc(m.reason || '—')}</td><td>${esc(userById(m.loggedBy)?.name || '—')}</td></tr>`; }).join('') : '<tr><td colspan="8" class="empty-row">No movements yet.</td></tr>'}</tbody></table></div></div>`;
    } else if (invTab === 'materials') {
      const canEdit = can('inventory');
      pane.innerHTML = `<div class="card"><div class="card-title">Raw Materials (${state.materials.length})</div>${canEdit ? `<div class="toolbar"><input class="grow" id="matName" placeholder="New material name" /><input id="matUnit" placeholder="unit" style="max-width:80px" value="pcs" /><input id="matStock" type="number" placeholder="stock" style="max-width:90px" value="0" /><input id="matReorder" type="number" placeholder="reorder" style="max-width:90px" value="10" /><button class="btn btn-primary" id="matAdd">+ Add</button></div>` : ''}<div class="tablewrap"><table><thead><tr><th>Material</th><th>Unit</th><th>Stock</th><th>Reorder</th><th>Status</th>${canEdit ? '<th>Adjust</th>' : ''}</tr></thead><tbody>${state.materials.length ? state.materials.map(m => { const st = m.stock <= 0 ? 'out of stock' : m.stock <= m.reorder ? 'low stock' : 'in stock'; return `<tr><td><strong>${esc(m.name)}</strong></td><td>${esc(m.unit)}</td><td>${m.stock}</td><td>${m.reorder}</td><td>${badge(st)}</td>${canEdit ? `<td><input type="number" data-mat-adj="${m.id}" value="${m.stock}" style="max-width:90px;padding:4px 8px" /><button class="btn btn-sm" data-mat-apply="${m.id}">Set</button></td>` : ''}</tr>`; }).join('') : '<tr><td colspan="6" class="empty-row">No materials.</td></tr>'}</tbody></table></div></div>`;
      if (canEdit) {
        $('#matAdd')?.addEventListener('click', () => { const name = $('#matName').value.trim(); if (!name) { toast('Name required.', 'bad'); return; } state.materials.push({ id: uid('MAT'), name, unit: $('#matUnit').value.trim() || 'pcs', stock: Number($('#matStock').value) || 0, reorder: Number($('#matReorder').value) || 10 }); save(); logActivity('Add Material', name); renderInvPane(); });
        $$('[data-mat-apply]').forEach(b => b.addEventListener('click', () => {
          const m = state.materials.find(x => x.id === b.dataset.matApply); if (!m) return;
          const v = Number(document.querySelector(`[data-mat-adj="${m.id}"]`).value);
          if (isNaN(v) || v < 0) { toast('Invalid.', 'bad'); return; }
          const before = m.stock; m.stock = v;
          save(); logActivity('Adjust Material', `${m.name}: ${before} → ${v}`, { type: 'material', id: m.id });
          if (v <= m.reorder) pushNotification(['admin', 'inventory'], `Low material: ${m.name} (${v} left)`, { page: 'inventory' });
          renderInvPane();
        }));
      }
    }
  }
  function openStockInModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `<div class="modal-box"><div class="modal-head"><h3>Record Stock-In</h3><button data-close>✕</button></div><div class="modal-body"><div class="form-grid"><label class="full">Product *<select id="siProduct"><option value="">— Select —</option>${state.products.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.sku)}) — ${p.stock} on hand</option>`).join('')}</select></label><label>Quantity *<input id="siQty" type="number" min="1" value="1" /></label><label>Reference<input id="siRef" placeholder="e.g. PO-2026-001" /></label><label class="full">Notes<input id="siNotes" /></label></div></div><div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="siSave">Record</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
    modal.querySelector('#siSave').addEventListener('click', () => {
      const pid = modal.querySelector('#siProduct').value;
      const qty = Number(modal.querySelector('#siQty').value) || 0;
      if (!pid || qty <= 0) { toast('Select product and quantity.', 'bad'); return; }
      const p = productById(pid); const before = p.stock; p.stock += qty;
      state.stockMovements.push({ id: uid('M'), productId: p.id, type: 'Stock-In', qty, before, after: p.stock, reason: modal.querySelector('#siRef').value || 'Stock-In', notes: modal.querySelector('#siNotes').value, loggedBy: session.userId, date: new Date().toISOString() });
      save(); logActivity('Stock-In', `Added ${qty} units to ${p.name}`); modal.remove();
      if (confirm(`Generate ${qty} QR unit(s) for ${p.name}?`)) {
        const ids = autoGenerateUnitsForProduct(p, qty, 'Stock-In');
        if (ids.length && confirm(`Add ${ids.length} label(s) to print sheet?`)) state.labelSheet = ids;
        save(); toast(`${ids.length} unit(s) generated.`, 'ok');
      }
      renderPage();
    });
  }

  /* ---------------- SALES + EXPENSES ---------------- */
  let salesTab = 'ledger';
  function renderSales(el) {
    el.innerHTML = `
      <div class="page-title"><div><h1>Sales Ledger</h1><p>Sales transactions and expense tracking.</p></div></div>
      <div class="tabs">
        <button class="tab-btn ${salesTab === 'ledger' ? 'active' : ''}" data-st="ledger">Transactions</button>
        <button class="tab-btn ${salesTab === 'expenses' ? 'active' : ''}" data-st="expenses">Expenses</button>
      </div>
      <div id="salesPane"></div>`;
    $$('.tab-btn[data-st]').forEach(b => b.addEventListener('click', () => { salesTab = b.dataset.st; renderSales(el); }));
    if (salesTab === 'ledger') {
      const completed = state.orders.filter(o => o.status === 'Completed');
      const fin = financials(null, null);
      $('#salesPane').innerHTML = `
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-label">Total Revenue</div><div class="kpi-val">${peso(fin.revenue)}</div></div>
          <div class="kpi"><div class="kpi-label">Total COGS</div><div class="kpi-val">${peso(fin.cogs)}</div></div>
          <div class="kpi"><div class="kpi-label">Gross Profit</div><div class="kpi-val">${peso(fin.gross)}</div></div>
          <div class="kpi"><div class="kpi-label">Expenses</div><div class="kpi-val">${peso(fin.expenses)}</div></div>
          <div class="kpi"><div class="kpi-label">Net Profit</div><div class="kpi-val">${peso(fin.net)}</div></div>
        </div>
        <div class="card"><div class="card-title">Transactions</div><div class="tablewrap"><table><thead><tr><th>Date</th><th>Order No.</th><th>Customer</th><th>Payment</th><th>Revenue</th></tr></thead>
          <tbody>${completed.length ? completed.map(o => { const c = customerById(o.customerId); const revenue = (o.payments || []).filter(p => !p.refunded).reduce((s, p) => s + Number(p.amount || 0), 0); return `<tr><td>${fmtDate(o.completedAt || o.createdAt)}</td><td class="mono">${esc(o.orderNo)}</td><td>${esc(c?.name || '—')}</td><td>${esc(o.paymentMode || 'Cash')}</td><td>${peso(revenue)}</td></tr>`; }).join('') : '<tr><td colspan="5" class="empty-row">No completed sales yet.</td></tr>'}</tbody></table></div></div>`;
    } else {
      const canEdit = can('sales') || can('dashboard');
      const list = [...state.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
      $('#salesPane').innerHTML = `
        <div class="card">
          <div class="card-title">Expenses (${list.length})
            ${canEdit ? '<button class="btn btn-sm btn-primary" id="expAdd">+ Add Expense</button>' : ''}
          </div>
          <div class="tablewrap"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Order/Job</th><th>Amount</th>${canEdit ? '<th></th>' : ''}</tr></thead>
            <tbody>${list.length ? list.map(e => {
              const linkedOrder = e.orderId ? orderById(e.orderId) : null;
              const linkedJob = e.jobId ? state.productionJobs.find(j => j.id === e.jobId) : null;
              const link = linkedOrder ? `<span class="mono" style="font-size:11px">${esc(linkedOrder.orderNo)}</span>` : linkedJob ? `<span class="mono" style="font-size:11px">${esc(linkedJob.orderNo || linkedJob.id)}</span>` : '—';
              return `<tr><td>${fmtDate(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.description || '—')}</td><td>${link}</td><td>${peso(e.amount)}</td>${canEdit ? `<td><button class="btn btn-sm" data-exp-edit="${e.id}">Edit</button><button class="btn btn-sm btn-danger" data-exp-arch="${e.id}">Archive</button></td>` : ''}</tr>`;
            }).join('') : `<tr><td colspan="${canEdit ? 6 : 5}" class="empty-row">No expenses recorded.</td></tr>`}</tbody></table></div>
        </div>`;
      if (canEdit) {
        $('#expAdd').addEventListener('click', () => openExpenseEditor(null));
        $$('[data-exp-edit]').forEach(b => b.addEventListener('click', () => openExpenseEditor(b.dataset.expEdit)));
        $$('[data-exp-arch]').forEach(b => b.addEventListener('click', () => archiveExpense(b.dataset.expArch)));
      }
    }
  }

  function openExpenseEditor(id) {
    const exp = id ? expenseById(id) : null;
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:560px">
        <div class="modal-head"><h3>${exp ? 'Edit Expense' : 'Add Expense'}</h3><button data-close>✕</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Date *<input id="expDate" type="date" value="${esc(exp?.date || today())}" /></label>
            <label>Category *<select id="expCat"><option>Utilities</option><option>Rent</option><option>Salaries</option><option>Materials</option><option>Transport</option><option>Marketing</option><option>Other</option></select></label>
            <label class="full">Description<input id="expDesc" value="${esc(exp?.description || '')}" /></label>
            <label>Amount *<input id="expAmt" type="number" step="0.01" min="0" value="${exp?.amount || 0}" /></label>
            <label>Order (optional)<select id="expOrder"><option value="">— None —</option>${state.orders.map(o => `<option value="${o.id}" ${exp?.orderId === o.id ? 'selected' : ''}>${esc(o.orderNo)}</option>`).join('')}</select></label>
          </div>
        </div>
        <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="expSave">Save</button></div>
      </div>`;
    document.body.appendChild(modal);
    if (exp) modal.querySelector('#expCat').value = exp.category;
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
    modal.querySelector('#expSave').addEventListener('click', () => {
      const data = {
        date: modal.querySelector('#expDate').value,
        category: modal.querySelector('#expCat').value,
        description: modal.querySelector('#expDesc').value,
        amount: Number(modal.querySelector('#expAmt').value) || 0,
        orderId: modal.querySelector('#expOrder').value || null,
        jobId: null
      };
      if (!data.date || !data.amount) { toast('Date and amount required.', 'bad'); return; }
      if (exp) {
        Object.assign(exp, data);
        logActivity('Edit Expense', `Updated expense ${exp.id}`, { type: 'expense', id: exp.id });
        toast('Expense updated.', 'ok');
      } else {
        state.expenses.push({ id: uid('E'), ...data });
        logActivity('Add Expense', `${data.category} — ${peso(data.amount)}`);
        toast('Expense added.', 'ok');
      }
      save(); modal.remove(); renderPage();
    });
  }

  function archiveExpense(id) {
    const exp = expenseById(id); if (!exp) return;
    if (!confirm(`Archive expense ${peso(exp.amount)}?`)) return;
    state.archive.unshift({ id: uid('AR'), type: 'expense', entity: JSON.parse(JSON.stringify(exp)), deletedBy: session.userId, deletedAt: new Date().toISOString() });
    state.expenses = state.expenses.filter(e => e.id !== id);
    save(); logActivity('Archive Expense', `Archived expense ${id}`); renderPage(); toast('Expense archived.', 'ok');
  }

  /* ---------------- REPORTS ---------------- */
  function renderReports(el) {
    el.innerHTML = `
      <div class="page-title"><div><h1>Reports</h1><p>Export business reports as PDF.</p></div></div>
      <div class="card">
        <div class="card-title">Available Reports</div>
        <div style="display:grid;gap:12px">
          <div class="alert-item"><div><div class="a-name">Monthly Sales Performance</div><div class="a-sku">Revenue, COGS, gross profit</div></div><button class="btn btn-sm btn-primary" data-report="sales">Export PDF</button></div>
          <div class="alert-item"><div><div class="a-name">Inventory Valuation</div><div class="a-sku">Stock, value, reorder status</div></div><button class="btn btn-sm btn-primary" data-report="inventory">Export PDF</button></div>
          <div class="alert-item"><div><div class="a-name">Customer Lifetime Value</div><div class="a-sku">Orders, revenue, lead source</div></div><button class="btn btn-sm btn-primary" data-report="customers">Export PDF</button></div>
          <div class="alert-item"><div><div class="a-name">Stock Movement Audit Trail</div><div class="a-sku">All stock-in, stock-out, adjustment</div></div><button class="btn btn-sm btn-primary" data-report="movements">Export PDF</button></div>
          <div class="alert-item"><div><div class="a-name">Financial Summary</div><div class="a-sku">Revenue, COGS, expenses, net profit</div></div><button class="btn btn-sm btn-primary" data-report="financials">Export PDF</button></div>
        </div>
      </div>`;
    $$('[data-report]').forEach(b => b.addEventListener('click', () => exportPdfReport(b.dataset.report)));
  }

  function exportPdfReport(type) {
    if (!window.jspdf) { toast('PDF library not loaded.', 'bad'); return; }
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const W = doc.internal.pageSize.getWidth();
    const M = 15; let y = M;
    doc.setFillColor(10, 10, 10); doc.rect(M, y, 16, 16, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('RGCA', M + 8, y + 10, { align: 'center' });
    doc.setTextColor(0, 0, 0); doc.setFontSize(14);
    doc.text('RGCA Interior Design Supplies', M + 22, y + 6);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('City of San Jose Del Monte, Bulacan, Philippines', M + 22, y + 11);
    const titles = { sales: 'Monthly Sales Performance', inventory: 'Inventory Valuation', customers: 'Customer Lifetime Value', movements: 'Stock Movement Audit Trail', financials: 'Financial Summary' };
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text(titles[type], W - M, y + 6, { align: 'right' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Generated: ' + new Date().toLocaleString('en-PH'), W - M, y + 11, { align: 'right' });
    y += 22; doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 8;

    const drawTable = (headers, rows) => {
      const usable = W - 2 * M;
      const colWidths = headers.map(() => usable / headers.length);
      doc.setFillColor(240, 240, 240); doc.rect(M, y, usable, 8, 'F');
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      headers.forEach((h, i) => { const x = M + colWidths.slice(0, i).reduce((a, b) => a + b, 0) + 2; doc.text(String(h).substring(0, 20), x, y + 5.5); });
      y += 8; doc.setFont('helvetica', 'normal');
      rows.forEach(row => { if (y > 270) { doc.addPage(); y = M; } row.forEach((cell, i) => { const x = M + colWidths.slice(0, i).reduce((a, b) => a + b, 0) + 2; doc.text(String(cell == null ? '' : cell).substring(0, 40), x, y + 5); }); y += 6; });
      return y;
    };

    if (type === 'sales') {
      const completed = state.orders.filter(o => o.status === 'Completed');
      const rows = completed.map(o => { const c = customerById(o.customerId); const revenue = (o.payments || []).filter(p => !p.refunded).reduce((s, p) => s + Number(p.amount || 0), 0); return [o.orderNo, fmtDate(o.completedAt || o.createdAt), c?.name || '—', peso(revenue), peso(o.cogs || 0), peso(revenue - (o.cogs || 0))]; });
      const fin = financials(null, null);
      drawTable(['Order No.', 'Date', 'Customer', 'Revenue', 'COGS', 'Gross Profit'], rows);
      y += 4; doc.setFont('helvetica', 'bold'); doc.text('Total Revenue: ' + peso(fin.revenue), M, y);
    } else if (type === 'inventory') {
      const rows = state.products.map(p => [p.sku, p.name, p.category, String(p.stock), String(p.reserved || 0), peso(p.cost), peso(p.stock * p.cost), productStatus(p)]);
      drawTable(['SKU', 'Product', 'Category', 'Qty', 'Reserved', 'Unit Cost', 'Value', 'Status'], rows);
      const totalVal = state.products.reduce((s, p) => s + (p.stock || 0) * (p.cost || 0), 0);
      y += 4; doc.setFont('helvetica', 'bold'); doc.text('Total Valuation: ' + peso(totalVal), M, y);
    } else if (type === 'customers') {
      const rows = state.customers.map(c => [c.clientCode, c.name, c.phone, c.email, c.leadSource, String(c.totalOrders || 0), peso(c.lifetimeValue || 0)]);
      drawTable(['Client ID', 'Name', 'Phone', 'Email', 'Source', 'Orders', 'LTV'], rows);
    } else if (type === 'movements') {
      const moves = [...state.stockMovements].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 100);
      const rows = moves.map(m => { const p = productById(m.productId); return [fmtDate(m.date), p?.name || '—', m.type, String(m.qty), String(m.before), String(m.after), userById(m.loggedBy)?.name || '—']; });
      drawTable(['Date', 'Product', 'Type', 'Qty', 'Before', 'After', 'By'], rows);
    } else if (type === 'financials') {
      const fin = financials(null, null);
      drawTable(['Metric', 'Amount'], [
        ['Total Revenue (payments received)', peso(fin.revenue)],
        ['Cost of Goods Sold', peso(fin.cogs)],
        ['Gross Profit', peso(fin.gross)],
        ['Operating Expenses', peso(fin.expenses)],
        ['Net Profit', peso(fin.net)]
      ]);
    }

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Page ${i} of ${pages} · Generated by ${session.name}`, W / 2, 290, { align: 'center' }); }
    doc.save(`RGCA_${type}_${today()}.pdf`); toast('PDF report downloaded.', 'ok');
  }

  /* ---------------- CUSTOMERS / USERS ---------------- */
  function renderCustomers(el) {
    el.innerHTML = `
      <div class="page-title"><div><h1>Customer Directory</h1><p>All clients and prospects.</p></div>${can('customers') ? '<button class="btn btn-primary" id="btnNewCust">+ New Customer</button>' : ''}</div>
      <div class="card"><div class="toolbar"><input class="grow" id="custSearch" placeholder="Search customers…" /></div><div class="tablewrap"><table><thead><tr><th>Client ID</th><th>Name</th><th>Contact</th><th>Email</th><th>Source</th><th>Orders</th><th>LTV</th><th></th></tr></thead><tbody id="custBody"></tbody></table></div></div>`;
    const render = () => {
      const q = $('#custSearch').value.toLowerCase();
      const list = state.customers.filter(c => !q || (c.name + ' ' + c.email + ' ' + c.phone).toLowerCase().includes(q));
      $('#custBody').innerHTML = list.map(c => `<tr><td class="mono">${esc(c.clientCode)}</td><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.email)}</td><td>${esc(c.leadSource)}</td><td>${c.totalOrders || 0}</td><td>${peso(c.lifetimeValue || 0)}</td><td>${can('customers') ? `<button class="btn btn-sm btn-danger" data-arch-cust="${c.id}">Archive</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="empty-row">No customers.</td></tr>';
      $$('[data-arch-cust]').forEach(b => b.addEventListener('click', () => archiveCustomer(b.dataset.archCust)));
    };
    $('#custSearch').addEventListener('input', render); render();
    const nc = $('#btnNewCust');
    if (nc) nc.addEventListener('click', () => {
      const modal = document.createElement('div'); modal.className = 'modal-backdrop';
      modal.innerHTML = `<div class="modal-box"><div class="modal-head"><h3>New Customer</h3><button data-close>✕</button></div><div class="modal-body"><div class="form-grid"><label class="full">Full Name *<input id="cName" required /></label><label>Contact<input id="cPhone" /></label><label>Email<input id="cEmail" type="email" /></label><label>Lead Source<select id="cLead"><option>Facebook</option><option>Walk-in</option><option>Referral</option><option>Website</option><option>Other</option></select></label></div></div><div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="cSave">Create</button></div></div>`;
      document.body.appendChild(modal);
      modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
      modal.querySelector('#cSave').addEventListener('click', () => {
        const name = modal.querySelector('#cName').value.trim(); if (!name) { toast('Name required.', 'bad'); return; }
        const code = 'CL-' + String(state.customers.length + 1).padStart(4, '0');
        state.customers.push({ id: uid('C'), clientCode: code, name, phone: modal.querySelector('#cPhone').value, email: modal.querySelector('#cEmail').value, leadSource: modal.querySelector('#cLead').value, totalOrders: 0, lifetimeValue: 0, isActive: true, createdAt: new Date().toISOString() });
        save(); modal.remove(); renderPage(); toast('Customer created.', 'ok');
      });
    });
  }

  function archiveCustomer(id) {
    const c = customerById(id); if (!c) return;
    const openOrders = state.orders.filter(o => o.customerId === id && o.status !== 'Completed' && o.status !== 'Cancelled');
    if (openOrders.length) { toast(`Cannot archive: ${openOrders.length} open order(s).`, 'bad'); return; }
    if (!confirm(`Archive "${c.name}"?`)) return;
    c.isActive = false;
    state.archive.unshift({ id: uid('AR'), type: 'customer', entity: JSON.parse(JSON.stringify(c)), deletedBy: session.userId, deletedAt: new Date().toISOString() });
    save(); logActivity('Archive Customer', `Archived ${c.name}`, { type: 'customer', id: c.id }); renderPage(); toast('Customer archived.', 'ok');
  }

  function renderUsers(el) {
    el.innerHTML = `
      <div class="page-title"><div><h1>User Management</h1><p>Staff accounts and roles.</p></div><button class="btn btn-primary" id="btnNewUser">+ New User</button></div>
      <div class="card"><div class="tablewrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${state.users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(ROLE_LABELS[u.role] || u.role)}</td><td>${u.active ? badge('Completed').replace('Completed', 'Active') : badge('Cancelled').replace('Cancelled', 'Inactive')}</td><td><button class="btn btn-sm" data-toggle-user="${u.id}">${u.active ? 'Deactivate' : 'Activate'}</button></td></tr>`).join('')}</tbody></table></div></div>`;
    $$('[data-toggle-user]').forEach(b => b.addEventListener('click', () => { const u = userById(b.dataset.toggleUser); if (!u) return; if (u.id === session.userId) { toast('Cannot deactivate yourself.', 'bad'); return; } u.active = !u.active; save(); renderPage(); toast(u.active ? 'Activated.' : 'Deactivated.', 'ok'); }));
    $('#btnNewUser').addEventListener('click', () => {
      const modal = document.createElement('div'); modal.className = 'modal-backdrop';
      modal.innerHTML = `<div class="modal-box"><div class="modal-head"><h3>New User</h3><button data-close>✕</button></div><div class="modal-body"><div class="form-grid"><label class="full">Full Name *<input id="uName" required /></label><label>Email *<input id="uEmail" type="email" required /></label><label>Password *<div class="pw-wrap"><input id="uPass" type="password" required /><button type="button" class="pw-toggle" data-pw="uPass">${EYE_OPEN_SVG}</button></div></label><label>Role<select id="uRole"><option value="admin">Administrator</option><option value="sales">Sales Staff</option><option value="inventory">Inventory Staff</option><option value="production">Production Staff</option><option value="marketing">Marketing Staff</option></select></label></div></div><div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="uSave">Create</button></div></div>`;
      document.body.appendChild(modal);
      modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
      modal.querySelector('#uSave').addEventListener('click', async () => {
        const name = modal.querySelector('#uName').value.trim(); const email = modal.querySelector('#uEmail').value.trim(); const pass = modal.querySelector('#uPass').value;
        if (!name || !email || !pass) { toast('All fields required.', 'bad'); return; }
        if (state.users.some(u => u.email === email)) { toast('Email already used.', 'bad'); return; }
        try {
          const res = await fetch('/api/users', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password: pass, role: modal.querySelector('#uRole').value })
          });
          if (!res.ok) throw new Error(await res.text());
          const created = await res.json();
          state.users.push(created); save();
          modal.remove(); renderPage(); toast('User created.', 'ok');
        } catch (e) { toast('Create failed: ' + e.message, 'bad'); }
      });
    });
  }

  function setupGlobalSearch() {
    const input = $('#globalSearch'); const results = $('#gsResults');
    if (!input || !results) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { results.hidden = true; return; }
      const orderHits = state.orders.filter(o => o.orderNo.toLowerCase().includes(q)).slice(0, 5);
      const productHits = state.products.filter(p => (p.name + ' ' + p.sku).toLowerCase().includes(q)).slice(0, 5);
      const custHits = state.customers.filter(c => (c.name + ' ' + c.email + ' ' + c.phone).toLowerCase().includes(q)).slice(0, 5);
      const unitHits = state.units.filter(u => u.id.toLowerCase().includes(q)).slice(0, 5);
      const inqHits = state.inquiries.filter(i => (i.name + ' ' + i.phone + ' ' + (i.email || '')).toLowerCase().includes(q)).slice(0, 3);
      const queueHits = state.queue.filter(qq => (qq.ticketNo + ' ' + qq.customerName).toLowerCase().includes(q)).slice(0, 3);
      const jobHits = state.productionJobs.filter(j => (j.name + ' ' + j.sku + ' ' + (j.orderNo || '')).toLowerCase().includes(q)).slice(0, 3);
      if (!orderHits.length && !productHits.length && !custHits.length && !unitHits.length && !inqHits.length && !queueHits.length && !jobHits.length) { results.innerHTML = '<div class="gs-empty">No results.</div>'; results.hidden = false; return; }
      results.innerHTML = `
        ${unitHits.length ? `<div class="gs-group"><div class="gs-group-label">Units</div>${unitHits.map(u => `<div class="gs-item" data-goto="scan"><span class="mono">${esc(u.id)}</span><span class="muted">${esc(u.name)}</span></div>`).join('')}</div>` : ''}
        ${orderHits.length ? `<div class="gs-group"><div class="gs-group-label">Orders</div>${orderHits.map(o => `<div class="gs-item" data-goto="orders"><span class="mono">${esc(o.orderNo)}</span><span class="muted">${esc(customerById(o.customerId)?.name || '')}</span></div>`).join('')}</div>` : ''}
        ${inqHits.length ? `<div class="gs-group"><div class="gs-group-label">Inquiries</div>${inqHits.map(i => `<div class="gs-item" data-goto="inquiries"><span>${esc(i.name)}</span><span class="muted mono">${esc(i.phone)}</span></div>`).join('')}</div>` : ''}
        ${queueHits.length ? `<div class="gs-group"><div class="gs-group-label">Queue</div>${queueHits.map(qq => `<div class="gs-item" data-goto="queue"><span class="mono">${esc(qq.ticketNo)}</span><span class="muted">${esc(qq.customerName)}</span></div>`).join('')}</div>` : ''}
        ${jobHits.length ? `<div class="gs-group"><div class="gs-group-label">Production Jobs</div>${jobHits.map(j => `<div class="gs-item" data-goto="production"><span>${esc(j.name)}</span><span class="muted mono">${esc(j.sku)}</span></div>`).join('')}</div>` : ''}
        ${productHits.length ? `<div class="gs-group"><div class="gs-group-label">Products</div>${productHits.map(p => `<div class="gs-item" data-goto="products"><span>${esc(p.name)}</span><span class="muted mono">${esc(p.sku)}</span></div>`).join('')}</div>` : ''}
        ${custHits.length ? `<div class="gs-group"><div class="gs-group-label">Clients</div>${custHits.map(c => `<div class="gs-item" data-goto="customers"><span>${esc(c.name)}</span><span class="muted mono">${esc(c.clientCode)}</span></div>`).join('')}</div>` : ''}
      `;
      results.hidden = false;
      results.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => { const mod = el.dataset.goto; if (can(mod)) { currentPage = mod; renderNav(); renderPage(); } results.hidden = true; input.value = ''; }));
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.global-search')) results.hidden = true; });
  }

  /* ---------------- SHOWROOM ---------------- */
  const Showroom = {
    init() { this.renderStats(); this.renderGrids(); this.renderFilters(); this.bind(); },
    refresh() { this.renderStats(); this.renderGrids(); this.renderFilters(); },
    renderStats() {
      const activeProducts = state.products.filter(p => p.isActive !== false);
      $('#pubProducts').textContent = activeProducts.length;
      const discountedIds = new Set();
      state.ads.filter(a => isAdActive(a)).forEach(a => { (a.productIds || []).forEach(id => { if (activeProducts.some(p => p.id === id)) discountedIds.add(id); }); });
      $('#pubAds').textContent = discountedIds.size;
      $('#pubNew').textContent = activeProducts.filter(p => p.isNew).length;
    },
    renderFilters() {
      const cats = [...new Set(state.products.map(p => p.category))];
      const sel = $('#pubCategory'); if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">All categories</option>' + cats.map(c => `<option>${esc(c)}</option>`).join('');
      sel.value = cur;
    },
    card(p) {
      const status = productStatus(p);
      const soldOut = availableStock(p) <= 0;
      const img = p.image || DEFAULT_IMG;
      const ep = effectivePrice(p);
      const ad = getActiveAdForProduct(p.id);
      const hasDiscount = ad && ep < p.price;
      return `<div class="pcard" data-pid="${p.id}">
        <div class="pcard-img">
          <img src="${esc(img)}" alt="${esc(p.name)}" onerror="this.onerror=null;this.src='${DEFAULT_IMG}'">
          ${p.isNew ? '<div class="pcard-tag">New</div>' : ''}
          ${hasDiscount ? '<div class="pcard-tag sale">Sale</div>' : (p.featured ? '<div class="pcard-tag promo">Featured</div>' : '')}
          ${soldOut ? '<div class="pcard-sold">SOLD</div>' : ''}
        </div>
        <div class="pcard-body"><div class="pcard-cat">${esc(p.category)}</div><div class="pcard-name">${esc(p.name)}</div>
          <div class="pcard-foot"><div class="pcard-price">${hasDiscount ? `<span class="price-sale">${peso(ep)}</span> <span class="price-original">${peso(p.price)}</span>` : peso(p.price)}</div><div class="pcard-stock">${soldOut ? 'Out of stock' : status === 'low stock' ? 'Low stock' : 'Available'}</div></div>
        </div>
      </div>`;
    },
    renderGrids() {
      const active = state.products.filter(p => p.isActive !== false);
      $('#featuredGrid').innerHTML = active.filter(p => p.featured).slice(0, 4).map(p => this.card(p)).join('') || '<p class="muted">No featured items.</p>';
      $('#newGrid').innerHTML = active.filter(p => p.isNew).slice(0, 4).map(p => this.card(p)).join('') || '<p class="muted">No new arrivals.</p>';
      $('#allGrid').innerHTML = this.filteredProducts().map(p => this.card(p)).join('') || '<p class="muted">No products match.</p>';
      $$('.pcard[data-pid]').forEach(card => card.addEventListener('click', () => openProductDetail(card.dataset.pid)));
    },
    filteredProducts() {
      const q = $('#pubSearch')?.value.toLowerCase() || '';
      const cat = $('#pubCategory')?.value || '';
      return state.products.filter(p => p.isActive !== false && (!cat || p.category === cat) && (!q || (p.name + ' ' + p.sku + ' ' + p.category).toLowerCase().includes(q)));
    },
    go(page) {
      $$('.ppage').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
      $$('.plink').forEach(b => b.classList.toggle('active', b.dataset.page === page));
      $$('.public-links').forEach(n => n.classList.remove('open'));
      window.scrollTo(0, 0);
    },
    bind() {
      $$('.plink').forEach(b => b.addEventListener('click', () => this.go(b.dataset.page)));
      $('#pubSearch')?.addEventListener('input', () => this.renderGrids());
      $('#pubCategory')?.addEventListener('change', () => this.renderGrids());
      $('#contactForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#cName').value.trim(); const phone = $('#cPhone').value.trim();
        if (normPhone(phone).length < 7) { toast('Enter a valid contact number.', 'bad'); return; }
        if (!name || !phone) { toast('Name and phone are required.', 'bad'); return; }
        state.inquiries.push({ id: uid('INQ'), createdAt: new Date().toISOString(), name, phone, email: $('#cEmail').value.trim(), interest: $('#cInterest').value.trim(), message: $('#cMessage').value.trim(), productId: (inquiryProductRef && $('#cInterest').value.includes(inquiryProductRef.sku)) ? inquiryProductRef.id : null, status: 'New', assignedTo: null, customerId: null, orderId: null });
        const newInq = state.inquiries[state.inquiries.length - 1];
        save(); pushNotification(['sales', 'admin'], `New website inquiry from ${name}`, { page: 'inquiries', entityId: newInq.id });
        inquiryProductRef = null;
        toast('Inquiry sent!', 'ok'); e.target.reset();
      });
      $('#burgerBtn').addEventListener('click', () => $('#publicLinks').classList.toggle('open'));
      const trackForm = document.getElementById('trackForm');
      if (trackForm) {
        trackForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const num = document.getElementById('trackOrderNo').value.trim();
          const phone = document.getElementById('trackPhone').value.trim();
          const box = document.getElementById('trackResult');
          const now = Date.now();
          if (trackLockUntil > now) { box.innerHTML = `<div class="alert-bad">Too many attempts. Please wait ${Math.ceil((trackLockUntil - now) / 1000)} seconds and try again.</div>`; return; }
          const o = state.orders.find(x => String(x.orderNo || '').toLowerCase() === num.toLowerCase());
          const c = o ? customerById(o.customerId) : null;
          if (!o || !c || !normPhone(phone) || normPhone(c.phone) !== normPhone(phone)) {
            trackFails++; if (trackFails >= 5) { trackLockUntil = now + 30000; trackFails = 0; }
            box.innerHTML = `<div class="alert-bad">We couldn't find an order matching that order number and phone number.</div>`; return;
          }
          trackFails = 0;
          const items = (o.items || []).map(it => { const p = productById(it.productId); return `<li>${esc(p?.name || '—')} × ${it.qty} — ${peso(it.qty * it.price)}</li>`; }).join('');
          box.innerHTML = `<div style="border:1px solid var(--g300);border-radius:8px;padding:14px;background:var(--white)">
            <div style="font-weight:600;margin-bottom:6px">Order ${esc(o.orderNo)}</div>
            <div style="margin-bottom:8px">Status: ${badge(o.status)}</div>
            <ul style="margin:8px 0;padding-left:18px">${items}</ul>
            <div><strong>Balance:</strong> ${peso(Number.isFinite(Number(o.remainingBalance)) ? Number(o.remainingBalance) : Math.max(0, Number(o.totalAmount || 0) - Number(o.amountPaid || 0)))}</div>
          </div>`;
        });
      }
    }
  };

  function openProductDetail(productId) {
    const p = productById(productId); if (!p) return;
    const detail = $('#productDetail');
    let selectedImg = p.image || DEFAULT_IMG;
    const getColorName = (c) => { if (!c) return ''; if (!c.startsWith('#')) return c.charAt(0).toUpperCase() + c.slice(1); const hex = c.toUpperCase(); const map = { '#0A0A0A': 'Black', '#000000': 'Black', '#FFFFFF': 'White', '#E5E5E5': 'White', '#8B7355': 'Brown', '#D4C9B8': 'Beige' }; return map[hex] || 'Custom'; };
    const render = () => {
      const ep = effectivePrice(p); const ad = getActiveAdForProduct(p.id); const hasDiscount = ad && ep < p.price;
      $('#pdContent').innerHTML = `<div class="pd-content-inner">
        <div><div class="pd-image"><img src="${esc(selectedImg)}" alt="${esc(p.name)}" onerror="this.onerror=null;this.src='${DEFAULT_IMG}'"></div>
          <div class="pd-thumbs">${(p.images || [p.image]).map(img => `<div class="pd-thumb ${img === selectedImg ? 'active' : ''}" data-img="${esc(img)}"><img src="${esc(img)}" onerror="this.onerror=null;this.src='${DEFAULT_IMG}'"></div>`).join('')}</div>
        </div>
        <div>
          <div class="pd-cat">${esc(p.category)}${hasDiscount ? ' · <span class="badge badge-solid" style="background:var(--bad);font-size:10px">SALE ' + ad.discountPercent + '% OFF</span>' : ''}</div>
          <h1 class="pd-name">${esc(p.name)}</h1>
          <div class="pd-price">${hasDiscount ? `<span class="price-sale">${peso(ep)}</span> <span class="price-original">${peso(p.price)}</span>` : peso(p.price)}</div>
          <div class="pd-bestfor"><div class="pd-bestfor-label">Best Used For</div><div class="pd-bestfor-text">${esc(p.bestFor || 'Best for everyday use and casual settings.')}</div></div>
          <div class="pd-desc-label">Description</div><div class="pd-desc">${esc(p.description || 'Premium interior solution crafted by RGCA.')}</div>
          <div class="pd-options">
            <div><div class="pd-opt-label">Available Sizes</div><div class="muted" style="font-size:14px;">${(p.sizes || []).join(', ') || 'Standard'}</div></div>
            <div><div class="pd-opt-label">Colors</div><div class="pd-opt-values" style="pointer-events:none">${(p.colors || []).map(c => `<div style="display:flex;align-items:center;gap:8px;background:var(--g50);padding:6px 12px;border-radius:999px;border:1px solid var(--g200)"><span style="display:inline-block;width:16px;height:16px;border-radius:50%;border:1px solid var(--g300);background:${esc(c)}"></span><span style="font-size:13px;font-weight:500">${esc(getColorName(c))}</span></div>`).join('')}</div></div>
          </div>
          <div class="toolbar" style="margin-top:24px"><button class="btn-black" id="btnInquire" style="flex:1">Inquire About This Product</button></div>
        </div>
      </div>`;
      $$('.pd-thumb').forEach(t => t.addEventListener('click', () => { selectedImg = t.dataset.img; render(); }));
      $('#btnInquire').addEventListener('click', () => { document.getElementById('productDetail').hidden = true; document.body.style.overflow = ''; Showroom.go('contact'); inquiryProductRef = { id: p.id, sku: p.sku }; $('#cInterest').value = p.name + ' (' + p.sku + ')'; });
    };
    render(); detail.hidden = false; document.body.style.overflow = 'hidden';
  }
  function closeProductDetail() { $('#productDetail').hidden = true; document.body.style.overflow = ''; }

  /* ---------------- LOGIN / SESSION ---------------- */
  function bindLogin() {
    $('#openLogin').addEventListener('click', () => { $('#loginModal').hidden = false; $('#loginError').hidden = true; $('#loginEmail').value = ''; $('#loginPass').value = ''; });
    $('#pdLogin')?.addEventListener('click', () => { $('#loginModal').hidden = false; });
    $('#closeLogin').addEventListener('click', () => { $('#loginModal').hidden = true; });
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await login($('#loginEmail').value.trim(), $('#loginPass').value);
      if (!r.ok) { const el = $('#loginError'); el.textContent = r.error; el.hidden = false; return; }
      $('#loginModal').hidden = true; enterAdmin();
    });
    $('#pdBack').addEventListener('click', closeProductDetail);
  }

  function enterAdmin() {
    closeProductDetail();
    $('#showroom').hidden = true; $('#app').hidden = false;
    $('#sbUserName').textContent = session.name;
    $('#sbUserRole').textContent = ROLE_LABELS[session.role];
    $('#sbAvatar').textContent = session.name.charAt(0).toUpperCase();
    $('#sbRoleLabel').textContent = ROLE_LABELS[session.role];
    currentPage = can('dashboard') ? 'dashboard' : (NAV.find(n => can(n.module))?.module || 'products');
    renderNav(); renderPage(); updateDate(); updateNotifDot();
    if (session.role === 'admin' || session.role === 'inventory') setTimeout(() => showStockAlertPopup(), 400);
  }
  function updateDate() { const d = new Date(); $('#tbDate').textContent = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
  function bindAdmin() {
    $('#btnLogout').addEventListener('click', async () => { if (confirm('Sign out?')) await logout(); });
    $('#toggleSidebar').addEventListener('click', () => { if (window.innerWidth < 900) $('#sidebar').classList.toggle('open'); else $('#sidebar').classList.toggle('collapsed'); });
    const notifBtn = $('#notifBtn');
    if (notifBtn) notifBtn.addEventListener('click', () => {
      const list = notificationsFor(session.role);
      list.forEach(n => n.read = true); save(); updateNotifDot();
      if (!list.length) { toast('No notifications.'); return; }
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.innerHTML = `<div class="modal-box"><div class="modal-head"><h3>Notifications</h3><div style="display:flex;gap:8px"><button class="btn btn-sm" id="markAllBtn">Mark All Read</button><button data-close>✕</button></div></div><div class="modal-body">${list.slice(0, 50).map(n => `<div class="stock-alert-item" style="cursor:${n.page ? 'pointer' : 'default'}" ${n.page ? `data-nav-page="${esc(n.page)}" data-nav-id="${esc(n.entityId || '')}"` : ''}><div><div class="a-name">${esc(n.message)}</div><div class="a-sku">${fmtDateTime(n.date)}</div></div></div>`).join('')}</div><div class="modal-foot"><button class="btn btn-primary" data-close>Close</button></div></div>`;
      document.body.appendChild(modal);
      modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
      modal.querySelectorAll('[data-nav-page]').forEach(el => el.addEventListener('click', () => { const p = el.dataset.navPage; if (can(p)) { currentPage = p; renderNav(); renderPage(); openRecord(p, el.dataset.navId); } modal.remove(); }));
      modal.querySelector('#markAllBtn').addEventListener('click', () => { markAllNotificationsRead(); modal.remove(); renderPage(); });
    });
  }

  /* ---------------- FINANCIALS ---------------- */
  function financials(startDate, endDate) {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    const completed = state.orders.filter(o => o.status === 'Completed');
    let revenue = 0, cogs = 0;
    completed.forEach(o => {
      (o.payments || []).forEach(pm => {
        if (pm.refunded) return;
        const d = new Date(pm.date);
        if (d >= start && d <= end) revenue += Number(pm.amount || 0);
      });
      const cd = new Date(o.completedAt || o.createdAt);
      if (cd >= start && cd <= end) cogs += Number(o.cogs || 0);
    });
    const expenses = state.expenses.filter(e => {
      const d = new Date(e.date); return d >= start && d <= end;
    }).reduce((s, e) => s + Number(e.amount || 0), 0);
    return { revenue, cogs, expenses, gross: revenue - cogs, net: revenue - cogs - expenses, start, end };
  }

  /* ---------------- PAYMENTS + RESERVATIONS ---------------- */
  function recomputeOrderPayments(o) {
    const paid = (o.payments || []).filter(p => !p.refunded).reduce((s, p) => s + Number(p.amount || 0), 0);
    o.amountPaid = paid;
    o.remainingBalance = Math.max(0, Number(o.totalAmount || 0) - paid);
  }
  function reserveForOrder(o) {
    if (!o || o.status === 'Completed' || o.status === 'Cancelled') return;
    (o.items || []).forEach(it => {
      const p = productById(it.productId); if (!p) return;
      const reserveQty = Math.min(it.qty, availableStock(p));
      p.reserved = (Number(p.reserved) || 0) + reserveQty;
      it.reservedQty = reserveQty;
    });
  }
  function releaseReservation(o) {
    if (!o) return;
    (o.items || []).forEach(it => {
      const p = productById(it.productId); if (!p) return;
      const rel = Number(it.reservedQty) || 0;
      p.reserved = Math.max(0, (Number(p.reserved) || 0) - rel);
      it.reservedQty = 0;
    });
  }
  function shortItemsForOrder(o) {
    const shorts = [];
    (o.items || []).forEach(it => {
      const p = productById(it.productId); if (!p) return;
      const avail = availableStock(p);
      if (it.qty > avail) shorts.push({ productId: p.id, name: p.name, sku: p.sku, shortfall: it.qty - avail, orderId: o.id, orderNo: o.orderNo });
    });
    return shorts;
  }
  function isAdActive(ad) {
    if (!ad.active) return false;
    const now = new Date();
    if (ad.startDate && new Date(ad.startDate + 'T23:59:59') < now) return false;
    if (ad.endDate && new Date(ad.endDate + 'T23:59:59') < now) return false;
    if (ad.startDate && new Date(ad.startDate) > now) return false;
    return true;
  }
  function getActiveAdForProduct(productId) {
    return state.ads.find(a => isAdActive(a) && Array.isArray(a.productIds) && a.productIds.includes(productId));
  }
  function effectivePrice(p) {
    const ad = getActiveAdForProduct(p.id);
    if (ad && Number(ad.discountPercent) > 0) return Math.max(0, Math.round(p.price * (1 - ad.discountPercent / 100)));
    return p.price;
  }
  function nextOrderNo() { const d = new Date(); const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); const n = String(state.orders.filter(o => o.orderNo.includes(ymd)).length + 1).padStart(4, '0'); return `ORD-${ymd}-${n}`; }
  function nextTicketNo() { const d = new Date(); const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); const n = String(state.queue.filter(q => q.ticketNo.includes(ymd)).length + 1).padStart(3, '0'); return `Q-${ymd}-${n}`; }
  function badge(status) {
    const cls = STATUS_BADGE[status] || 'outline';
    const icon = { 'out of stock': '✕', 'low stock': '⚠', 'in stock': '✓', 'overstock': '▤', 'Pending': '◔', 'In Production': '▶', 'Ready for Delivery': '◑', 'Completed': '✓', 'Cancelled': '✕', 'Waiting': '◔', 'Being Served': '▶', 'Queued': '◔', 'In Progress': '▶', 'Done': '✓' }[status] || '';
    return `<span class="badge badge-${cls}">${icon} ${esc(status)}</span>`;
  }

  /* ---------------- BOOT ---------------- */
  async function init() {
    await load();
    await loadScanSession();
    Showroom.init();
    bindLogin();
    bindAdmin();
    bindPasswordToggles();
    initPasswordToggleIcons();
    setupGlobalSearch();
    setTimeout(showPopupAd, 500);
    await restoreSession();
    if (session && state.users.find(u => u.id === session.userId)?.active) enterAdmin();
    window.addEventListener('beforeunload', () => { if (saveTimer) { clearTimeout(saveTimer); flushSaveBeacon(); } });
  }

  document.addEventListener('DOMContentLoaded', init);
  window.Showroom = Showroom;
})();