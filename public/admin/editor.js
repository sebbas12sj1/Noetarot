// ================================================================
// Editor visual — lee y escribe /api/admin/config
// ================================================================

const SECTION_LABELS = {
  hero: { name: 'Portada', icon: '✨' },
  about: { name: 'Sobre mí', icon: '👤' },
  services: { name: 'Servicios', icon: '💳' },
  how: { name: 'Cómo funciona', icon: '📋' },
  testimonials: { name: 'Testimonios', icon: '💬' },
  faq: { name: 'Preguntas frecuentes', icon: '❓' },
  cta: { name: 'Llamado a la acción', icon: '📢' },
  text: { name: 'Texto libre', icon: '📝' }
};

const DEFAULTS = {
  hero:         { title: 'Lecturas de Tarot', subtitle: 'Las cartas tienen algo que decirte.', ctaText: 'Ver consultas' },
  about:        { title: 'Sobre mí', name: 'Luna', role: 'Tarotista', body: 'Contá quién sos y por qué hacés esto...', image: '' },
  services:     { title: 'Elegí tu consulta', subtitle: '' },
  how:          { title: '¿Cómo funciona?', steps: ['Elegís tu lectura.', 'Pagás online.', 'Recibís tu lectura al instante.'] },
  testimonials: { title: 'Testimonios', items: [{ name: 'María', text: 'Una experiencia increíble.' }] },
  faq:          { title: 'Preguntas frecuentes', items: [{ q: 'Pregunta', a: 'Respuesta.' }] },
  cta:          { title: '¿Lista para tu consulta?', buttonText: 'Consultar ahora' },
  text:         { title: '', body: 'Escribí acá tu texto...' }
};

let config = null;
let selectedId = null;
let dirty = false;
let saveTimer = null;

// ---------- utils ----------
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const uid = () => 's-' + Math.random().toString(36).slice(2, 10);

function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2200);
}

function setDirty(yes = true) {
  dirty = yes;
  const s = $('#saveStatus');
  s.textContent = yes ? 'Cambios sin guardar' : 'Guardado';
  s.className = 'save-status ' + (yes ? 'dirty' : 'saved');
  clearTimeout(saveTimer);
  if (yes) saveTimer = setTimeout(save, 1500); // autosave
}

// ---------- API ----------
async function loadConfig() {
  const res = await fetch('/api/admin/config');
  if (res.status === 401) { location.href = '/admin/'; return; }
  config = await res.json();
  renderAll();
}

async function save() {
  if (!config) return;
  const btn = $('#saveBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    if (!res.ok) throw new Error('Error al guardar');
    setDirty(false);
    toast('Guardado ✓', 'ok');
    refreshPreview();
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

function refreshPreview() {
  const f = $('#preview');
  f.src = '/?t=' + Date.now();
}

// ---------- Render all ----------
function renderAll() {
  renderSectionList();
  renderProps();
}

// ---------- Section list ----------
function renderSectionList() {
  const ul = $('#sectionList');
  ul.innerHTML = '';
  config.sections.forEach(sec => {
    const meta = SECTION_LABELS[sec.type] || { name: sec.type, icon: '◆' };
    const li = document.createElement('li');
    li.className = 'section-item' + (sec.id === selectedId ? ' active' : '') + (sec.visible === false ? ' hidden-sec' : '');
    li.dataset.id = sec.id;
    li.innerHTML = `
      <span class="drag-handle">⋮⋮</span>
      <span class="label">
        ${meta.icon} ${escapeHtml(sectionTitle(sec))}
        <small>${meta.name}</small>
      </span>
      <button class="icon-btn" data-act="toggle" title="Mostrar/ocultar">${sec.visible === false ? '🚫' : '👁'}</button>
      <button class="icon-btn danger" data-act="delete" title="Eliminar">🗑</button>
    `;
    ul.appendChild(li);
  });

  // click select
  $$('#sectionList .section-item').forEach(li => {
    li.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      selectedId = li.dataset.id;
      renderAll();
    });
    li.querySelector('[data-act="toggle"]').addEventListener('click', () => {
      const sec = config.sections.find(s => s.id === li.dataset.id);
      sec.visible = sec.visible === false ? true : false;
      renderSectionList();
      setDirty();
    });
    li.querySelector('[data-act="delete"]').addEventListener('click', () => {
      if (!confirm('¿Eliminar esta sección?')) return;
      config.sections = config.sections.filter(s => s.id !== li.dataset.id);
      if (selectedId === li.dataset.id) selectedId = null;
      renderAll();
      setDirty();
    });
  });

  // drag-drop reorder
  Sortable.create(ul, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd: (evt) => {
      const [moved] = config.sections.splice(evt.oldIndex, 1);
      config.sections.splice(evt.newIndex, 0, moved);
      setDirty();
    }
  });
}

