// ─── Config y sesión (comunes a todas las páginas) ───────────────────────
const API = `http://${location.hostname}:3000`;

const token = localStorage.getItem('ecotrack_token');
if (!token) { window.location.href = 'login.html'; }

const nombre = localStorage.getItem('ecotrack_nombre') || 'Usuario';
const username = localStorage.getItem('ecotrack_username') || '';
const iniciales = nombre.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

function cerrarSesion() {
  localStorage.removeItem('ecotrack_token');
  localStorage.removeItem('ecotrack_nombre');
  localStorage.removeItem('ecotrack_username');
  window.location.href = 'login.html';
}

// Sesión expirada / inválida: cualquier fetch que devuelva 401 pasa por acá.
function manejarNoAutorizado() {
  cerrarSesion();
}

// ─── Dark mode ─────────────────────────────────────────────────────────
const darkPref = localStorage.getItem('ecotrack_dark') === 'true';
if (darkPref) document.documentElement.classList.add('dark');

function toggleDark() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('ecotrack_dark', isDark);
  const btn = document.getElementById('btn-dark');
  if (btn) btn.querySelector('span').textContent = isDark ? 'light_mode' : 'dark_mode';
}

// ─── Dropdown de perfil ────────────────────────────────────────────────
function toggleProfile() {
  document.getElementById('profile-menu')?.classList.toggle('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('#profile-menu') && !e.target.closest('button[onclick="toggleProfile()"]')) {
    document.getElementById('profile-menu')?.classList.remove('open');
  }
});

// ─── Carga del sidebar compartido ──────────────────────────────────────
// Cada página necesita <div id="sidebar-placeholder"></div> y
// <body data-page="index|historico|auditor|configuracion">.
async function initShell() {
  const res = await fetch('shared/sidebar.html');
  const placeholder = document.getElementById('sidebar-placeholder');
  placeholder.outerHTML = await res.text();

  // Resaltar el link activo
  const page = document.body.dataset.page;
  document.querySelectorAll('aside nav a[data-page]').forEach(a => {
    if (a.dataset.page === page) {
      a.classList.add('bg-primary-container', 'text-on-primary-container');
      a.querySelector('.material-symbols-outlined')?.setAttribute('style', "font-variation-settings:'FILL' 1;");
    } else {
      a.classList.add('text-on-surface-variant', 'hover:bg-surface-container-highest', 'transition-colors');
    }
  });

  // Datos del usuario en el sidebar
  document.getElementById('nombre-sidebar').textContent = nombre;
  document.getElementById('nombre-menu').textContent = nombre;
  document.getElementById('user-menu').textContent = username;
  document.getElementById('avatar-sidebar').textContent = iniciales;
}
