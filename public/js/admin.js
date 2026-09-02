/* ============================================================
   الزهور اكسبرس — لوحة الإدارة
   ============================================================ */
'use strict';

let adminOk = App.load('admin') === true;
let currentTab = 'overview';

const el = (id) => document.getElementById(id);

/* ---------------- الدخول ---------------- */

function renderLogin() {
  el('view-dash').style.display = 'none';
  el('view-login').style.display = '';
  el('btn-logout').style.display = 'none';
}

async function doLogin() {
  const p = el('in-pass').value;
  try {
    const d = await App.post('/admin/login', { password: p });
    App.save('adminToken', d.token);
    adminOk = true;
    App.save('admin', true);
    renderDash();
  } catch (e) { toast(e.message, 'bad'); }
}

function logout() {
  adminOk = false;
  App.clear('admin');
  App.clear('adminToken');
  renderLogin();
}

/* ---------------- تبديل التبويبات ---------------- */

function switchTab(t) {
  currentTab = t;
  document.querySelectorAll('#admin-tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === t);
  });
  ['overview', 'shops', 'drivers', 'customers', 'orders', 'offers', 'ads'].forEach((x) => {
    el('tab-' + x).style.display = x === t ? '' : 'none';
  });
  refreshTab();
}

async function refreshTab() {
  // 🛡️ لا تُعد رسم اللوحة أثناء كتابة المستخدم في أي حقل — حتى لا يُمحى ما كتبه
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA') && ae.closest('#view-dash')) return;
  try {
    if (currentTab === 'overview') await paintOverview();
    else if (currentTab === 'shops') await paintShops();
    else if (currentTab === 'drivers') await paintDrivers();
    else if (currentTab === 'customers') await paintCustomers();
    else if (currentTab === 'orders') await paintOrders();
    else if (currentTab === 'offers') await paintOffers();
    else if (currentTab === 'ads') await paintAds();
  } catch (e) {
    if (String(e.message).includes('غير مصرح')) {
      logout();
      toast('انتهت جلسة الإدارة — سجّل الدخول من جديد', 'bad');
      return;
    }
    toast(e.message, 'bad');
  }
}

/* ---------------- نظرة عامة ---------------- */

async function paintOverview() {
  const d = await App.get('/admin/overview');
  const s = d.stats;
  el('tab-overview').innerHTML = `
    <div class="section-title">💰 إيرادات المنصة (نموذج الاشتراك + العمولة + الإعلانات)</div>
    <div class="grid3">
      <div class="stat" style="background:linear-gradient(135deg,#4c1d95,#6d28d9); color:#fff">
        <div class="num" style="color:#fff">${s.platformRevenue.toFixed(2)}</div>
        <div class="lbl" style="color:#e9e4ff">إجمالي إيرادات المنصة (د.أ)</div>
      </div>
      <div class="stat"><div class="num">${s.monthlySubscriptions.toFixed(2)}</div><div class="lbl">اشتراكات شهرية (${s.activeShops} محل × 10 د.أ)</div></div>
      <div class="stat"><div class="num">${s.commissionsTotal.toFixed(2)}</div><div class="lbl">عمولة الطلبات (20 قرش × الطلب)</div></div>
    </div>

    <div class="section-title">📊 حالة التطبيق الآن</div>
    <div class="grid3">
      <div class="stat"><div class="num">${s.ordersToday}</div><div class="lbl">طلبات اليوم</div></div>
      <div class="stat"><div class="num">${s.activeOrders}</div><div class="lbl">طلبات نشطة</div></div>
      <div class="stat"><div class="num">${s.totalOrders}</div><div class="lbl">كل الطلبات</div></div>
      <div class="stat"><div class="num">${s.revenueToday.toFixed(2)}</div><div class="lbl">مبيعات اليوم (د.أ)</div></div>
      <div class="stat"><div class="num">${s.activeShops}</div><div class="lbl">محلات فعّالة</div></div>
      <div class="stat"><div class="num">${s.onlineDrivers}<span class="muted small">/${s.totalDrivers}</span></div><div class="lbl">سائقون متاحون</div></div>
      <div class="stat"><div class="num">${s.totalCustomers}</div><div class="lbl">زبائن مسجلون</div></div>
      <div class="stat"><div class="num">${s.activeAds}</div><div class="lbl">إعلانات معروضة</div></div>
      ${s.pendingShops ? `<div class="stat" style="border:1.5px solid var(--warn)"><div class="num" style="color:var(--warn)">${s.pendingShops}</div><div class="lbl">⏳ طلبات انضمام بحاجة موافقة</div></div>` : ''}
    </div>

    <div class="section-title">🧾 أحدث الطلبات</div>
    ${d.latestOrders.length ? d.latestOrders.map((o) => `
      <div class="card order-card">
        <div class="oc-top">
          <span class="oc-code">طلب #${o.code} • ${App.dt(o.createdAt)}</span>
          ${chip(o.status)}
        </div>
        <div class="oc-shop">${o.shopIcon} ${escapeHtml(o.shopName)} → 🧍 ${escapeHtml(o.customerName)}</div>
        <div class="oc-items">${o.items.map((i) => i.emoji + ' ' + escapeHtml(i.name) + ' ×' + i.qty).join(' • ')}</div>
        <div class="oc-foot">
          <span class="muted small">${o.driverName ? '🛵 ' + escapeHtml(o.driverName) : '—'} • عمولة المنصة: 0.20</span>
          <span class="oc-total">${App.fmt(o.total)}</span>
        </div>
      </div>
    `).join('') : '<div class="card"><div class="empty" style="padding:14px">لا طلبات بعد</div></div>'}
  `;
}

