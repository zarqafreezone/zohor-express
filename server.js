/* ============================================================
   الزهور اكسبرس — خادم بدون أي اعتماديات خارجية (Node.js خالص)
   يقدّم: REST API + الملفات الثابتة (الواجهات)
   نموذج الإيرادات: اشتراك شهري 10 دنانير من البقالات
                    + 20 قرش عمولة على كل طلب + مساحات إعلانية
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

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
  'محلات فلترة المياه',
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

const SUBSCRIPTION_FEE = 10;   // دينار شهرياً من البقالة
const ORDER_COMMISSION = 0.2;  // 20 قرش على كل طلب

/* ---------------- قاعدة البيانات (ملف JSON) ---------------- */

let db = null;

function nextId(prefix) {
  db.seq += 1;
  return prefix + db.seq;
}
function nextOrderCode() {
  db.orderCode += 1;
  return String(db.orderCode);
}
function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function seedDb() {
  const now = Date.now();
  const DAY = 86400000;
  let id = 2000;
  const nid = () => (id += 1);

  const P = (name, price, unit, emoji) => ({
    id: 'p' + nid(), name, price, unit, emoji: emoji || '📦', available: true,
  });

  return {
    seq: id,
    orderCode: 2000,
    settings: {
      adminPassword: 'admin123',
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
          P('خبز صاج', 0.3, 'ربطة', '🫓'),
          P('حليب طازج 1 لتر', 1.1, 'عبوة', '🥛'),
          P('بيض بلدي — طبق', 1.75, 'طبق', '🥚'),
          P('جبنة عكاوي 250غ', 2.25, 'علبة', '🧀'),
          P('زيت زيتون بلدي 1 لتر', 8.5, 'قنينة', '🫒'),
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
          P('مناقيش زعتر', 0.35, 'حبة', '🫓'),
          P('مناقيش جبنة', 0.6, 'حبة', '🧀'),
          P('فلافل — 12 حبة', 0.75, 'كيس', '🧆'),
          P('حمص بالطحينة', 1.25, 'طبق', '🥣'),
          P('فول مدمس', 1.0, 'طبق', '🫘'),
          P('مسخن دجاج', 3.5, 'طبق', '🍗'),
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
          P('بطاقة شحن أوريدو 5 دنانير', 5.25, 'بطاقة', '🎫'),
          P('بطاقة شحن زين 10 دنانير', 10.4, 'بطاقة', '💳'),
          P('شاحن سريع Type-C', 4.5, 'حبة', '🔌'),
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
        category: 'محلات فلترة المياه', icon: '💧', rating: 4.7, status: 'active', isOpen: true,
        subscriptionUntil: now + 14 * DAY, createdAt: now,
        products: [
          P('عبوة مياه مقطرة 40 لتر', 1.5, 'عبوة', '💧'),
          P('عبوة مياه معدنية 20 لتر', 1.0, 'عبوة', '🚰'),
          P('فلتر مياه منزلي 5 مراحل', 25.0, 'حبة', '🫗'),
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
        status: 'active', online: false, deliveries: 27, earnings: 13.5, createdAt: now,
      },
    ],
    ads: [
      {
        id: 'a' + nid(), title: '🥩 عرض أبو عمر للحوم', body: 'خصم 10% على الطلبات فوق 10 دنانير هذا الأسبوع', active: true,
      },
      {
        id: 'a' + nid(), title: '🌸 انشر بقالتك معنا', body: 'اشتراك 10 دنانير شهرياً + 20 قرش على الطلب — تواصل مع الإدارة', active: true,
      },
    ],
    orders: [],
  };
}

function loadDb() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true }); // إنشاء مجلد البيانات إن لم يوجد (مهم للنشر على خوادم جديدة)
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return;
    }
  } catch (e) {
    console.error('تعذر قراءة قاعدة البيانات، سيتم إعادة التهيئة:', e.message);
  }
  db = seedDb();
  saveDb();
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
  };
}
function findShop(id) { return db.shops.find((s) => s.id === id); }
function findDriver(id) { return db.drivers.find((d) => d.id === id); }
function findOrder(id) { return db.orders.find((o) => o.id === id); }

