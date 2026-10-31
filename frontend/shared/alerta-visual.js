(function () {
  const ROOT_ID = 'alertas-visuales-root';
  const STYLE_ID = 'alertas-visuales-style';
  const deduplicadas = new Set();

  function agregarEstilos() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 12px;
        width: min(420px, calc(100vw - 32px));
        max-width: calc(100vw - 32px);
        pointer-events: none;
      }
      #alerta-popup {
        display: none !important;
      }
      .alerta-visual-card {
        position: relative;
        display: flex;
        gap: 12px;
        width: 100%;
        padding: 16px 42px 14px 14px;
        background: var(--color-surface, #fff);
        border-left: 8px solid var(--color-error, #dc2626);
        border-radius: 8px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, .28);
        color: var(--color-text, #1f2937);
        cursor: pointer;
        pointer-events: auto;
        transform: translateX(120%);
        opacity: 0;
        transition: transform .35s ease, opacity .35s ease;
      }
      .alerta-visual-card.visible {
        transform: translateX(0);
        opacity: 1;
      }
      .alerta-visual-card.saliendo {
        transform: translateX(20%);
        opacity: 0;
      }
      .alerta-visual-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 38px;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: var(--color-error, #dc2626);
        color: #fff;
        font-size: 24px;
        font-weight: 800;
        line-height: 1;
        animation: alerta-visual-brillo .8s ease-in-out 3;
      }
      .alerta-visual-title {
        margin: 0 0 4px;
        color: var(--color-error, #b91c1c);
        font-size: 14px;
        font-weight: 800;
        letter-spacing: .04em;
        text-transform: uppercase;
      }
      .alerta-visual-detail {
        margin: 0;
        font-size: 14px;
        line-height: 1.4;
      }
      .alerta-visual-hint {
        margin: 6px 0 0;
        color: var(--color-muted-text, #6b7280);
        font-size: 11px;
      }
      .alerta-visual-close {
        position: absolute;
        top: 8px;
        right: 10px;
        border: 0;
        background: transparent;
        color: var(--color-muted-text, #6b7280);
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
      }
      @keyframes alerta-visual-brillo {
        0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, .2); }
        50% { box-shadow: 0 0 0 10px rgba(220, 38, 38, .0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .alerta-visual-card { transition: none; }
        .alerta-visual-icon { animation: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function obtenerContenedor() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.setAttribute('aria-live', 'assertive');
      root.setAttribute('aria-atomic', 'false');
      document.body.appendChild(root);
    }

    const popupViejo = document.getElementById('alerta-popup');
    if (popupViejo) popupViejo.style.display = 'none';
    return root;
  }

  function unidadDe(variable) {
    return variable === 'temperatura' ? '°C' : variable === 'humedad' ? '%' : '';
  }

  function crearTextoDetalle(alerta) {
    const unidad = unidadDe(alerta.variable);
    const valor = Number(alerta.valor);
    const maximo = Number(alerta.umbralMax);
    const minimo = Number(alerta.umbralMin);
    const medida = `${alerta.valor}${unidad}`;

    if (!Number.isNaN(maximo) && valor > maximo) {
      return `${alerta.dispositivoCodigo}: ${medida} supera el máximo (${alerta.umbralMax}${unidad})`;
    }
    if (!Number.isNaN(minimo) && valor < minimo) {
      return `${alerta.dispositivoCodigo}: ${medida} por debajo del mínimo (${alerta.umbralMin}${unidad})`;
    }
    return `${alerta.dispositivoCodigo}: ${medida}`;
  }

  function cerrar(card) {
    card.classList.remove('visible');
    card.classList.add('saliendo');
    card.addEventListener('transitionend', () => card.remove(), { once: true });
    setTimeout(() => card.remove(), 500);
  }

  function mostrar(alerta) {
    if (!alerta || !alerta.dispositivoCodigo || !alerta.variable) return;

    const timestamp = String(alerta.timestamp ?? '');
    const clave = `${alerta.dispositivoCodigo}|${alerta.variable}|${timestamp}`;
    if (deduplicadas.has(clave)) return;
    deduplicadas.add(clave);

    const root = obtenerContenedor();
    const card = document.createElement('article');
    card.className = 'alerta-visual-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'alert');
    card.addEventListener('click', () => {
      window.location.href = 'auditor.html';
    });

    const icon = document.createElement('span');
    icon.className = 'alerta-visual-icon';
    icon.textContent = '!';
    icon.setAttribute('aria-hidden', 'true');

    const content = document.createElement('div');
    content.style.minWidth = '0';

    const title = document.createElement('p');
    title.className = 'alerta-visual-title';
    title.textContent = `Alerta · ${alerta.variable}`;

    const detail = document.createElement('p');
    detail.className = 'alerta-visual-detail';
    detail.textContent = crearTextoDetalle(alerta);

    const hint = document.createElement('p');
    hint.className = 'alerta-visual-hint';
    hint.textContent = `${new Date(alerta.timestamp).toLocaleTimeString('es-AR')} · clic para ver el detalle`;

    const close = document.createElement('button');
    close.className = 'alerta-visual-close';
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Cerrar alerta');
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      cerrar(card);
    });

    content.append(title, detail, hint);
    card.append(icon, content, close);
    root.prepend(card);
    requestAnimationFrame(() => card.classList.add('visible'));
    setTimeout(() => cerrar(card), 10000);
  }

  agregarEstilos();
  obtenerContenedor();
  window.addEventListener('ecotrack:alerta', (event) => mostrar(event.detail));
})();
