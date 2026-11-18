(function (root, factory) {
  const escapeHtml = root?.ecotrackHtmlEscape?.escapeHtml
    || (typeof require !== 'undefined' ? require('./html-escape').escapeHtml : null);
  const api = factory(escapeHtml);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ecotrackPlatformPanelRender = api;
})(typeof window !== 'undefined' ? window : null, function (escapeHtml) {
  function renderDeviceRow(device) {
    const cliente = device.cliente || 'Sin cliente';
    const firmware = device.firmware_version || '—';
    const conexion = device.online === 'online' ? 'online' : 'offline';
    const lectura = device.ultima_lectura
      ? new Date(device.ultima_lectura.timestamp).toLocaleString('es-AR')
      : 'sin lectura reciente (últimos 30 días)';
    const ultimaConexion = device.ultima_conexion
      ? new Date(device.ultima_conexion).toLocaleString('es-AR')
      : '—';

    return `<tr class="border-b"><td class="p-3">${escapeHtml(device.codigo)}</td><td class="p-3">${escapeHtml(cliente)}</td><td class="p-3">${escapeHtml(device.estado)}</td><td class="p-3">${escapeHtml(firmware)}</td><td class="p-3">${escapeHtml(conexion)}</td><td class="p-3">${escapeHtml(lectura)}</td><td class="p-3">${escapeHtml(ultimaConexion)}</td></tr>`;
  }

  function renderSummaryItem(estado, total) {
    return `<div class="bg-surface rounded-lg p-4"><div class="text-on-surface-variant">${escapeHtml(estado)}</div><strong class="text-headline-md">${escapeHtml(total)}</strong></div>`;
  }

  function puedeResetearUsuario(usuario, actorUsername) {
    return usuario.username !== actorUsername && (usuario.rol === 'admin' || usuario.rol === 'comun');
  }

  function iniciales(nombre, username) {
    const fuente = nombre && nombre.trim()
      ? nombre
      : username || '?';
    return fuente.split(/\s+/).filter(Boolean).map((parte) => parte[0]).join('').toUpperCase().slice(0, 2);
  }

  function rolEtiqueta(rol) {
    if (rol === 'admin') {
      return '<span class="inline-flex items-center rounded-full bg-primary-container/35 text-on-primary-container px-2 py-1 text-label-bold text-xs">Administrador</span>';
    }
    if (rol === 'platform_admin') {
      return '<span class="inline-flex items-center rounded-full bg-secondary-container/60 text-on-secondary-container px-2 py-1 text-label-bold text-xs">Plataforma</span>';
    }
    return '<span class="inline-flex items-center rounded-full bg-surface-container-high text-on-surface-variant px-2 py-1 text-label-bold text-xs">Usuario</span>';
  }

  function renderUserRow(usuario, actorUsername) {
    const reset = puedeResetearUsuario(usuario, actorUsername)
    ? `<button type="button" data-reset-user-id="${escapeHtml(usuario.id)}" class="reset-user border border-outline-variant rounded-lg px-3 py-2 text-primary hover:bg-surface-container-high transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" title="Resetear contraseña de ${escapeHtml(usuario.username)}" aria-label="Resetear contraseña de ${escapeHtml(usuario.username)}">Resetear contraseña</button>`
      : '';
    return `<tr class="border-b border-outline-variant hover:bg-surface-container-low transition-colors">
      <td class="px-5 py-4 text-on-surface font-bold">${escapeHtml(usuario.username)}</td>
      <td class="px-5 py-4 text-on-surface">${escapeHtml(usuario.nombre || '—')}</td>
      <td class="px-5 py-4">${rolEtiqueta(usuario.rol)}</td>
      <td class="px-5 py-4">${reset}</td>
    </tr>`;
  }

  function renderClientRow(cliente) {
    const administradores = Array.isArray(cliente.administradores) ? cliente.administradores : [];
    const cantidadAdministradores = Number.isInteger(cliente.cantidad_administradores)
      ? cliente.cantidad_administradores
      : administradores.length;
    const administradorPrincipal = cliente.administrador_principal
      || (cantidadAdministradores > 0 ? administradores[0] : null);
    let administradorHtml = '<span class="text-error font-bold">Sin administrador</span>';
    if (administradorPrincipal) {
      const etiquetaCantidad = cantidadAdministradores > 1
        ? `<span class="inline-flex items-center rounded-full bg-secondary-container/60 text-on-secondary-container px-2 py-1 text-label-bold text-xs" title="El administrador principal es el más antiguo">${cantidadAdministradores} administradores</span>`
        : '';
      administradorHtml = `<div class="flex items-center gap-3">
        <span class="h-9 w-9 shrink-0 rounded-full bg-primary text-on-primary flex items-center justify-center text-label-bold" aria-hidden="true">${escapeHtml(iniciales(administradorPrincipal.nombre, administradorPrincipal.username))}</span>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <strong class="text-on-surface">${escapeHtml(administradorPrincipal.nombre || '—')}</strong>
            ${etiquetaCantidad}
          </div>
          <div class="text-on-surface-variant text-body-sm">${escapeHtml(administradorPrincipal.username)}</div>
        </div>
      </div>`;
    }
    const usuarios = Number.isInteger(cliente.usuarios_count)
      ? cliente.usuarios_count
      : Number.isInteger(cliente.cantidad_usuarios)
        ? cliente.cantidad_usuarios
        : null;
    const usuariosHtml = usuarios === null
      ? '<span class="text-on-surface-variant">—</span>'
      : `<strong class="text-on-surface">${escapeHtml(usuarios)}</strong>`;
    const resetButton = administradorPrincipal
      ? `<button type="button" data-reset-user-id="${escapeHtml(administradorPrincipal.id)}" data-reset-username="${escapeHtml(administradorPrincipal.username)}" class="reset-user p-2 rounded-lg text-secondary hover:bg-secondary-container/60 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" title="Resetear contraseña de ${escapeHtml(administradorPrincipal.nombre || administradorPrincipal.username)}" aria-label="Resetear contraseña de ${escapeHtml(administradorPrincipal.nombre || administradorPrincipal.username)}">
          <span class="material-symbols-outlined" aria-hidden="true">key</span>
          <span class="sr-only">Resetear contraseña</span>
        </button>`
      : '';
    return `<tr class="border-b border-outline-variant hover:bg-surface-container-low transition-colors" data-client-id="${escapeHtml(cliente.id)}">
      <td class="px-5 py-4 font-bold text-on-surface">${escapeHtml(cliente.nombre)}</td>
      <td class="px-5 py-4">${administradorHtml}</td>
      <td class="px-5 py-4" id="usuarios-count-${escapeHtml(cliente.id)}">${usuariosHtml}</td>
      <td class="px-5 py-4">
        <div class="flex items-center gap-2">
          ${resetButton}
          <button type="button" data-view-client-id="${escapeHtml(cliente.id)}" class="border border-outline-variant rounded-lg px-3 py-2 text-primary hover:bg-surface-container-high transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Ver usuarios</button>
        </div>
      </td>
    </tr>`;
  }

  return { renderDeviceRow, renderSummaryItem, puedeResetearUsuario, renderUserRow, renderClientRow, rolEtiqueta, iniciales };
});