/* ---------------- إدارة المحلات ---------------- */

async function paintShops() {
  const d = await App.get('/shops?all=1');
  el('tab-shops').innerHTML = `
    <div class="section-title">🏪 المحلات والمحلات <span class="count">${d.shops.length}</span></div>
    ${d.shops.map((s) => {
      const daysLeft = s.subscriptionUntil ? Math.ceil((s.subscriptionUntil - Date.now()) / 86400000) : null;
      return `
      <div class="card mng-row" style="flex-wrap:wrap">
        <div class="icon">${s.icon}</div>
        <div class="flex1">
          <h4>${escapeHtml(s.name)} ${s.status === 'pending' ? '<span class="chip warn">بانتظار الموافقة</span>' : ''} ${s.status === 'blocked' ? '<span class="chip bad">موقوف</span>' : ''} ${s.status === 'active' ? '<span class="chip ok">فعّال</span>' : ''}</h4>
          <div class="sub">${escapeHtml(s.category)} • ${s.productCount} منتج • ${s.isOpen ? '🟢 مفتوح' : '🔴 مغلق'}</div>
          <div class="sub">📅 الاشتراك (10 د.أ/شهر): ${daysLeft == null ? '<b style="color:var(--bad)">غير مشترك</b>' : daysLeft > 0 ? `فعّال — متبقي ${daysLeft} يوم` : '<b style="color:var(--bad)">منتهي</b>'}</div>
        </div>
        <div class="row wrap">
          ${s.status !== 'active' ? `<button class="btn ok sm" data-approve="${s.id}">✅ تنشيط</button>` : `<button class="btn warn sm" data-suspend="${s.id}">⏸ إيقاف</button>`}
          <button class="btn soft sm" data-renew="${s.id}">📅 تجديد الاشتراك +30ي</button>
          ${s.status === 'active' ? `<button class="btn ghost sm" data-open="${s.id}">${s.isOpen ? '🔒 إغلاق المحل' : '🔓 فتح المحل'}</button>` : ''}
          <button class="btn bad sm" data-delshop="${s.id}" title="حذف نهائي">🗑 حذف</button>
        </div>
      </div>
    `; }).join('')}
  `;
  bindShopsButtons();
}

