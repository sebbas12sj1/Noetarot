require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'luna1234';
const IS_PROD = process.env.NODE_ENV === 'production';

const CONFIG_PATH = path.join(__dirname, 'config.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!process.env.MP_ACCESS_TOKEN) {
  console.warn('⚠️  MP_ACCESS_TOKEN no está configurado. Copiá .env.example a .env y completá tu Access Token.');
}
if (ADMIN_PASSWORD === 'luna1234') {
  console.warn('⚠️  Estás usando la contraseña por defecto. Cambiala en .env (ADMIN_PASSWORD).');
}

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || 'TEST-ACCESS-TOKEN',
  options: { timeout: 5000 }
});

// ---------- Security: headers / CSP ----------
app.disable('x-powered-by');
if (IS_PROD) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameSrc:   ["'self'", 'https://www.mercadopago.com.ar', 'https://www.mercadopago.com'],
      formAction: ["'self'", 'https://www.mercadopago.com.ar', 'https://www.mercadopago.com'],
      frameAncestors: ["'self'"],
      objectSrc:  ["'none'"],
      upgradeInsecureRequests: IS_PROD ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// ---------- Rate limiting ----------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Probá de nuevo en 15 minutos.' }
});

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});

const adminWriteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120
});

// ---------- State ----------
function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

const sessions = new Set();
const orders = new Map();

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// ---------- Admin auth helpers ----------
function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function requireAdmin(req, res, next) {
  const token = req.cookies.admin_token;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// ---------- Config validation ----------
const VALID_SECTION_TYPES = ['hero', 'about', 'services', 'how', 'testimonials', 'faq', 'cta', 'text'];

function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return 'Formato inválido';
  if (!cfg.site || typeof cfg.site !== 'object') return 'Falta site';
  if (!cfg.theme || typeof cfg.theme !== 'object') return 'Falta theme';
  if (!Array.isArray(cfg.packages)) return 'Falta packages';
  if (!Array.isArray(cfg.sections)) return 'Falta sections';

  for (const p of cfg.packages) {
    if (!p.id || typeof p.id !== 'string') return 'Paquete con id inválido';
    if (typeof p.title !== 'string') return 'Paquete sin título';
    if (typeof p.price !== 'number' || p.price < 0 || p.price > 10_000_000) return `Precio inválido en paquete ${p.id}`;
    if (typeof p.questions !== 'number' || p.questions < 0 || p.questions > 10) return `questions inválido en ${p.id}`;
  }
  const pkgIds = new Set(cfg.packages.map(p => p.id));
  if (pkgIds.size !== cfg.packages.length) return 'Ids de paquete duplicados';

  for (const s of cfg.sections) {
    if (!s.id || typeof s.id !== 'string') return 'Sección con id inválido';
    if (!VALID_SECTION_TYPES.includes(s.type)) return `Tipo de sección inválido: ${s.type}`;
    if (s.data && typeof s.data !== 'object') return 'data inválido en sección';
  }
  const secIds = new Set(cfg.sections.map(s => s.id));
  if (secIds.size !== cfg.sections.length) return 'Ids de sección duplicados';

  return null;
}

function validateEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 150;
}

// ---------- Public API ----------
app.get('/api/config', (req, res) => {
  res.json(loadConfig());
});

app.get('/api/packages', (req, res) => {
  res.json(loadConfig().packages);
});

