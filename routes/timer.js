'use strict';

const express = require('express');
const ROOM_ID_PATTERN = /^[a-f0-9]{32}$/;

const routes = (rm) => {
  const router = express.Router();

  router.get('/:id', (req, res) => {
    const timerId = String(req.params.id || '').trim().toLowerCase();
    if (!ROOM_ID_PATTERN.test(timerId)) return res.status(400).json({ error: 'Invalid room code.' });
    if (!rm.timerExists(timerId)) return res.status(404).json({ error: 'Timer not found.' });
    return res.status(200).json({ timerId });
  });

  return router;
};

routes.ROOM_ID_PATTERN = ROOM_ID_PATTERN;
module.exports = routes;
