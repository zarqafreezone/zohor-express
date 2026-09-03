/* ============================================================
   الزهور اكسبرس — واجهة الزبون
   ============================================================ */
'use strict';

const CAT_IMG = {
  'بقالة': '/img/shops/grocery.jpg', 'مطعم': '/img/shops/restaurant.jpg',
  'لحوم ومجمدات': '/img/shops/butcher.jpg', 'خضار وفواكه': '/img/shops/vegetables.jpg',
  'مخبز - معجنات - حلويات': '/img/shops/bakery.jpg', 'تنك ماء': '/img/shops/watertank.jpg',
  'بوتيك وملابس': '/img/shops/boutique.jpg', 'الأحذية': '/img/shops/shoes.jpg', 'عطور واكسسوارات': '/img/shops/perfumes.jpg', 'خياطة': '/img/shops/tailor.jpg', 'عطارة': '/img/shops/herbs.jpg',
  'غاز - اسطوانات': '/img/shops/gas.jpg', 'محمص': '/img/shops/roastery.jpg',
  'ميكانيكي وكهربائي متنقل': '/img/shops/mechanic.jpg', 'توصيل ركاب - طلاب - رحلات': '/img/shops/passengers.jpg', 'موبايلات واكسسوارات وبطاقات شحن': '/img/shops/mobile.jpg',
  'اجهزة كهربائية والكترونيات': '/img/shops/electronics.jpg', 'صيانة ومقاولات': '/img/shops/maintenance.jpg',
  'دراي كلين': '/img/shops/dryclean.jpg', 'مياه شرب': '/img/shops/water.jpg',
  'أخرى': '/img/shops/spices.jpg',
};

let me = App.load('customer') || null;            // بيانات الزبون
let cart = App.loadLocal('cart') || {};           // {shopId: {productId: qty}}
let currentShop = null;                           // المحل المفتوح حالياً
let trackOrderId = null;
let allShops = [];                                // كل المحلات
let activeCat = 'الكل';                           // التصنيف المختار
let adsList = [];                                 // الإعلانات النشطة
let adIndex = 0;
let adTimer = null;
let DELIVERY_FEE = 1;                             // رسوم التوصيل (تُجلب من الخادم)

/* 🔊 مراقب تنبيهات الزبون: استلام السائق للطلب + وصوله لمنطقتك */
let statusWatchTimer = null;                      // مؤقت مستقل لا تتأثر به التنقلات
const lastStatusMap = {};                         // {orderId: آخر حالة شوفناها}
const arrivalDone = {};                           // {orderId: نبهنا أن السائق وصل؟}
let custCoords = null;                            // موقع الزبون (لحساب قرب السائق)

function notifyStatusChange(o) {
  const prev = lastStatusMap[o.id];
  lastStatusMap[o.id] = o.status;
  if (!prev || prev === o.status) return;
  if (o.status === 'picked_up') {
    ZhSounds.play('pickup');
    toast('🚀 السائق استلم طلبك وفي الطريق إليك', 'ok');
  } else if (o.status === 'delivered') {
    ZhSounds.play('arrived');
    toast('✅ وصل السائق إليك — تم التوصيل بنجاح', 'ok');
  }
}

function ensureCustCoords(cb) {
  if (custCoords) return cb();
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (p) => { custCoords = { lat: p.coords.latitude, lng: p.coords.longitude }; cb(); },
    () => { /* بدون إذن الموقع — يكفي تنبيه «تم التوصيل» */ },
    { enableHighAccuracy: true, maximumAge: 20000, timeout: 8000 }
  );
}

// مراقبة دائمة لطلبات الزبون النشطة — تنبيه صوتي فور تغيّر الحالة في أي شاشة
function startStatusWatch() {
  if (statusWatchTimer || !me) return;
  statusWatchTimer = setInterval(async () => {
    if (!me) return;
    try {
      const d = await App.get('/orders?customer=' + me.phone);
      const seen = {};
      d.orders.forEach((o) => {
        seen[o.id] = 1;
        notifyStatusChange(o);
        // 📍 تنبيه «السائق وصل منطقتك» حين يقترب 200 متر من موقع الزبون
        if (o.status === 'picked_up' && o.driverLocation && !arrivalDone[o.id]) {
          ensureCustCoords(() => {
            if (arrivalDone[o.id] || !custCoords) return;
            const m = distMeters(custCoords.lat, custCoords.lng, o.driverLocation.lat, o.driverLocation.lng);
            if (m <= 200) {
              arrivalDone[o.id] = true;
              ZhSounds.play('arrived');
              toast('📍 السائق وصل منطقتك — استعد للاستلام!', 'ok');
            }
          });
        }
      });
      Object.keys(lastStatusMap).forEach((id) => {
        if (!seen[id]) { delete lastStatusMap[id]; delete arrivalDone[id]; }
      });
    } catch { /* تجاهل */ }
  }, 7000);
}

/* ---------------- التنقل بين الشاشات ---------------- */

const views = ['login', 'home', 'shop', 'orders', 'track', 'account'];

