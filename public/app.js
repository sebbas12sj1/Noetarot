// ---------- Render page from config ----------
const root = document.getElementById('sections-root');
let CONFIG = null;

function applyTheme(t) {
  if (!t) return;
  const r = document.documentElement.style;
  if (t.gold)     r.setProperty('--gold', t.gold);
  if (t.goldSoft) r.setProperty('--gold-soft', t.goldSoft);
  if (t.purple)   r.setProperty('--purple', t.purple);
  if (t.bg1)      r.setProperty('--bg-1', t.bg1);
  if (t.bg2)      r.setProperty('--bg-2', t.bg2);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function formatPrice(n) {
  return '$' + Number(n).toLocaleString('es-AR');
}

const RENDERERS = {
  hero(data) {
    return `
      <section class="hero" id="top">
        <div class="moon"></div>
        <h1>${escapeHtml(data.title || 'Lecturas de Tarot')}</h1>
        <p class="subtitle">${escapeHtml(data.subtitle || '')}</p>
        ${data.ctaText ? `<a href="#services" class="btn btn-hero">${escapeHtml(data.ctaText)}</a>` : ''}
      </section>`;
  },

  about(data) {
    const img = data.image
      ? `<div class="about-img"><img src="${escapeHtml(data.image)}" alt="${escapeHtml(data.name || '')}" /></div>`
      : `<div class="about-img about-img-placeholder"><span>☽</span></div>`;
    return `
      <section class="about" id="about">
        <div class="about-inner">
          ${img}
          <div class="about-text">
            <h2>${escapeHtml(data.title || 'Sobre mí')}</h2>
            <p class="about-name">${escapeHtml(data.name || '')}</p>
            <p class="about-role">${escapeHtml(data.role || '')}</p>
            <p class="about-body">${escapeHtml(data.body || '')}</p>
          </div>
        </div>
      </section>`;
  },

  services(data) {
    const cards = (CONFIG.packages || []).map(p => `
      <article class="card-pack ${p.featured ? 'featured' : ''}" data-pkg="${escapeHtml(p.id)}">
        ${p.featured ? '<div class="badge">Más elegida</div>' : ''}
        <div class="card-icon">${escapeHtml(p.icon || '✦')}</div>
        <h3>${escapeHtml(p.title)}</h3>
        <p class="desc">${escapeHtml(p.description)}</p>
        <p class="price">${formatPrice(p.price)} <span>ARS</span></p>
        <button class="btn" data-pkg="${escapeHtml(p.id)}">Consultar</button>
      </article>
    `).join('');
    return `
      <section class="services" id="services">
        <div class="section-head">
          <h2>${escapeHtml(data.title || 'Consultas')}</h2>
          ${data.subtitle ? `<p class="section-sub">${escapeHtml(data.subtitle)}</p>` : ''}
        </div>
        <div class="packages">${cards}</div>
      </section>`;
  },

  how(data) {
    const steps = (data.steps || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');
    return `
      <section class="how">
        <h2>${escapeHtml(data.title || '¿Cómo funciona?')}</h2>
        <ol>${steps}</ol>
      </section>`;
  },

  testimonials(data) {
    const items = (data.items || []).map(t => `
      <figure class="testimonial">
        <blockquote>"${escapeHtml(t.text)}"</blockquote>
        <figcaption>— ${escapeHtml(t.name)}</figcaption>
      </figure>
    `).join('');
    return `
      <section class="testimonials">
        <h2>${escapeHtml(data.title || 'Testimonios')}</h2>
        <div class="testimonial-grid">${items}</div>
      </section>`;
  },

  faq(data) {
    const items = (data.items || []).map(q => `
      <details class="faq-item">
        <summary>${escapeHtml(q.q)}</summary>
        <p>${escapeHtml(q.a)}</p>
      </details>
    `).join('');
    return `
      <section class="faq" id="faq">
        <h2>${escapeHtml(data.title || 'Preguntas frecuentes')}</h2>
        <div class="faq-list">${items}</div>
      </section>`;
  },

  cta(data) {
    return `
      <section class="cta">
        <h2>${escapeHtml(data.title || '')}</h2>
        <a href="#services" class="btn btn-hero">${escapeHtml(data.buttonText || 'Consultar')}</a>
      </section>`;
  },

  text(data) {
    return `
      <section class="text-block">
        ${data.title ? `<h2>${escapeHtml(data.title)}</h2>` : ''}
        <p>${escapeHtml(data.body || '')}</p>
      </section>`;
  }
};

function render(config) {
  CONFIG = config;
  applyTheme(config.theme);
  document.title = config.site?.title || 'Lecturas de Tarot';
  const brand = config.site?.brand || 'Luz de Luna';
  document.getElementById('brandLink').textContent = brand;
  document.getElementById('footerBrand').textContent = brand;
  document.getElementById('year').textContent = new Date().getFullYear();

  root.innerHTML = (config.sections || [])
    .filter(s => s.visible !== false)
    .map(s => RENDERERS[s.type] ? RENDERERS[s.type](s.data || {}) : '')
    .join('');

  bindPackageButtons();
}

async function load() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    render(cfg);
  } catch (err) {
    root.innerHTML = `<p style="text-align:center;padding:3rem;color:#fff">Error cargando la página.</p>`;
  }
}

