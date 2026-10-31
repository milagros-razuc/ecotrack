// ─── Config y sesión (comunes a todas las páginas) ───────────────────────
const API = `http://${location.hostname}:3000`;

function leerDatoLocalStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn(`No se pudo leer ${key} del almacenamiento local:`, error);
    return null;
  }
}

function borrarDatoLocalStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`No se pudo borrar ${key} del almacenamiento local:`, error);
  }
}

const token = leerDatoLocalStorage('ecotrack_token');
if (!token) { window.location.href = 'login.html'; }

const nombre = leerDatoLocalStorage('ecotrack_nombre') || 'Usuario';
const username = leerDatoLocalStorage('ecotrack_username') || '';
const rol = leerDatoLocalStorage('ecotrack_rol') || 'comun';
const esAdmin = rol === 'admin';
const iniciales = nombre.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

function cerrarSesion() {
  socket?.disconnect();
  borrarDatoLocalStorage('ecotrack_token');
  borrarDatoLocalStorage('ecotrack_nombre');
  borrarDatoLocalStorage('ecotrack_username');
  borrarDatoLocalStorage('ecotrack_rol');
  window.location.href = 'login.html';
}

// Sesión expirada / inválida.
function manejarNoAutorizado() {
  cerrarSesion();
}

// ─── Conexión Socket.IO (tiempo real) ──────────────────────────────────
// Requiere que la página cargue el cliente de Socket.IO ANTES de este
// script, por ejemplo:
//   <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
//   <script src="shared/app.js"></script>

let socket = null;
if (typeof io !== 'undefined') {
  socket = io(API, { auth: { token } });

  socket.on('connect_error', (err) => {
    console.warn('Socket.IO: no se pudo conectar en tiempo real —', err.message);
    if (window.ecotrackSocketAuth?.shouldEndSession(err)) {
      socket.io.opts.reconnection = false;
      cerrarSesion();
    }
  });

  socket.on('disconnect', (reason) => {
    if (window.ecotrackSocketAuth?.shouldEndSession(null, reason)) {
      socket.io.opts.reconnection = false;
      cerrarSesion();
    }
  });

  socket.on('lectura', (datos) => {
    window.dispatchEvent(new CustomEvent('ecotrack:lectura', { detail: datos }));
  });

  // Alerta en tiempo real
  socket.on('alerta', (alerta) => {
    window.dispatchEvent(new CustomEvent('ecotrack:alerta', { detail: alerta }));
  });

  socket.on('alerta-accion', (accion) => {
    window.dispatchEvent(new CustomEvent('ecotrack:alerta-accion', { detail: accion }));
  });
}

// ─── Theme ─────────────────────────────────────────────────────────────
const THEME_STORAGE_KEY = 'ecotrack_dark';

function leerPreferenciaTema() {
  const stored = leerDatoLocalStorage(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

function guardarPreferenciaTema(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn('No se pudo guardar la preferencia de tema:', error);
  }
}

function borrarPreferenciaTema() {
  borrarDatoLocalStorage(THEME_STORAGE_KEY);
}

function preferenciaSistemaOscura() {
  try {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (error) {
    console.warn('No se pudo consultar la preferencia del sistema:', error);
    return false;
  }
}

function aplicarTema(theme) {
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('light', !isDark);
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  sincronizarControlesTema();
  window.dispatchEvent(new CustomEvent('ecotrack:theme-change', {
    detail: { theme: isDark ? 'dark' : 'light' },
  }));
}

function temaActual() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function sincronizarControlesTema() {
  const isDark = temaActual() === 'dark';
  document.querySelectorAll('#btn-dark').forEach(btn => {
    const icon = btn.querySelector('.material-symbols-outlined, span');
    if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
    const action = isDark ? 'Activar tema claro' : 'Activar tema oscuro';
    btn.title = action;
    btn.setAttribute('aria-label', action);
    btn.setAttribute('aria-pressed', String(isDark));
  });
}

const savedTheme = leerPreferenciaTema();
aplicarTema(savedTheme || (preferenciaSistemaOscura() ? 'dark' : 'light'));

function toggleDark() {
  const nextTheme = temaActual() === 'dark' ? 'light' : 'dark';
  guardarPreferenciaTema(nextTheme);
  aplicarTema(nextTheme);
}

function obtenerColorTema(name, fallback) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function coloresTema() {
  return {
    primary: obtenerColorTema('--color-primary', '#006d36'),
    secondary: obtenerColorTema('--color-secondary', '#4b53bc'),
    tertiary: obtenerColorTema('--color-tertiary', '#5d5f5f'),
    text: obtenerColorTema('--color-text', '#1c1b1b'),
    mutedText: obtenerColorTema('--color-muted-text', '#3e4a3f'),
    border: obtenerColorTema('--color-border', '#bdcabc'),
    surface: obtenerColorTema('--color-surface', '#ffffff'),
    grid: obtenerColorTema('--color-chart-grid', 'rgba(0,0,0,.08)'),
    primaryFill: obtenerColorTema('--color-primary-fill', 'rgba(0,109,54,.08)'),
    tertiaryFill: obtenerColorTema('--color-tertiary-fill', 'rgba(93,95,95,.06)'),
  };
}

document.addEventListener('DOMContentLoaded', sincronizarControlesTema);

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

  document.querySelectorAll('#mobile-navigation a[data-page]').forEach(a => {
    if (a.dataset.page === page) {
      a.classList.add('active');
      a.querySelector('.material-symbols-outlined')?.setAttribute('style', "font-variation-settings:'FILL' 1;");
    }
    a.addEventListener('click', cerrarMobileMenu);
  });

  // Datos del usuario en el sidebar
  document.getElementById('nombre-sidebar').textContent = nombre;
  document.getElementById('nombre-menu').textContent = nombre;
  document.getElementById('user-menu').textContent = username;
  document.getElementById('avatar-sidebar').textContent = iniciales;
  document.getElementById('rol-sidebar').textContent = esAdmin ? 'Administrador' : 'Usuario';

  // Oculta cualquier elemento marcado data-admin-only si el usuario no es admin.
  if (!esAdmin) {
    document.querySelectorAll('[data-admin-only]').forEach(el => el.classList.add('hidden'));
  }
}

function toggleMobileMenu() {
  const menu = document.getElementById('mobile-navigation');
  const backdrop = document.getElementById('mobile-navigation-backdrop');
  const button = document.querySelector('.mobile-menu-toggle');
  if (!menu || !backdrop || !button) return;

  const open = !menu.classList.contains('open');
  menu.classList.toggle('open', open);
  backdrop.classList.toggle('open', open);
  document.body.classList.toggle('mobile-menu-open', open);
  menu.setAttribute('aria-hidden', String(!open));
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
}

function cerrarMobileMenu() {
  const menu = document.getElementById('mobile-navigation');
  const backdrop = document.getElementById('mobile-navigation-backdrop');
  const button = document.querySelector('.mobile-menu-toggle');
  if (!menu || !backdrop || !button) return;

  menu.classList.remove('open');
  backdrop.classList.remove('open');
  document.body.classList.remove('mobile-menu-open');
  menu.setAttribute('aria-hidden', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', 'Abrir menú de navegación');
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') cerrarMobileMenu();
});

function mostrarMensajeModal(elId, texto, esError) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = texto;
  el.classList.remove('hidden', 'text-error', 'text-primary');
  el.classList.add(esError ? 'text-error' : 'text-primary');
}