function show(view) {
  stopPoll();
  if (adTimer) { clearInterval(adTimer); adTimer = null; }
  views.forEach((v) => {
    const el = document.getElementById('view-' + v);
    if (el) el.style.display = (v === view) ? '' : 'none';
  });
  document.getElementById('cart-bar-wrap').innerHTML = '';
  document.querySelectorAll('#nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.view === view);
  });
  window.scrollTo(0, 0);
}

/* ---------------- شاشة الدخول ---------------- */

function renderLogin() {
  show('login');
  if (me) fillCustForm('in', me);
}

function readCustForm(prefix) {
  const g = (id) => (document.getElementById(prefix + id) || { value: '' }).value.trim();
  return {
    name: g('-name'), phone: g('-phone'), phone2: g('-phone2'),
    area: g('-area'), street: g('-street'), building: g('-building'), landmark: g('-landmark'),
  };
}

function fillCustForm(prefix, c) {
  const set = (id, v) => { const el = document.getElementById(prefix + id); if (el) el.value = v || ''; };
  set('-name', c.name); set('-phone', c.phone); set('-phone2', c.phone2);
  set('-area', c.area); set('-street', c.street); set('-building', c.building); set('-landmark', c.landmark);
}

async function doLogin() {
  const f = readCustForm('in');
  if (f.name.length < 2) return toast('اكتب اسمك أولاً 🙂', 'bad');
  if (f.phone.replace(/\D/g, '').length < 9) return toast('اكتب رقم موبايل صحيح — مثال: 0791234567', 'bad');
  if (!f.area) return toast('اكتب الحي / المنطقة (مطلوب للتوصيل)', 'bad');
  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.textContent = 'جارٍ الدخول…';
  try {
    const d = await App.post('/customers/login', f);
    me = d.customer;
    App.save('customer', me);
    renderHome();
    if (maybeOpenPendingShop()) return; // كان بالانتظار من إعلان الصفحة الرئيسية
    toast('أهلاً ' + me.name + ' 🌸', 'ok');
  } catch (e) {
    toast(e.message, 'bad');
    btn.disabled = false;
    btn.textContent = 'ابدأ الطلب 🌸';
  }
}

/* ---------------- الإعلانات (مساحات إعلانية) ---------------- */

async function renderAds() {
  const wrap = document.getElementById('ads-strip');
  try {
    const d = await App.get('/ads');
    adsList = d.ads || [];
  } catch { adsList = []; }
  if (!adsList.length) { wrap.innerHTML = ''; return; }
  adIndex = 0;
  paintAd();
  if (adTimer) clearInterval(adTimer);
  adTimer = setInterval(() => {
    if (!adsList.length) return;
    adIndex = (adIndex + 1) % adsList.length;
    paintAd();
  }, 6000);
}

function paintAd() {
  const wrap = document.getElementById('ads-strip');
  if (!wrap || !adsList.length) return;
  const a = adsList[adIndex % adsList.length];
  wrap.innerHTML = `
    <div class="ad-banner" onclick="nextAd()">
      <span class="ad-tag">إعلان</span>
      <div class="flex1">
        <div class="ad-title">${escapeHtml(a.title)}</div>
        <div class="ad-body">${escapeHtml(a.body)}</div>
        ${a.shopId && a.shopName ? '<a class="ad-shop-link" href="#" onclick="event.preventDefault(); event.stopPropagation(); openShop(\'' + a.shopId + '\')">🏪 ' + escapeHtml(a.shopName) + ' — ادخل محله ←</a>' : ''}
      </div>
      <span class="ad-next">‹</span>
    </div>`;
}
function nextAd() {
  if (adsList.length < 2) return;
  adIndex = (adIndex + 1) % adsList.length;
  paintAd();
}

/* ---------------- قائمة المحلات + التصنيفات ---------------- */

async function renderHome() {
  show('home');
  document.getElementById('hdr-title').textContent = 'الزهور اكسبرس';
  document.getElementById('hdr-sub').textContent = 'أهلاً ' + (me ? me.name.split(' ')[0] : '') + ' 👋';
  renderAds();
  const grid = document.getElementById('shops-grid');
  grid.innerHTML = '<div class="empty">جارٍ تحميل المحلات…</div>';
  try {
    const d = await App.get('/shops');
    allShops = d.shops;
    if (d.deliveryFee) DELIVERY_FEE = +d.deliveryFee; // رسوم التوصيل الرسمية من الخادم
    document.getElementById('shops-count').textContent = allShops.length;

    // بناء تبويبات التصنيفات الموجودة فعلياً
    const cats = ['الكل', ...new Set(allShops.map((s) => s.category))];
    document.getElementById('cat-tabs').innerHTML = cats.map((c) =>
      `<button class="${c === activeCat ? 'active' : ''}" onclick="setCat('${escapeHtml(c).replace(/'/g, "\\'")}')">${c}</button>`
    ).join('');

    paintShops();

    // قسم العروض والتخفيضات
    try {
      const od = await App.get('/offers');
      paintOffers(od.offers || []);
    } catch { paintOffers([]); }
  } catch (e) {
    grid.innerHTML = `<div class="empty">⚠️ ${escapeHtml(e.message)}</div>`;
  }
}

