/* ============================================================
   الزهور اكسبرس — خادم بدون أي اعتماديات خارجية (Node.js خالص)
   يقدّم: REST API + الملفات الثابتة (الواجهات)
   نموذج الإيرادات: اشتراك شهري 10 دنانير من المحلات
                    + 20 قرش عمولة على كل طلب + مساحات إعلانية
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ═══════════ وضع التخزين ═══════════
   DATABASE_URL موجودة → PostgreSQL سحابي دائم (الإنتاج)
   غير موجودة → ملف JSON محلي (وضع التطوير/الاحتياطي) */
const DATABASE_URL = process.env.DATABASE_URL || '';
let pgPool = null;
let dbReady = Promise.resolve();
let db = null;

if (DATABASE_URL) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
  console.log('🗄️  التخزين: PostgreSQL سحابي دائم (Neon)');
} else {
  console.log('📁 التخزين: ملف محلي data/db.json (وضع احتياطي — البيانات غير دائمة عبر النشر)');
}

/* حفظ المستند في القاعدة (سطر واحد JSON) — إن وجد PostgreSQL */
async function pgPersist() {
  if (!pgPool || !db) return;
  await pgPool.query(
    'INSERT INTO app_state (id, data, updated_at) VALUES (1, $1, NOW()) ' +
    'ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()',
    [JSON.stringify(db)]
  );
}

/* حفظ غير متزامن لا يكسر الطلبات — يضمن الاستمرارية مع السحابة */
let _saving = false;
let _dirtyAgain = false;
function saveDb() {
  if (!pgPool) {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8'); } catch (e) { console.error('save file err:', e.message); }
    return;
  }
  if (_saving) { _dirtyAgain = true; return; }
  _saving = true;
  const snap = JSON.stringify(db);
  pgPool.query(
    'INSERT INTO app_state (id, data, updated_at) VALUES (1, $1::jsonb, NOW()) ' +
    'ON CONFLICT (id) DO UPDATE SET data = $1::jsonb, updated_at = NOW()',
    [snap]
  ).then(() => {
    _saving = false;
    if (_dirtyAgain) { _dirtyAgain = false; saveDb(); }
  }).catch((e) => {
    _saving = false;
    console.error('❌ فشل الحفظ السحابي:', e.message);
  });
}

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* ---------------- ثوابت ---------------- */

const CATEGORIES = [
  'بقالة',
  'مطعم',
  'لحوم ومجمدات',
  'خضار وفواكه',
  'مخبز',
  'موبايلات واكسسوارات وبطاقات شحن',
  'اجهزة كهربائية والكترونيات',
  'صيانة ومقاولات',
  'دراي كلين',
  'مياه شرب',
  'ادوات منزلية',
  'أخرى',
];

const CATEGORY_ICONS = {
  'بقالة': '🛒',
  'مطعم': '🍴',
  'لحوم ومجمدات': '🥩',
  'خضار وفواكه': '🥬',
  'مخبز': '🥖',
  'موبايلات واكسسوارات وبطاقات شحن': '📱',
  'اجهزة كهربائية والكترونيات': '💡',
  'صيانة ومقاولات': '🔧',
  'دراي كلين': '🧺',
  'أخرى': '📦',
};

const SUBSCRIPTION_FEE = 10;   // دينار شهرياً من المحل
const ORDER_COMMISSION = 0.2;  // 20 قرش على كل طلب
const TRIAL_DAYS = 14;         // فترة تجريبية مجانية للمحل الجديد
const SEED_SHOP_PASSWORD = '1234'; // كلمة المرور الافتراضية للمحلات التجريبية

/* صور حقيقية لكل تصنيف */
const CATEGORY_IMAGES = {
  'بقالة': '/img/shops/grocery.jpg',
  'مطعم': '/img/shops/restaurant.jpg',
  'لحوم ومجمدات': '/img/shops/butcher.jpg',
  'خضار وفواكه': '/img/shops/vegetables.jpg',
  'مخبز': '/img/shops/bakery.jpg',
  'موبايلات واكسسوارات وبطاقات شحن': '/img/shops/mobile.jpg',
  'اجهزة كهربائية والكترونيات': '/img/shops/electronics.jpg',
  'صيانة ومقاولات': '/img/shops/maintenance.jpg',
  'دراي كلين': '/img/shops/dryclean.jpg',
  'مياه شرب': '/img/shops/water.jpg',
  'ادوات منزلية': '/img/shops/housewares.jpg',
  'أخرى': '/img/shops/spices.jpg',
};

/* تطبيع رقم الجوال: يقبل 07... أو +9627... أو 009627... أو 9627... */
function normPhone(raw) {
  let p = String(raw || '').replace(/[^\d+]/g, '');
  if (p.startsWith('+962')) p = '0' + p.slice(4);
  else if (p.startsWith('00962')) p = '0' + p.slice(5);
  else if (p.startsWith('962') && p.length >= 11) p = '0' + p.slice(3);
  else if (p.length === 9 && p.startsWith('7')) p = '0' + p;
  return p;
}
const validPhone = (p) => /^07\d{8}$/.test(p);

/* بناء نص العنوان التفصيلي من مكوناته */
function buildAddress(c) {
  return [c.area, c.street, c.building, c.landmark].filter(Boolean).join(' — ');
}

/* ---------------- أدوات المعرفات (آمنة ضد التكرار) ---------------- */

