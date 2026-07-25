'use strict';

const express = require('express');
const path = require('path');
const RoomManager = require('../models/RoomManager');

const server = (port, options = {}) => {
  const app = express();
  const http = require('http').Server(app);
  const rm = new RoomManager(options.roomManager);

  app.disable('x-powered-by');
  app.use('/timer', require('../routes/timer')(rm));
  app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    extensions: ['html'],
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  }));

  http.io = require('../middleware/socket')(http, rm);

  http.listen(port, '0.0.0.0', () => {
    console.log(`Sync Timer listening on port ${port}`);
  });
  return http;
};

module.exports = server;