function bindShopsButtons() {
  document.querySelectorAll('[data-approve]').forEach((b) => b.onclick = async () => {
    try {
      await App.patch('/admin/shops/' + b.dataset.approve, { status: 'active' });
      toast('نُشّط المحل ✅', 'ok'); paintShops();
    } catch (e) { toast(e.message, 'bad'); }
  });
  document.querySelectorAll('[data-suspend]').forEach((b) => b.onclick = async () => {
    try {
      await App.patch('/admin/shops/' + b.dataset.suspend, { status: 'blocked' });
      toast('أُوقف المحل ⏸', 'ok'); paintShops();
    } catch (e) { toast(e.message, 'bad'); }
  });
  document.querySelectorAll('[data-renew]').forEach((b) => b.onclick = async () => {
    try {
      await App.patch('/admin/shops/' + b.dataset.renew, { action: 'renew' });
      toast('جُدد الاشتراك 30 يوماً 📅 (+10 د.أ)', 'ok'); paintShops();
    } catch (e) { toast(e.message, 'bad'); }
  });
  document.querySelectorAll('[data-open]').forEach((b) => b.onclick = async () => {
    const cur = b.textContent.includes('إغلاق');
    try {
      await App.patch('/admin/shops/' + b.dataset.open, { isOpen: !cur });
      paintShops();
    } catch (e) { toast(e.message, 'bad'); }
  });
  document.querySelectorAll('[data-delshop]').forEach((b) => b.onclick = async () => {
    if (!confirm('🗑 حذف هذا المحل نهائياً؟\nسيُزال مع كل منتجاته ولن يستطيع صاحبه الدخول بعدها.\n(سجل طلباته القديمة يبقى محفوظاً)')) return;
    try {
      await App.del('/admin/shops/' + b.dataset.delshop);
      toast('حُذف المحل نهائياً', 'ok'); paintShops();
    } catch (e) { toast(e.message, 'bad'); }
  });
}

/* ---------------- إدارة السائقين ---------------- */

async function paintDrivers() {
  const d = await App.get('/admin/drivers');
  const drivers = d.drivers || [];
  const orders = (await App.get('/orders')).orders;
  el('tab-drivers').innerHTML = `
    <div class="section-title">🛵 السائقون <span class="count">${drivers.length}</span></div>
    ${drivers.length ? drivers.map((dr) => `
      <div class="card mng-row">
        <div class="icon">🛵</div>
        <div class="flex1">
          <h4>${escapeHtml(dr.name)} ${dr.status === 'blocked' ? '<span class="chip bad">موقوف</span>' : '<span class="chip ok">فعّال</span>'}</h4>
          <div class="sub">📱 ${escapeHtml(dr.phone)} • <span class="dot-online ${dr.online ? 'on' : ''}"></span> ${dr.online ? 'متاح الآن' : 'غير متاح'}</div>
          <div class="sub">🧾 ${dr.deliveries} توصيلة • أرباحه: ${App.fmt(dr.earnings)} • له ${orders.filter((o) => o.driverId === dr.id).length} طلب</div>
          ${dr.location ? `<div class="sub">📍 موقعه الآن: <a href="https://maps.google.com/?q=${dr.location.lat},${dr.location.lng}" target="_blank" style="color:var(--v1)">${dr.location.lat}, ${dr.location.lng} ↗</a> (${App.time(dr.location.updatedAt)})</div>` : '<div class="sub">📍 لا موقع حالياً (يظهر عند تفعيله «متاح»)</div>'}
        </div>
        ${dr.status === 'active'
          ? `<button class="btn warn sm" data-blockdrv="${dr.id}">⏸ إيقاف</button>`
          : `<button class="btn ok sm" data-unblockdrv="${dr.id}">✅ تنشيط</button>`}
        <button class="btn bad sm" data-deldrv="${dr.id}" title="حذف نهائي">🗑</button>
      </div>
    `).join('') : '<div class="card"><div class="empty">لا سائقين بعد</div></div>'}
  `;
  document.querySelectorAll('[data-blockdrv]').forEach((b) => b.onclick = async () => {
    try {
      await App.patch('/admin/drivers/' + b.dataset.blockdrv, { status: 'blocked' });
      toast('أُوقف السائق', 'ok'); paintDrivers();
    } catch (e) { toast(e.message, 'bad'); }
  });
  document.querySelectorAll('[data-unblockdrv]').forEach((b) => b.onclick = async () => {
    try {
      await App.patch('/admin/drivers/' + b.dataset.unblockdrv, { status: 'active' });
      toast('نُشّط السائق ✅', 'ok'); paintDrivers();
    } catch (e) { toast(e.message, 'bad'); }
  });
  document.querySelectorAll('[data-deldrv]').forEach((b) => b.onclick = async () => {
    if (!confirm('🗑 حذف هذا السائق نهائياً؟\nطلباته النشطة ستعود تلقائياً لتجمّع الانتظار ليقبلها سائق آخر.')) return;
    try {
      const r = await App.del('/admin/drivers/' + b.dataset.deldrv);
      toast('حُذف السائق' + (r.released ? ' — وأُعيد ' + r.released + ' طلبات للانتظار' : ''), 'ok'); paintDrivers();
    } catch (e) { toast(e.message, 'bad'); }
  });
}

