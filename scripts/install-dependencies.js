#!/usr/bin/env node
// Copies the superpowers skills and the `experto` agent bundled in this repo (bundled/) into ~/.claude,
// WITHOUT overwriting anything that already exists. Run only from `/night-turn prepare` and from the launcher.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..', 'bundled');
const target = path.join(os.homedir(), '.claude');
const copied = [];

for (const [sub, kind] of [['skills', 'dir'], ['agents', 'file']]) {
  const source = path.join(root, sub);
  if (!fs.existsSync(source)) continue;
  fs.mkdirSync(path.join(target, sub), { recursive: true });
  for (const name of fs.readdirSync(source)) {
    const from = path.join(source, name);
    const to = path.join(target, sub, name);
    if (fs.existsSync(to)) continue;
    if (kind === 'dir') fs.cpSync(from, to, { recursive: true }); else fs.copyFileSync(from, to);
    copied.push(`${sub}/${name}`);
  }
}
console.log(copied.length
  ? `Installed in ~/.claude: ${copied.join(', ')}. Restart Claude Code so it loads them.`
  : 'Dependencies already present: nothing to copy.');
