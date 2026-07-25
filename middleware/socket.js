'use strict';

const { logExceptInTest } = require('../helpers');
const TIMERSTATE = require('../helpers/timerStates');
const ROOM_ID_PATTERN = /^[a-f0-9]{32}$/;
const MAX_CONNECTIONS = Number.parseInt(process.env.MAX_CONNECTIONS || '500', 10);
const CONTROL_LIMIT = 30;
const CONTROL_WINDOW_MS = 10_000;
const SETUP_LIMIT = 8;
const SETUP_WINDOW_MS = 60_000;

module.exports = (http, roomManager) => {
  const io = require('socket.io')(http, {
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 16 * 1024,
    pingTimeout: 20_000,
    pingInterval: 25_000,
  });
  const rm = roomManager;
  rm.updateCallback = (timer) => io.to(timer.id).emit('update timer', timer.time);

  const validRoom = (timerId) => typeof timerId === 'string' && ROOM_ID_PATTERN.test(timerId);
  const reject = (socket, message) => socket.emit('timer error', { message });
  const withinRate = (socket, key, limit, windowMs) => {
    const now = Date.now();
    const events = (socket.data[key] || []).filter((time) => now - time < windowMs);
    if (events.length >= limit) return false;
    events.push(now);
    socket.data[key] = events;
    return true;
  };
  const withTimer = (socket, timerId, action) => {
    if (!withinRate(socket, 'controlEvents', CONTROL_LIMIT, CONTROL_WINDOW_MS)) {
      reject(socket, 'Too many timer actions. Slow down.');
      return;
    }
    if (!validRoom(timerId) || socket.data.timerId !== timerId || !rm.timerExists(timerId)) {
      reject(socket, 'Join this room before controlling its timer.');
      return;
    }
    if (!rm.timerList[timerId].clients.includes(socket.id)) {
      reject(socket, 'Room membership expired. Rejoin the room.');
      return;
    }
    action(rm.timerList[timerId]);
  };

  io.on('connection', (socket) => {
    if (io.engine.clientsCount > MAX_CONNECTIONS) {
      reject(socket, 'Server is at connection capacity. Try again shortly.');
      socket.disconnect(true);
      return;
    }

    socket.on('set up', (rawTimerId) => {
      if (!withinRate(socket, 'setupEvents', SETUP_LIMIT, SETUP_WINDOW_MS)) {
        reject(socket, 'Too many room changes. Try again in a minute.');
        return;
      }
      const timerId = typeof rawTimerId === 'string' ? rawTimerId.trim().toLowerCase() : '';
      if (!validRoom(timerId)) {
        reject(socket, 'Enter a valid 32-character room code.');
        return;
      }

      const previousRoom = socket.data.timerId;
      if (previousRoom && previousRoom !== timerId) {
        socket.leave(previousRoom);
        rm.removeClientFromTimer(previousRoom, socket.id);
        if (rm.timerExists(previousRoom)) {
          io.to(previousRoom).emit('participant count', { count: rm.timerList[previousRoom].clients.length });
        }
        delete socket.data.timerId;
      }

      if (!rm.timerExists(timerId) && !rm.createTimer(timerId)) {
        reject(socket, 'Room capacity reached. Try again shortly.');
        return;
      }

      try {
        socket.join(timerId);
        rm.addClient(socket.id);
        rm.addClientToTimer(timerId, socket.id);
        socket.data.timerId = timerId;
        io.to(timerId).emit('participant count', { count: rm.timerList[timerId].clients.length });
        socket.emit('done set up', { timerId });
        socket.emit('update timer', rm.timerList[timerId].time);
        socket.emit(rm.timerList[timerId].timerRunning === TIMERSTATE.RUNNING ? 'timer started' : 'timer stopped');
      } catch (error) {
        logExceptInTest(`Setup error for ${socket.id}: ${error.message}`);
        reject(socket, 'Could not join the room.');
      }
    });

    socket.on('get time', (timerId) => withTimer(socket, timerId, (timer) => socket.emit('update timer', timer.time)));
    socket.on('start timer', (timerId) => withTimer(socket, timerId, (timer) => {
      timer.startTimer();
      io.to(timerId).emit('timer started');
    }));
    socket.on('stop timer', (timerId) => withTimer(socket, timerId, (timer) => {
      timer.stopTimer();
      io.to(timerId).emit('timer stopped');
    }));
    socket.on('rewind timer', (timerId) => withTimer(socket, timerId, (timer) => {
      timer.rewindTimer();
      io.to(timerId).emit('update timer', timer.time);
    }));
    socket.on('fastforward timer', (timerId) => withTimer(socket, timerId, (timer) => {
      timer.forwardTimer();
      io.to(timerId).emit('update timer', timer.time);
    }));
    socket.on('reset timer', (timerId) => withTimer(socket, timerId, (timer) => {
      timer.resetTimer();
      io.to(timerId).emit('timer stopped');
    }));

    socket.on('disconnect', () => {
      const timerIds = rm.removeClient(socket.id);
      for (const timerId of timerIds) {
        if (rm.timerExists(timerId)) {
          io.to(timerId).emit('participant count', { count: rm.timerList[timerId].clients.length });
        }
      }
    });
  });

  return io;
};
