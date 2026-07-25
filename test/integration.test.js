'use strict';

process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const createServer = require('../bin/server');

const once = (emitter, event, timeout = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeout);
  emitter.once(event, (value) => {
    clearTimeout(timer);
    resolve(value);
  });
});

const closeServer = (server) => new Promise((resolve) => server.close(resolve));

test('two clients receive the same shared timer updates', async () => {
  const server = createServer(0);
  if (!server.listening) await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const first = createClient(url, { transports: ['websocket'] });
  const second = createClient(url, { transports: ['websocket'] });

  try {
    await Promise.all([once(first, 'connect'), once(second, 'connect')]);
    const firstReady = once(first, 'done set up');
    const secondReady = once(second, 'done set up');
    first.emit('set up', 'shared-test');
    second.emit('set up', 'shared-test');
    await Promise.all([firstReady, secondReady]);

    const firstStarted = once(first, 'timer started');
    const secondStarted = once(second, 'timer started');
    first.emit('start timer', 'shared-test');
    await Promise.all([firstStarted, secondStarted]);

    const firstUpdate = once(first, 'update timer');
    const secondUpdate = once(second, 'update timer');
    const [a, b] = await Promise.all([firstUpdate, secondUpdate]);
    assert.deepEqual(a, b);
    const stopped = once(first, 'timer stopped');
    first.emit('stop timer', 'shared-test');
    await stopped;
  } finally {
    first.close();
    second.close();
    await closeServer(server);
  }
});

test('invalid room ids fail closed', async () => {
  const server = createServer(0);
  if (!server.listening) await once(server, 'listening');
  const client = createClient(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'] });

  try {
    await once(client, 'connect');
    const errorPromise = once(client, 'timer error');
    client.emit('set up', '../bad room');
    const error = await errorPromise;
    assert.match(error.message, /Room names/);
  } finally {
    client.close();
    await closeServer(server);
  }
});
