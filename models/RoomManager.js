'use strict';

const { logExceptInTest } = require('../helpers');
const Timer = require('./Timer');
const crypto = require('crypto');

const DEFAULT_GC_DELAY = 5 * 60 * 1000;
const DEFAULT_MAX_TIMERS = 250;

class RoomManager {
  constructor({
    maxTimers = Number.parseInt(process.env.MAX_ACTIVE_ROOMS || DEFAULT_MAX_TIMERS, 10),
    gcDelay = DEFAULT_GC_DELAY,
  } = {}) {
    this.clientList = [];
    this.timerList = Object.create(null);
    this.timerGCList = Object.create(null);
    this.updateCallback = null;
    this.maxTimers = Number.isInteger(maxTimers) && maxTimers > 0 ? maxTimers : DEFAULT_MAX_TIMERS;
    this.gcDelay = gcDelay;
  }

  clientExists(clientId) {
    return this.clientList.includes(clientId);
  }

  timerExists(timerId) {
    return Object.prototype.hasOwnProperty.call(this.timerList, timerId);
  }

  createTimer(timerId = crypto.randomBytes(16).toString('hex')) {
    if (this.timerExists(timerId)) return timerId;
    if (Object.keys(this.timerList).length >= this.maxTimers) return null;
    this.timerList[timerId] = new Timer(this.updateCallback, timerId);
    logExceptInTest(`New Timer ${timerId} created`);
    return timerId;
  }

  deleteTimer(timerId) {
    if (!this.timerExists(timerId)) return false;
    this.timerList[timerId].stopTimer();
    delete this.timerList[timerId];
    if (this.timerGCList[timerId]) clearTimeout(this.timerGCList[timerId]);
    delete this.timerGCList[timerId];
    logExceptInTest(`Timer ${timerId} deleted`);
    return true;
  }

  addClient(clientId) {
    if (this.clientExists(clientId)) return false;
    this.clientList.push(clientId);
    return true;
  }

  addClientToTimer(timerId, clientId) {
    if (!this.timerExists(timerId) || !this.clientExists(clientId)) return false;
    const added = this.timerList[timerId].addClient(clientId);
    if (this.timerGCList[timerId]) {
      clearTimeout(this.timerGCList[timerId]);
      delete this.timerGCList[timerId];
    }
    return added;
  }

  removeClientFromTimer(timerId, clientId) {
    if (!this.timerExists(timerId)) return false;
    const removed = this.timerList[timerId].removeClient(clientId);
    if (removed && this.timerList[timerId].clients.length === 0) {
      this.timerGCList[timerId] = setTimeout(() => this.deleteTimer(timerId), this.gcDelay);
      this.timerGCList[timerId].unref?.();
    }
    return removed;
  }

  timerIdsForClient(clientId) {
    return Object.keys(this.timerList).filter((timerId) => this.timerList[timerId].clients.includes(clientId));
  }

  removeClient(clientId) {
    const timerIds = this.timerIdsForClient(clientId);
    for (const timerId of timerIds) this.removeClientFromTimer(timerId, clientId);
    const index = this.clientList.indexOf(clientId);
    if (index >= 0) this.clientList.splice(index, 1);
    return timerIds;
  }
}

module.exports = RoomManager;