app.post('/api/create-preference', paymentLimiter, async (req, res) => {
  try {
    const { packageId, nombre, email, preguntas } = req.body || {};
    if (typeof packageId !== 'string' || typeof nombre !== 'string' || typeof email !== 'string') {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    if (nombre.trim().length < 2 || nombre.length > 100) {
      return res.status(400).json({ error: 'Nombre inválido' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    const cfg = loadConfig();
    const pkg = cfg.packages.find(p => p.id === packageId);
    if (!pkg) return res.status(400).json({ error: 'Paquete inválido' });

    let cleanPreguntas = [];
    if (pkg.questions > 0) {
      if (!Array.isArray(preguntas) || preguntas.length !== pkg.questions) {
        return res.status(400).json({ error: `Debés enviar ${pkg.questions} pregunta(s)` });
      }
      cleanPreguntas = preguntas.map(p => String(p || '').trim().slice(0, 1000));
      if (cleanPreguntas.some(p => p.length < 3)) {
        return res.status(400).json({ error: 'Preguntas demasiado cortas' });
      }
    }

    const orderId = `${pkg.id}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    orders.set(orderId, {
      packageId: pkg.id,
      pkgSnapshot: pkg,
      nombre: nombre.trim().slice(0, 100),
      email: email.trim().slice(0, 150),
      preguntas: cleanPreguntas,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    const preference = new Preference(mp);
    const result = await preference.create({
      body: {
        items: [{
          id: pkg.id,
          title: pkg.title,
          description: pkg.description,
          quantity: 1,
          unit_price: pkg.price,
          currency_id: 'ARS'
        }],
        payer: { name: nombre, email },
        back_urls: {
          success: `${BASE_URL}/reading.html?order=${orderId}`,
          failure: `${BASE_URL}/?status=failure`,
          pending: `${BASE_URL}/?status=pending`
        },
        auto_return: 'approved',
        external_reference: orderId,
        notification_url: `${BASE_URL}/api/webhook`,
        statement_descriptor: 'NOETAROT'
      }
    });

    res.json({
      orderId,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point
    });
  } catch (err) {
    console.error('Error creando preferencia:', err.message);
    res.status(500).json({ error: 'No se pudo iniciar el pago' });
  }
});

app.post('/api/webhook', async (req, res) => {
  try {
    const { type, data } = req.body || {};
    if (type === 'payment' && data?.id) {
      const payment = new Payment(mp);
      const info = await payment.get({ id: data.id });
      const order = orders.get(info.external_reference);
      if (order) {
        order.status = info.status;
        order.paymentId = info.id;
        order.updatedAt = new Date().toISOString();
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.sendStatus(500);
  }
});

app.get('/api/order/:orderId', (req, res) => {
  const order = orders.get(String(req.params.orderId).slice(0, 100));
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  res.json(order);
});

// ---------- Tarot reading ----------
const TAROT_DECK = [
  { name: 'El Loco', meaning: 'Nuevos comienzos, espontaneidad, fe en el camino.' },
  { name: 'El Mago', meaning: 'Poder personal, manifestación, habilidad para crear.' },
  { name: 'La Sacerdotisa', meaning: 'Intuición, sabiduría oculta, escucha interior.' },
  { name: 'La Emperatriz', meaning: 'Abundancia, fertilidad, conexión con lo femenino.' },
  { name: 'El Emperador', meaning: 'Estructura, autoridad, estabilidad material.' },
  { name: 'El Hierofante', meaning: 'Tradición, enseñanza, búsqueda espiritual.' },
  { name: 'Los Enamorados', meaning: 'Elecciones importantes, vínculos, alineación.' },
  { name: 'El Carro', meaning: 'Voluntad, victoria tras esfuerzo, avance decidido.' },
  { name: 'La Fuerza', meaning: 'Coraje interno, templanza, dominio suave.' },
  { name: 'El Ermitaño', meaning: 'Introspección, guía interior, búsqueda de verdad.' },
  { name: 'La Rueda de la Fortuna', meaning: 'Ciclos, cambios de suerte, destino en movimiento.' },
  { name: 'La Justicia', meaning: 'Equilibrio, consecuencias, verdad revelada.' },
  { name: 'El Colgado', meaning: 'Pausa, cambio de perspectiva, entrega necesaria.' },
  { name: 'La Muerte', meaning: 'Finales, transformación profunda, renovación.' },
  { name: 'La Templanza', meaning: 'Equilibrio, moderación, integración.' },
  { name: 'El Diablo', meaning: 'Apegos, sombras, lo que te ata.' },
  { name: 'La Torre', meaning: 'Ruptura repentina, liberación, revelación.' },
  { name: 'La Estrella', meaning: 'Esperanza, inspiración, guía luminosa.' },
  { name: 'La Luna', meaning: 'Ilusiones, intuición, lo que aún no ves claro.' },
  { name: 'El Sol', meaning: 'Alegría, claridad, éxito y vitalidad.' },
  { name: 'El Juicio', meaning: 'Llamado interno, renacer, rendición de cuentas.' },
  { name: 'El Mundo', meaning: 'Cierre de ciclo, plenitud, logro integrado.' }
];

function drawCards(count) {
  const deck = [...TAROT_DECK];
  const drawn = [];
  for (let i = 0; i < count; i++) {
    const idx = crypto.randomInt(0, deck.length);
    drawn.push(deck.splice(idx, 1)[0]);
  }
  return drawn;
}

app.get('/api/reading/:orderId', (req, res) => {
  const order = orders.get(String(req.params.orderId).slice(0, 100));
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  if (order.status !== 'approved') {
    return res.status(402).json({ error: 'Pago no aprobado', status: order.status });
  }
  if (order.reading) return res.json(order.reading);

  const pkg = order.pkgSnapshot;
  let reading;
  if (pkg.questions === 0) {
    const cards = drawCards(3);
    reading = {
      type: 'general',
      spread: [
        { position: 'Pasado', card: cards[0] },
        { position: 'Presente', card: cards[1] },
        { position: 'Futuro', card: cards[2] }
      ],
      closing: 'Confiá en el proceso. Lo que hoy parece confuso mañana se ordena.'
    };
  } else {
    const cards = drawCards(pkg.questions);
    reading = {
      type: 'questions',
      items: order.preguntas.map((q, i) => ({ pregunta: q, card: cards[i] })),
      closing: 'Que estas cartas te acompañen en tu camino.'
    };
  }
  order.reading = reading;
  res.json(reading);
});

// ---------- Admin API ----------
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const password = String(req.body?.password ?? '');
  if (!timingSafeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.add(token);
  res.cookie('admin_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/'
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  sessions.delete(req.cookies.admin_token);
  res.clearCookie('admin_token', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

app.get('/api/admin/config', requireAdmin, (req, res) => {
  res.json(loadConfig());
});

app.put('/api/admin/config', requireAdmin, adminWriteLimiter, (req, res) => {
  try {
    const err = validateConfig(req.body);
    if (err) return res.status(400).json({ error: err });
    saveConfig(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar' });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 8).replace(/[^.a-z0-9]/g, '');
    const safe = crypto.randomBytes(10).toString('hex');
    cb(null, `img-${Date.now()}-${safe}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo imágenes png/jpg/webp/gif'));
  }
});

app.post('/api/admin/upload', requireAdmin, adminWriteLimiter, (req, res) => {
  upload.single('image')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Falta archivo' });
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

// ---------- Static ----------
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: IS_PROD ? '1d' : 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

app.listen(PORT, () => {
  console.log(`🔮 Noe Tarot en ${BASE_URL}`);
  console.log(`🛠  Editor visual en ${BASE_URL}/admin`);
});
