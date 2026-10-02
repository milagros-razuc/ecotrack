function clientRoom(clienteId) {
  return `cliente:${clienteId}`;
}

function userRoom(userId) {
  return `usuario:${userId}`;
}

function createSocketRegistry() {
  const socketsByUser = new Map();

  function register(socket, { userId, clienteId }) {
    socket.data.userId = userId;
    socket.data.clienteId = clienteId;
    if (clienteId !== undefined && clienteId !== null) {
  socket.join(clientRoom(clienteId));
  }
  socket.join(userRoom(userId));

    const sockets = socketsByUser.get(String(userId)) || new Set();
    sockets.add(socket);
    socketsByUser.set(String(userId), sockets);
  }

  function unregister(socket) {
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

  return { register, unregister, socketsForUser };
}

module.exports = { clientRoom, userRoom, createSocketRegistry };
