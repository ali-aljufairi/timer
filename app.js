'use strict';

const createServer = require('./bin/server');
const port = Number.parseInt(process.env.PORT || '3000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const server = createServer(port);
const shutdown = () => {
  const forcedExit = setTimeout(() => process.exit(1), 15_000);
  forcedExit.unref();
  server.close(() => process.exit(0));
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
