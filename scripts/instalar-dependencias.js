#!/usr/bin/env node
// Copia a ~/.claude las skills de superpowers y el agente `experto` que trae este repo (bundled/),
// SIN pisar nada que ya exista. Se ejecuta solo desde `/turno-noche preparar` y desde el lanzador.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..', 'bundled');
const destino = path.join(os.homedir(), '.claude');
const copiados = [];

for (const [sub, tipo] of [['skills', 'dir'], ['agents', 'file']]) {
  const origen = path.join(raiz, sub);
  if (!fs.existsSync(origen)) continue;
  fs.mkdirSync(path.join(destino, sub), { recursive: true });
  for (const nombre of fs.readdirSync(origen)) {
    const a = path.join(origen, nombre);
    const b = path.join(destino, sub, nombre);
    if (fs.existsSync(b)) continue;
    if (tipo === 'dir') fs.cpSync(a, b, { recursive: true }); else fs.copyFileSync(a, b);
    copiados.push(`${sub}/${nombre}`);
  }
}
console.log(copiados.length
  ? `Instalado en ~/.claude: ${copiados.join(', ')}. Reinicia Claude Code para que los cargue.`
  : 'Dependencias ya presentes: nada que copiar.');
