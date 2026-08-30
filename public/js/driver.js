/* ============================================================
   الزهور اكسبرس — لوحة السائق
   ============================================================ */
'use strict';

let driver = App.load('driver') || null;
let lastPoolCount = 0;

const el = (id) => document.getElementById(id);

/* ---------------- مشاركة الموقع المباشرة (GPS) ---------------- */
let geoWatch = null;
let lastLocSend = 0;

function startGeo() {
  if (geoWatch || !navigator.geolocation) return;
  geoWatch = navigator.geolocation.watchPosition((pos) => {
    const now = Date.now();
    if (now - lastLocSend < 8000) return; // إرسال كل 8 ثوانٍ
    lastLocSend = now;
    App.patch('/drivers/' + driver.id + '/location', { lat: pos.coords.latitude, lng: pos.coords.longitude })
      .then(() => {
        const g = el('geo-ind');
        if (g) { g.style.display = ''; g.textContent = '📡 مشاركة الموقع نشطة — الزبون يراك'; }
      })
      .catch(() => {});
  }, () => {
    const g = el('geo-ind');
    if (g) { g.style.display = ''; g.textContent = '⚠️ تعذر الوصول للموقع — اسمح بصلاحية الموقع في متصفحك'; }
  }, { enableHighAccuracy: true, maximumAge: 5000 });
}

function stopGeo() {
  if (geoWatch) { navigator.geolocation.clearWatch(geoWatch); geoWatch = null; }
  App.patch('/drivers/' + driver.id + '/location', {}).catch(() => {});
  const g = el('geo-ind');
  if (g) g.style.display = 'none';
}

/* ---------------- دخول ---------------- */

function renderLogin() {
  document.getElementById('view-dash').style.display = 'none';
  document.getElementById('view-login').style.display = '';
  if (driver) {
    el('in-name').value = driver.name || '';
    el('in-phone').value = driver.phone || '';
  }
}