function paintOffers(offers) {
  const wrap = document.getElementById('offers-section');
  if (!wrap) return;
  if (!offers.length) {
    wrap.innerHTML = '';
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  wrap.innerHTML = `
    <div class="section-title">🔥 عروض وتخفيضات <span class="count">${offers.length}</span></div>
    <div class="offers-grid">
      ${offers.slice(0, 12).map((of) => `
        <div class="offer-card" onclick="openShop('${of.shopId}')">
          <div class="o-disc">-${of.discount}%</div>
          ${of.product.image ? `<img class="o-img" src="${of.product.image}" alt="">` : `<div class="o-emoji">${of.product.emoji}</div>`}
          <div class="o-name">${escapeHtml(of.product.name)}</div>
          <div class="o-prices">
            <span class="o-old">${App.fmt(of.product.oldPrice)}</span>
            <b class="o-new">${App.fmt(of.product.price)}</b>
          </div>
          <div class="o-shop">${of.shopIcon} ${escapeHtml(of.shopName)}</div>
        </div>`).join('')}
    </div>
  `;
}

function setCat(c) { activeCat = c; renderHome(); }

function paintShops() {
  const grid = document.getElementById('shops-grid');
  const list = activeCat === 'الكل' ? allShops : allShops.filter((s) => s.category === activeCat);
  if (!list.length) {
    grid.innerHTML = '<div class="empty"><div class="e-icon">🏪</div><div class="e-title">لا توجد محلات في هذا التصنيف</div></div>';
    return;
  }
  grid.innerHTML = list.map((s) => `
    <div class="shop-card" onclick="openShop('${s.id}')">
      <div class="shop-photo${s.image ? '' : ' no-img'}${s.isOpen ? '' : ' closed'}">
        ${s.image ? `<img src="${s.image}" alt="${escapeHtml(s.name)}" loading="lazy">` : `<span class="ph-emoji">${s.icon}</span>`}
        <span class="open-flag ${s.isOpen ? 'on' : 'off'}">${s.isOpen ? '● مفتوح' : '● مغلق'}</span>
      </div>
      <div class="sp-body">
        <h3>${escapeHtml(s.name)}</h3>
        <div class="muted small">${escapeHtml(s.category)} • ${s.productCount} منتج • ⭐ ${s.rating}</div>
      </div>
    </div>
  `).join('');
}

/* ---------------- صفحة المحل ---------------- */

function cartOf(shopId) { return cart[shopId] || {}; }
function cartCount(shopId) { return Object.values(cartOf(shopId)).reduce((a, b) => a + b, 0); }
function cartSubtotal(shopId) {
  if (!currentShop || currentShop.id !== shopId) return 0;
  return currentShop.products.reduce((sum, p) => sum + (cartOf(shopId)[p.id] || 0) * p.price, 0);
}
function persistCart() { App.saveLocal('cart', cart); }

function changeQty(pid, delta) {
  if (!currentShop) return;
  const c = { ...cartOf(currentShop.id) };
  const q = (c[pid] || 0) + delta;
  if (q <= 0) delete c[pid]; else c[pid] = Math.min(99, q);
  cart[currentShop.id] = c;
  persistCart();
  renderShopPage();
}

async function openShop(id) {
  try {
    const d = await App.get('/shops/' + id);
    currentShop = d.shop;
    currentShop.image = currentShop.image || CAT_IMG[currentShop.category] || null;
    renderShopPage();
  } catch (e) { toast(e.message, 'bad'); }
}

function renderShopPage() {
  const s = currentShop;
  show('shop');
  document.getElementById('hdr-title').textContent = s.icon + ' ' + s.name;
  document.getElementById('hdr-sub').textContent = s.category + ' • ⭐ ' + s.rating;

  const c = cartOf(s.id);
  const count = cartCount(s.id);
  const sub = cartSubtotal(s.id);

  let html = `
    <button class="btn ghost sm" onclick="renderHome()">← رجوع للمحلات</button>
    <div style="height:10px"></div>
    ${s.image ? `<div class="shop-banner" style="background-image:url('${s.image}')"></div>` : ''}
    <div class="card">
      <div class="row between">
        <div>
          <h3 style="font-size:16px">${s.icon} ${escapeHtml(s.name)}</h3>
          <div class="muted small">${escapeHtml(s.category)} • ${s.products.length} منتج وخدمة</div>
        </div>
        ${s.isOpen
          ? '<span class="badge-open">● مفتوح للاستقبال</span>'
          : '<span class="badge-closed">● مغلق حالياً</span>'}
      </div>
    </div>
    <div class="card">
  `;

  if (!s.products.length) {
    html += '<div class="empty"><div class="e-icon">📦</div><div class="e-title">لا توجد منتجات بعد</div></div>';
  } else {
    html += s.products.map((p) => {
      const q = c[p.id] || 0;
      const disc = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
      return `
        <div class="product-row" style="${p.available ? '' : 'opacity:.45'}">
          ${p.image ? `<img class="p-thumb" src="${p.image}" alt="">` : `<div class="p-emoji">${p.emoji}</div>`}
          <div class="flex1">
            <div class="p-name">${escapeHtml(p.name)} ${p.kind === 'service' ? '<span class="chip info">🛠️ خدمة</span>' : ''} ${disc ? `<span class="chip warn">🔥 خصم ${disc}%</span>` : ''} ${p.available ? '' : '<span class="chip gray">غير متوفر</span>'}</div>
            <div class="p-unit">${p.kind === 'service' ? 'يُطلب كخدمة' : escapeHtml(p.unit)}</div>
          </div>
          <div class="p-price">
            ${disc ? `<span style="display:block; font-size:11px; font-weight:400; color:var(--mut); text-decoration:line-through">${App.fmt(p.oldPrice)}</span>` : ''}
            ${App.fmt(p.price)}
          </div>
          <div class="qty-ctl">
            ${q > 0 ? `<button onclick="changeQty('${p.id}',-1)">−</button><span class="q">${q}</span>` : ''}
            <button class="add" onclick="changeQty('${p.id}',1)" ${p.available && s.isOpen ? '' : 'disabled'}>+</button>
          </div>
        </div>
      `;
    }).join('');
  }
  html += '</div>';

  document.getElementById('view-shop').innerHTML = html;

  const barWrap = document.getElementById('cart-bar-wrap');
  if (count > 0 && s.isOpen) {
    barWrap.innerHTML = `
      <div class="cart-bar">
        <div onclick="openCheckout()">
          <span>🛒 ${count} صنف • ${App.fmt(sub)}</span>
          <b>إتمام الطلب ←</b>
        </div>
      </div>`;
  } else {
    barWrap.innerHTML = '';
  }
}

/* ---------------- إتمام الطلب ---------------- */

function openCheckout() {
  if (!me || !currentShop) return;
  const count = cartCount(currentShop.id);
  const sub = cartSubtotal(currentShop.id);
  const fee = DELIVERY_FEE;
  openSheet(`
    <h3>🧾 إتمام الطلب — ${escapeHtml(currentShop.name)}</h3>
    <div class="field">
      <label>الاسم</label>
      <input class="input" id="co-name" value="${escapeHtml(me.name)}">
    </div>
    <div class="field">
      <label>رقم الجوال</label>
      <input class="input" id="co-phone" value="${escapeHtml(me.phone)}" readonly style="background:#f1eefb">
    </div>
    <div class="field">
      <label>عنوان التوصيل</label>
      <input class="input" id="co-address" value="${escapeHtml(me.address)}" placeholder="الحي — الشارع — رقم البناية">
    </div>
    <div class="field">
      <label>ملاحظات (اختياري)</label>
      <textarea class="input" id="co-notes" placeholder="مثال: الخبز حَمص إذا سمحت 🙏"></textarea>
    </div>
    <div class="card" style="box-shadow:none; background:#faf8ff">
      <div class="item-line"><span>مجموع الطلبية</span><span class="pr">${App.fmt(sub)}</span></div>
      <div class="item-line"><span>رسوم التوصيل</span><span class="pr">${App.fmt(fee)}</span></div>
      <div class="item-line grand" style="font-weight:800"><span>الإجمالي (نقداً عند الاستلام)</span><span class="pr" style="color:var(--v1)">${App.fmt(sub + fee)}</span></div>
    </div>
    <button class="btn ok block" id="btn-place">✅ تأكيد الطلب</button>
    <div style="height:6px"></div>
    <button class="btn ghost block" onclick="closeSheet()">إلغاء</button>
  `);

  document.getElementById('btn-place').onclick = async () => {
    const name = document.getElementById('co-name').value.trim();
    const address = document.getElementById('co-address').value.trim();
    const notes = document.getElementById('co-notes').value.trim();
    if (!address) return toast('العنوان مطلوب', 'bad');
    const btn = document.getElementById('btn-place');
    btn.disabled = true;
    btn.textContent = 'جارٍ إرسال الطلب…';
    try {
      const items = Object.entries(cartOf(currentShop.id)).map(([productId, qty]) => ({ productId, qty }));
      const d = await App.post('/orders', {
        shopId: currentShop.id,
        customer: { id: me.id, name, phone: me.phone, phone2: me.phone2 || '', address },
        items, notes,
      });
      me = { ...me, name, address };
      App.save('customer', me);
      delete cart[currentShop.id];
      persistCart();
      closeSheet();
      toast('أُرسل طلبك بنجاح 🌸', 'ok');
      openTrack(d.order.id);
    } catch (e) {
      toast(e.message, 'bad');
      btn.disabled = false;
      btn.textContent = '✅ تأكيد الطلب';
    }
  };
}

// فتح محل طُلب من الإعلان المنبثق (حتى من الصفحة الرئيسية) فور توفر جلسة الزبون
function maybeOpenPendingShop() {
  let id = null;
  try { id = sessionStorage.getItem('zh_openShop'); } catch { /* لا شيء */ }
  if (id && me) {
    try { sessionStorage.removeItem('zh_openShop'); } catch { /* لا شيء */ }
    openShop(id);
    return true;
  }
  return false;
}

/* ---------------- 🔍 البحث الشامل ---------------- */

let searchTimer = null;
function initSearch() {
  const inp = document.getElementById('global-search');
  if (!inp || inp.dataset.bound) return;
  inp.dataset.bound = '1';
  const res = document.getElementById('search-results');
  const clearBtn = document.getElementById('search-clear');
  const restore = () => {
    res.style.display = 'none'; res.innerHTML = '';
    document.getElementById('shops-grid').style.display = '';
    const cats = document.getElementById('cat-tabs'); if (cats) cats.style.display = '';
    const off = document.getElementById('offers-section');
    if (off) off.style.display = off.innerHTML ? '' : 'none';
  };
  inp.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const qv = inp.value.trim();
    clearBtn.style.display = qv ? '' : 'none';
    if (qv.length < 2) return restore();
    searchTimer = setTimeout(async () => {
      try {
        const d = await App.get('/search?q=' + encodeURIComponent(qv));
        document.getElementById('shops-grid').style.display = 'none';
        const cats = document.getElementById('cat-tabs'); if (cats) cats.style.display = 'none';
        const off = document.getElementById('offers-section'); if (off) off.style.display = 'none';
        res.style.display = '';
        const shopCards = d.shops.map((x) => `
          <div class="list-link" onclick="openShop('${x.id}')">
            <div class="icon">${x.image ? `<img src="${x.image}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">` : x.icon}</div>
            <div class="flex1"><h4>${escapeHtml(x.name)}</h4><div class="sub">${escapeHtml(x.category)} • ${x.productCount} منتج وخدمة</div></div>
            <span class="muted">دخول ←</span>
          </div>`).join('');
        const itemCards = d.items.map((it) => `
          <div class="card sres-item" onclick="openShop('${it.shopId}')">
            <div class="p-emoji">${it.emoji}</div>
            <div class="flex1">
              <div class="p-name">${escapeHtml(it.name)} ${it.kind === 'service' ? '<span class="chip info">🛠️ خدمة</span>' : ''} ${it.discount ? `<span class="chip warn">🔥 -${it.discount}%</span>` : ''} ${it.available ? '' : '<span class="chip gray">غير متوفر</span>'}</div>
              <div class="sub">${it.shopIcon} ${escapeHtml(it.shopName)} • ${it.kind === 'service' ? 'يُطلب كخدمة' : escapeHtml(it.unit)}</div>
            </div>
            <div class="p-price">${it.oldPrice ? `<span style="display:block;font-size:11px;color:var(--mut);text-decoration:line-through">${App.fmt(it.oldPrice)}</span>` : ''}${App.fmt(it.price)}</div>
          </div>`).join('');
        res.innerHTML = `
          <button class="btn ghost sm" id="btn-clear-search" style="margin-bottom:8px">← رجوع لكل المحلات</button>
          ${d.shops.length ? `<div class="section-title">🏪 محلات (${d.shops.length})</div>${shopCards}` : ''}
          ${d.items.length ? `<div class="section-title">🛒 منتجات وخدمات (${d.items.length})</div>${itemCards}` : ''}
          ${!d.shops.length && !d.items.length ? '<div class="empty"><div class="e-icon">🔍</div><div class="e-title">لا نتائج مطابقة — جرّب كلمة أقصر</div></div>' : ''}`;
        document.getElementById('btn-clear-search').onclick = () => { inp.value = ''; inp.dispatchEvent(new Event('input')); inp.focus(); };
      } catch { /* تجاهل */ }
    }, 260);
  });
  clearBtn.onclick = () => { inp.value = ''; inp.dispatchEvent(new Event('input')); inp.focus(); };
}

