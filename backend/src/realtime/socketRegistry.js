function clientRoom(clienteId) {
  return `cliente:${clienteId}`;
}

function userRoom(userId) {
  return `usuario:${userId}`;
}

function createSocketRegistry() {
  const socketsByUser = new Map();
  const expiryTimers = new Map();

  function register(socket, { userId, clienteId, expiresAt }) {
    socket.data.userId = userId;
    socket.data.clienteId = clienteId;
    if (clienteId !== null && clienteId !== undefined) {
      socket.join(clientRoom(clienteId));
    }
    socket.join(userRoom(userId));

    const sockets = socketsByUser.get(String(userId)) || new Set();
    sockets.add(socket);
    socketsByUser.set(String(userId), sockets);

    if (Number.isFinite(expiresAt)) {
      const delay = Math.max(0, expiresAt * 1000 - Date.now());
      const timer = setTimeout(() => socket.disconnect(true), delay);
      expiryTimers.set(socket.id, timer);
    }
  }

  function unregister(socket) {
    const expiryTimer = expiryTimers.get(socket.id);
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimers.delete(socket.id);

    const userId = socket.data.userId;
    if (userId === undefined) return;

    const sockets = socketsByUser.get(String(userId));
    if (!sockets) return;

    sockets.delete(socket);
    if (sockets.size === 0) socketsByUser.delete(String(userId));
  }

  function socketsForUser(userId) {
    return socketsByUser.get(String(userId)) || new Set();
  }

  function hasExpiryTimer(socketId) {
    return expiryTimers.has(socketId);
  }

  function disconnectUserSockets(userId) {
    for (const socket of [...socketsForUser(userId)]) {
      socket.disconnect(true);
    }
  }

  return { register, unregister, socketsForUser, hasExpiryTimer, disconnectUserSockets };
}

let activeRegistry = null;

function setActiveRegistry(registry) {
  activeRegistry = registry;
}

function getActiveRegistry() {
  return activeRegistry;
}

module.exports = { clientRoom, userRoom, createSocketRegistry, setActiveRegistry, getActiveRegistry };
