#!/usr/bin/env node
// Night shift launcher: opens a NEW `claude -p` session for each task in the queue,
// until the work, the time, the budget run out or consecutive errors appear.
// State lives in files (queue.md, report), not in the memory of one long session.
//
// Usage: node launch-night.js --project D:/GitHub/N8N-Automation [--hours 7 | --until 06:30]
//        [--budget 25] [--per-round 6] [--max-rounds 40] [--round-limit-min 90] [--no-worktree]
// To stop it gracefully: create the STOP file in the project folder (see the "Stop:" line of the log).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const a = parseArgs(process.argv.slice(2));
const hours = num(a.hours, 7);
const budget = num(a.budget, 25);
const perRound = num(a['per-round'], 6);
const maxRounds = num(a['max-rounds'], 40);
const roundLimitMs = num(a['round-limit-min'], 90) * 60000;
const USAGE_LIMIT_WAIT_MS = 20 * 60000;

const repo = git(['rev-parse', '--show-toplevel'], a.project || process.cwd()).trim();
const name = path.basename(repo);
const today = localDate(new Date());
const home = os.homedir();
const stateDir = path.join(home, '.claude', 'night-turn', 'projects', name);
const queueFile = path.join(stateDir, 'queue.md');
const reportDir = path.join(stateDir, 'reports');
const reportFile = path.join(reportDir, `${today}.md`);
const logDir = path.join(reportDir, today);
const stopFile = path.join(stateDir, 'STOP');

if (!fs.existsSync(queueFile)) die(`The queue does not exist: ${queueFile}\nCreate it with "/night-turn prepare" on this PC (the queue does not travel with the repo).`);
fs.mkdirSync(logDir, { recursive: true });
const log = (m) => {
  const l = `[${new Date().toLocaleString('sv-SE')}] ${m}`;
  console.log(l);
  fs.appendFileSync(path.join(logDir, 'launcher.log'), l + '\n');
};

const deadline = a.until ? nextTime(a.until) : new Date(Date.now() + hours * 3600000);
// The name carries the machine so two PCs working on the same repo don't use the same branch.
const machine = os.hostname().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'machine';
const branch = `night/${today}-${machine}`;
const baseBranch = git(['rev-parse', '--abbrev-ref', 'HEAD'], repo).trim();
const baseSha = git(['rev-parse', 'HEAD'], repo).trim();
const workDir = a['no-worktree'] ? repo : prepareWorktree();
// Each round's session runs in `workDir`: it needs to find the skill installed personally on this PC
// (the normal case) or committed in the project repo (the worktree only sees what is committed).
// Missing profiles don't stop the shift: the skill reads them and, if one is missing, works with the other.
const skillInWork = path.join(workDir, '.claude', 'skills', 'night-turn', 'SKILL.md');
const skillPersonal = path.join(home, '.claude', 'skills', 'night-turn', 'SKILL.md');
if (!fs.existsSync(skillInWork) && !fs.existsSync(skillPersonal)) {
  die(`The night-turn skill is neither installed in ~/.claude/skills nor committed in ${workDir}.\n` +
      'Install it with: git clone https://github.com/SrProfessional/NightTurn.git ~/.claude/skills/night-turn (see README), ' +
      'or commit .claude/skills/night-turn in the project repo, and launch again.');
}
if (!fs.existsSync(reportFile)) {
  fs.writeFileSync(reportFile, `# Night shift report — ${name} — ${today}\n\nBranch: \`${branch}\`  \nBase: \`${baseBranch}\` @ ${baseSha.slice(0, 7)}  \nWorking folder: \`${workDir}\`\n\n`);
}
try { fs.unlinkSync(stopFile); } catch (_) { /* did not exist */ }

log(`Start. Project=${name} branch=${branch} until=${deadline.toLocaleString('sv-SE')} budget=$${budget}`);
log(`Stop: create the file ${stopFile}`);
// Dependencies (superpowers and experto) bundled in this repo: copied only if missing.
try { cp.spawnSync(process.execPath, [path.join(__dirname, 'install-dependencies.js')], { stdio: 'inherit' }); } catch (_) { /* not fatal */ }
const awake = keepAwake();

const memory = path.join(home, '.claude', 'projects', repo.replace(/[^A-Za-z0-9]/g, '-'), 'memory'); // optional: does not travel between PCs
const disallowed = [
  'AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode',
  'Bash(git push *)', 'PowerShell(git push *)',
  'Bash(ssh *)', 'Bash(scp *)', 'Bash(kubectl *)',
  'PowerShell(ssh *)', 'PowerShell(scp *)', 'PowerShell(kubectl *)',
];
// No end-of-turn sound (the global Stop hook would ring every round) and no prompt improver.
const settings = JSON.stringify({
  hooks: { Stop: [] },
  enabledPlugins: { 'prompt-improver@severity1-marketplace': false },
});

