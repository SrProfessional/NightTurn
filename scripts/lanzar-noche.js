#!/usr/bin/env node
// Lanzador del turno de noche: abre una sesión `claude -p` NUEVA por cada tarea de la cola,
// hasta que se acabe el trabajo, la hora, el presupuesto o aparezcan errores seguidos.
// El estado vive en archivos (cola.md, reporte), no en la memoria de una sesión larga.
//
// Uso: node lanzar-noche.js --proyecto D:/GitHub/N8N-Automation [--horas 7 | --hasta 06:30]
//        [--presupuesto 25] [--por-ronda 6] [--max-rondas 40] [--limite-ronda-min 90] [--sin-worktree]
// Para detenerlo con calma: crear el archivo PARAR en la carpeta del proyecto (ver línea "Parar:" del log).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const a = parseArgs(process.argv.slice(2));
const horas = num(a.horas, 7);
const presupuesto = num(a.presupuesto, 25);
const porRonda = num(a['por-ronda'], 6);
const maxRondas = num(a['max-rondas'], 40);
const limiteRondaMs = num(a['limite-ronda-min'], 90) * 60000;
const ESPERA_LIMITE_MS = 20 * 60000;

const repo = git(['rev-parse', '--show-toplevel'], a.proyecto || process.cwd()).trim();
const nombre = path.basename(repo);
const hoy = fechaLocal(new Date());
const home = os.homedir();
const estado = path.join(home, '.claude', 'turno-noche', 'proyectos', nombre);
const colaFile = path.join(estado, 'cola.md');
const reporteDir = path.join(estado, 'reportes');
const reporteFile = path.join(reporteDir, `${hoy}.md`);
const logDir = path.join(reporteDir, hoy);
const parar = path.join(estado, 'PARAR');

if (!fs.existsSync(colaFile)) die(`No existe la cola: ${colaFile}\nCrea la cola con "/turno-noche preparar" en este PC (la cola no viaja con el repo).`);
fs.mkdirSync(logDir, { recursive: true });
const log = (m) => {
  const l = `[${new Date().toLocaleString('sv-SE')}] ${m}`;
  console.log(l);
  fs.appendFileSync(path.join(logDir, 'lanzador.log'), l + '\n');
};

const limite = a.hasta ? proximaHora(a.hasta) : new Date(Date.now() + horas * 3600000);
const rama = `noche/${hoy}`;
const trabajo = a['sin-worktree'] ? repo : prepararWorktree();
// La sesión de cada ronda corre en `trabajo`: necesita encontrar la skill instalada de forma personal
// en este PC (lo normal) o commiteada en el repo del proyecto (el worktree solo ve lo commiteado).
// Perfiles faltantes no detienen el turno: la skill los lee y, si falta alguno, trabaja con el otro.
const skillEnTrabajo = path.join(trabajo, '.claude', 'skills', 'turno-noche', 'SKILL.md');
const skillPersonal = path.join(home, '.claude', 'skills', 'turno-noche', 'SKILL.md');
if (!fs.existsSync(skillEnTrabajo) && !fs.existsSync(skillPersonal)) {
  die(`La skill turno-noche no está instalada en ~/.claude/skills ni commiteada en ${trabajo}.\n` +
      'Instálala con: git clone https://github.com/SrProfessional/NightTurn.git ~/.claude/skills/turno-noche (ver README), ' +
      'o commitea .claude/skills/turno-noche en el repo del proyecto, y vuelve a lanzar.');
}
if (!fs.existsSync(reporteFile)) {
  fs.writeFileSync(reporteFile, `# Reporte del turno de noche — ${nombre} — ${hoy}\n\nRama: \`${rama}\`  \nCarpeta de trabajo: \`${trabajo}\`\n\n`);
}
try { fs.unlinkSync(parar); } catch (_) { /* no existía */ }

log(`Inicio. Proyecto=${nombre} rama=${rama} hasta=${limite.toLocaleString('sv-SE')} presupuesto=$${presupuesto}`);
log(`Parar: crear el archivo ${parar}`);
const despierto = mantenerDespierto();

