const test = require('node:test');

test.todo(
  'CP-RF02 — criterio de aceptación: "Permitir configurar el intervalo de captura." '
    + 'Motivo: el intervalo de captura actual es constante de compilación y no configurable por el operador.'
);

test.todo(
  'CP-RF07 — criterio de aceptación: "Consultar el historial por rango de fechas y por variable." '
    + 'Motivo: fechaDesde/fechaHasta no se aplican al histórico agregado; defecto conocido de RF07.'
);

test.todo(
  'CP-RF10 — criterio de aceptación: "Notificar alertas activas con un pop-up dentro del dashboard." '
    + 'Motivo: el backend emite eventos Socket.IO, pero no existe en esta suite un mecanismo verificable '
    + 'que demuestre el pop-up del dashboard.'
);

test.todo(
  'CP-RF14 — criterio de aceptación: "Registrar logs de actividad para auditoría y trazabilidad." '
    + 'Motivo: no existen eventos específicos de alta/revocación de API keys para verificar la trazabilidad '
    + 'de esas operaciones.'
);

test.todo(
  'CP-RF19 — criterio de aceptación: "API pública documentada para sistemas externos autorizados '
    + '(lecturas, alertas, estado de dispositivos)." '
    + 'Motivo: queda pendiente verificar mediante una prueba de ruta que X-Api-Key inválida o revocada '
    + 'devuelve 401 y que una clave no expone datos del titular de otra.'
);

test.todo(
  'CP-RF20 — criterio de aceptación: "Cada usuario ve y edita su perfil, incluido el cambio de contraseña." '
    + 'Motivo: la invalidación de sesiones previas al cambio de contraseña requiere una verificación integrada '
    + 'de extremo a extremo; el mecanismo token_version ya tiene cobertura unitaria en auth.test.js.'
);