function existsId(prefix, id) {
  switch (prefix) {
    case 's': return !!db.shops.find((x) => x.id === id);
    case 'd': return !!db.drivers.find((x) => x.id === id);
    case 'c': return !!db.customers.find((x) => x.id === id);
    case 'o': return !!db.orders.find((x) => x.id === id);
    case 'p': return db.shops.some((x) => x.products.some((p) => p.id === id));
    case 'a': return db.ads.some((x) => x.id === id);
    default: return false;
  }
}

function nextId(prefix) {
  let id;
  do {
    db.seq += 1;
    id = prefix + db.seq;
  } while (existsId(prefix, id));
  return id;
}

function nextOrderCode() {
  let code;
  do {
    db.orderCode += 1;
    code = String(db.orderCode);
  } while (db.orders.some((o) => o.code === code));
  return code;
}

/* ---------------- بناء البيانات الأولية ---------------- */

function seedDb() {
  const now = Date.now();
  const DAY = 86400000;
  let id = 2000;
  const nid = () => (id += 1);

  const P = (name, price, unit, emoji, oldPrice) => ({
    id: 'p' + nid(), name, price, unit, emoji: emoji || '📦', available: true,
    ...(oldPrice ? { oldPrice } : {}),
  });

  const data = {
    orderCode: 2000,
    settings: {
      adminPassword: 'Zohor@2026',
      deliveryFee: 0.5,
      area: 'منطقة جبل الزهور',
      subscriptionFee: SUBSCRIPTION_FEE,
      orderCommission: ORDER_COMMISSION,
    },
    shops: [
      {
        id: 's' + nid(), name: 'بقالة أبو أحمد', owner: 'أحمد العلي', phone: '0790000001',
        category: 'بقالة', icon: '🛒', rating: 4.8, status: 'active', isOpen: true,
        subscriptionUntil: now + 21 * DAY, createdAt: now,
        products: [
          P('زيت زيتون بلدي 1 لتر', 8.5, 'قنينة', '🫒', 10.0),
          P('خبز صاج', 0.3, 'ربطة', '🫓'),
          P('حليب طازج 1 لتر', 1.1, 'عبوة', '🥛'),
          P('بيض بلدي — طبق', 1.75, 'طبق', '🥚'),
          P('جبنة عكاوي 250غ', 2.25, 'علبة', '🧀'),
          P('سكر 1 كغ', 0.9, 'كيس', '🍬'),
          P('أرز 1 كغ', 1.6, 'كيس', '🍚'),
          P('مياه معدنية 6×1.5ل', 1.8, 'عبوة', '💧'),
        ],
      },
      {
        id: 's' + nid(), name: 'خضار وفواكه أم محمد', owner: 'أم محمد', phone: '0790000002',
        category: 'خضار وفواكه', icon: '🥬', rating: 4.9, status: 'active', isOpen: true,
        subscriptionUntil: now + 12 * DAY, createdAt: now,
        products: [
          P('طماطم', 0.65, 'كغ', '🍅'),
          P('خيار', 0.6, 'كغ', '🥒'),
          P('بطاطا', 0.75, 'كغ', '🥔'),
          P('بصل', 0.7, 'كغ', '🧅'),
          P('ليمون', 0.9, 'كغ', '🍋'),
          P('فلفل أخضر', 1.1, 'كغ', '🫑'),
          P('تفاح بلدي', 1.6, 'كغ', '🍎'),
          P('موز', 1.45, 'كغ', '🍌'),
          P('عنب حلواني', 2.4, 'كغ', '🍇'),
        ],
      },
      {
        id: 's' + nid(), name: 'مطعم ومناقيش أبو خالد', owner: 'خالد سعيد', phone: '0790000003',
        category: 'مطعم', icon: '🍴', rating: 4.7, status: 'active', isOpen: true,
        subscriptionUntil: now + 27 * DAY, createdAt: now,
        products: [
          P('مسخن دجاج', 3.5, 'طبق', '🍗', 4.5),
          P('مناقيش زعتر', 0.35, 'حبة', '🫓'),
          P('مناقيش جبنة', 0.6, 'حبة', '🧀'),
          P('فلافل — 12 حبة', 0.75, 'كيس', '🧆'),
          P('حمص بالطحينة', 1.25, 'طبق', '🥣'),
          P('فول مدمس', 1.0, 'طبق', '🫘'),
          P('شاي بالنعنع', 0.25, 'كوب', '🍵'),
        ],
      },
      {
        id: 's' + nid(), name: 'لحوم ومجمدات أبو عمر', owner: 'عمر القضاة', phone: '0790000004',
        category: 'لحوم ومجمدات', icon: '🥩', rating: 4.6, status: 'active', isOpen: true,
        subscriptionUntil: now + 8 * DAY, createdAt: now,
        products: [
          P('دجاج كامل طازج', 2.6, 'كغ', '🐔'),
          P('لحم عجل مفروم', 7.5, 'كغ', '🥩'),
          P('كفتة بالبقدونس', 7.0, 'كغ', '🍢'),
          P('شيش طاووق', 5.5, 'كغ', '🍗'),
          P('برجر بقري — علبة', 3.25, 'علبة', '🍔'),
          P('أصابع دجاج مجمدة', 2.9, 'كيس', '🍟'),
          P('سجق بلدي', 5.0, 'كغ', '🌭'),
        ],
      },
      {
        id: 's' + nid(), name: 'مخبز الزهور', owner: 'سعيد المخاوي', phone: '0790000005',
        category: 'مخبز', icon: '🥖', rating: 4.8, status: 'active', isOpen: true,
        subscriptionUntil: now + 18 * DAY, createdAt: now,
        products: [
          P('خبز عربي', 0.25, 'حبة', '🥖'),
          P('كعك بالسمسم', 0.3, 'حبة', '🥨'),
          P('كيك إسفنجي — قالب', 2.5, 'قالب', '🎂'),
          P('كنافة نابلسية', 4.5, 'كغ', '🥮'),
          P('دونات', 0.5, 'حبة', '🍩'),
        ],
      },
      {
        id: 's' + nid(), name: 'موبايلات الزهور', owner: 'لؤي الحسن', phone: '0790000006',
        category: 'موبايلات واكسسوارات وبطاقات شحن', icon: '📱', rating: 4.7, status: 'active', isOpen: true,
        subscriptionUntil: now + 25 * DAY, createdAt: now,
        products: [
          P('شاحن سريع Type-C', 4.5, 'حبة', '🔌', 5.5),
          P('بطاقة شحن أوريدو 5 دنانير', 5.25, 'بطاقة', '🎫'),
          P('بطاقة شحن زين 10 دنانير', 10.4, 'بطاقة', '💳'),
          P('سماعة سلكية', 2.0, 'حبة', '🎧'),
          P('كفر حماية', 1.5, 'حبة', '📱'),
          P('سكرين حماية زجاجية', 1.75, 'حبة', '🛡️'),
        ],
      },
      {
        id: 's' + nid(), name: 'اجهزة النور الكهربائية', owner: 'نور الدين', phone: '0790000007',
        category: 'اجهزة كهربائية والكترونيات', icon: '💡', rating: 4.5, status: 'active', isOpen: true,
        subscriptionUntil: now + 15 * DAY, createdAt: now,
        products: [
          P('لمبة LED موفرة', 1.25, 'حبة', '💡'),
          P('غلاية ماء كهربائية', 9.5, 'حبة', '🫖'),
          P('مروحة طاولة', 12.0, 'حبة', '🌀'),
          P('دفاية كهربائية', 15.0, 'حبة', '🔥'),
          P('بطارية قلوية AA — 4 حبات', 1.1, 'عبوة', '🔋'),
          P('ماسحة كهربائية', 8.75, 'حبة', '🧹'),
        ],
      },
      {
        id: 's' + nid(), name: 'خدمات أبو سامر للصيانة', owner: 'سامر الزعبي', phone: '0790000008',
        category: 'صيانة ومقاولات', icon: '🔧', rating: 4.9, status: 'active', isOpen: true,
        subscriptionUntil: now + 30 * DAY, createdAt: now,
        products: [
          P('زيارة فني سباكة', 5.0, 'زيارة', '🚰'),
          P('صيانة مكيف سبليت', 10.0, 'زيارة', '❄️'),
          P('تركيب ستائر', 4.0, 'زيارة', '🪟'),
          P('صيانة كهرباء منزلية', 6.0, 'زيارة', '⚡'),
          P('دهان حائط — لتر', 2.5, 'لتر', '🎨'),
        ],
      },
      {
        id: 's' + nid(), name: 'دراي كلين النقاء', owner: 'مازن الفقيه', phone: '0790000009',
        category: 'دراي كلين', icon: '🧺', rating: 4.6, status: 'active', isOpen: true,
        subscriptionUntil: now + 6 * DAY, createdAt: now,
        products: [
          P('تنظيفة كنبة 3 مقاعد', 8.0, 'خدمة', '🛋️'),
          P('تنظيفة سجادة 2×3', 5.0, 'خدمة', '🧶'),
          P('غسيل ستائر — طقم', 4.0, 'خدمة', '🪟'),
          P('كي وشوي بدلة', 3.5, 'خدمة', '👔'),
          P('غسيل مبطنة', 6.0, 'خدمة', '🛏️'),
        ],
      },
      {
        id: 's' + nid(), name: 'عطارة أبو وليد', owner: 'وليد المصري', phone: '0790000010',
        category: 'أخرى', icon: '🌿', rating: 4.8, status: 'active', isOpen: true,
        subscriptionUntil: now + 20 * DAY, createdAt: now,
        products: [
          P('زعتر بلدي 250غ', 1.5, 'كيس', '🌿'),
          P('بهارات مشكلة 100غ', 0.8, 'كيس', '🧂'),
          P('قهوة عربية 250غ', 3.5, 'كيس', '☕'),
          P('تمر عجوة 1 كغ', 4.75, 'كغ', '🌴'),
          P('خل تفاح 1ل', 1.1, 'قنينة', '🍶'),
        ],
      },
      {
        id: 's' + nid(), name: 'فلترة المياه الزهور', owner: 'فادي الطرحيني', phone: '0790000012',
        category: 'مياه شرب', icon: '💧', rating: 4.7, status: 'active', isOpen: true,
        subscriptionUntil: now + 14 * DAY, createdAt: now,
        products: [
          P('فلتر مياه منزلي 5 مراحل', 25.0, 'حبة', '🫗', 30.0),
          P('عبوة مياه مقطرة 40 لتر', 1.5, 'عبوة', '💧'),
          P('عبوة مياه معدنية 20 لتر', 1.0, 'عبوة', '🚰'),
          P('كارتريدج فلتر بديل', 3.5, 'حبة', '🔄'),
          P('مضخة مياه كهربائية', 12.0, 'حبة', '⚙️'),
        ],
      },
      {
        id: 's' + nid(), name: 'بقالة السلام (جديدة)', owner: 'يوسف سلام', phone: '0790000011',
        category: 'بقالة', icon: '🛒', rating: 5, status: 'pending', isOpen: true,
        subscriptionUntil: null, createdAt: now,
        products: [],
      },
    ],
    customers: [],
    drivers: [
      {
        id: 'd' + nid(), name: 'أبو يزن', phone: '0790000099',
        status: 'active', docsSubmitted: true, idImage: null, licenseImage: null,
        phone2: '', address: '',
        online: false, deliveries: 27, earnings: 13.5, createdAt: now,
      },
    ],
    ads: [
      {
        id: 'a' + nid(), title: '🥩 عرض أبو عمر للحوم', body: 'خصم 10% على الطلبات فوق 10 دنانير هذا الأسبوع', active: true,
      },
      {
        id: 'a' + nid(), title: '🌸 انشر محلك معنا', body: 'اشتراك 10 دنانير شهرياً + 20 قرش على الطلب — تواصل مع الإدارة', active: true,
      },
    ],
    orders: [],
  };
  // مهم: العدّاد يُحفظ بعد بناء كل المعرفات — وإلا تكررت المعرّفات وتختلط بيانات المحلات!
  data.seq = id;
  return data;
}

