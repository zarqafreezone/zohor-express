/* ============================================================
   الزهور اكسبرس — لوحة البقالة / المحل
   ============================================================ */
'use strict';

let shop = App.load('shop') || null;
let dashTab = 'orders';

const el = (id) => document.getElementById(id);

function setHeader() {
  el('hdr-logo').textContent = shop.icon;
  el('hdr-title').textContent = shop.icon + ' ' + shop.name;
  el('hdr-sub').textContent = shop.category + (shop.isOpen ? ' — مفتوح' : ' — مغلق');
}

function daysLeft(ts) {
  return Math.max(0, Math.ceil((ts - Date.now()) / 86400000));
}

/* ---------------- شاشة الدخول ---------------- */

async function renderLogin() {
  document.getElementById('view-dash').style.display = 'none';
  document.getElementById('view-login').style.display = '';
  const list = el('shops-list');
  list.innerHTML = '<div class="empty">جارٍ التحميل…</div>';
  try {
    const d = await App.get('/shops?all=1');
    if (!d.shops.length) { list.innerHTML = '<div class="empty">لا توجد محلات مسجلة</div>'; return; }
    list.innerHTML = `
      <h3 style="margin-bottom:4px; font-size:15px">اختر محلك وأدخل رقمك السري:</h3>
      <p class="muted small" style="margin-bottom:8px">🔑 المحلات التجريبية رقمها السري: <b>1234</b></p>
      ${d.shops.map((x) => `
      <div class="list-link" onclick="askPass('${x.id}','${escapeHtml(x.name).replace(/'/g, '&#39;')}','${x.icon}')">
        <div class="icon">${x.icon}</div>
        <div class="flex1">
          <h4>${escapeHtml(x.name)} ${x.status === 'pending' ? '<span class="chip warn">قيد المراجعة</span>' : ''} ${x.status === 'blocked' ? '<span class="chip bad">موقوف</span>' : ''} ${x.status === 'active' && x.subscriptionActive === false ? '<span class="chip bad">اشتراك منتهي</span>' : ''}</div>
          <div class="sub">${escapeHtml(x.category)}</div>
        </div>
        <span class="muted">دخول ←</span>
      </div>
    `).join('')}`;
  } catch (e) {
    list.innerHTML = `<div class="empty">⚠️ ${escapeHtml(e.message)}</div>`;
  }
  loadCategories();
}

async function loadCategories() {
  try {
    const d = await App.get('/categories');
    el('rg-category').innerHTML = d.categories.map((c) => `<option>${c}</option>`).join('');
  } catch { /* تجاهل */ }
}