// ---------- Modal + checkout ----------
const modal = document.getElementById('modal');
const closeModal = document.getElementById('closeModal');
const modalSub = document.getElementById('modalSub');
const questionsWrap = document.getElementById('questions');
const totalPrice = document.getElementById('totalPrice');
const form = document.getElementById('consultForm');
const submitBtn = document.getElementById('submitBtn');

let currentPkg = null;

function openModal(pkgId) {
  const pkg = CONFIG.packages.find(p => p.id === pkgId);
  if (!pkg) return;
  currentPkg = pkg;
  document.getElementById('modal-title').textContent = pkg.title;
  modalSub.textContent = pkg.questions
    ? `Escribí tus ${pkg.questions} pregunta${pkg.questions > 1 ? 's' : ''} con claridad.`
    : 'Recibirás una tirada de pasado, presente y futuro.';

  questionsWrap.innerHTML = '';
  for (let i = 0; i < pkg.questions; i++) {
    const label = document.createElement('label');
    label.innerHTML = `
      <span>Pregunta ${i + 1}</span>
      <textarea name="pregunta-${i}" required minlength="3" placeholder="¿Qué querés consultar?"></textarea>`;
    questionsWrap.appendChild(label);
  }
  totalPrice.textContent = formatPrice(pkg.price) + ' ARS';
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModalFn() {
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  form.reset();
  currentPkg = null;
}

function bindPackageButtons() {
  document.querySelectorAll('.btn[data-pkg]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.pkg));
  });
}

closeModal.addEventListener('click', closeModalFn);
modal.addEventListener('click', e => { if (e.target === modal) closeModalFn(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.classList.contains('active')) closeModalFn();
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentPkg) return;
  const fd = new FormData(form);
  const preguntas = [];
  for (let i = 0; i < currentPkg.questions; i++) {
    preguntas.push((fd.get(`pregunta-${i}`) || '').toString().trim());
  }
  const body = {
    packageId: currentPkg.id,
    nombre: fd.get('nombre').toString().trim(),
    email: fd.get('email').toString().trim(),
    preguntas
  };
  submitBtn.disabled = true;
  submitBtn.textContent = 'Redirigiendo...';
  try {
    const res = await fetch('/api/create-preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al iniciar el pago');
    const url = data.init_point || data.sandbox_init_point;
    if (!url) throw new Error('No se recibió URL de pago');
    window.location.href = url;
  } catch (err) {
    alert('No se pudo iniciar el pago: ' + err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Ir a pagar';
  }
});

const params = new URLSearchParams(location.search);
if (params.get('status') === 'failure') {
  setTimeout(() => alert('El pago no pudo completarse. Podés intentar de nuevo.'), 200);
} else if (params.get('status') === 'pending') {
  setTimeout(() => alert('Tu pago quedó pendiente. Te avisaremos por email cuando se acredite.'), 200);
}

load();