function loadFromLocalFile() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return true;
    }
  } catch (e) {
    console.error('تعذر قراءة الملف المحلي:', e.message);
  }
  return false;
}

async function loadDb() {
  if (pgPool) {
    try {
      // إنشاء الجدول إن لم يوجد ثم جلب الحالة
      await pgPool.query(
        'CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())'
      );
      const r = await pgPool.query('SELECT data FROM app_state WHERE id = 1');
      if (r.rows.length) {
        db = r.rows[0].data;
        console.log('✅ حُمّلت البيانات من السحابة — محلات:', db.shops.length, '| طلبات:', db.orders.length);
        return;
      }
      // قاعدة فارغة: هل نستورد ملفاً محلياً قديماً (ترحيل بياناتك الحالية)؟
      if (loadFromLocalFile()) {
        console.log('📦 استُوردت البيانات المحلية إلى السحابة — محلات:', db.shops.length);
      } else {
        db = seedDb();
        console.log('🌱 أُنشئت بيانات أولى جديدة في السحابة');
      }
      await pgPersist();
      return;
    } catch (e) {
      console.error('❌ خطأ قاعدة البيانات السحابية:', e.message);
      console.log('↩️  سنعمل بالملف المحلي مؤقتاً حتى تعود الاتصال');
    }
  }
  if (!loadFromLocalFile()) {
    db = seedDb();
    saveDb();
  }
}
function resetDb() {
  db = seedDb();
  saveDb();
}