async function doLogin(id) {
  try {
    const d = await App.post('/shops/login', { shopId: id });
    shop = d.shop;
    App.save('shop', shop);
    renderDash();
    toast('أهلاً بك في ' + shop.name + ' 🌸', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

async function register() {
  const name = el('rg-name').value.trim();
  const owner = el('rg-owner').value.trim();
  const phone = el('rg-phone').value.trim();
  const category = el('rg-category').value;
  const password = el('rg-pass').value;
  if (!name || !owner) return toast('اكتب اسم المحل واسم المالك', 'bad');
  if (phone.replace(/\D/g, '').length < 9) return toast('اكتب رقم جوال صحيح — مثال: 0791234567', 'bad');
  if (password.length < 4) return toast('اختر رقماً سرياً (4 خانات على الأقل) — ستحتاجه كل مرة تدخل لوحتك', 'bad');
  try {
    const d = await App.post('/shops/register', { name, owner, phone, category, password });
    // دخول تلقائي على المحل الجديد — فترة تجريبية 14 يوم تعمل فوراً
    shop = d.shop;
    App.save('shop', shop);
    toast('🎉 أهلاً بك ' + shop.name + '! فترتك التجريبية 14 يوم بدأت — أضف منتجاتك الآن', 'ok');
    dashTab = 'products';
    renderDash();
  } catch (e) { toast(e.message, 'bad'); }
}

/* ---------------- لوحة المحل ---------------- */

async function renderDash() {
  document.getElementById('view-login').style.display = 'none';
  document.getElementById('view-dash').style.display = '';
  setHeader();

  // حالة الاشتراك
  const active = shop.subscriptionUntil && shop.subscriptionUntil > Date.now();
  el('sub-chip').className = 'chip ' + (active ? 'ok' : 'bad');
  el('sub-chip').textContent = active ? 'فعّال ✓' : 'غير فعّال';
  el('sub-lbl').textContent = active
    ? (shop.trial ? '🎟️ فترة تجريبية مجانية — متبقي ' + daysLeft(shop.subscriptionUntil) + ' يوم' : 'فعّال حتى ' + new Date(shop.subscriptionUntil).toLocaleDateString('ar') + ' — متبقي ' + daysLeft(shop.subscriptionUntil) + ' يوم (اشتراك 10 دنانير شهرياً)')
    : 'انتهى الاشتراك — جدّد عبر إدارة التطبيق (10 دنانير شهرياً)';

  // لافتة انتهاء الاشتراك
  let exp = document.getElementById('expired-banner');
  if (!active) {
    if (!exp) {
      exp = document.createElement('div');
      exp.id = 'expired-banner';
      exp.className = 'card';
      exp.style.cssText = 'background:var(--bad-bg); border:1.5px solid var(--bad); margin-bottom:12px';
      document.getElementById('sub-card').after(exp);
    }
    exp.innerHTML = '⛔ <b>انتهى اشتراك محلك</b> — مخفي حالياً عن الزبائن ولا يستقبل طلبات.<br>جدّد اشتراكك (10 دنانير/شهر) عبر إدارة التطبيق 📞';
  } else if (exp) exp.remove();

  el('sw-open').checked = !!shop.isOpen;
  el('sw-open').disabled = !active;
  updateOpenLbl();
  switchTab(dashTab);

  await refreshOrders();
  setPoll(refreshOrders, 5000);
}

function updateOpenLbl() {
  el('open-lbl').textContent = shop.isOpen
    ? 'محلك مفتوح ويستقبل طلبات الزبائن الآن'
    : 'محلك مغلق — لن يصل أي طلب جديد';
}

async function refreshOrders() {
  if (!shop || document.getElementById('view-dash').style.display === 'none') return;
  try {
    const d = await App.get('/orders?shop=' + shop.id);
    const orders = d.orders;

    // إحصائيات اليوم
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const today = orders.filter((o) => o.createdAt >= todayStart && !['cancelled', 'rejected'].includes(o.status));
    el('st-today').textContent = today.length;
    el('st-revenue').textContent = today.reduce((s, o) => s + o.subtotal, 0).toFixed(2);
    el('st-comm').textContent = (today.length * 0.2).toFixed(2);

    paintOrders(orders);
  } catch (e) { /* تجاهل */ }
}

function paintOrders(orders) {
  const newOnes = orders.filter((o) => o.status === 'pending');
  const activeOnes = orders.filter((o) => ['accepted', 'ready', 'assigned', 'picked_up'].includes(o.status));
  const past = orders.filter((o) => ['delivered', 'rejected', 'cancelled'].includes(o.status));

  el('tab-orders').innerHTML = `
    <div class="section-title">🔔 طلبات جديدة <span class="count">${newOnes.length}</span></div>
    ${newOnes.length ? newOnes.map(orderCard).join('') : '<div class="card"><div class="empty" style="padding:16px"><div class="e-icon">😴</div>لا طلبات جديدة حالياً</div></div>'}

    <div class="section-title">🔄 قيد التنفيذ <span class="count">${activeOnes.length}</span></div>
    ${activeOnes.length ? activeOnes.map(orderCard).join('') : '<div class="card muted small" style="text-align:center">لا يوجد</div>'}

    <div class="section-title">📁 سجل الطلبات <span class="count">${past.length}</span></div>
    ${past.length ? past.map(orderCard).join('') : '<div class="card muted small" style="text-align:center">لا يوجد</div>'}
  `;
  bindOrderButtons();
}

function orderCard(o) {
  const actions = [];
  if (o.status === 'pending') {
    actions.push(`<button class="btn ok sm" data-act="accept" data-id="${o.id}">✅ موافقة</button>`);
    actions.push(`<button class="btn bad sm" data-act="reject" data-id="${o.id}">رفض</button>`);
  }
  if (o.status === 'accepted') {
    actions.push(`<button class="btn sm" data-act="ready" data-id="${o.id}">📦 الطلب جاهز</button>`);
  }
  return `
    <div class="card order-card">
      <div class="oc-top">
        <span class="oc-code">طلب #${o.code} • ${App.dt(o.createdAt)}</span>
        ${chip(o.status)}
      </div>
      <div class="oc-items">${o.items.map((i) => i.emoji + ' ' + escapeHtml(i.name) + ' ×' + i.qty).join(' • ')}</div>
      ${o.notes ? `<div class="muted small">📝 ${escapeHtml(o.notes)}</div>` : ''}
      <div class="oc-items">📍 ${escapeHtml(o.address)} — 📱 ${escapeHtml(o.customerPhone)} (${escapeHtml(o.customerName)})</div>
      ${o.driverName ? `<div class="muted small">🛵 السائق: ${escapeHtml(o.driverName)}</div>` : ''}
      <div class="oc-foot">
        <span class="oc-total">${App.fmt(o.total)}</span>
        <div class="row">${actions.join('')}</div>
      </div>
    </div>
  `;
}

function bindOrderButtons() {
  document.querySelectorAll('#tab-orders button[data-act]').forEach((b) => {
    b.onclick = async () => {
      try {
        await App.patch('/orders/' + b.dataset.id, { action: b.dataset.act });
        if (b.dataset.act === 'accept') toast('قُبل الطلب — ابدأ بالتحضير 💪', 'ok');
        if (b.dataset.act === 'ready') toast('أعلنت الطلب جاهزاً — بانتظار السائق 📦', 'ok');
        if (b.dataset.act === 'reject') toast('رُفض الطلب', 'bad');
        refreshOrders();
      } catch (e) { toast(e.message, 'bad'); }
    };
  });
}

/* ---------------- تبويب المنتجات ---------------- */

function switchTab(t) {
  dashTab = t;
  document.querySelectorAll('#dash-tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === t);
  });
  el('tab-orders').style.display = t === 'orders' ? '' : 'none';
  el('tab-products').style.display = t === 'products' ? '' : 'none';
  if (t === 'products') paintProducts();
}

function paintProducts() {
  const ps = shop.products;
  el('tab-products').innerHTML = `
    <div class="card">
      <h3 style="font-size:15px; margin-bottom:10px">➕ إضافة منتج / خدمة</h3>
      <div class="field"><label>اسم المنتج</label><input class="input" id="pr-name" placeholder="مثال: حليب طازج 1 لتر"></div>
      <div class="grid2">
        <div class="field"><label>السعر (د.أ)</label><input class="input" id="pr-price" type="number" step="0.05" min="0" placeholder="0.00"></div>
        <div class="field"><label>الوحدة</label><input class="input" id="pr-unit" placeholder="كغ / حبة / خدمة"></div>
      </div>
      <button class="btn block" id="btn-add-product">إضافة للقائمة</button>
    </div>
    <div class="card">
      <h3 style="font-size:15px; margin-bottom:4px">📦 قائمة منتجاتك (${ps.length})</h3>
      <p class="muted small" style="margin-bottom:6px">💡 زر «🏷️ تخفيض» يضع سعراً مخفضاً يظهر للزبون بشارة عرض وقسم العروض</p>
      ${!ps.length ? '<div class="empty">لم تضف منتجات بعد — أضف أول منتج من الأعلى ⬆️</div>' : ps.map((p) => {
        const disc = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
        return `
        <div class="product-row" style="${p.available ? '' : 'opacity:.5'}">
          <div class="p-emoji">${p.emoji}</div>
          <div class="flex1">
            <div class="p-name">${escapeHtml(p.name)} ${disc ? `<span class="chip warn">🔥 خصم ${disc}%</span>` : ''}</div>
            <div class="p-unit">${escapeHtml(p.unit)} •
              ${p.oldPrice ? `<span style="text-decoration:line-through">${App.fmt(p.oldPrice)}</span> ` : ''}
              <b>${App.fmt(p.price)}</b>
              ${p.available ? '' : '• <b style="color:var(--bad)">غير متوفر</b>'}
            </div>
          </div>
          ${disc
            ? `<button class="btn soft sm" data-unoffer="${p.id}">إلغاء العرض</button>`
            : `<button class="btn warn sm" data-offer="${p.id}">🏷️ تخفيض</button>`}
          <button class="btn soft sm" data-toggle="${p.id}">${p.available ? 'إخفاء' : 'إظهار'}</button>
          <button class="btn bad sm icon" data-del="${p.id}">🗑</button>
        </div>
      `; }).join('')}
    </div>
    <button class="btn ghost sm block" id="btn-change-pass" style="margin-bottom:14px">🔑 تغيير الرقم السري</button>
  `;
  el('btn-add-product').onclick = addProduct;
  const cpBtn = document.getElementById('btn-change-pass');
  if (cpBtn) cpBtn.onclick = changePass;
  document.querySelectorAll('#tab-products button[data-offer]').forEach((b) => {
    b.onclick = async () => {
      const p = shop.products.find((x) => x.id === b.dataset.offer);
      const val = prompt(`🏷️ تخفيض «${p.name}»\nالسعر الحالي: ${App.fmt(p.price)}\n\nاكتب سعر العرض الجديد (أقل من الحالي):`, '');
      if (val == null) return;
      const newPrice = parseFloat(val);
      if (isNaN(newPrice) || newPrice <= 0) return toast('سعر غير صحيح', 'bad');
      if (newPrice >= p.price) return toast('سعر العرض يجب أن يكون أقل من السعر الحالي (' + App.fmt(p.price) + ')', 'bad');
      try {
        const d = await App.patch(`/shops/${shop.id}/products/${p.id}`, { price: newPrice, oldPrice: p.price });
        shop = d.shop; App.save('shop', shop);
        toast('🔥 بدأ العرض! سيظهر للزبائن بقسم العروض', 'ok');
        paintProducts();
      } catch (e) { toast(e.message, 'bad'); }
    };
  });
  document.querySelectorAll('#tab-products button[data-unoffer]').forEach((b) => {
    b.onclick = async () => {
      try {
        const d = await App.patch(`/shops/${shop.id}/products/${b.dataset.unoffer}`, { oldPrice: null });
        shop = d.shop; App.save('shop', shop);
        toast('أُلغي العرض', 'ok');
        paintProducts();
      } catch (e) { toast(e.message, 'bad'); }
    };
  });
  document.querySelectorAll('#tab-products button[data-toggle]').forEach((b) => {
    b.onclick = async () => {
      const p = shop.products.find((x) => x.id === b.dataset.toggle);
      try {
        const d = await App.patch(`/shops/${shop.id}/products/${p.id}`, { available: !p.available });
        shop = d.shop; App.save('shop', shop);
        paintProducts();
      } catch (e) { toast(e.message, 'bad'); }
    };
  });
  document.querySelectorAll('#tab-products button[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('حذف هذا المنتج نهائياً؟')) return;
      try {
        const d = await App.del(`/shops/${shop.id}/products/${b.dataset.del}`);
        shop = d.shop; App.save('shop', shop);
        toast('حُذف المنتج', 'ok');
        paintProducts();
      } catch (e) { toast(e.message, 'bad'); }
    };
  });
}