function sectionTitle(sec) {
  const d = sec.data || {};
  return d.title || d.name || SECTION_LABELS[sec.type]?.name || 'Sección';
}

// ---------- Properties panel ----------
function renderProps() {
  const head = $('#propsTitle');
  const hint = $('#propsHint');
  const body = $('#propsBody');
  body.innerHTML = '';

  if (!selectedId) {
    head.textContent = 'Seleccioná una sección';
    hint.textContent = 'Elegí una sección en la lista para editarla.';
    return;
  }
  const sec = config.sections.find(s => s.id === selectedId);
  if (!sec) {
    selectedId = null;
    renderProps();
    return;
  }
  const meta = SECTION_LABELS[sec.type];
  head.textContent = `${meta.icon} ${meta.name}`;
  hint.textContent = 'Los cambios se guardan automáticamente.';

  const renderer = PROP_RENDERERS[sec.type];
  if (renderer) body.appendChild(renderer(sec));
}

// ---------- Helpers to build form fields ----------
function field(labelText, inputEl) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const lab = document.createElement('label');
  lab.textContent = labelText;
  wrap.appendChild(lab);
  wrap.appendChild(inputEl);
  return wrap;
}

function textInput(value, onChange, opts = {}) {
  const i = document.createElement(opts.multiline ? 'textarea' : 'input');
  if (!opts.multiline) i.type = opts.type || 'text';
  i.value = value ?? '';
  if (opts.placeholder) i.placeholder = opts.placeholder;
  i.addEventListener('input', () => { onChange(i.value); setDirty(); });
  return i;
}

function numberInput(value, onChange) {
  const i = document.createElement('input');
  i.type = 'number';
  i.min = 0;
  i.value = value ?? 0;
  i.addEventListener('input', () => { onChange(Number(i.value) || 0); setDirty(); });
  return i;
}

function imageInput(value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'upload-row';
  const preview = document.createElement('div');
  preview.className = 'upload-preview';
  if (value) preview.style.backgroundImage = `url(${value})`;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-ghost';
  btn.textContent = value ? 'Cambiar imagen' : 'Subir imagen';

  const fileIn = document.createElement('input');
  fileIn.type = 'file';
  fileIn.accept = 'image/*';

  btn.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('image', f);
    btn.textContent = 'Subiendo...';
    btn.disabled = true;
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Error al subir');
      const data = await res.json();
      preview.style.backgroundImage = `url(${data.url})`;
      onChange(data.url);
      setDirty();
      btn.textContent = 'Cambiar imagen';
    } catch (err) {
      toast(err.message, 'err');
      btn.textContent = 'Subir imagen';
    } finally {
      btn.disabled = false;
    }
  });

  wrap.append(preview, btn, fileIn);

  if (value) {
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'btn-ghost';
    rm.textContent = 'Quitar';
    rm.addEventListener('click', () => {
      preview.style.backgroundImage = '';
      onChange('');
      setDirty();
      renderProps();
    });
    wrap.appendChild(rm);
  }

  return wrap;
}