function mensajeReclamoRechazado() {
  return 'No se pudo reclamar el dispositivo';
}

// ─── Modal "Mi perfil" ───────────────────────────────────────────
async function abrirPerfil() {
  document.getElementById('profile-menu')?.classList.remove('open');
  document.getElementById('modal-perfil').classList.remove('hidden');

  const contenido = document.getElementById('perfil-contenido');
  contenido.innerHTML = '<p class="text-on-surface-variant">Cargando...</p>';

  const res = await fetch(`${API}/api/auth/me`, { headers: { Authorization: token } });
  if (res.status === 401) return manejarNoAutorizado();
  const usuario = await res.json();

  contenido.innerHTML = `
    <div class="flex flex-col gap-1">
      <label class="text-label-bold text-on-surface-variant uppercase">Usuario</label>
      <p class="font-bold text-on-surface">${usuario.username}</p>
    </div>
    <div class="flex flex-col gap-1">
      <label class="text-label-bold text-on-surface-variant uppercase">Rol</label>
      <p class="text-on-surface">${usuario.rol === 'admin' ? 'Administrador' : 'Común'}</p>
    </div>
    <div class="flex flex-col gap-1">
      <label class="text-label-bold text-on-surface-variant uppercase">Nombre</label>
      <input id="perfil-nombre" class="px-3 py-2 border border-outline-variant rounded-lg text-body-sm outline-none focus:border-primary" value="${usuario.nombre || ''}"/>
    </div>
    <p id="perfil-error" class="hidden text-error text-body-sm"></p>
  `;
}

function cerrarPerfil() {
  document.getElementById('modal-perfil').classList.add('hidden');
}

async function guardarPerfil() {
  const nuevoNombre = document.getElementById('perfil-nombre').value.trim();

  if (!nuevoNombre) {
    mostrarMensajeModal('perfil-error', 'El nombre no puede estar vacío', true);
    return;
  }

  const res = await fetch(`${API}/api/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ nombre: nuevoNombre }),
  });
  if (res.status === 401) return manejarNoAutorizado();
  const data = await res.json();
  if (!res.ok) {
    mostrarMensajeModal('perfil-error', data.error || 'No se pudo guardar el nombre', true);
    return;
  }

  // El nombre mostrado en sidebar/menú viene de localStorage, así que
  // lo actualizamos ahí también, sin forzar un logout.
  localStorage.setItem('ecotrack_nombre', data.nombre);
  document.getElementById('nombre-sidebar').textContent = data.nombre;
  document.getElementById('nombre-menu').textContent = data.nombre;

  mostrarMensajeModal('perfil-error', 'Nombre actualizado correctamente', false);
  setTimeout(cerrarPerfil, 1000);
}

// ─── Modal "Cambiar contraseña" ────────────────────────────────────────
function abrirCambiarPassword() {
  document.getElementById('profile-menu')?.classList.remove('open');
  document.getElementById('modal-password').classList.remove('hidden');
  document.getElementById('password-actual').value = '';
  document.getElementById('password-nueva').value = '';
  document.getElementById('password-error').classList.add('hidden');
}

function cerrarCambiarPassword() {
  document.getElementById('modal-password').classList.add('hidden');
}

async function enviarCambiarPassword() {
  const passwordActual = document.getElementById('password-actual').value;
  const passwordNueva = document.getElementById('password-nueva').value;

  const res = await fetch(`${API}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ passwordActual, passwordNueva }),
  });
  if (res.status === 401) return manejarNoAutorizado();
  const data = await res.json();
  if (!res.ok) {
    mostrarMensajeModal('password-error', data.error || 'No se pudo cambiar la contraseña', true);
    return;
  }

  // El backend invalida todas las sesiones, incluida la actual. El token nuevo
  // se descarta deliberadamente y la sesión local se cierra sin depender del
  // evento de desconexión del socket.
  cerrarSesion();
}
