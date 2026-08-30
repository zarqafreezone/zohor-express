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
    const opts = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
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

// صوت تنبيه قصير (للسائق عند وصول طلب جديد)
function beep() {
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
