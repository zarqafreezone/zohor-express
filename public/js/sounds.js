/* ============================================================
   الزهور اكسبرس — محرك التنبيهات الصوتية المميزة
   أصوات مركّبة بتقنية Web Audio — بدون ملفات صوتية، فورية وخفيفة
   🔔 السائق: طلب جديد في التجمع
   🔔 المحل: طلبية جديدة وصلت
   🚀 الزبون: السائق استلم طلبك
   📍 الزبون: السائق وصل منطقتك
   ============================================================ */
'use strict';

const ZhSounds = {
  ctx: null,
  muted: false,

  init() {
    try { this.muted = localStorage.getItem('zh_sound') === '0'; } catch { this.muted = false; }
    // المتصفحات تمنع الصوت قبل أول لمسة — نفتح القفل مع أول تفاعل من المستخدم
    const unlock = () => {
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch { /* متصفح لا يدعم */ }
    };
    ['pointerdown', 'touchstart', 'keydown'].forEach((ev) =>
      document.addEventListener(ev, unlock, { passive: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) unlock(); });
    this.mount();
  },

  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') return this.ctx.resume().then(() => this.ctx);
    return Promise.resolve(this.ctx);
  },

  // نغمة واحدة بمغلف ناعم (هجوم سريع + تخامد تدريجي)
  tone(freq, at, dur, type, vol) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.16, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  },

  // اهتزاز الهاتف مصاحب للنغمة (يفيد صاحب الموبايل لو الصوت واطي)
  buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* لا شيء */ } },

  play(name) {
    if (this.muted) return;
    this.ensure().then(() => { try { this['_melody_' + name](); } catch { /* تجاهل */ } }).catch(() => {});
  },

  // نقرة تأكيد قصيرة (بدل beep القديم)
  blip() {
    if (this.muted) return;
    this.ensure().then(() => { try { this.tone(880, 0, 0.14, 'sine', 0.10); } catch { /* تجاهل */ } }).catch(() => {});
  },

  /* ── 🔔 السائق: طلب جديد — جرس باب عاجل يتكرر 3 مرات مع اهتزاز طويل ── */
  _melody_driver_new() {
    for (let r = 0; r < 3; r++) {
      const b = r * 0.85;
      this.tone(1318.5, b, 0.22, 'sine', 0.05);        // لمعة جرس عالية
      this.tone(659.25, b, 0.28, 'sine', 0.20);        // دينـج
      this.tone(523.25, b + 0.34, 0.40, 'sine', 0.20); // دونـج
    }
    this.buzz([450, 150, 450, 150, 450]);
  },

  /* ── 🏪 المحل: طلبية جديدة — رنة صندوق النقد «كا-تشينغ» المبهجة ── */
  _melody_shop_new() {
    this.tone(1046.5, 0.00, 0.10, 'triangle', 0.20);
    this.tone(1318.5, 0.09, 0.10, 'triangle', 0.20);
    this.tone(1568.0, 0.18, 0.30, 'triangle', 0.22);
    this.tone(2093.0, 0.18, 0.25, 'sine', 0.07);
    this.tone(1318.5, 0.55, 0.10, 'triangle', 0.15);
    this.tone(1568.0, 0.64, 0.35, 'triangle', 0.18);
    this.buzz([280, 90, 280]);
  },

  /* ── 🚀 الزبون: السائق استلم طلبك — نغمتان صاعدتان خفيفتان ── */
  _melody_pickup() {
    for (let r = 0; r < 2; r++) {
      const b = r * 0.62;
      this.tone(392.00, b, 0.15, 'triangle', 0.18);
      this.tone(587.33, b + 0.16, 0.32, 'triangle', 0.20);
    }
    this.buzz([200, 90, 200]);
  },

  /* ── 📍 الزبون: السائق وصل — أجراس باب دافئة (ثلاث نغمات هابطة) ── */
  _melody_arrived() {
    for (let r = 0; r < 2; r++) {
      const b = r * 0.95;
      this.tone(783.99, b, 0.28, 'sine', 0.20);
      this.tone(659.25, b + 0.20, 0.28, 'sine', 0.20);
      this.tone(523.25, b + 0.40, 0.55, 'sine', 0.22);
      this.tone(1046.5, b + 0.40, 0.40, 'sine', 0.06);
    }
    this.buzz([350, 120, 350]);
  },

  /* ── زر عائم 🔔/🔕 لكتم أو تشغيل التنبيهات (يظهر تلقائياً) ── */
  mount() {
    const mk = () => {
      if (document.getElementById('zh-snd-btn')) return;
      const b = document.createElement('button');
      b.id = 'zh-snd-btn';
      const bottom = document.querySelector('.bottom-nav') ? 80 : 16;
      b.style.cssText = 'position:fixed; left:12px; bottom:' + bottom + 'px; z-index:950; width:44px; height:44px;'
        + ' border-radius:50%; border:1.5px solid var(--line,#e8e4f6); background:var(--card,#fff); font-size:19px;'
        + ' box-shadow:0 2px 10px rgba(0,0,0,.15); cursor:pointer; line-height:1; padding:0;';
      b.setAttribute('aria-label', 'تشغيل أو كتم أصوات التنبيهات');
      const paint = () => {
        b.textContent = this.muted ? '🔕' : '🔔';
        b.title = this.muted ? 'الصوت مكتوم — اضغط للتشغيل' : 'أصوات التنبيهات تعمل — اضغط للكتم';
      };
      paint();
      b.onclick = () => {
        this.muted = !this.muted;
        try { localStorage.setItem('zh_sound', this.muted ? '0' : '1'); } catch { /* تجاهل */ }
        paint();
        if (!this.muted) { this.blip(); toast('🔊 أصوات التنبيهات تعمل الآن', 'ok'); }
        else toast('🔕 تم كتم أصوات التنبيهات', 'ok');
      };
      document.body.appendChild(b);
    };
    if (document.body) mk();
    else document.addEventListener('DOMContentLoaded', mk);
  },
};

ZhSounds.init();