async function doLogin() {
  const name = el('in-name').value.trim();
  const phone = el('in-phone').value.trim();
  if (name.length < 2) return toast('اكتب اسمك', 'bad');
  if (!/^07\d{8}$/.test(phone)) return toast('رقم الجوال يجب أن يبدأ بـ 07 (10 أرقام)', 'bad');
  try {
    const d = await App.post('/drivers/login', { name, phone });
    driver = d.driver;
    App.save('driver', driver);
    renderDash();
    toast('بالتوفيق يا ' + driver.name + ' 🛵', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

/* ---------------- اللوحة ---------------- */

const STATUS_CHIP = {
  pending: '<span class="chip warn">⏳ بانتظار اعتماد الإدارة</span>',
  active: '<span class="chip ok">✅ سائق معتمد</span>',
  blocked: '<span class="chip bad">🚫 موقوف</span>',
};

// شاشة إكمال التسجيل: مستندات + معلومات
function renderCompletion() {
  document.getElementById('view-dash').style.display = 'none';
  document.getElementById('view-login').style.display = 'none';
  let c = document.getElementById('view-complete');
  if (!c) {
    c = document.createElement('div');
    c.className = 'container';
    c.id = 'view-complete';
    document.body.appendChild(c);
  }
  c.style.display = '';
  const hasId = !!driver.idImage, hasLic = !!driver.licenseImage;
  c.innerHTML = `
    <div class="login-hero">
      <div class="big">🪪</div>
      <h2>أكمل ملفك يا ${escapeHtml(driver.name)}</h2>
      <p>للاعتماد كسائق في «الزهور اكسبرس» يجب رفع المستندات التالية لمراجعتها من الإدارة</p>
    </div>
    <div class="card">
      <div class="step-row">
        <div class="n">${hasId ? '✅' : '1'}</div>
        <div class="flex1">
          <h4>صورة الهوية الشخصية</h4>
          <p>صورة واضحة لوجه وطرفي الهوية</p>
          <input type="file" id="file-id" accept="image/*" capture="environment" style="margin-top:6px; width:100%">
        </div>
      </div>
      <div class="step-row">
        <div class="n">${hasLic ? '✅' : '2'}</div>
        <div class="flex1">
          <h4>صورة رخصة السيارة / الدراجة</h4>
          <p>رخصة سير المركبة التي ستوصّل بها</p>
          <input type="file" id="file-lic" accept="image/*" capture="environment" style="margin-top:6px; width:100%">
        </div>
      </div>
      <div class="field"><label>📲 رقم موبايل إضافي (اختياري)</label><input class="input" id="cp2-phone2" inputmode="tel" value="${escapeHtml(driver.phone2 || '')}" placeholder="رقم بديل"></div>
      <div class="field"><label>📍 عنوانك (الحي — الشارع)</label><input class="input" id="cp2-addr" value="${escapeHtml(driver.address || '')}" placeholder="مثال: جبل الزهور — شارع 10"></div>
      <button class="btn ok block" id="btn-send-docs">📤 إرسال الملف للإدارة</button>
      <p class="muted small" style="margin-top:8px">⏳ سيتم تفعيل حسابك بعد مراجعة المستندات — عادة خلال ساعات</p>
    </div>
  `;
  document.getElementById('btn-send-docs').onclick = async () => {
    const idFile = document.getElementById('file-id').files[0];
    const licFile = document.getElementById('file-lic').files[0];
    if (!idFile && !hasId) return toast('ارفع صورة الهوية أولاً', 'bad');
    if (!licFile && !hasLic) return toast('ارفع صورة الرخصة أولاً', 'bad');
    const btn = document.getElementById('btn-send-docs');
    btn.disabled = true;
    btn.textContent = '⏳ جارٍ تجهيز الصور…';
    try {
      const payload = {
        phone2: document.getElementById('cp2-phone2').value.trim(),
        address: document.getElementById('cp2-addr').value.trim(),
      };
      if (idFile) payload.idImage = await fileToDataUrl(idFile, 700, 0.55);
      if (licFile) payload.licenseImage = await fileToDataUrl(licFile, 700, 0.55);
      const d = await App.patch('/drivers/' + driver.id + '/docs', payload);
      driver = d.driver;
      App.save('driver', driver);
      toast('أُرسل ملفك للإدارة بنجاح ✅', 'ok');
      c.style.display = 'none';
      renderDash();
    } catch (e) {
      toast(e.message, 'bad');
      btn.disabled = false;
      btn.textContent = '📤 إرسال الملف للإدارة';
    }
  };
}

async function renderDash() {
  document.getElementById('view-login').style.display = 'none';
  const c = document.getElementById('view-complete');
  if (c) c.style.display = 'none';

  // سائق جديد بدون مستندات → شاشة الإكمال
  if (driver.status === 'pending' && !driver.docsSubmitted) return renderCompletion();

  document.getElementById('view-dash').style.display = '';
  el('hdr-title').textContent = '🛵 ' + driver.name;
  el('hdr-sub').textContent = driver.status === 'blocked' ? 'حسابك موقوف — تواصل مع الإدارة' : (driver.online ? 'أنت متاح الآن 🟢' : 'غير متاح 🔴');

  // البطاقة التعريفية + حالة الاعتماد
  el('drv-name').textContent = driver.name;
  el('drv-card').innerHTML = `
    <div class="row" style="margin-bottom:8px">
      <div class="avatar">🛵</div>
      <div class="flex1">
        <h3 style="font-size:15.5px">${escapeHtml(driver.name)}</h3>
        ${STATUS_CHIP[driver.status] || ''}
      </div>
    </div>
    <div class="prow2"><span class="pl">📱 موبايل أساسي</span><b dir="ltr">${escapeHtml(driver.phone)}</b></div>
    <div class="prow2"><span class="pl">📲 موبايل إضافي</span><b dir="ltr">${driver.phone2 ? escapeHtml(driver.phone2) : '<span class="muted">غير مسجل</span>'}</b></div>
    <div class="prow2" style="border-bottom:none"><span class="pl">📍 العنوان</span><b>${escapeHtml(driver.address || '—')}</b></div>
    ${driver.status === 'active' && driver.docsSubmitted ? '<button class="btn ghost sm block" style="margin-top:8px" id="btn-view-docs">🪪 عرض مستنداتي المرفوعة</button>' : ''}
    ${driver.status === 'pending' ? '<div class="muted small" style="margin-top:8px">⏳ مستنداتك قيد المراجعة — التفعيل بعد موافقة الإدارة</div>' : ''}
  `;
  const vd = document.getElementById('btn-view-docs');
  if (vd) vd.onclick = () => openSheet(`
    <h3>🪪 مستنداتك</h3>
    <p class="muted small" style="margin-bottom:8px">صورة الهوية:</p>
    <img src="${driver.idImage}" style="width:100%; border-radius:12px; margin-bottom:12px">
    <p class="muted small" style="margin-bottom:8px">صورة الرخصة:</p>
    <img src="${driver.licenseImage}" style="width:100%; border-radius:12px">
  `);

  el('drv-status').textContent = driver.status === 'blocked'
    ? '🚫 حسابك موقوف من الإدارة'
    : (driver.status === 'pending' ? '⏳ بانتظار اعتماد الإدارة'
      : (driver.online ? '🟢 متاح — تصلك طلبات المنطقة' : '🔴 غير متاح'));

  const sw = el('sw-online');
  sw.checked = !!driver.online;
  sw.disabled = driver.status !== 'active';

  el('st-deliveries').textContent = driver.deliveries;
  el('st-earnings').textContent = (+driver.earnings).toFixed(2);

  await refresh();
  setPoll(refresh, 4000);
}

async function refresh() {
  if (!driver || document.getElementById('view-dash').style.display === 'none') return;
  try {
    // تحديث بيانات السائق
    const dd = await App.get('/drivers/' + driver.id);
    driver = dd.driver;
    App.save('driver', driver);
    if (driver.status === 'pending' && !driver.docsSubmitted) { stopPoll(); return renderCompletion(); }
    el('st-deliveries').textContent = driver.deliveries;
    el('st-earnings').textContent = (+driver.earnings).toFixed(2);
    el('sw-online').checked = !!driver.online;
    el('sw-online').disabled = driver.status !== 'active';
    el('drv-status').textContent = driver.status === 'blocked' ? '🚫 حسابك موقوف من الإدارة' : (driver.status === 'pending' ? '⏳ بانتظار اعتماد الإدارة' : (driver.online ? '🟢 متاح — تصلك طلبات المنطقة' : '🔴 غير متاح'));

    // مجموعة الطلبات الجاهزة
    const pool = (await App.get('/orders?pool=1')).orders;
    el('pool-count').textContent = pool.length;

    // تجاهل عرض مهامي إن كان السائق موقوفاً
    const mine = driver.status === 'blocked' ? [] : (await App.get('/orders?driver=' + driver.id)).orders
      .filter((o) => ['assigned', 'picked_up'].includes(o.status));
    el('mine-count').textContent = mine.length;
    el('st-active').textContent = mine.length;

    // تنبيه صوتي عند ظهور طلب جديد
    if (driver.online && pool.length > lastPoolCount && lastPoolCount !== 0) beep();
    lastPoolCount = pool.length;

    // تجمّع الطلبات
    el('pool').innerHTML = pool.length ? pool.map((o) => `
      <div class="card order-card">
        <div class="oc-top">
          <span class="oc-code">طلب #${o.code} • ${App.dt(o.createdAt)}</span>
          <span class="chip vio">جاهز للاستلام</span>
        </div>
        <div class="oc-shop">${o.shopIcon} ${escapeHtml(o.shopName)}</div>
        <div class="oc-items">${o.items.map((i) => i.emoji + ' ' + escapeHtml(i.name) + ' ×' + i.qty).join(' • ')}</div>
        <div class="oc-items">📍 التوصيل: ${escapeHtml(o.address)}</div>
        ${o.notes ? `<div class="muted small">📝 ${escapeHtml(o.notes)}</div>` : ''}
        <div class="oc-foot">
          <span class="oc-total">${App.fmt(o.total)} <span class="muted small">(توصيل: ${App.fmt(o.deliveryFee)})</span></span>
          <button class="btn sm" data-accept="${o.id}" ${driver.online ? '' : 'disabled'}>🙋 اقبل الطلب</button>
        </div>
      </div>
    `).join('') : `
      <div class="card"><div class="empty" style="padding:18px">
        <div class="e-icon">🛵</div>
        ${driver.online ? 'لا توجد طلبات جاهزة حالياً — ابقَ متاحاً' : 'أنت غير متاح — فعّل الزر لتصلك الطلبات'}
      </div></div>
    `;

    // مهامي
    el('mine').innerHTML = mine.length ? mine.map((o) => {
      const nextAct = o.status === 'assigned'
        ? `<button class="btn sm" data-pickup="${o.id}">📦 استلمت الطلب من المحل</button>`
        : `<button class="btn ok sm" data-deliver="${o.id}">✅ تم التوصيل للزبون</button>`;
      return `
      <div class="card order-card" style="border-right:4px solid var(--v2)">
        <div class="oc-top">
          <span class="oc-code">طلب #${o.code} • ${App.dt(o.createdAt)}</span>
          ${chip(o.status)}
        </div>
        <div class="oc-shop">${o.shopIcon} ${escapeHtml(o.shopName)}</div>
        <div class="oc-items">${o.items.map((i) => i.emoji + ' ' + escapeHtml(i.name) + ' ×' + i.qty).join(' • ')}</div>
        <div class="oc-items">🧍 ${escapeHtml(o.customerName)} — 📱 <a dir="ltr" href="tel:${escapeHtml(o.customerPhone)}" style="color:var(--v1)">${escapeHtml(o.customerPhone)}</a>${o.customerPhone2 ? ` — 📲 <a dir="ltr" href="tel:${escapeHtml(o.customerPhone2)}" style="color:var(--v1)">${escapeHtml(o.customerPhone2)}</a>` : ''}</div>
        <div class="oc-items">📍 ${escapeHtml(o.address)}</div>
        ${o.notes ? `<div class="muted small">📝 ${escapeHtml(o.notes)}</div>` : ''}
        <div class="row wrap" style="margin:6px 0">
          <a class="btn soft sm" href="https://maps.google.com/?q=${encodeURIComponent(o.shopName + ' جبل الزهور عمان')}" target="_blank">🧭 انطلق للمحل</a>
          <a class="btn soft sm" href="https://maps.google.com/?q=${encodeURIComponent(o.address + ' جبل الزهور عمان')}" target="_blank">🧭 انطلق للزبون</a>
          <a class="btn ghost sm" href="tel:${escapeHtml(o.customerPhone)}">📞 الزبون</a>
        </div>
        <div class="oc-foot">
          <span class="oc-total">${App.fmt(o.total)} <span class="muted small">(توصيل: ${App.fmt(o.deliveryFee)})</span></span>
          <div class="row">${nextAct}</div>
        </div>
      </div>
    `; }).join('') : '<div class="card muted small" style="text-align:center">لا مهام حالية</div>';

    // السجل
    const hist = (await App.get('/orders?driver=' + driver.id)).orders
      .filter((o) => o.status === 'delivered').slice(0, 10);
    el('history').innerHTML = hist.length ? hist.map((o) => `
      <div class="card order-card">
        <div class="oc-top">
          <span class="oc-code">طلب #${o.code} • ${App.dt(o.createdAt)}</span>
          <span class="chip ok">✅ تم</span>
        </div>
        <div class="oc-shop">${o.shopIcon} ${escapeHtml(o.shopName)}</div>
        <div class="oc-foot">
          <span class="muted small">🧍 ${escapeHtml(o.customerName)}</span>
          <span class="oc-total">ربحك: ${App.fmt(o.deliveryFee)}</span>
        </div>
      </div>
    `).join('') : '<div class="card muted small" style="text-align:center">لا توصيلات سابقة</div>';

    bindButtons();
  } catch (e) { /* تجاهل الأخطاء المؤقتة */ }
}

function bindButtons() {
  document.querySelectorAll('[data-accept]').forEach((b) => {
    b.onclick = async () => {
      try {
        await App.patch('/orders/' + b.dataset.accept, { action: 'assign', driverId: driver.id });
        toast('قُبل الطلب — توجه للمحل 🏪', 'ok');
        beep();
        refresh();
      } catch (e) { toast(e.message, 'bad'); }
    };
  });
  document.querySelectorAll('[data-pickup]').forEach((b) => {
    b.onclick = async () => {
      try {
        await App.patch('/orders/' + b.dataset.pickup, { action: 'pickup' });
        toast('استلمت الطلب — في الطريق للزبون 🚀', 'ok');
        refresh();
      } catch (e) { toast(e.message, 'bad'); }
    };
  });
  document.querySelectorAll('[data-deliver]').forEach((b) => {
    b.onclick = async () => {
      try {
        await App.patch('/orders/' + b.dataset.deliver, { action: 'deliver' });
        toast('أحسنت! أُضيفت رسوم التوصيل لأرباحك 💰', 'ok');
        refresh();
      } catch (e) { toast(e.message, 'bad'); }
    };
  });
}

/* ---------------- الأحداث ---------------- */

el('btn-login').onclick = doLogin;

el('sw-online').onchange = async () => {
  try {
    const d = await App.patch('/drivers/' + driver.id, { online: el('sw-online').checked });
    driver = d.driver;
    App.save('driver', driver);
    if (driver.online) { startGeo(); toast('أنت متاح الآن — شارك موقعك ليتبعك الزبون 📡', 'ok'); }
    else { stopGeo(); toast('أنت غير متاح 🔴', 'ok'); }
    renderDash();
  } catch (e) {
    toast(e.message, 'bad');
    el('sw-online').checked = driver.online;
  }
};

// عند فتح الصفحة: إن كان متاحاً من قبل نكمل مشاركة الموقع
if (driver && driver.online) startGeo();

if (driver) renderDash(); else renderLogin();