function listEditor(items, fieldsOf, onChange, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sub-list';

  function render() {
    wrap.innerHTML = '';
    items.forEach((it, idx) => {
      const card = document.createElement('div');
      card.className = 'sub-item';
      const rm = document.createElement('button');
      rm.className = 'icon-btn danger remove';
      rm.type = 'button';
      rm.textContent = '🗑';
      rm.title = 'Quitar';
      rm.addEventListener('click', () => {
        items.splice(idx, 1);
        onChange(items);
        setDirty();
        render();
      });
      card.appendChild(rm);
      fieldsOf(it, idx).forEach(f => card.appendChild(f));
      wrap.appendChild(card);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'add-sub';
    add.textContent = opts.addLabel || '+ Agregar';
    add.addEventListener('click', () => {
      items.push(typeof opts.blank === 'function' ? opts.blank() : { ...(opts.blank || {}) });
      onChange(items);
      setDirty();
      render();
    });
    wrap.appendChild(add);
  }
  render();
  return wrap;
}

// ---------- Per-type property renderers ----------
const PROP_RENDERERS = {
  hero(sec) {
    const d = sec.data;
    const f = document.createDocumentFragment();
    f.appendChild(field('Título', textInput(d.title, v => d.title = v)));
    f.appendChild(field('Subtítulo', textInput(d.subtitle, v => d.subtitle = v, { multiline: true })));
    f.appendChild(field('Texto del botón', textInput(d.ctaText, v => d.ctaText = v, { placeholder: 'Ej: Ver consultas' })));
    return f;
  },

  about(sec) {
    const d = sec.data;
    const f = document.createDocumentFragment();
    f.appendChild(field('Título', textInput(d.title, v => d.title = v)));
    f.appendChild(field('Nombre', textInput(d.name, v => d.name = v)));
    f.appendChild(field('Rol / experiencia', textInput(d.role, v => d.role = v)));
    f.appendChild(field('Descripción', textInput(d.body, v => d.body = v, { multiline: true })));
    f.appendChild(field('Foto', imageInput(d.image, v => d.image = v)));
    return f;
  },

  services(sec) {
    const d = sec.data;
    const f = document.createDocumentFragment();
    f.appendChild(field('Título', textInput(d.title, v => d.title = v)));
    f.appendChild(field('Subtítulo', textInput(d.subtitle, v => d.subtitle = v, { multiline: true })));
    const info = document.createElement('p');
    info.className = 'hint';
    info.style.marginTop = '0.8rem';
    info.innerHTML = '💡 Los precios y títulos de los servicios se editan en <b>💰 Precios y servicios</b> (abajo a la izquierda).';
    f.appendChild(info);
    return f;
  },

  how(sec) {
    const d = sec.data;
    if (!Array.isArray(d.steps)) d.steps = [];
    const f = document.createDocumentFragment();
    f.appendChild(field('Título', textInput(d.title, v => d.title = v)));

    const stepsWrap = listEditor(
      d.steps,
      (step, idx) => [field(`Paso ${idx + 1}`, textInput(step, v => d.steps[idx] = v, { multiline: true }))],
      v => d.steps = v,
      { addLabel: '+ Agregar paso', blank: () => '' }
    );
    f.appendChild(field('Pasos', stepsWrap));
    return f;
  },

  testimonials(sec) {
    const d = sec.data;
    if (!Array.isArray(d.items)) d.items = [];
    const f = document.createDocumentFragment();
    f.appendChild(field('Título', textInput(d.title, v => d.title = v)));
    const listEl = listEditor(
      d.items,
      (it) => [
        field('Nombre', textInput(it.name, v => it.name = v)),
        field('Testimonio', textInput(it.text, v => it.text = v, { multiline: true }))
      ],
      v => d.items = v,
      { addLabel: '+ Agregar testimonio', blank: () => ({ name: '', text: '' }) }
    );
    f.appendChild(field('Testimonios', listEl));
    return f;
  },

  faq(sec) {
    const d = sec.data;
    if (!Array.isArray(d.items)) d.items = [];
    const f = document.createDocumentFragment();
    f.appendChild(field('Título', textInput(d.title, v => d.title = v)));
    const listEl = listEditor(
      d.items,
      (it) => [
        field('Pregunta', textInput(it.q, v => it.q = v)),
        field('Respuesta', textInput(it.a, v => it.a = v, { multiline: true }))
      ],
      v => d.items = v,
      { addLabel: '+ Agregar pregunta', blank: () => ({ q: '', a: '' }) }
    );
    f.appendChild(field('Preguntas', listEl));
    return f;
  },

  cta(sec) {
    const d = sec.data;
    const f = document.createDocumentFragment();
    f.appendChild(field('Título', textInput(d.title, v => d.title = v, { multiline: true })));
    f.appendChild(field('Texto del botón', textInput(d.buttonText, v => d.buttonText = v)));
    return f;
  },

  text(sec) {
    const d = sec.data;
    const f = document.createDocumentFragment();
    f.appendChild(field('Título (opcional)', textInput(d.title, v => d.title = v)));
    f.appendChild(field('Texto', textInput(d.body, v => d.body = v, { multiline: true })));
    return f;
  }
};

// ---------- Add section ----------
$('#addSectionBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('#addMenu').hidden = !$('#addMenu').hidden;
});
document.addEventListener('click', e => {
  if (!e.target.closest('.add-section')) $('#addMenu').hidden = true;
});
$$('#addMenu button').forEach(b => {
  b.addEventListener('click', () => {
    const type = b.dataset.type;
    const id = uid();
    config.sections.push({
      id, type, visible: true,
      data: structuredClone(DEFAULTS[type])
    });
    selectedId = id;
    $('#addMenu').hidden = true;
    renderAll();
    setDirty();
  });
});

// ---------- Theme dialog ----------
function openDialog(id) { $('#' + id).hidden = false; }
function closeDialog(id) { $('#' + id).hidden = true; }
$$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('.dialog-backdrop').hidden = true));
$$('.dialog-backdrop').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.hidden = true; }));