/* ---------------- طلباتي (مع تبويبات وإعادة طلب) ---------------- */

let ordersTab = 'active'; // active | past
let ORDERS_CACHE = [];    // ذاكرة الطلبات الحالية

async function refreshBubble() {
  if (!me) return;
  try {
    const d = await App.get('/orders?customer=' + me.phone + '&active=1');
    const bubble = document.getElementById('orders-bubble');
    bubble.textContent = d.orders.length;
    bubble.style.display = d.orders.length ? '' : 'none';
  } catch { /* تجاهل */ }
}

async function renderOrders() {
  show('orders');
  document.getElementById('hdr-title').textContent = 'الزهور اكسبرس';
  document.getElementById('hdr-sub').textContent = 'طلباتي';
  const el = document.getElementById('view-orders');
  if (!me) return renderLogin();
  el.innerHTML = '<div class="empty">جارٍ التحميل…</div>';
  try {
    const d = await App.get('/orders?customer=' + me.phone);
    paintOrders(d.orders);
    setPoll(async () => {
      try {
        const dd = await App.get('/orders?customer=' + me.phone);
        paintOrders(dd.orders);
      } catch { /* تجاهل */ }
    }, 5000);
  } catch (e) {
    el.innerHTML = `<div class="empty">⚠️ ${escapeHtml(e.message)}</div>`;
  }
}

