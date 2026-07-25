'use strict';

const ROOM_PATTERN = /^[a-f0-9]{32}$/;
const ROOM_HINT = 'Paste the private code from a shared room link.';
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

const normalizeRoom = (value) => value.trim().toLowerCase();
const randomRoom = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');

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
    roomInput.setAttribute('aria-invalid', 'true');
    $('room-hint').textContent = 'Enter the complete 32-character room access code.';
    roomInput.focus();
    return;
  }
  roomInput.classList.remove('invalid');
  roomInput.removeAttribute('aria-invalid');
  $('room-hint').textContent = ROOM_HINT;
  roomId = normalized;
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  history.replaceState({}, '', url);
  $('room-name').textContent = `${roomId.slice(0, 10)}…${roomId.slice(-6)}`;
  $('room-name').title = roomId;
  welcomePanel.hidden = true;
  timerPanel.hidden = false;
  socket.emit('set up', roomId);
};

$('join-button').addEventListener('click', () => openRoom(roomInput.value));
$('new-room-button').addEventListener('click', () => openRoom(randomRoom()));
roomInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') openRoom(roomInput.value);
});
roomInput.addEventListener('input', () => {
  roomInput.classList.remove('invalid');
  roomInput.removeAttribute('aria-invalid');
  $('room-hint').textContent = ROOM_HINT;
});

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
