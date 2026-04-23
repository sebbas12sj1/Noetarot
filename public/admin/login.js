const form = document.getElementById('loginForm');
const btn = document.getElementById('btn');
const err = document.getElementById('err');

fetch('/api/admin/me').then(r => {
  if (r.ok) location.href = '/admin/editor.html';
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Ingresando...';
  const password = new FormData(form).get('password');
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Error');
    }
    location.href = '/admin/editor.html';
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});
