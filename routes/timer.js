'use strict';

const express = require('express');
const ROOM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const routes = (rm) => {
  const router = express.Router();

  router.get('/new', (_req, res) => {
    const timerId = rm.createTimer();
    res.redirect(302, `/?room=${encodeURIComponent(timerId)}`);
  });

  router.get('/:id', (req, res) => {
    const timerId = String(req.params.id || '').trim().toLowerCase();
    if (!ROOM_ID_PATTERN.test(timerId)) {
      return res.status(400).json({ error: 'Invalid room id.' });
    }
    if (!rm.timerExists(timerId)) {
      return res.status(404).json({ error: 'Timer not found.' });
    }
    return res.status(200).json({ timerId });
  });

  return router;
};

routes.ROOM_ID_PATTERN = ROOM_ID_PATTERN;
module.exports = routes;
