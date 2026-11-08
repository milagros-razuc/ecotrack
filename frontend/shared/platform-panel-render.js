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

  return { renderDeviceRow, renderSummaryItem };
});
