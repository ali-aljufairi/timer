'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('every browser element lookup exists in the shipped HTML', () => {
  const publicDirectory = path.join(__dirname, '..', 'public');
  const script = fs.readFileSync(path.join(publicDirectory, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');
  const referencedIds = [...script.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]);
  assert.ok(referencedIds.length > 0);
  for (const id of new Set(referencedIds)) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `Missing HTML element #${id}`);
  }
});