/* ---------------- أدوات مساعدة ---------------- */

const round2 = (n) => Math.round(n * 100) / 100;

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
const bad = (res, msg, code) => json(res, code || 400, { error: msg });

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function publicShop(s) {
  return {
    id: s.id, name: s.name, category: s.category, icon: s.icon, rating: s.rating,
    isOpen: s.isOpen, status: s.status, productCount: s.products.length,
    subscriptionActive: !!(s.subscriptionUntil && s.subscriptionUntil > Date.now()),
    image: s.image || CATEGORY_IMAGES[s.category] || null,
  };
}
const subActive = (s) => !!(s.subscriptionUntil && s.subscriptionUntil > Date.now());
function findShop(id) { return db.shops.find((s) => s.id === id); }
function findDriver(id) { return db.drivers.find((d) => d.id === id); }
function findOrder(id) { return db.orders.find((o) => o.id === id); }

const TIMELINE_LABELS = {
  created: 'أُرسل الطلب',
  accepted: 'قبل المحل الطلب',
  ready: 'الطلب جاهز للاستلام',
  assigned: 'السائق في طريقه للمحل',
  picked_up: 'السائق استلم الطلب',
  delivered: 'تم التوصيل بنجاح ✅',
  rejected: 'رفض المحل الطلب',
  cancelled: 'أُلغي الطلب',
};

function pushTimeline(order, key) {
  order.timeline.push({ key, label: TIMELINE_LABELS[key] || key, at: Date.now() });
}

/* ---------------- الموجّه (Router) ---------------- */

