// ─── Config y sesión (comunes a todas las páginas) ───────────────────────
const API = `http://${location.hostname}:3000`;

const token = localStorage.getItem('ecotrack_token');
if (!token) { window.location.href = 'login.html'; }

const nombre = localStorage.getItem('ecotrack_nombre') || 'Usuario';
const username = localStorage.getItem('ecotrack_username') || '';
const rol = localStorage.getItem('ecotrack_rol') || 'comun';
const esAdmin = rol === 'admin';
const iniciales = nombre.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

function cerrarSesion() {
  socket?.disconnect();
  localStorage.removeItem('ecotrack_token');
  localStorage.removeItem('ecotrack_nombre');
  localStorage.removeItem('ecotrack_username');
  localStorage.removeItem('ecotrack_rol');
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
  });

  socket.on('lectura', (datos) => {
    window.dispatchEvent(new CustomEvent('ecotrack:lectura', { detail: datos }));
  });

  // Alerta en tiempo real
  socket.on('alerta', (alerta) => {
    mostrarAlertaPopup(alerta);
    window.dispatchEvent(new CustomEvent('ecotrack:alerta', { detail: alerta }));
  });
}

// ─── Pop-up de alerta en tiempo real (RF10, RI05) ──────────────────────
// El contenedor #alerta-popup viaja con el sidebar (shared/sidebar.html),
let colaAlertas = [];
let popupAlertaVisible = false;

function mostrarAlertaPopup(alerta) {
  const dispositivo = alerta.dispositivo_codigo || alerta.dispositivoCodigo;
  const yaEnCola = colaAlertas.some(a =>
    (a.dispositivo_codigo || a.dispositivoCodigo) === dispositivo && a.variable === alerta.variable
  );
  // Evita que un dispositivo que repite la misma alerta 
  if (yaEnCola) return;

  colaAlertas.push(alerta);
  if (!popupAlertaVisible) procesarColaAlertas();
}

function procesarColaAlertas() {
  const siguiente = colaAlertas.shift();
  if (!siguiente) { popupAlertaVisible = false; return; }
  popupAlertaVisible = true;

  const popup = document.getElementById('alerta-popup');
  if (!popup) { popupAlertaVisible = false; return; }

  const dispositivo = siguiente.dispositivo_codigo || siguiente.dispositivoCodigo || 'Dispositivo';
  const variable = siguiente.variable || '';
  const valor = parseFloat(siguiente.valor);
  const umbralMin = parseFloat(siguiente.umbral_min ?? siguiente.umbralMin);
  const umbralMax = parseFloat(siguiente.umbral_max ?? siguiente.umbralMax);

  document.getElementById('alerta-popup-dispositivo').textContent = dispositivo;
  document.getElementById('alerta-popup-detalle').textContent =
    `${variable}: ${isNaN(valor) ? '—' : valor.toFixed(1)}` +
    (isNaN(umbralMin) || isNaN(umbralMax) ? '' : ` (umbral ${umbralMin.toFixed(1)}–${umbralMax.toFixed(1)})`);

  popup.classList.remove('hidden');
  popup.classList.add('flex');
  requestAnimationFrame(() => popup.classList.add('show'));

  clearTimeout(popup._timeoutId);
  popup._timeoutId = setTimeout(cerrarAlertaPopup, 6000);
}

function cerrarAlertaPopup() {
  const popup = document.getElementById('alerta-popup');
  if (!popup) return;
  popup.classList.remove('show');
  setTimeout(() => {
    popup.classList.add('hidden');
    popup.classList.remove('flex');
    procesarColaAlertas();
  }, 300);
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
  document.getElementById('rol-sidebar').textContent = esAdmin ? 'Administrador' : 'Usuario';

  // Oculta cualquier elemento marcado data-admin-only si el usuario no es admin.
  if (!esAdmin) {
    document.querySelectorAll('[data-admin-only]').forEach(el => el.classList.add('hidden'));
  }
}

function mostrarMensajeModal(elId, texto, esError) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = texto;
  el.classList.remove('hidden', 'text-error', 'text-primary');
  el.classList.add(esError ? 'text-error' : 'text-primary');
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

  // El backend invalida todas las sesiones anteriores (token_version++) y
  // devuelve un token nuevo para que esta misma sesión no se corte. Sin
  // esto, el usuario quedaría deslogueado a la fuerza tras cambiar su
  // propia contraseña.
  if (data.token) {
    localStorage.setItem('ecotrack_token', data.token);
  }

  mostrarMensajeModal('password-error', 'Contraseña actualizada correctamente', false);
  setTimeout(cerrarCambiarPassword, 1000);
}
