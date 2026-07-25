'use strict';

const { logExceptInTest } = require('../helpers');
const TIMERSTATE = require('../helpers/timerStates');
const ROOM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

module.exports = (http, roomManager) => {
  const io = require('socket.io')(http, {
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 16 * 1024,
  });
  const rm = roomManager;
  rm.updateCallback = (timer) => io.to(timer.id).emit('update timer', timer.time);

  const validRoom = (timerId) => typeof timerId === 'string' && ROOM_ID_PATTERN.test(timerId);
  const withTimer = (socket, timerId, action) => {
    if (!validRoom(timerId) || !rm.timerExists(timerId)) {
      socket.emit('timer error', { message: 'Invalid or unavailable room.' });
      return;
    }
    action(rm.timerList[timerId]);
  };

  io.on('connection', (socket) => {
    logExceptInTest(`User ${socket.id} connected`);

    socket.on('set up', (rawTimerId) => {
      const timerId = typeof rawTimerId === 'string' ? rawTimerId.trim().toLowerCase() : '';
      if (!validRoom(timerId)) {
        socket.emit('timer error', { message: 'Room names use letters, numbers, dashes, and underscores.' });
        return;
      }

      if (!rm.timerExists(timerId)) rm.createTimer(timerId);

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
        socket.emit('timer error', { message: 'Could not join the room.' });
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
      const timerId = socket.data.timerId;
      rm.removeClient(socket.id);
      if (timerId && rm.timerExists(timerId)) {
        io.to(timerId).emit('participant count', { count: rm.timerList[timerId].clients.length });
      }
    });
  });
};