/* ---------------- الزبائن ---------------- */

async function paintCustomers() {
  const d = await App.get('/admin/customers');
  const cs = d.customers || [];
  el('tab-customers').innerHTML = `
    <div class="section-title">🧍 الزبائن <span class="count">${cs.length}</span></div>
    <p class="muted small" style="margin-bottom:8px">💡 الحذف يزيل بطاقة الزبون فقط — سجل طلباته يبقى، وإن عاد ليطلب يُنشأ حسابه تلقائياً من رقمه</p>
    ${cs.length ? cs.map((c) => `
      <div class="card mng-row">
        <div class="icon">🧍</div>
        <div class="flex1">
          <h4>${escapeHtml(c.name)}</h4>
          <div class="sub">📱 <span dir="ltr">${escapeHtml(c.phone)}</span>${c.phone2 ? ' • 📲 <span dir="ltr">' + escapeHtml(c.phone2) + '</span>' : ''} • 🧾 ${c.ordersCount} طلب</div>
          <div class="sub">📍 ${escapeHtml(c.address || '—')}</div>
        </div>
        <button class="btn bad sm" data-delcust="${c.id}" title="حذف نهائي">🗑</button>
      </div>
    `).join('') : '<div class="card"><div class="empty">لا زبائن بعد</div></div>'}
  `;
  document.querySelectorAll('[data-delcust]').forEach((b) => b.onclick = async () => {
    if (!confirm('🗑 حذف بطاقة هذا الزبون؟\n(سجل طلباته يبقى محفوظاً)')) return;
    try {
      await App.del('/admin/customers/' + b.dataset.delcust);
      toast('حُذفت بطاقة الزبون', 'ok'); paintCustomers();
    } catch (e) { toast(e.message, 'bad'); }
  });
}

/* ---------------- كل الطلبات ---------------- */

async function paintOrders() {
  const d = await App.get('/orders');
  el('tab-orders').innerHTML = `
    <div class="section-title">🧾 كل الطلبات <span class="count">${d.orders.length}</span></div>
    ${d.orders.length ? d.orders.map((o) => `
      <div class="card order-card">
        <div class="oc-top">
          <span class="oc-code">طلب #${o.code} • ${App.dt(o.createdAt)}</span>
          ${chip(o.status)}
        </div>
        <div class="oc-shop">${o.shopIcon} ${escapeHtml(o.shopName)} → 🧍 ${escapeHtml(o.customerName)} (${escapeHtml(o.customerPhone)})</div>
        <div class="oc-items">${o.items.map((i) => i.emoji + ' ' + escapeHtml(i.name) + ' ×' + i.qty).join(' • ')}</div>
        <div class="oc-items">📍 ${escapeHtml(o.address)} ${o.driverName ? ' • 🛵 ' + escapeHtml(o.driverName) : ''}</div>
        <div class="oc-foot">
          <span class="muted small">عمولة المنصة: ${App.fmt(o.platformCommission || 0.2)}</span>
          <span class="oc-total">${App.fmt(o.total)}</span>
        </div>
      </div>
    `).join('') : '<div class="card"><div class="empty" style="padding:14px">لا طلبات بعد</div></div>'}
  `;
}

/* ---------------- العروض والتخفيضات ---------------- */