const TIMELINE_LABELS = {
  created: 'أُرسل الطلب',
  accepted: 'قبلت البقالة الطلب',
  ready: 'الطلب جاهز للاستلام',
  assigned: 'السائق في طريقه للبقالة',
  picked_up: 'السائق استلم الطلب',
  delivered: 'تم التوصيل بنجاح ✅',
  rejected: 'رفضت البقالة الطلب',
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

  /* ---------- عام ---------- */
  if (m === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, app: 'alzaher-express', area: db.settings.area });

  } else if (m === 'GET' && pathname === '/api/ads') {
    return json(res, 200, { ads: db.ads.filter((a) => a.active) });

  /* ---------- الزبون ---------- */
  } else if (m === 'POST' && pathname === '/api/customers/login') {
    const { name, phone, address } = body;
    if (!phone || !/^07\d{8}$/.test(String(phone))) return bad(res, 'رقم الجوال يجب أن يبدأ بـ 07 ويتكون من 10 أرقام');
    let c = db.customers.find((x) => x.phone === phone);
    if (!c) {
      c = { id: nextId('c'), name: name || 'زبون', phone, address: address || '', createdAt: Date.now() };
      db.customers.push(c);
    } else {
      if (name) c.name = name;
      if (address) c.address = address;
    }
    saveDb();
    return json(res, 200, { customer: c });

  /* ---------- البقالات ---------- */
  } else if (m === 'GET' && pathname === '/api/categories') {
    return json(res, 200, { categories: CATEGORIES, icons: CATEGORY_ICONS });

  } else if (m === 'GET' && pathname === '/api/shops') {
    const all = q('all') === '1';
    const shops = db.shops.filter((s) => all || s.status === 'active').map(publicShop);
    return json(res, 200, { shops });

  } else if (m === 'POST' && pathname === '/api/shops/register') {
    const { name, owner, phone, category } = body;
    if (!name || !owner || !phone) return bad(res, 'يرجى تعبئة جميع الحقول');
    if (!/^07\d{8}$/.test(String(phone))) return bad(res, 'رقم الجوال يجب أن يبدأ بـ 07 ويتكون من 10 أرقام');
    const exists = db.shops.find((s) => s.phone === phone);
    if (exists) return bad(res, 'يوجد حساب مسجل بهذا الرقم مسبقاً');
    const cat = CATEGORIES.includes(category) ? category : 'أخرى';
    const shop = {
      id: nextId('s'), name, owner, phone,
      category: cat, icon: CATEGORY_ICONS[cat], rating: 5,
      status: 'pending', isOpen: true, subscriptionUntil: null,
      createdAt: Date.now(), products: [],
    };
    db.shops.push(shop);
    saveDb();
    return json(res, 200, { shop });

  } else if (m === 'POST' && pathname === '/api/shops/login') {
    const shop = findShop(body.shopId);
    if (!shop) return bad(res, 'البقالة غير موجودة', 404);
    if (shop.status === 'blocked') return bad(res, 'تم إيقاف هذه البقالة. تواصل مع الإدارة', 403);
    return json(res, 200, { shop });

  } else if (parts[1] === 'shops' && parts[2] && !parts[3]) {
    const shop = findShop(parts[2]);
    if (!shop) return bad(res, 'البقالة غير موجودة', 404);
    if (m === 'GET') return json(res, 200, { shop });
    if (m === 'PATCH') {
      if (typeof body.isOpen === 'boolean') shop.isOpen = body.isOpen;
      if (body.name) shop.name = body.name;
      saveDb();
      return json(res, 200, { shop });
    }

  } else if (parts[1] === 'shops' && parts[2] && parts[3] === 'products' && !parts[4]) {
    const shop = findShop(parts[2]);
    if (!shop) return bad(res, 'البقالة غير موجودة', 404);
    if (m === 'POST') {
      const { name, price, unit, emoji } = body;
      if (!name || price == null || isNaN(+price) || +price < 0) return bad(res, 'اسم المنتج والسعر مطلوبان');
      const product = {
        id: nextId('p'), name, price: round2(+price),
        unit: unit || 'حبة', emoji: emoji || '📦', available: true,
      };
      shop.products.push(product);
      saveDb();
      return json(res, 200, { product, shop });
    }

  } else if (parts[1] === 'shops' && parts[2] && parts[3] === 'products' && parts[4]) {
    const shop = findShop(parts[2]);
    if (!shop) return bad(res, 'البقالة غير موجودة', 404);
    const product = shop.products.find((p) => p.id === parts[4]);
    if (!product) return bad(res, 'المنتج غير موجود', 404);
    if (m === 'PATCH') {
      if (body.name) product.name = body.name;
      if (body.unit) product.unit = body.unit;
      if (body.emoji) product.emoji = body.emoji;
      if (body.price != null && !isNaN(+body.price)) product.price = round2(+body.price);
      if (typeof body.available === 'boolean') product.available = body.available;
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
    if (!shop) return bad(res, 'البقالة غير موجودة', 404);
    if (shop.status !== 'active') return bad(res, 'هذه البقالة غير مفعّلة حالياً');
    if (!shop.isOpen) return bad(res, 'البقالة مغلقة حالياً، جرّب لاحقاً');
    if (!customer || !/^07\d{8}$/.test(String(customer.phone || ''))) return bad(res, 'رقم جوال الزبون غير صحيح');
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
    let cust = db.customers.find((x) => x.phone === customer.phone);
    if (!cust) {
      cust = { id: nextId('c'), name: customer.name || 'زبون', phone: customer.phone, address: customer.address, createdAt: Date.now() };
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
    if (m === 'GET') return json(res, 200, { order });

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
    if (!phone || !/^07\d{8}$/.test(String(phone))) return bad(res, 'رقم الجوال يجب أن يبدأ بـ 07 ويتكون من 10 أرقام');
    let d = db.drivers.find((x) => x.phone === phone);
    if (!d) {
      d = { id: nextId('d'), name: name || 'سائق', phone, status: 'active', online: false, deliveries: 0, earnings: 0, createdAt: Date.now() };
      db.drivers.push(d);
    } else if (name) {
      d.name = name;
    }
    saveDb();
    return json(res, 200, { driver: d });

  } else if (parts[1] === 'drivers' && parts[2] && !parts[3]) {
    const driver = findDriver(parts[2]);
    if (!driver) return bad(res, 'السائق غير موجود', 404);
    if (m === 'GET') return json(res, 200, { driver });
    if (m === 'PATCH') {
      if (typeof body.online === 'boolean') driver.online = body.online;
      saveDb();
      return json(res, 200, { driver });
    }

  /* ---------- الإدارة ---------- */
  } else if (m === 'POST' && pathname === '/api/admin/login') {
    if (body.password !== db.settings.adminPassword) return bad(res, 'كلمة المرور غير صحيحة', 401);
    return json(res, 200, { ok: true });

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
    if (!shop) return bad(res, 'البقالة غير موجودة', 404);
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

loadDb();

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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌸 الزهور اكسبرس يعمل الآن على المنفذ ${PORT} — منطقة ${db.settings.area}`);
});