let spent = 0, rounds = 0, failures = 0, noProgress = 0, reason = 'finished';
while (true) {
  if (fs.existsSync(stopFile)) { reason = 'STOP file'; break; }
  if (Date.now() >= deadline.getTime()) { reason = 'deadline'; break; }
  if (spent >= budget) { reason = 'budget exhausted'; break; }
  if (rounds >= maxRounds) { reason = 'maximum rounds'; break; }
  rounds++;
  const before = fs.readFileSync(queueFile, 'utf8');
  const cap = Math.min(perRound, budget - spent);
  log(`Round ${rounds}: cap $${cap.toFixed(2)} (spent $${spent.toFixed(2)})`);
  const r = runRound(rounds, cap);
  spent += r.cost;
  const after = fs.readFileSync(queueFile, 'utf8');
  log(`Round ${rounds} → ${r.summary} cost $${r.cost.toFixed(2)}`);

  if (r.usageLimit) {
    rounds--; // doesn't count as a round: retried after the wait
    const wait = Math.min(USAGE_LIMIT_WAIT_MS, deadline.getTime() - Date.now());
    if (wait <= 0) { reason = 'usage limit until the deadline'; break; }
    log(`Claude usage limit: waiting ${Math.round(wait / 60000)} min`);
    sleep(wait);
    continue;
  }
  if (r.error) {
    if (++failures >= 3) { reason = '3 errors in a row'; break; }
    continue;
  }
  failures = 0;
  if (r.status === 'end-no-work') { reason = 'no more work that can be advanced'; break; }
  if (r.status === 'end-time') { reason = 'deadline'; break; }
  if (r.status === 'end-blocked') { reason = 'everything left is blocked'; break; }
  noProgress = before === after ? noProgress + 1 : 0;
  if (noProgress >= 2) { reason = 'two rounds without queue changes'; break; }
}

fs.appendFileSync(reportFile,
  `\n---\n## Launcher closing\n- Reason: ${reason}\n- Rounds: ${rounds}\n- Spend: $${spent.toFixed(2)} of $${budget}\n- Branch: \`${branch}\` in \`${workDir}\`\n- End: ${new Date().toLocaleString('sv-SE')}\n`);
log(`End. Reason: ${reason}. Rounds=${rounds} spend=$${spent.toFixed(2)}`);
if (awake) awake.kill();

// ---------------------------------------------------------------- functions

function runRound(n, cap) {
  const prompt =
    `/night-turn run --project "${repo}" --queue "${queueFile}" --report "${reportFile}" --until "${deadline.toISOString()}"\n\n` +
    'Automatic night shift order. Nobody is going to answer: do not ask for clarifications or approvals; ' +
    'decide using the decision profile and log every decision. Do a single task and finish with the STATUS line.';
  const args = [
    '-p', '--output-format', 'json',
    '--permission-mode', 'auto', '--permission-prompts', 'none',
    '--max-budget-usd', cap.toFixed(2),
    '--name', `night-${today}-r${n}`,
    '--settings', settings,
    '--add-dir', stateDir,
  ];
  if (fs.existsSync(memory)) args.push('--add-dir', memory);
  args.push('--disallowedTools', ...disallowed);

  const res = cp.spawnSync(a.claude || 'claude', args, {
    cwd: workDir, input: prompt, encoding: 'utf8', timeout: roundLimitMs,
    maxBuffer: 256 * 1024 * 1024, windowsHide: true,
  });
  const raw = (res.stdout || '') + (res.stderr ? `\n--- stderr ---\n${res.stderr}` : '');
  fs.writeFileSync(path.join(logDir, `round-${String(n).padStart(2, '0')}.json`), raw);

  let j = null;
  try { j = JSON.parse((res.stdout || '').trim().split('\n').filter(Boolean).pop()); } catch (_) { /* no JSON */ }
  const text = (j && j.result) || res.stderr || '';
  const cost = (j && Number(j.total_cost_usd)) || 0;
  if (res.error && res.error.code === 'ETIMEDOUT') {
    return { error: true, cost, summary: `exceeded ${roundLimitMs / 60000} min and was cut off` };
  }
  const usageLimit = /usage limit|rate limit|limit reached|resets? at|overloaded|too many requests/i.test(text) && (!j || j.is_error);
  if (usageLimit) return { usageLimit: true, cost, summary: 'usage limit' };
  if (res.status !== 0 || !j || j.is_error) {
    return { error: true, cost, summary: `error (code ${res.status}) ${text.slice(0, 120).replace(/\s+/g, ' ')}` };
  }
  const m = [...text.matchAll(/STATUS:\s*(continue|end-no-work|end-time|end-blocked)/g)].pop();
  return { status: m ? m[1] : 'continue', cost, summary: `STATUS ${m ? m[1] : '(no STATUS line, assuming continue)'}` };
}