async function handleApi(req, res, pathname, url) {
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]
  const m = req.method;
  const body = (m === 'GET') ? {} : await readBody(req);
  const q = (k) => url.searchParams.get(k);

  // 🛡️ حماية الإدارة: كل مسارات /api/admin تتطلب رمز جلسة صحيح
  if (parts[1] === 'admin' && pathname !== '/api/admin/login') {
    if (!db.settings.adminToken || req.headers['x-admin-token'] !== db.settings.adminToken) {
      return bad(res, 'غير مصرح — سجّل دخول الإدارة أولاً', 401);
    }
  }

  /* ---------- عام ---------- */
  if (m === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, app: 'zohor-express', area: db.settings.area });

  } else if (m === 'GET' && pathname === '/api/ads') {
    return json(res, 200, { ads: db.ads.filter((a) => a.active) });

  } else if (m === 'GET' && pathname === '/api/offers') {
    // كل العروض والتخفيضات من المحلات الفعّالة
    const offers = [];
    for (const s of db.shops) {
      if (s.status !== 'active') continue;
      for (const p of s.products) {
        if (p.oldPrice && p.oldPrice > p.price && p.available) {
          offers.push({
            shopId: s.id, shopName: s.name, shopIcon: s.icon,
            product: p,
            discount: Math.round((1 - p.price / p.oldPrice) * 100),
          });
        }
      }
    }
    offers.sort((a, b) => b.discount - a.discount);
    return json(res, 200, { offers });

  /* ---------- الزبون ---------- */
  } else if (m === 'POST' && pathname === '/api/customers/login') {
    const { name, phone, phone2, area, street, building, landmark } = body;
    const norm = normPhone(phone);
    if (!validPhone(norm)) return bad(res, 'رقم الجوال غير صحيح — مثال صحيح: 0791234567');
    const p2 = phone2 ? normPhone(phone2) : '';
    let c = db.customers.find((x) => x.phone === norm);
    if (!c) {
      c = { id: nextId('c'), name: name || 'زبون', phone: norm, phone2: p2,
        area: area || '', street: street || '', building: building || '', landmark: landmark || '',
        address: '', createdAt: Date.now() };
      db.customers.push(c);
    } else {
      if (name) c.name = name;
      if (phone2 !== undefined) c.phone2 = p2;
      if (area !== undefined) c.area = area;
      if (street !== undefined) c.street = street;
      if (building !== undefined) c.building = building;
      if (landmark !== undefined) c.landmark = landmark;
    }
    c.address = buildAddress(c);
    saveDb();
    return json(res, 200, { customer: c });

  /* ---------- المحلات ---------- */
  } else if (m === 'GET' && pathname === '/api/categories') {
    return json(res, 200, { categories: CATEGORIES, icons: CATEGORY_ICONS });

  } else if (m === 'GET' && pathname === '/api/shops') {
    const all = q('all') === '1';
    // للزبائن: المحلات الفعّالة فقط + اشتراكها ساري (أو فترة تجريبية)
    // مع all=1 (لصفحة دخول المحلات والإدارة): تُضاف بيانات التواصل والعنوان
    const shops = db.shops
      .filter((s) => all || (s.status === 'active' && subActive(s)))
      .map((s) => all
        ? { ...publicShop(s), ownerPhone: s.phone, phone2: s.phone2 || '', address: s.address || '' }
        : publicShop(s));
    return json(res, 200, { shops });

  } else if (m === 'POST' && pathname === '/api/shops/register') {
    const { name, owner, phone, category, phone2, area, street, landmark } = body;
    if (!name || !owner || !phone) return bad(res, 'يرجى تعبئة جميع الحقول');
    const norm = normPhone(phone);
    if (!validPhone(norm)) return bad(res, 'رقم الجوال غير صحيح — مثال صحيح: 0791234567');
    const exists = db.shops.find((s) => s.phone === norm);
    if (exists) return bad(res, 'يوجد محل مسجل بهذا الرقم مسبقاً — ادخل عليه من القائمة');
    const password = String(body.password || '');
    if (password.length < 4) return bad(res, 'الرقم السري مطلوب (4 خانات على الأقل) — ستحتاجه لإدارة محلك');
    const cat = CATEGORIES.includes(category) ? category : 'أخرى';
    const shop = {
      id: nextId('s'), name, owner, phone: norm,
      category: cat, icon: CATEGORY_ICONS[cat], rating: 5,
      status: 'active', isOpen: true,
      subscriptionUntil: Date.now() + TRIAL_DAYS * 86400000,
      trial: true,
      password,
      phone2: phone2 ? normPhone(phone2) : '',
      address: [area, street, landmark].filter(Boolean).join(' — '),
      createdAt: Date.now(), products: [],
    };
    db.shops.push(shop);
    saveDb();
    return json(res, 200, { shop });

  } else if (m === 'POST' && pathname === '/api/shops/login') {
    const shop = findShop(body.shopId);
    if (!shop) return bad(res, 'المحل غير موجود', 404);
    if (shop.status === 'blocked') return bad(res, 'تم إيقاف هذا المحل. تواصل مع الإدارة', 403);
    const pass = String(body.password || '');
    if (!pass) return bad(res, 'أدخل الرقم السري للمحل');
    if (pass !== (shop.password || SEED_SHOP_PASSWORD)) return bad(res, 'الرقم السري غير صحيح', 401);
    return json(res, 200, { shop });

  } else if (m === 'PATCH' && parts[1] === 'shops' && parts[2] && parts[3] === 'password') {
    // تغيير الرقم السري
    const shop = findShop(parts[2]);
    if (!shop) return bad(res, 'المحل غير موجود', 404);
    const oldPass = String(body.oldPassword || '');
    const newPass = String(body.newPassword || '');
    if (oldPass !== (shop.password || SEED_SHOP_PASSWORD)) return bad(res, 'الرقم السري الحالي غير صحيح', 401);
    if (newPass.length < 4) return bad(res, 'الرقم السري الجديد يجب أن يكون 4 خانات على الأقل');
    shop.password = newPass;
    saveDb();
    return json(res, 200, { ok: true });

  } else if (parts[1] === 'shops' && parts[2] && !parts[3]) {
    const shop = findShop(parts[2]);
    if (!shop) return bad(res, 'المحل غير موجود', 404);
    if (m === 'GET') return json(res, 200, { shop });
    if (m === 'PATCH') {
      if (typeof body.isOpen === 'boolean') shop.isOpen = body.isOpen;
      if (body.name) shop.name = body.name;
      saveDb();
      return json(res, 200, { shop });
    }

  } else if (parts[1] === 'shops' && parts[2] && parts[3] === 'products' && !parts[4]) {
    const shop = findShop(parts[2]);
    if (!shop) return bad(res, 'المحل غير موجود', 404);
    if (m === 'POST') {
      const { name, price, unit, emoji, image } = body;
      if (!name || price == null || isNaN(+price) || +price < 0) return bad(res, 'اسم المنتج والسعر مطلوبان');
      if (image) {
        if (!String(image).startsWith('data:image/')) return bad(res, 'صورة غير صالحة');
        if (String(image).length > 600000) return bad(res, 'الصورة كبيرة جداً');
      }
      const product = {
        id: nextId('p'), name, price: round2(+price),
        unit: unit || 'حبة', emoji: emoji || '📦', available: true,
        ...(image ? { image } : {}),
      };
      shop.products.push(product);
      saveDb();
      return json(res, 200, { product, shop });
    }

  } else if (parts[1] === 'shops' && parts[2] && parts[3] === 'products' && parts[4]) {
    const shop = findShop(parts[2]);
    if (!shop) return bad(res, 'المحل غير موجود', 404);
    const product = shop.products.find((p) => p.id === parts[4]);
    if (!product) return bad(res, 'المنتج غير موجود', 404);
    if (m === 'PATCH') {
      if (body.name) product.name = body.name;
      if (body.unit) product.unit = body.unit;
      if (body.emoji) product.emoji = body.emoji;
      if (body.price != null && !isNaN(+body.price)) product.price = round2(+body.price);
      if (typeof body.available === 'boolean') product.available = body.available;
      // صورة المنتج (إضافة أو تغيير أو إزالة بـ null)
      if (body.image === null) delete product.image;
      else if (body.image) {
        if (!String(body.image).startsWith('data:image/')) return bad(res, 'صورة غير صالحة');
        if (String(body.image).length > 600000) return bad(res, 'الصورة كبيرة جداً');
        product.image = body.image;
      }
      // نظام العروض: oldPrice = السعر قبل التخفيض (null لإلغاء العرض)
      if (body.oldPrice === null) delete product.oldPrice;
      else if (body.oldPrice != null && !isNaN(+body.oldPrice) && +body.oldPrice > 0) product.oldPrice = round2(+body.oldPrice);
      saveDb();
      return json(res, 200, { product, shop });
    }
    if (m === 'DELETE') {
      shop.products = shop.products.filter((p) => p.id !== product.id);
      saveDb();
      return json(res, 200, { ok: true, shop });
    }

  /* ---------- الطلبات ---------- */
  } else if (m === 'POST' && pathname === '/api/orders') {
    const { shopId, customer, items, notes } = body;
    const shop = findShop(shopId);
    if (!shop) return bad(res, 'المحل غير موجود', 404);
    if (shop.status !== 'active') return bad(res, 'هذا المحل غير مفعّل حالياً');
    if (!shop.isOpen) return bad(res, 'المحل مغلق حالياً، جرّب لاحقاً');
    if (!subActive(shop)) return bad(res, 'انتهى اشتراك هذا المحل — سيعود قريباً');
    if (!customer || !validPhone(normPhone(customer.phone))) return bad(res, 'رقم جوال الزبون غير صحيح');
    if (!customer.address || !String(customer.address).trim()) return bad(res, 'العنوان مطلوب للتوصيل');
    if (!Array.isArray(items) || !items.length) return bad(res, 'السلة فارغة');

    // التحقق من المنتجات واحتساب الإجمالي (الأسعار من الخادم دائماً)
    const orderItems = [];
    for (const it of items) {
      const p = shop.products.find((x) => x.id === it.productId);
      if (!p) return bad(res, 'أحد المنتجات غير متوفر');
      if (!p.available) return bad(res, `المنتج «${p.name}» غير متوفر حالياً`);
      const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
      orderItems.push({ productId: p.id, name: p.name, emoji: p.emoji, unit: p.unit, price: p.price, qty });
    }
    const subtotal = round2(orderItems.reduce((s, i) => s + i.price * i.qty, 0));
    const deliveryFee = db.settings.deliveryFee;

    // إنشاء/تحديث بيانات الزبون
    const custPhone = normPhone(customer.phone);
    let cust = db.customers.find((x) => x.phone === custPhone);
    if (!cust) {
      cust = { id: nextId('c'), name: customer.name || 'زبون', phone: custPhone, address: customer.address, createdAt: Date.now() };
      db.customers.push(cust);
    } else {
      cust.name = customer.name || cust.name;
      cust.address = customer.address;
    }

    const order = {
      id: nextId('o'),
      code: nextOrderCode(),
      area: db.settings.area,
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      customerPhone2: (customer.phone2 ? normPhone(customer.phone2) : '') || cust.phone2 || '',
      address: cust.address,
      shopId: shop.id,
      shopName: shop.name,
      shopIcon: shop.icon,
      items: orderItems,
      subtotal, deliveryFee,
      total: round2(subtotal + deliveryFee),
      platformCommission: db.settings.orderCommission, // 20 قرش عمولة المنصة
      payment: 'نقداً عند الاستلام',
      notes: notes || '',
      status: 'pending',
      driverId: null,
      driverName: null,
      timeline: [],
      createdAt: Date.now(),
    };
    pushTimeline(order, 'created');
    db.orders.push(order);
    saveDb();
    return json(res, 200, { order });

  } else if (m === 'GET' && pathname === '/api/orders') {
    let list = db.orders.slice();
    if (q('customer')) list = list.filter((o) => o.customerId === q('customer') || o.customerPhone === q('customer'));
    if (q('shop')) list = list.filter((o) => o.shopId === q('shop'));
    if (q('driver')) list = list.filter((o) => o.driverId === q('driver'));
    if (q('pool') === '1') list = list.filter((o) => o.status === 'ready' && !o.driverId);
    if (q('status')) list = list.filter((o) => o.status === q('status'));
    if (q('active') === '1') list = list.filter((o) => !['delivered', 'rejected', 'cancelled'].includes(o.status));
    list.sort((a, b) => b.createdAt - a.createdAt);
    return json(res, 200, { orders: list });

  } else if (parts[1] === 'orders' && parts[2] && !parts[3]) {
    const order = findOrder(parts[2]);
    if (!order) return bad(res, 'الطلب غير موجود', 404);
    if (m === 'GET') {
      // إرفاق موقع السائق الحديث إن كان مكلّفاً بالطلب
      const out = { order };
      if (order.driverId) {
        const drv = findDriver(order.driverId);
        if (drv && drv.location && Date.now() - drv.location.updatedAt < 15 * 60000) {
          out.driverLocation = drv.location;
        }
      }
      return json(res, 200, out);
    }

    if (m === 'PATCH') {
      const action = body.action;
      const allowed = {
        accept: ['pending'], reject: ['pending'], ready: ['accepted'],
        assign: ['ready'], pickup: ['assigned'], deliver: ['picked_up'],
        cancel: ['pending', 'accepted'],
      };
      if (!allowed[action]) return bad(res, 'إجراء غير معروف');
      if (!allowed[action].includes(order.status)) {
        return bad(res, 'لا يمكن تنفيذ هذا الإجراء على حالة الطلب الحالية');
      }

      if (action === 'accept') { order.status = 'accepted'; pushTimeline(order, 'accepted'); }
      else if (action === 'reject') { order.status = 'rejected'; pushTimeline(order, 'rejected'); }
      else if (action === 'ready') { order.status = 'ready'; pushTimeline(order, 'ready'); }
      else if (action === 'assign') {
        const driver = findDriver(body.driverId);
        if (!driver) return bad(res, 'السائق غير موجود', 404);
        if (driver.status !== 'active') return bad(res, 'حساب السائق موقوف', 403);
        if (!driver.online) return bad(res, 'يجب أن تكون متاحاً (متصل) لقبول الطلبات');
        order.status = 'assigned';
        order.driverId = driver.id;
        order.driverName = driver.name;
        pushTimeline(order, 'assigned');
      } else if (action === 'pickup') { order.status = 'picked_up'; pushTimeline(order, 'picked_up'); }
      else if (action === 'deliver') {
        order.status = 'delivered';
        pushTimeline(order, 'delivered');
        const driver = findDriver(order.driverId);
        if (driver) { driver.deliveries += 1; driver.earnings = round2(driver.earnings + order.deliveryFee); }
      } else if (action === 'cancel') { order.status = 'cancelled'; pushTimeline(order, 'cancelled'); }

      saveDb();
      return json(res, 200, { order });
    }

  /* ---------- السائقون ---------- */
  } else if (m === 'POST' && pathname === '/api/drivers/login') {
    const { name, phone } = body;
    const norm = normPhone(phone);
    if (!validPhone(norm)) return bad(res, 'رقم الجوال غير صحيح — مثال صحيح: 0791234567');
    let d = db.drivers.find((x) => x.phone === norm);
    if (!d) {
      d = { id: nextId('d'), name: name || 'سائق', phone: norm, status: 'pending',
        docsSubmitted: false, idImage: null, licenseImage: null,
        phone2: '', address: '', online: false, deliveries: 0, earnings: 0, createdAt: Date.now() };
      db.drivers.push(d);
    } else if (name) {
      d.name = name;
    }
    saveDb();
    return json(res, 200, { driver: d });

  } else if (m === 'PATCH' && parts[1] === 'drivers' && parts[2] && parts[3] === 'location') {
    // تحديث موقع السائق المباشر (GPS)
    const driver = findDriver(parts[2]);
    if (!driver) return bad(res, 'السائق غير موجود', 404);
    const lat = parseFloat(body.lat), lng = parseFloat(body.lng);
    if (isNaN(lat) || isNaN(lng)) {
      driver.location = null;
    } else {
      driver.location = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), updatedAt: Date.now() };
    }
    saveDb();
    return json(res, 200, { ok: true });

  } else if (m === 'PATCH' && parts[1] === 'drivers' && parts[2] && parts[3] === 'docs') {
    // رفع صورة الهوية ورخصة السيارة + بيانات إضافية
    const driver = findDriver(parts[2]);
    if (!driver) return bad(res, 'السائق غير موجود', 404);
    if (body.idImage) {
      if (String(body.idImage).length > 700000) return bad(res, 'صورة الهوية كبيرة جداً');
      driver.idImage = body.idImage;
    }
    if (body.licenseImage) {
      if (String(body.licenseImage).length > 700000) return bad(res, 'صورة الرخصة كبيرة جداً');
      driver.licenseImage = body.licenseImage;
    }
    if (body.phone2 !== undefined) driver.phone2 = body.phone2 ? normPhone(body.phone2) : '';
    if (body.address !== undefined) driver.address = String(body.address).slice(0, 200);
    driver.docsSubmitted = !!(driver.idImage && driver.licenseImage);
    saveDb();
    return json(res, 200, { driver });

  } else if (parts[1] === 'drivers' && parts[2] && !parts[3]) {
    const driver = findDriver(parts[2]);
    if (!driver) return bad(res, 'السائق غير موجود', 404);
    if (m === 'GET') return json(res, 200, { driver });
    if (m === 'PATCH') {
      if (body.online === true && driver.status !== 'active') {
        return bad(res, 'حسابك بانتظار اعتماد الإدارة — لا يمكن التفعيل الآن', 403);
      }
      if (typeof body.online === 'boolean') driver.online = body.online;
      saveDb();
      return json(res, 200, { driver });
    }

  /* ---------- الإدارة ---------- */
  } else if (m === 'POST' && pathname === '/api/admin/login') {
    if (body.password !== db.settings.adminPassword) return bad(res, 'كلمة المرور غير صحيحة', 401);
    // رمز جلسة جديد في كل دخول ناجح
    db.settings.adminToken = crypto.randomBytes(24).toString('hex');
    saveDb();
    return json(res, 200, { ok: true, token: db.settings.adminToken });

  } else if (m === 'GET' && pathname === '/api/admin/overview') {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayOrders = db.orders.filter((o) => o.createdAt >= todayStart);
    const deliveredToday = todayOrders.filter((o) => o.status === 'delivered');
    const billable = db.orders.filter((o) => !['cancelled', 'rejected'].includes(o.status));
    const activeShops = db.shops.filter((s) => s.status === 'active');
    return json(res, 200, {
      stats: {
        ordersToday: todayOrders.length,
        activeOrders: db.orders.filter((o) => !['delivered', 'rejected', 'cancelled'].includes(o.status)).length,
        totalOrders: db.orders.length,
        revenueToday: round2(deliveredToday.reduce((s, o) => s + o.total, 0)),
        activeShops: activeShops.length,
        pendingShops: db.shops.filter((s) => s.status === 'pending').length,
        onlineDrivers: db.drivers.filter((d) => d.online && d.status === 'active').length,
        totalDrivers: db.drivers.length,
        pendingDrivers: db.drivers.filter((d) => d.status === 'pending').length,
        totalCustomers: db.customers.length,
        // إيرادات المنصة
        monthlySubscriptions: round2(activeShops.length * db.settings.subscriptionFee),
        commissionsTotal: round2(billable.length * db.settings.orderCommission),
        platformRevenue: round2(activeShops.length * db.settings.subscriptionFee + billable.length * db.settings.orderCommission),
        activeAds: db.ads.filter((a) => a.active).length,
      },
      latestOrders: db.orders.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 8),
    });

  } else if (parts[1] === 'admin' && parts[2] === 'shops' && parts[3] && !parts[4]) {
    const shop = findShop(parts[3]);
    if (!shop) return bad(res, 'المحل غير موجود', 404);
    if (m === 'PATCH') {
      if (['active', 'pending', 'blocked'].includes(body.status)) shop.status = body.status;
      if (typeof body.isOpen === 'boolean') shop.isOpen = body.isOpen;
      if (body.action === 'renew') {
        const base = shop.subscriptionUntil && shop.subscriptionUntil > Date.now() ? shop.subscriptionUntil : Date.now();
        shop.subscriptionUntil = base + 30 * 86400000;
        if (shop.status === 'pending') shop.status = 'active';
      }
      saveDb();
      return json(res, 200, { shop });
    }

  } else if (m === 'GET' && pathname === '/api/admin/drivers') {
    return json(res, 200, { drivers: db.drivers });

  } else if (parts[1] === 'admin' && parts[2] === 'drivers' && parts[3]) {
    const driver = findDriver(parts[3]);
    if (!driver) return bad(res, 'السائق غير موجود', 404);
    if (m === 'PATCH') {
      if (['active', 'blocked'].includes(body.status)) {
        driver.status = body.status;
        if (body.status === 'blocked') driver.online = false;
      }
      saveDb();
      return json(res, 200, { driver });
    }

  /* ---------- الإعلانات (مساحات إعلانية) ---------- */
  } else if (m === 'GET' && pathname === '/api/admin/ads') {
    return json(res, 200, { ads: db.ads });

  } else if (m === 'POST' && pathname === '/api/admin/ads') {
    const { title, body: adBody } = body;
    if (!title || !adBody) return bad(res, 'عنوان ونص الإعلان مطلوبان');
    const ad = { id: nextId('a'), title, body: adBody, active: true };
    db.ads.push(ad);
    saveDb();
    return json(res, 200, { ad });

  } else if (parts[1] === 'admin' && parts[2] === 'ads' && parts[3]) {
    const ad = db.ads.find((a) => a.id === parts[3]);
    if (!ad) return bad(res, 'الإعلان غير موجود', 404);
    if (m === 'PATCH') {
      if (typeof body.active === 'boolean') ad.active = body.active;
      if (body.title) ad.title = body.title;
      if (body.body) ad.body = body.body;
      saveDb();
      return json(res, 200, { ad });
    }
    if (m === 'DELETE') {
      db.ads = db.ads.filter((a) => a.id !== ad.id);
      saveDb();
      return json(res, 200, { ok: true });
    }

  } else if (m === 'POST' && pathname === '/api/admin/reset') {
    if (body.password !== db.settings.adminPassword) return bad(res, 'كلمة المرور غير صحيحة', 401);
    resetDb();
    return json(res, 200, { ok: true });
  }

  return bad(res, 'المسار غير موجود: ' + pathname, 404);
}

/* ---------------- الملفات الثابتة ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function serveStatic(res, pathname) {
  let file = pathname === '/' ? '/index.html' : pathname;
  const full = path.normalize(path.join(PUBLIC_DIR, file));
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — الصفحة غير موجودة');
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

/* ---------------- التشغيل ---------------- */

dbReady = loadDb();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname, url).catch((e) => {
      console.error('API error:', e);
      bad(res, 'خطأ داخلي في الخادم', 500);
    });
  } else {
    serveStatic(res, pathname);
  }
});

dbReady.then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌸 الزهور اكسبرس يعمل الآن على المنفذ ${PORT} — منطقة ${db.settings.area}`);
  });
}).catch((e) => {
  console.error('فشل تهيئة البيانات:', e);
  process.exit(1);
});