const memoria = path.join(home, '.claude', 'projects', repo.replace(/[^A-Za-z0-9]/g, '-'), 'memory'); // opcional: no viaja entre PCs
const noPermitido = [
  'AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode',
  'Bash(git push *)', 'PowerShell(git push *)',
  'Bash(ssh *)', 'Bash(scp *)', 'Bash(kubectl *)',
  'PowerShell(ssh *)', 'PowerShell(scp *)', 'PowerShell(kubectl *)',
];
// Sin sonido de fin de turno (el Stop hook global suena en cada ronda) ni el mejorador de prompts.
const ajustes = JSON.stringify({
  hooks: { Stop: [] },
  enabledPlugins: { 'prompt-improver@severity1-marketplace': false },
});

let gastado = 0, rondas = 0, fallos = 0, sinProgreso = 0, motivo = 'terminado';
while (true) {
  if (fs.existsSync(parar)) { motivo = 'archivo PARAR'; break; }
  if (Date.now() >= limite.getTime()) { motivo = 'hora límite'; break; }
  if (gastado >= presupuesto) { motivo = 'presupuesto agotado'; break; }
  if (rondas >= maxRondas) { motivo = 'máximo de rondas'; break; }
  rondas++;
  const antes = fs.readFileSync(colaFile, 'utf8');
  const tope = Math.min(porRonda, presupuesto - gastado);
  log(`Ronda ${rondas}: tope $${tope.toFixed(2)} (gastado $${gastado.toFixed(2)})`);
  const r = correrRonda(rondas, tope);
  gastado += r.costo;
  const despues = fs.readFileSync(colaFile, 'utf8');
  log(`Ronda ${rondas} → ${r.resumen} costo $${r.costo.toFixed(2)}`);

  if (r.limiteUso) {
    rondas--; // no cuenta como ronda: se reintenta tras la espera
    const espera = Math.min(ESPERA_LIMITE_MS, limite.getTime() - Date.now());
    if (espera <= 0) { motivo = 'límite de uso hasta la hora límite'; break; }
    log(`Límite de uso de Claude: espero ${Math.round(espera / 60000)} min`);
    dormir(espera);
    continue;
  }
  if (r.error) {
    if (++fallos >= 3) { motivo = '3 errores seguidos'; break; }
    continue;
  }
  fallos = 0;
  if (r.estado === 'fin-sin-trabajo') { motivo = 'sin más trabajo que se pueda avanzar'; break; }
  if (r.estado === 'fin-hora') { motivo = 'hora límite'; break; }
  if (r.estado === 'fin-bloqueado') { motivo = 'todo lo que queda está bloqueado'; break; }
  sinProgreso = antes === despues ? sinProgreso + 1 : 0;
  if (sinProgreso >= 2) { motivo = 'dos rondas sin cambios en la cola'; break; }
}

fs.appendFileSync(reporteFile,
  `\n---\n## Cierre del lanzador\n- Motivo: ${motivo}\n- Rondas: ${rondas}\n- Gasto: $${gastado.toFixed(2)} de $${presupuesto}\n- Rama: \`${rama}\` en \`${trabajo}\`\n- Fin: ${new Date().toLocaleString('sv-SE')}\n`);
log(`Fin. Motivo: ${motivo}. Rondas=${rondas} gasto=$${gastado.toFixed(2)}`);
if (despierto) despierto.kill();

// ---------------------------------------------------------------- funciones