async function paintOffers() {
  const d = await App.get('/admin/offers');
  const of = d.offers || [];
  const live = of.filter((x) => x.shopLive);
  const C = [];
  C.push('    <div class="section-title">🔥 عروض وتخفيضات <span class="count">' + of.length + '</span></div>');
  C.push('    <div class="card" style="display:flex; gap:10px; margin-bottom:10px">');
  C.push('      <div class="flex1" style="text-align:center"><div style="font-size:22px; font-weight:900; color:var(--ok)">' + live.length + '</div><div class="muted small">ظاهرة للزبائن الآن</div></div>');
  C.push('      <div class="flex1" style="text-align:center"><div style="font-size:22px; font-weight:900; color:var(--warn)">' + (of.length - live.length) + '</div><div class="muted small">مخفية (محل موقوف/منتهي)</div></div>');
  C.push('    </div>');
  C.push('    <p class="muted small" style="margin-bottom:8px">💡 العروض ينشئها أصحاب المحلات بزر «🏷️ تخفيض» — ومن هنا تلغي أي عرض فيعود المنتج لسعره الأصلي</p>');
  C.push(of.length ? of.map((x) => `
      <div class="card mng-row">
        <div class="p-emoji">${x.emoji}</div>
        <div class="flex1">
          <h4>${escapeHtml(x.name)} <span class="chip warn">🔥 -${x.discount}%</span> ${x.shopLive ? '' : '<span class="chip gray">مخفي — المحل غير فعّال</span>'}</h4>
          <div class="sub">${x.shopIcon} ${escapeHtml(x.shopName)} • ${escapeHtml(x.unit)}</div>
          <div class="sub"><span style="text-decoration:line-through">${App.fmt(x.oldPrice)}</span> ← <b style="color:var(--ok)">${App.fmt(x.price)}</b></div>
        </div>
        <button class="btn warn sm" data-unoffer="${x.productId}" data-shop="${x.shopId}">إلغاء العرض</button>
      </div>
    `).join('') : '<div class="card"><div class="empty">لا عروض حالياً</div></div>');
  el('tab-offers').innerHTML = C.join('');
  document.querySelectorAll('[data-unoffer]').forEach((b) => b.onclick = async () => {
    if (!confirm('إلغاء هذا العرض؟ سيعود المنتج لسعره الأصلي فوراً')) return;
    try {
      await App.patch('/shops/' + b.dataset.shop + '/products/' + b.dataset.unoffer, { oldPrice: null });
      toast('أُلغي العرض — عاد المنتج لسعره الأصلي', 'ok'); paintOffers();
    } catch (e) { toast(e.message, 'bad'); }
  });
}

/* ---------------- الإعلانات ---------------- */

