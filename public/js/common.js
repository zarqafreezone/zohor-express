/* ============================================================
   زهور إكسبريس — أدوات مشتركة للواجهات
   ============================================================ */
'use strict';

const App = {
  // تنسيق المبالغ بالدينار الأردني
  fmt(n) { return (+n).toFixed(2) + ' د.أ'; },

  // تنسيق التاريخ والوقت
  dt(ts) {
    return new Date(ts).toLocaleString('ar', {
      hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
    });
  },
  time(ts) {
    return new Date(ts).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  },

  // استدعاءات API
  async req(url, method, body) {
    const headers = { 'Content-Type': 'application/json' };
    // رمز جلسة الإدارة (يُرفق تلقائياً مع طلبات /admin)
    if (url.startsWith('/admin')) {
      try {
        const t = JSON.parse(sessionStorage.getItem('zh_adminToken'));
        if (t) headers['x-admin-token'] = t;
      } catch { /* لا رمز */ }
    }
    const opts = { method: method || 'GET', headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch('/api' + url, opts);
    let data = {};
    try { data = await r.json(); } catch { /* تجاهل */ }
    if (!r.ok) throw new Error(data.error || 'حدث خطأ غير متوقع');
    return data;
  },
  get(u) { return this.req(u, 'GET'); },
  post(u, b) { return this.req(u, 'POST', b || {}); },
  patch(u, b) { return this.req(u, 'PATCH', b || {}); },
  del(u) { return this.req(u, 'DELETE'); },

  // جلسة بسيطة لكل نافذة متصفح
  save(k, v) { sessionStorage.setItem('zh_' + k, JSON.stringify(v)); },
  load(k) {
    try { return JSON.parse(sessionStorage.getItem('zh_' + k)); } catch { return null; }
  },
  clear(k) { sessionStorage.removeItem('zh_' + k); },

  // حفظ دائم محلي (السلة مثلاً)
  saveLocal(k, v) { localStorage.setItem('zh_' + k, JSON.stringify(v)); },
  loadLocal(k) {
    try { return JSON.parse(localStorage.getItem('zh_' + k)); } catch { return null; }
  },
};

// حالات الطلب
const STATUS = {
  pending:   { label: 'بانتظار موافقة المحل', icon: '⏳', cls: 'warn' },
  accepted:  { label: 'قيد التحضير',           icon: '👨‍🍳', cls: 'info' },
  rejected:  { label: 'مرفوضة',                icon: '❌', cls: 'bad' },
  ready:     { label: 'جاهزة — بانتظار السائق', icon: '📦', cls: 'vio' },
  assigned:  { label: 'السائق في الطريق للمحل', icon: '🛵', cls: 'info' },
  picked_up: { label: 'في الطريق إليك',        icon: '🚀', cls: 'info' },
  delivered: { label: 'تم التوصيل',            icon: '✅', cls: 'ok' },
  cancelled: { label: 'ملغاة',                 icon: '🚫', cls: 'gray' },
};

function chip(status) {
  const s = STATUS[status] || { label: status, cls: 'gray', icon: '' };
  return `<span class="chip ${s.cls}">${s.icon} ${s.label}</span>`;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// تنبيه منبثق صغير
function toast(msg, type) {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2400);
  setTimeout(() => t.remove(), 2800);
}

// صوت تأكيد قصير — يعتمد محرك الأصوات المميزة إن كان محمّلاً (sounds.js)
function beep() {
  if (window.ZhSounds) return ZhSounds.blip();
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.value = 0.07;
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 200);
  } catch { /* لا شيء */ }
}

// المسافة بين نقطتين بالمتر — لتنبيه الزبون عند اقتراب السائق
function distMeters(la1, lo1, la2, lo2) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLa = rad(la2 - la1), dLo = rad(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// نافذة سفلية (Sheet) قابلة للإغلاق
function openSheet(html) {
  closeSheet();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.id = 'sheet-overlay';
  ov.innerHTML = `<div class="sheet"><div class="grab"></div>${html}</div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov) closeSheet(); });
  document.body.appendChild(ov);
  return ov;
}
function closeSheet() {
  const ov = document.getElementById('sheet-overlay');
  if (ov) ov.remove();
}

// إدارة مؤقتات التحديث الدوري (واحد فقط في كل مرة)
let _pollTimer = null;
function setPoll(fn, ms) {
  clearInterval(_pollTimer);
  _pollTimer = setInterval(fn, ms || 4000);
}
function stopPoll() { clearInterval(_pollTimer); _pollTimer = null; }

// ضغط صورة من الجوال وتحويلها إلى Data URL (لرفع المستندات)
function fileToDataUrl(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('صورة غير صالحة'));
      img.onload = () => {
        try {
          const max = maxSize || 700;
          let w = img.width, h = img.height;
          if (w > max || h > max) {
            const r = Math.min(max / w, max / h);
            w = Math.round(w * r); h = Math.round(h * r);
          }
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', quality || 0.6));
        } catch (e) { reject(e); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   الإعلان المنبثق — نافذة «ورقة كتاب» أنيقة ببداية دخول الموقع
   يتحكم بها من لوحة الإدارة (تبويب الإعلانات) مع زر معاينة
   ============================================================ */
function showPopupAd(p) {
  if (!p || !p.title) return;
  const ov = document.createElement('div');
  ov.className = 'pbook-ov';
  const lines = String(p.body || '').split('\n').filter((x) => x.trim())
    .map((l) => '<div class="pbook-line">' + escapeHtml(l) + '</div>').join('');
  ov.innerHTML =
    '<div class="pbook" role="dialog" aria-label="إعلان">' +
      '<button class="pbook-x" aria-label="إغلاق الإعلان">✕</button>' +
      '<div class="pbook-orn">✦ ─────── ✦</div>' +
      '<h2 class="pbook-title">' + escapeHtml(p.title) + '</h2>' +
      '<div class="pbook-orn">✦ ─────── ✦</div>' +
      lines +
      (p.phone ? '<a class="pbook-call" href="tel:' + escapeHtml(p.phone) + '" dir="ltr">📞 ' + escapeHtml(p.phone) + '</a>' : '') +
      (p.shopId ? '<br><a class="pbook-shop" href="/customer.html">🏪 ' + escapeHtml(p.shopName || 'ادخل صفحة المحل') + ' — تسوّق الآن ←</a>' : '') +
      '<div class="pbook-foot">🌸 من إعلانات الزهور اكسبرس</div>' +
    '</div>';
  const close = () => { try { sessionStorage.setItem('zh_popupSeen', '1'); } catch { /* لا شيء */ } ov.remove(); };
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('.pbook-x').onclick = close;
  const sl = ov.querySelector('.pbook-shop');
  if (sl) sl.onclick = (e) => {
    e.preventDefault();
    try { sessionStorage.setItem('zh_openShop', p.shopId); } catch { /* لا شيء */ }
    if (typeof openShop === 'function') { close(); openShop(p.shopId); }
    else location.href = '/customer.html';
  };
  document.body.appendChild(ov);
}