$('#openThemeBtn').addEventListener('click', () => {
  const t = config.theme || {};
  const form = $('#themeForm');
  form.innerHTML = '';

  const entries = [
    ['gold', 'Dorado principal'],
    ['goldSoft', 'Dorado claro'],
    ['purple', 'Violeta'],
    ['bg1', 'Fondo arriba'],
    ['bg2', 'Fondo abajo']
  ];
  entries.forEach(([key, label]) => {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lab = document.createElement('label');
    lab.textContent = label;
    const inline = document.createElement('div');
    inline.className = 'field-inline';
    const color = document.createElement('input');
    color.type = 'color';
    color.value = t[key] || '#000000';
    const hex = document.createElement('input');
    hex.type = 'text';
    hex.value = t[key] || '';
    const onChange = v => { t[key] = v; color.value = v; hex.value = v; setDirty(); };
    color.addEventListener('input', () => onChange(color.value));
    hex.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) onChange(hex.value); });
    inline.append(color, hex);
    wrap.append(lab, inline);
    form.appendChild(wrap);
  });

  config.theme = t;
  openDialog('themeDialog');
});

// ---------- Packages dialog ----------
$('#openPackagesBtn').addEventListener('click', () => {
  const form = $('#packagesForm');
  form.innerHTML = '';
  config.packages.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className = 'package-editor';
    const h = document.createElement('h4');
    h.textContent = `Servicio ${idx + 1}`;
    card.appendChild(h);
    card.appendChild(field('Título', textInput(p.title, v => p.title = v)));
    card.appendChild(field('Descripción', textInput(p.description, v => p.description = v, { multiline: true })));
    card.appendChild(field('Precio (ARS)', numberInput(p.price, v => p.price = v)));

    const qWrap = document.createElement('div');
    qWrap.className = 'field';
    const qLab = document.createElement('label');
    qLab.textContent = 'Cantidad de preguntas (0 = lectura general)';
    const qIn = document.createElement('input');
    qIn.type = 'number';
    qIn.min = 0;
    qIn.max = 10;
    qIn.value = p.questions;
    qIn.addEventListener('input', () => { p.questions = Number(qIn.value) || 0; setDirty(); });
    qWrap.append(qLab, qIn);
    card.appendChild(qWrap);

    card.appendChild(field('Icono (emoji)', textInput(p.icon, v => p.icon = v, { placeholder: '✦' })));

    const fWrap = document.createElement('div');
    fWrap.className = 'field';
    const fLab = document.createElement('label');
    fLab.style.display = 'flex';
    fLab.style.alignItems = 'center';
    fLab.style.gap = '0.5rem';
    fLab.style.textTransform = 'none';
    fLab.style.letterSpacing = '0';
    const fIn = document.createElement('input');
    fIn.type = 'checkbox';
    fIn.checked = !!p.featured;
    fIn.style.width = 'auto';
    fIn.addEventListener('change', () => {
      config.packages.forEach(x => x.featured = false);
      p.featured = fIn.checked;
      setDirty();
    });
    fLab.append(fIn, document.createTextNode(' Destacar como "Más elegida"'));
    fWrap.appendChild(fLab);
    card.appendChild(fWrap);

    form.appendChild(card);
  });
  openDialog('packagesDialog');
});

// ---------- Site dialog ----------
$('#openSiteBtn').addEventListener('click', () => {
  const s = config.site || (config.site = {});
  const form = $('#siteForm');
  form.innerHTML = '';
  form.appendChild(field('Título de la pestaña', textInput(s.title, v => s.title = v)));
  form.appendChild(field('Marca / nombre', textInput(s.brand, v => s.brand = v)));
  form.appendChild(field('Frase corta', textInput(s.tagline, v => s.tagline = v)));
  openDialog('siteDialog');
});

// ---------- Top bar actions ----------
$('#saveBtn').addEventListener('click', save);
$('#previewBtn').addEventListener('click', () => window.open('/', '_blank'));
$('#logoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  location.href = '/admin/';
});

// ---------- Device switcher ----------
$$('.device-btn').forEach(b => {
  b.addEventListener('click', () => {
    $$('.device-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $('#previewFrameWrap').className = 'preview-frame-wrap ' + b.dataset.device;
  });
});

// ---------- utils ----------
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ---------- Warn on leave with unsaved ----------
window.addEventListener('beforeunload', e => {
  if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Boot ----------
loadConfig();
