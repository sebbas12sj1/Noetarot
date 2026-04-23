const params = new URLSearchParams(window.location.search);
const orderId = params.get('order');
const intro = document.getElementById('intro');
const spread = document.getElementById('spread');
const closing = document.getElementById('closing');

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

async function loadReading(retries = 10) {
  if (!orderId) {
    intro.textContent = 'No se encontró tu orden. Volvé al inicio e intentá nuevamente.';
    return;
  }

  try {
    const res = await fetch(`/api/reading/${encodeURIComponent(orderId)}`);

    if (res.status === 402) {
      if (retries > 0) {
        intro.textContent = 'Confirmando tu pago...';
        setTimeout(() => loadReading(retries - 1), 2000);
        return;
      }
      intro.textContent = 'Tu pago aún no se confirmó. Te enviaremos un email cuando esté listo.';
      return;
    }

    if (!res.ok) throw new Error('No se pudo obtener la lectura');
    const data = await res.json();

    intro.textContent = 'Las cartas han hablado. Escuchá con atención.';

    if (data.type === 'general') {
      data.spread.forEach((item, i) => {
        const card = document.createElement('article');
        card.className = 'tarot-card';
        card.style.animationDelay = `${i * 0.25}s`;
        card.innerHTML = `
          <div class="position">${escapeHtml(item.position)}</div>
          <div class="symbol">✦</div>
          <div class="name">${escapeHtml(item.card.name)}</div>
          <p class="meaning">${escapeHtml(item.card.meaning)}</p>
        `;
        spread.appendChild(card);
      });
    } else {
      data.items.forEach((item, i) => {
        const card = document.createElement('article');
        card.className = 'tarot-card';
        card.style.animationDelay = `${i * 0.25}s`;
        card.innerHTML = `
          <div class="position">Pregunta ${i + 1}</div>
          <p class="pregunta">"${escapeHtml(item.pregunta)}"</p>
          <div class="symbol">✦</div>
          <div class="name">${escapeHtml(item.card.name)}</div>
          <p class="meaning">${escapeHtml(item.card.meaning)}</p>
        `;
        spread.appendChild(card);
      });
    }

    closing.textContent = data.closing;
    closing.style.display = 'block';
  } catch (err) {
    intro.textContent = 'Hubo un problema cargando tu lectura.';
  }
}

loadReading();
