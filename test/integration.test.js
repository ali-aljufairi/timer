'use strict';

process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const createServer = require('../bin/server');

const ROOM_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ROOM_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const once = (emitter, event, timeout = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeout);
  emitter.once(event, (value) => {
    clearTimeout(timer);
    resolve(value);
  });
});
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const closeServer = (server) => new Promise((resolve) => server.close(resolve));
const join = async (client, room) => {
  const ready = once(client, 'done set up');
  client.emit('set up', room);
  await ready;
};

const withServer = async (run, options = {}) => {
  const server = createServer(0, options);
  if (!server.listening) await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await closeServer(server);
  }
};

const connect = async (url) => {
  const client = createClient(url, { transports: ['websocket'] });
  await once(client, 'connect');
  return client;
};

test('two joined clients receive the same shared timer updates', async () => {
  await withServer(async (url) => {
    const first = await connect(url);
    const second = await connect(url);
    try {
      await join(first, ROOM_A);
      await join(second, ROOM_A);
      const firstStarted = once(first, 'timer started');
      const secondStarted = once(second, 'timer started');
      first.emit('start timer', ROOM_A);
      await Promise.all([firstStarted, secondStarted]);
      const [a, b] = await Promise.all([once(first, 'update timer'), once(second, 'update timer')]);
      assert.deepEqual(a, b);
      const stopped = once(first, 'timer stopped');
      first.emit('stop timer', ROOM_A);
      await stopped;
    } finally {
      first.close();
      second.close();
    }
  });
});

test('an unjoined client cannot mutate another room', async () => {
  await withServer(async (url) => {
    const owner = await connect(url);
    const attacker = await connect(url);
    try {
      await join(owner, ROOM_A);
      let ownerSawStart = false;
      owner.once('timer started', () => { ownerSawStart = true; });
      const rejected = once(attacker, 'timer error');
      attacker.emit('start timer', ROOM_A);
      const error = await rejected;
      assert.match(error.message, /Join this room/);
      await wait(300);
      assert.equal(ownerSawStart, false);
    } finally {
      owner.close();
      attacker.close();
    }
  });
});

test('switching rooms removes old membership and disconnect count is accurate', async () => {
  await withServer(async (url) => {
    const switching = await connect(url);
    const observer = await connect(url);
    try {
      await join(switching, ROOM_A);
      await join(observer, ROOM_B);
      await join(switching, ROOM_B);
      const countAfterDisconnect = once(observer, 'participant count');
      switching.close();
      const result = await countAfterDisconnect;
      assert.equal(result.count, 1);
    } finally {
      switching.close();
      observer.close();
    }
  });
});

test('invalid room ids fail closed', async () => {
  await withServer(async (url) => {
    const client = await connect(url);
    try {
      const errorPromise = once(client, 'timer error');
      client.emit('set up', '../bad room');
      const error = await errorPromise;
      assert.match(error.message, /32-character/);
    } finally {
      client.close();
    }
  });
});

test('room-change rate limit rejects excessive setup events', async () => {
  await withServer(async (url) => {
    const client = await connect(url);
    try {
      await join(client, ROOM_A);
      const rejected = once(client, 'timer error');
      for (let index = 0; index < 8; index += 1) client.emit('set up', ROOM_A);
      const error = await rejected;
      assert.match(error.message, /Too many room changes/);
    } finally {
      client.close();
    }
  });
});

test('active-room capacity rejects new room allocation', async () => {
  await withServer(async (url) => {
    const first = await connect(url);
    const second = await connect(url);
    try {
      await join(first, ROOM_A);
      const rejected = once(second, 'timer error');
      second.emit('set up', ROOM_B);
      const error = await rejected;
      assert.match(error.message, /Room capacity reached/);
    } finally {
      first.close();
      second.close();
    }
  }, { roomManager: { maxTimers: 1 } });
});

test('timer lookup validates capabilities and reveals only existing rooms', async () => {
  await withServer(async (url) => {
    const invalid = await fetch(`${url}/timer/not-a-capability`);
    assert.equal(invalid.status, 400);
    const absent = await fetch(`${url}/timer/${ROOM_A}`);
    assert.equal(absent.status, 404);

    const client = await connect(url);
    try {
      await join(client, ROOM_A);
      const existing = await fetch(`${url}/timer/${ROOM_A}`);
      assert.equal(existing.status, 200);
      assert.deepEqual(await existing.json(), { timerId: ROOM_A });
    } finally {
      client.close();
    }
  });
});