async function addProduct() {
  const name = el('pr-name').value.trim();
  const price = parseFloat(el('pr-price').value);
  const unit = el('pr-unit').value.trim() || 'حبة';
  if (!name) return toast('اكتب اسم المنتج', 'bad');
  if (isNaN(price) || price < 0) return toast('اكتب سعراً صحيحاً', 'bad');
  try {
    const d = await App.post(`/shops/${shop.id}/products`, { name, price, unit });
    shop = d.shop; App.save('shop', shop);
    toast('أُضيف المنتج ✅', 'ok');
    paintProducts();
  } catch (e) { toast(e.message, 'bad'); }
}

/* ---------------- ربط الأحداث ---------------- */

el('btn-toggle-register').onclick = () => {
  const c = el('register-card');
  c.style.display = c.style.display === 'none' ? '' : 'none';
};
el('btn-register').onclick = register;

el('sw-open').onchange = async () => {
  try {
    const d = await App.patch('/shops/' + shop.id, { isOpen: el('sw-open').checked });
    shop = d.shop; App.save('shop', shop);
    updateOpenLbl();
    setHeader();
    toast(shop.isOpen ? 'محلك مفتوح الآن 🟢' : 'أُغلق محلك 🔴', 'ok');
  } catch (e) {
    toast(e.message, 'bad');
    el('sw-open').checked = shop.isOpen;
  }
};

document.querySelectorAll('#dash-tabs button').forEach((b) => {
  b.onclick = () => switchTab(b.dataset.tab);
});

/* ---------------- التهيئة ---------------- */

if (shop) renderDash(); else renderLogin();