// Runs git without aborting the launcher if it fails: returns { ok, out }.
function softGit(args, cwd) {
  const r = cp.spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}
// (function declarations: used before this line, during script startup)
function merged(b) { return softGit(['merge-base', '--is-ancestor', b, 'HEAD'], repo).ok; }
function clean(dir) { return softGit(['status', '--porcelain'], dir).out.trim() === ''; }

// Deletes the folders of earlier nights whose branch is already merged into the base and has no pending changes.
function cleanMergedNights(folder, current) {
  if (!fs.existsSync(folder)) return;
  for (const d of fs.readdirSync(folder)) {
    const dir = path.join(folder, d);
    if (!d.startsWith('night-') || dir === current || !fs.statSync(dir).isDirectory()) continue;
    const r = softGit(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
    const oldBranch = r.ok ? r.out.trim() : '';
    if (!oldBranch.startsWith('night/') || !merged(oldBranch) || !clean(dir)) continue;
    if (softGit(['worktree', 'remove', dir], repo).ok) {
      softGit(['branch', '-d', oldBranch], repo);
      log(`Cleanup: earlier night already merged (${oldBranch}), folder and branch removed.`);
    }
  }
}

function prepareWorktree() {
  const folder = path.join(home, '.config', 'superpowers', 'worktrees', name);
  const target = path.join(folder, `night-${today}-${machine}`);
  cleanMergedNights(folder, target);
  if (!['master', 'main'].includes(baseBranch)) {
    log(`WARNING: the main folder is on "${baseBranch}", not master/main: the night starts from there.`);
  }
  if (!clean(repo)) log('WARNING: the main folder has uncommitted changes; they do not enter the night branch.');
  fs.mkdirSync(folder, { recursive: true });

  const branchExists = softGit(['branch', '--list', branch], repo).out.trim() !== '';
  const folderExists = fs.existsSync(target);
  if (branchExists || folderExists) {
    // Repeated run on the same day. If the earlier work is already merged and has nothing pending, start from
    // scratch from the current base; if it has unmerged work, continue it and try to bring it up to date.
    if (branchExists && merged(branch) && (!folderExists || clean(target))) {
      if (folderExists) softGit(['worktree', 'remove', target], repo);
      softGit(['branch', '-d', branch], repo);
      log(`Branch ${branch} was already merged: recreating it from ${baseBranch}.`);
    } else {
      if (!folderExists) git(['worktree', 'add', target, branch], repo);
      const m = softGit(['merge', '--no-edit', baseSha], target);
      if (m.ok) {
        log(`Continuing ${branch} (unmerged work) and updated it with ${baseBranch}.`);
      } else {
        softGit(['merge', '--abort'], target);
        log(`WARNING: continuing ${branch} but it could NOT be updated with ${baseBranch} (conflict); it starts out of date.`);
      }
      return target;
    }
  }
  git(['worktree', 'add', '-b', branch, target, 'HEAD'], repo);
  return target;
}

// Keeps the computer from sleeping while the shift runs (the screen may still turn off).
// Windows: SetThreadExecutionState. macOS: caffeinate (-i idle, -s on power; -w ends when this process ends).
// Linux: not implemented (returns null; the computer may sleep).
function keepAwake() {
  let child = null;
  if (process.platform === 'darwin') {
    child = cp.spawn('caffeinate', ['-i', '-s', '-w', String(process.pid)], { stdio: 'ignore' });
  } else if (process.platform === 'win32') {
    const ps = "Add-Type -Namespace W -Name P -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);';" +
      `[W.P]::SetThreadExecutionState(0x80000001) | Out-Null; Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue`;
    child = cp.spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], { stdio: 'ignore', windowsHide: true });
  }
  // If the tool doesn't exist, the shift goes on (the computer might just fall asleep).
  if (child) child.on('error', () => {});
  return child;
}

function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function git(args, cwd) {
  const r = cp.spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) die(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}
function localDate(d) { return d.toLocaleDateString('sv-SE'); }
function nextTime(hhmm) {
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