function paintOrders(orders) {
  ORDERS_CACHE = orders;
  const el = document.getElementById('view-orders');
  const active = orders.filter((o) => !['delivered', 'rejected', 'cancelled'].includes(o.status));
  const past = orders.filter((o) => ['delivered', 'rejected', 'cancelled'].includes(o.status));
  const list = ordersTab === 'active' ? active : past;
  const bubble = document.getElementById('orders-bubble');
  bubble.style.display = active.length ? '' : 'none';
  bubble.textContent = active.length;

  if (!orders.length) {
    el.innerHTML = `
      <div class="empty">
        <div class="e-icon">🧾</div>
        <div class="e-title">لا توجد طلبات بعد</div>
        تصفح المحلات واطلب أول طلبية 🌸
        <div style="margin-top:14px"><button class="btn" onclick="renderHome()">تصفح المحلات</button></div>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="tabs">
      <button class="${ordersTab === 'active' ? 'active' : ''}" onclick="ordersTab='active';paintOrders(ORDERS_CACHE)">النشطة (${active.length})</button>
      <button class="${ordersTab === 'past' ? 'active' : ''}" onclick="ordersTab='past';paintOrders(ORDERS_CACHE)">السابقة (${past.length})</button>
    </div>
    ${!list.length ? `<div class="empty"><div class="e-icon">${ordersTab === 'active' ? '🧾' : '📁'}</div><div class="e-title">${ordersTab === 'active' ? 'لا طلبات نشطة حالياً' : 'لا طلبات سابقة'}</div></div>`
      : list.map((o) => `
      <div class="card order-card" onclick="openTrack('${o.id}')">
        <div class="oc-top">
          <span class="oc-code">طلب #${o.code}</span>
          ${chip(o.status)}
        </div>
        <div class="oc-shop">${o.shopIcon} ${escapeHtml(o.shopName)}</div>
        <div class="oc-items">${o.items.map((i) => i.emoji + ' ' + escapeHtml(i.name) + ' ×' + i.qty).join(' • ')}</div>
        <div class="oc-foot">
          <span class="muted small">🕐 ${App.dt(o.createdAt)}</span>
          <span class="oc-total">${App.fmt(o.total)}</span>
        </div>
        ${o.status === 'delivered' ? `
          <div style="margin-top:9px" onclick="event.stopPropagation()">
            <button class="btn soft sm block" onclick="reorder('${o.id}')">🔁 إعادة نفس الطلب</button>
          </div>` : ''}
      </div>`).join('')}
  `;
}

// إعادة طلب سابق: يعيد الأصناف المتوفرة إلى السلة
async function reorder(orderId) {
  try {
    const o = ORDERS_CACHE.find((x) => x.id === orderId);
    if (!o) return;
    const d = await App.get('/shops/' + o.shopId);
    const shop = d.shop;
    if (!shop.isOpen) return toast('المحل مغلق حالياً', 'bad');
    const c = cartOf(o.shopId);
    let added = 0, missing = 0;
    for (const it of o.items) {
      const p = shop.products.find((x) => x.id === it.productId && x.available);
      if (p) { c[it.productId] = Math.min(99, (c[it.productId] || 0) + it.qty); added++; }
      else missing++;
    }
    if (!added) return toast('أصناف هذا الطلب لم تعد متوفرة', 'bad');
    cart[o.shopId] = c;
    persistCart();
    toast('أُضيفت ' + added + ' أصناف للسلة' + (missing ? ' (' + missing + ' غير متوفرة)' : '') + ' 🛒', 'ok');
    currentShop = shop;
    renderShopPage();
  } catch (e) { toast(e.message, 'bad'); }
}

/* ---------------- متابعة الطلب ---------------- */

async function openTrack(id) {
  trackOrderId = id;
  show('track');
  await renderTrack();
  setPoll(renderTrack, 3000);
}

async function renderTrack() {
  const el = document.getElementById('view-track');
  try {
    const d = await App.get('/orders/' + trackOrderId);
    const o = d.order;
    const drvLoc = d.driverLocation || d.order.driverLocation || null;
    notifyStatusChange(o); // 🔊 صوت عند الاستلام / عند التوصيل (بلا تكرار مع المراقب العام)
    document.getElementById('hdr-title').textContent = 'طلب #' + o.code;
    document.getElementById('hdr-sub').textContent = STATUS[o.status].label;

    const doneKeys = { pending: ['created'], accepted: ['created', 'accepted'], ready: ['created', 'accepted', 'ready'], assigned: ['created', 'accepted', 'ready', 'assigned'], picked_up: ['created', 'accepted', 'ready', 'assigned', 'picked_up'], delivered: ['created', 'accepted', 'ready', 'assigned', 'picked_up', 'delivered'] };
    const flow = doneKeys[o.status] || ['created'];
    const badState = ['rejected', 'cancelled'].includes(o.status);

    const steps = o.timeline.map((t) => {
      let cls = '';
      if (badState) cls = (t.key === o.status) ? 'bad' : 'done';
      else if (t.key === o.status) cls = 'now';
      else cls = flow.includes(t.key) ? 'done' : '';
      return `
        <div class="t-step ${cls}">
          <div class="dot">${cls === 'now' ? '⏺' : cls === 'done' ? '✓' : ''}</div>
          <div>
            <div class="t-lbl">${escapeHtml(t.label)}</div>
            <div class="t-time">${App.dt(t.at)}</div>
          </div>
        </div>`;
    }).join('');

    const canCancel = ['pending', 'accepted'].includes(o.status);
    const showMap = ['assigned', 'picked_up'].includes(o.status);

    el.innerHTML = `
      <button class="btn ghost sm" onclick="renderOrders()">← رجوع لطلباتي</button>
      <div style="height:10px"></div>
      <div class="card">
        <div class="row between" style="margin-bottom:6px">
          <h3>${o.shopIcon} ${escapeHtml(o.shopName)}</h3>
          ${chip(o.status)}
        </div>
        ${o.driverName ? `<div class="muted small" style="margin-bottom:4px">🛵 السائق: <b>${escapeHtml(o.driverName)}</b> ${d.driverPhone ? `<a class="chip info" dir="ltr" href="tel:${d.driverPhone}" style="text-decoration:none; margin-inline-start:6px">📞 اتصل بالسائق</a>` : ''}</div>` : ''}
        <div class="muted small">📍 ${escapeHtml(o.address)}</div>
        ${o.notes ? `<div class="muted small">📝 ${escapeHtml(o.notes)}</div>` : ''}
      </div>

      ${showMap ? `
      <div class="card">
        <div class="section-title" style="margin-top:0">🛵 موقع السائق المباشر</div>
        ${drvLoc ? `
          <div id="drv-map" class="map-box"></div>
          <div class="muted small" style="margin-top:6px">آخر تحديث: ${App.time(drvLoc.updatedAt)} — <a href="https://maps.google.com/?q=${drvLoc.lat},${drvLoc.lng}" target="_blank" style="color:var(--v1)">افتح في خرائط جوجل ↗</a></div>
        ` : '<div class="empty" style="padding:14px"><div class="e-icon">📡</div>السائق لم يُفعّل مشاركة الموقع بعد — سيظهر هنا فور تحركه</div>'}
      </div>` : ''}

      <div class="card">
        <div class="section-title" style="margin-top:0">🚚 حالة الطلب</div>
        <div class="timeline">${steps}</div>
        ${canCancel ? `<button class="btn bad block sm" style="margin-top:10px" id="btn-cancel">إلغاء الطلب</button>` : ''}
      </div>

      <div class="card">
        <div class="section-title" style="margin-top:0">🧾 تفاصيل الطلبية</div>
        ${o.items.map((i) => `
          <div class="item-line">
            <span class="nm">${i.emoji} ${escapeHtml(i.name)} <span class="muted small">(${escapeHtml(i.unit)}) ×${i.qty}</span></span>
            <span class="pr">${App.fmt(i.price * i.qty)}</span>
          </div>`).join('')}
        <div class="totals-box">
          <div class="item-line"><span>المجموع</span><span class="pr">${App.fmt(o.subtotal)}</span></div>
          <div class="item-line"><span>التوصيل</span><span class="pr">${App.fmt(o.deliveryFee)}</span></div>
          <div class="item-line grand"><span><b>الإجمالي</b> <span class="muted small">(${escapeHtml(o.payment)})</span></span><span class="pr"><b>${App.fmt(o.total)}</b></span></div>
        </div>
      </div>
    `;

    // خريطة السائق (Leaflet عبر الإنترنت — وفي المعاينة المعزولة يظهر البديل النصي)
    if (showMap && drvLoc) {
      const mapEl = document.getElementById('drv-map');
      if (mapEl && typeof L !== 'undefined') {
        try {
          const map = L.map('drv-map').setView([drvLoc.lat, drvLoc.lng], 15);
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
          L.marker([drvLoc.lat, drvLoc.lng]).addTo(map).bindPopup('🛵 موقع السائق').openPopup();
          setTimeout(() => map.invalidateSize(), 300);
        } catch { if (mapEl) mapEl.innerHTML = '<div class="empty" style="padding:12px">تعذر تحميل الخريطة — استخدم رابط خرائط جوجل بالأعلى</div>'; }
      } else if (mapEl) {
        mapEl.innerHTML = `<div class="empty" style="padding:12px">📡 إحداثيات السائق: ${drvLoc.lat}, ${drvLoc.lng}<br><a href="https://maps.google.com/?q=${drvLoc.lat},${drvLoc.lng}" target="_blank" style="color:var(--v1)">افتح الموقع في خرائط جوجل ↗</a></div>`;
      }
    }

    const cancelBtn = document.getElementById('btn-cancel');
    if (cancelBtn) {
      cancelBtn.onclick = async () => {
        if (!confirm('هل أنت متأكد من إلغاء الطلب؟')) return;
        try {
          await App.patch('/orders/' + o.id, { action: 'cancel' });
          toast('أُلغي الطلب', 'ok');
          renderTrack();
        } catch (e) { toast(e.message, 'bad'); }
      };
    }
  } catch (e) {
    el.innerHTML = `<div class="empty">⚠️ ${escapeHtml(e.message)}</div>`;
  }
}

/* ---------------- حسابي ---------------- */

function renderAccount() {
  show('account');
  document.getElementById('hdr-title').textContent = 'الزهور اكسبرس';
  document.getElementById('hdr-sub').textContent = 'بطاقتي التعريفية';
  const el = document.getElementById('view-account');
  el.innerHTML = `
    <div class="card profile-card">
      <div class="row" style="margin-bottom:10px">
        <div class="avatar">👤</div>
        <div class="flex1">
          <h3 style="font-size:17px">${escapeHtml(me.name)}</h3>
          <span class="chip vio">🛍️ زبون — منطقة جبل الزهور</span>
        </div>
      </div>
      <div class="prow2"><span class="pl">📱 موبايل أساسي</span><b dir="ltr">${escapeHtml(me.phone)}</b></div>
      <div class="prow2"><span class="pl">📲 موبايل إضافي</span><b dir="ltr">${me.phone2 ? escapeHtml(me.phone2) : '<span class="muted">غير مسجل</span>'}</b></div>
      <div class="prow2"><span class="pl">🏘️ الحي / المنطقة</span><b>${escapeHtml(me.area || '—')}</b></div>
      <div class="prow2"><span class="pl">🛣️ الشارع</span><b>${escapeHtml(me.street || '—')}</b></div>
      <div class="prow2"><span class="pl">🏢 البناية / الطابق</span><b>${escapeHtml(me.building || '—')}</b></div>
      <div class="prow2" style="border-bottom:none"><span class="pl">📍 علامة مميزة</span><b>${escapeHtml(me.landmark || '—')}</b></div>
    </div>
    <button class="btn block" id="ac-edit">✏️ تعديل بطاقتي</button>
    <div style="height:8px"></div>
    <button class="btn ghost block" id="ac-logout">🚪 تسجيل الخروج</button>
  `;
  document.getElementById('ac-edit').onclick = () => {
    openSheet(`
      <h3>✏️ تعديل بطاقتي التعريفية</h3>
      <div class="field"><label>الاسم</label><input class="input" id="cf-name" value="${escapeHtml(me.name)}"></div>
      <div class="field"><label>رقم الموبايل (ثابت)</label><input class="input" value="${escapeHtml(me.phone)}" readonly style="background:#f1eefb"></div>
      <div class="field"><label>رقم موبايل إضافي</label><input class="input" id="cf-phone2" inputmode="tel" value="${escapeHtml(me.phone2 || '')}"></div>
      <div class="field"><label>الحي / المنطقة</label><input class="input" id="cf-area" value="${escapeHtml(me.area || '')}"></div>
      <div class="grid2">
        <div class="field"><label>الشارع</label><input class="input" id="cf-street" value="${escapeHtml(me.street || '')}"></div>
        <div class="field"><label>البناية / الطابق</label><input class="input" id="cf-building" value="${escapeHtml(me.building || '')}"></div>
      </div>
      <div class="field"><label>علامة مميزة</label><input class="input" id="cf-landmark" value="${escapeHtml(me.landmark || '')}"></div>
      <button class="btn ok block" id="cf-save">💾 حفظ</button>
      <div style="height:6px"></div>
      <button class="btn ghost block" onclick="closeSheet()">إلغاء</button>
    `);
    document.getElementById('cf-save').onclick = async () => {
      const g = (id) => document.getElementById(id).value.trim();
      const name = g('cf-name');
      if (name.length < 2) return toast('الاسم قصير', 'bad');
      if (!g('cf-area')) return toast('الحي / المنطقة مطلوبة', 'bad');
      try {
        const d = await App.post('/customers/login', {
          name, phone: me.phone,
          phone2: g('cf-phone2'), area: g('cf-area'), street: g('cf-street'),
          building: g('cf-building'), landmark: g('cf-landmark'),
        });
        me = d.customer;
        App.save('customer', me);
        closeSheet();
        toast('حُدّثت بطاقتك ✅', 'ok');
        renderAccount();
      } catch (e) { toast(e.message, 'bad'); }
    };
  };
  document.getElementById('ac-logout').onclick = () => {
    App.clear('customer');
    me = null;
    renderLogin();
  };
}

/* ---------------- التهيئة ---------------- */

// ربط زر «ابدأ الطلب» (كان مفقوداً — هذا سبب عدم عمل الزر)
document.getElementById('btn-login').addEventListener('click', doLogin);
document.getElementById('in-landmark').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});
document.getElementById('in-phone').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('in-area').focus();
});

document.querySelectorAll('#nav a').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const v = a.dataset.view;
    if (v === 'home') renderHome();
    else if (v === 'orders') renderOrders();
    else if (v === 'account') renderAccount();
  });
});

initSearch(); // 🔍 البحث الشامل يعمل دائماً
if (me) {
  renderHome();
  refreshBubble();
  startStatusWatch(); // 🔊 تنبيهات الزبون تعمل في كل الشاشات
  maybeOpenPendingShop(); // 🏪 فتح محل مطلوب من إعلان منبثق سابق
} else {
  renderLogin();
}