function correrRonda(n, tope) {
  const prompt =
    `/turno-noche ejecutar --proyecto "${repo}" --cola "${colaFile}" --reporte "${reporteFile}" --hasta "${limite.toISOString()}"\n\n` +
    'Orden automática del turno de noche. Nadie va a contestar: no pidas aclaraciones ni aprobaciones; ' +
    'decide con el perfil de decisiones y registra cada decisión. Una sola tarea y termina con la línea ESTADO.';
  const args = [
    '-p', '--output-format', 'json',
    '--permission-mode', 'auto', '--permission-prompts', 'none',
    '--max-budget-usd', tope.toFixed(2),
    '--name', `noche-${hoy}-r${n}`,
    '--settings', ajustes,
    '--add-dir', estado,
  ];
  if (fs.existsSync(memoria)) args.push('--add-dir', memoria);
  args.push('--disallowedTools', ...noPermitido);

  const res = cp.spawnSync(a.claude || 'claude', args, {
    cwd: trabajo, input: prompt, encoding: 'utf8', timeout: limiteRondaMs,
    maxBuffer: 256 * 1024 * 1024, windowsHide: true,
  });
  const crudo = (res.stdout || '') + (res.stderr ? `\n--- stderr ---\n${res.stderr}` : '');
  fs.writeFileSync(path.join(logDir, `ronda-${String(n).padStart(2, '0')}.json`), crudo);

  let j = null;
  try { j = JSON.parse((res.stdout || '').trim().split('\n').filter(Boolean).pop()); } catch (_) { /* sin JSON */ }
  const texto = (j && j.result) || res.stderr || '';
  const costo = (j && Number(j.total_cost_usd)) || 0;
  if (res.error && res.error.code === 'ETIMEDOUT') {
    return { error: true, costo, resumen: `se pasó de ${limiteRondaMs / 60000} min y se cortó` };
  }
  const limiteUso = /usage limit|rate limit|limit reached|resets? at|overloaded|too many requests/i.test(texto) && (!j || j.is_error);
  if (limiteUso) return { limiteUso: true, costo, resumen: 'límite de uso' };
  if (res.status !== 0 || !j || j.is_error) {
    return { error: true, costo, resumen: `error (código ${res.status}) ${texto.slice(0, 120).replace(/\s+/g, ' ')}` };
  }
  const m = [...texto.matchAll(/ESTADO:\s*(continuar|fin-sin-trabajo|fin-hora|fin-bloqueado)/g)].pop();
  return { estado: m ? m[1] : 'continuar', costo, resumen: `ESTADO ${m ? m[1] : '(sin línea ESTADO, asumo continuar)'}` };
}

function prepararWorktree() {
  const destino = path.join(home, '.config', 'superpowers', 'worktrees', nombre, `noche-${hoy}`);
  if (fs.existsSync(destino)) return destino;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const existeRama = git(['branch', '--list', rama], repo).trim() !== '';
  git(existeRama ? ['worktree', 'add', destino, rama] : ['worktree', 'add', '-b', rama, destino, 'HEAD'], repo);
  return destino;
}

// Evita que el equipo se duerma mientras el turno corre (la pantalla sí puede apagarse).
// Windows: SetThreadExecutionState. macOS: caffeinate (-i inactividad, -s con corriente; -w acaba
// cuando termina este proceso). Linux: sin implementar (devuelve null; el equipo puede dormirse).
function mantenerDespierto() {
  let hijo = null;
  if (process.platform === 'darwin') {
    hijo = cp.spawn('caffeinate', ['-i', '-s', '-w', String(process.pid)], { stdio: 'ignore' });
  } else if (process.platform === 'win32') {
    const ps = "Add-Type -Namespace W -Name P -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);';" +
      `[W.P]::SetThreadExecutionState(0x80000001) | Out-Null; Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue`;
    hijo = cp.spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], { stdio: 'ignore', windowsHide: true });
  }
  // Si la herramienta no existe, el turno sigue (solo que el equipo podría dormirse).
  if (hijo) hijo.on('error', () => {});
  return hijo;
}

function dormir(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function git(args, cwd) {
  const r = cp.spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) die(`git ${args.join(' ')} falló: ${r.stderr}`);
  return r.stdout;
}
function fechaLocal(d) { return d.toLocaleDateString('sv-SE'); }
function proximaHora(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}
function num(v, def) { const n = Number(v); return Number.isFinite(n) && v !== undefined ? n : def; }
function die(m) { console.error(m); process.exit(1); }
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    o[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return o;
}
