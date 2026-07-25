'use strict';

const ROOM_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const $ = (id) => document.getElementById(id);
const welcomePanel = $('welcome-panel');
const timerPanel = $('timer-panel');
const roomInput = $('room-input');
const connection = $('connection-status');
const timerState = $('timer-state');
const startButton = $('start-button');
const toast = $('toast');
let roomId = null;
let running = false;
let toastTimer;

const socket = io({ transports: ['websocket', 'polling'] });

const showToast = (message, isError = false) => {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.style.color = isError ? 'var(--danger)' : 'var(--accent)';
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 2600);
};

const normalizeRoom = (value) => value.trim().toLowerCase().replace(/\s+/g, '-');
const randomRoom = () => {
  const words = ['bright', 'calm', 'cosmic', 'swift', 'quiet', 'lunar'];
  const word = words[Math.floor(Math.random() * words.length)];
  const suffix = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 5);
  return `${word}-${suffix}`;
};

const updateConnection = (status) => {
  connection.classList.toggle('online', status === 'Connected');
  connection.classList.toggle('offline', status === 'Offline');
  connection.querySelector('span').textContent = status;
};

const setRunning = (value) => {
  running = value;
  startButton.classList.toggle('running', running);
  startButton.setAttribute('aria-label', running ? 'Pause timer' : 'Start timer');
  timerState.classList.toggle('running', running);
  timerState.querySelector('span').textContent = running ? 'Running live' : 'Paused';
};

const openRoom = (requestedRoom) => {
  const normalized = normalizeRoom(requestedRoom);
  if (!ROOM_PATTERN.test(normalized)) {
    roomInput.classList.add('invalid');
    roomInput.focus();
    return;
  }
  roomInput.classList.remove('invalid');
  roomId = normalized;
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  history.replaceState({}, '', url);
  $('room-name').textContent = roomId;
  welcomePanel.hidden = true;
  timerPanel.hidden = false;
  socket.emit('set up', roomId);
};

$('join-button').addEventListener('click', () => openRoom(roomInput.value));
$('new-room-button').addEventListener('click', () => openRoom(randomRoom()));
roomInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') openRoom(roomInput.value);
});
roomInput.addEventListener('input', () => roomInput.classList.remove('invalid'));

startButton.addEventListener('click', () => {
  if (!roomId) return;
  socket.emit(running ? 'stop timer' : 'start timer', roomId);
});
$('reset-button').addEventListener('click', () => roomId && socket.emit('reset timer', roomId));
$('rewind-button').addEventListener('click', () => roomId && socket.emit('rewind timer', roomId));
$('forward-button').addEventListener('click', () => roomId && socket.emit('fastforward timer', roomId));
$('share-button').addEventListener('click', async () => {
  const shareData = { title: `Sync Timer · ${roomId}`, text: 'Join my shared timer', url: window.location.href };
  try {
    if (navigator.share) await navigator.share(shareData);
    else await navigator.clipboard.writeText(window.location.href);
    showToast(navigator.share ? 'Share sheet opened' : 'Room link copied');
  } catch (error) {
    if (error.name !== 'AbortError') showToast('Could not copy the link', true);
  }
});

socket.on('connect', () => {
  updateConnection('Connected');
  if (roomId) socket.emit('set up', roomId);
});
socket.on('disconnect', () => updateConnection('Offline'));
socket.on('connect_error', () => updateConnection('Reconnecting'));
socket.on('done set up', () => showToast('Room synchronized'));
socket.on('update timer', (time) => {
  if (!time) return;
  $('hours').textContent = time.hours;
  $('minutes').textContent = time.minutes;
  $('seconds').textContent = time.seconds;
});
socket.on('timer started', () => setRunning(true));
socket.on('timer stopped', () => setRunning(false));
socket.on('participant count', ({ count }) => { $('participant-count').textContent = String(count); });
socket.on('timer error', (error) => showToast(error?.message || 'Timer unavailable', true));

const initialRoom = new URLSearchParams(window.location.search).get('room');
if (initialRoom) openRoom(initialRoom);
