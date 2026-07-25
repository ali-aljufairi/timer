'use strict';

process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const Timer = require('../models/Timer');
const RoomManager = require('../models/RoomManager');
const TIMERSTATE = require('../helpers/timerStates');

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('timer starts, advances, and stops', async () => {
  const timer = new Timer(null, 'test');
  timer.startTimer();
  assert.equal(timer.timerRunning, TIMERSTATE.RUNNING);
  await wait(1050);
  timer.updateTimer();
  assert.equal(timer.time.seconds, '01');
  timer.stopTimer();
  assert.equal(timer.timerRunning, TIMERSTATE.SUSPENDED);
});

test('seconds wrap at sixty', () => {
  const timer = new Timer(null, 'test');
  timer.elapsedTime = 61_000;
  timer.startTime = Date.now();
  timer.updateTimer();
  assert.deepEqual(timer.time, { hours: '00', minutes: '01', seconds: '01' });
});

test('forward and rewind work while paused', () => {
  const timer = new Timer(null, 'test');
  timer.forwardTimer();
  assert.equal(timer.time.seconds, '05');
  timer.rewindTimer();
  assert.equal(timer.time.seconds, '00');
  timer.rewindTimer();
  assert.equal(timer.time.seconds, '00');
});

test('room manager creates and finds capability timers', () => {
  const rooms = new RoomManager();
  const roomId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  assert.equal(rooms.timerExists(roomId), false);
  assert.equal(rooms.createTimer(roomId), roomId);
  assert.equal(rooms.timerExists(roomId), true);
});

test('room manager enforces active-room capacity', () => {
  const rooms = new RoomManager({ maxTimers: 1 });
  assert.equal(rooms.createTimer('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(rooms.createTimer('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), null);
});

test('client removal cleans every tracked room defensively', () => {
  const rooms = new RoomManager({ gcDelay: 10 });
  const first = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const second = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  rooms.createTimer(first);
  rooms.createTimer(second);
  rooms.addClient('client');
  rooms.addClientToTimer(first, 'client');
  rooms.addClientToTimer(second, 'client');
  assert.deepEqual(rooms.removeClient('client').sort(), [first, second].sort());
  assert.equal(rooms.timerList[first].clients.length, 0);
  assert.equal(rooms.timerList[second].clients.length, 0);
});