async function paintAds() {
  const d = await App.get('/admin/ads');
  const ppRes = await App.get('/popup');
  const pp = ppRes.popup || {};
  const shopsRes = await App.get('/shops?all=1').catch(() => ({ shops: [] }));
  el('tab-ads').innerHTML = `
    <div class="section-title">📣 المساحات الإعلانية</div>
    <div class="card" style="border:1.5px dashed var(--v2); margin-bottom:12px">
      <h3 style="font-size:15px; margin-bottom:2px">🪟 الإعلان المنبثق — نافذة بداية الدخول</h3>
      <p class="muted small" style="margin-bottom:10px">يظهر كورقة كتاب أنيقة عند فتح الصفحة الرئيسية أمام كل الزبائن</p>
      <label style="display:flex; align-items:center; gap:8px; margin-bottom:10px; font-weight:700; font-size:13.5px">
        <input type="checkbox" id="pp-active" ${pp.active ? 'checked' : ''}> مُفعّل — يظهر للزبائن
      </label>
      <div class="field"><label>عنوان الإعلان</label><input class="input" id="pp-title" autocomplete="off" value="${escapeHtml(pp.title || '')}"></div>
      <div class="field"><label>النص — كل سطر يظهر مستقلاً داخل الورقة</label><textarea class="input" id="pp-body" rows="3" autocomplete="off">${escapeHtml(pp.body || '')}</textarea></div>
      <div class="field"><label>رقم الهاتف (يظهر بزر اتصال داخل الورقة)</label><input class="input" id="pp-phone" autocomplete="off" dir="ltr" value="${escapeHtml(pp.phone || '')}"></div>
      <div class="field"><label>🏪 رابط محل داخل الورقة (اختياري — يأخذ الزبون لصفحة محله)</label>
        <select class="input" id="pp-shop" autocomplete="off"><option value="">بدون رابط محل</option>${shopsRes.shops.map((sh) => '<option value="' + sh.id + '"' + (pp.shopId === sh.id ? ' selected' : '') + '>' + sh.icon + ' ' + escapeHtml(sh.name) + '</option>').join('')}</select>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn ok block" id="btn-pp-save">💾 حفظ</button>
        <button class="btn soft sm" id="btn-pp-preview">👁 معاينة</button>
      </div>
    </div>
    <div class="card">
      <p class="muted small" style="margin-bottom:10px">تظهر الإعلانات النشطة في الصفحة الرئيسية لجميع الزبائن — مصدر دخل إضافي للتطبيق.</p>
      <div class="field"><label>عنوان الإعلان</label><input class="input" id="ad-title" autocomplete="off" placeholder="مثال: 🥩 عروض لحوم أبو عمر"></div>
      <div class="field"><label>نص الإعلان</label><input class="input" id="ad-body" autocomplete="off" placeholder="مثال: خصم 10% هذا الأسبوع على كل الطلبات"></div>
      <div class="field"><label>🏪 اسم المحل (اختياري — يظهر في الإعلان كرابط يفتح صفحة محله)</label>
        <select class="input" id="ad-shop" autocomplete="off"><option value="">بدون رابط محل</option>${shopsRes.shops.map((sh) => '<option value="' + sh.id + '">' + sh.icon + ' ' + escapeHtml(sh.name) + '</option>').join('')}</select>
      </div>
      <button class="btn block" id="btn-add-ad">➕ نشر الإعلان</button>
    </div>
    ${d.ads.map((a) => `
      <div class="card mng-row">
        <div class="icon">📣</div>
        <div class="flex1">
          <h4>${escapeHtml(a.title)} ${a.active ? '<span class="chip ok">معروض</span>' : '<span class="chip gray">متوقف</span>'}</h4>
          <div class="sub">${escapeHtml(a.body)}</div>
          ${a.shopName ? '<div class="sub">🏪 مرتبط بمحل: <b style="color:var(--v1)">' + escapeHtml(a.shopName) + '</b></div>' : ''}
        </div>
        <button class="btn ${a.active ? 'warn' : 'ok'} sm" data-ad-toggle="${a.id}" data-active="${a.active}">${a.active ? 'إيقاف' : 'عرض'}</button>
        <button class="btn bad sm" data-ad-del="${a.id}">🗑</button>
      </div>
    `).join('') || ''}
  `;
  el('btn-add-ad').onclick = async () => {
    const title = el('ad-title').value.trim();
    const body = el('ad-body').value.trim();
    if (!title || !body) return toast('اكتب عنواناً ونصاً للإعلان', 'bad');
    try {
      await App.post('/admin/ads', { title, body, shopId: el('ad-shop').value || null });
      toast('نُشر الإعلان 📣', 'ok');
      paintAds();
    } catch (e) { toast(e.message, 'bad'); }
  };
  const ppVals = () => ({
    active: el('pp-active').checked,
    title: el('pp-title').value.trim(),
    body: el('pp-body').value,
    phone: el('pp-phone').value.trim(),
    shopId: el('pp-shop').value || null,
  });
  el('btn-pp-save').onclick = async () => {
    const v = ppVals();
    if (!v.title || !v.body.trim()) return toast('اكتب عنواناً ونصاً للإعلان المنبثق', 'bad');
    try {
      await App.patch('/admin/popup', v);
      toast('حُفظ الإعلان المنبثق ✅', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  };
  el('btn-pp-preview').onclick = () => {
    const v = ppVals();
    if (!v.title) return toast('اكتب العنوان أولاً لترى المعاينة', 'bad');
    showPopupAd(v);
  };
  document.querySelectorAll('[data-ad-toggle]').forEach((b) => b.onclick = async () => {
    try {
      await App.patch('/admin/ads/' + b.dataset.adToggle, { active: b.dataset.active !== 'true' });
      paintAds();
    } catch (e) { toast(e.message, 'bad'); }
  });
  document.querySelectorAll('[data-ad-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('حذف الإعلان نهائياً؟')) return;
    try {
      await App.del('/admin/ads/' + b.dataset.adDel);
      toast('حُذف الإعلان', 'ok');
      paintAds();
    } catch (e) { toast(e.message, 'bad'); }
  });
}

/* ---------------- التهيئة ---------------- */

function renderDash() {
  el('view-login').style.display = 'none';
  el('view-dash').style.display = '';
  el('btn-logout').style.display = '';
  switchTab(currentTab);
  setPoll(refreshTab, 8000);
}

el('btn-login').onclick = doLogin;
el('in-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
el('btn-logout').onclick = logout;
el('btn-reset').onclick = async () => {
  if (!confirm('سيتم حذف جميع البيانات وإعادة البيانات التجريبية. متابعة؟')) return;
  const p = prompt('أدخل كلمة مرور الإدارة للتأكيد:');
  if (p == null) return;
  try {
    await App.post('/admin/reset', { password: p });
    toast('أُعيد تعيين البيانات ♻️', 'ok');
    renderDash();
  } catch (e) { toast(e.message, 'bad'); }
};

document.querySelectorAll('#admin-tabs button').forEach((b) => {
  b.onclick = () => switchTab(b.dataset.tab);
});

if (adminOk) renderDash(); else renderLogin();
