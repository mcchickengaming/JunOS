// starts the desktop app again after a restore or an update.
// main.js runs this with its own electron.exe as plain node
// (ELECTRON_RUN_AS_NODE=1), detached, then quits. this waits until
// the old app is really gone (its storage files are free and its
// single-instance lock is released), moves a restored save's desktop
// storage into place (saves.js applyPendingDesktop), and opens the
// app the same way it was opened before.
//
//   node relaunch.js <json: { pid, home, exe, args }>

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Saves = require('./saves');

const job = JSON.parse(process.argv[2] || '{}');
const log = (m) => {
  try { fs.appendFileSync(path.join(job.home, 'runtime', 'logs', 'desktop-relaunch.log'), `${new Date().toISOString()} ${m}\n`); } catch (e) {}
};

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

(async () => {
  const t0 = Date.now();
  while (job.pid && alive(job.pid) && Date.now() - t0 < 30000) await new Promise(r => setTimeout(r, 250));
  // chromium's helper processes let go of the files a moment later
  await new Promise(r => setTimeout(r, 1200));
  // a file still held a moment longer by windows: try a few times
  for (let i = 0; i < 6; i++) {
    try {
      if (Saves.applyPendingDesktop(job.home)) log('desktop part of the save put in place');
      break;
    } catch (e) {
      log('desktop part, try ' + (i + 1) + ': ' + e.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    spawn(job.exe, job.args || [], { cwd: job.home, env, detached: true, stdio: 'ignore', windowsHide: false }).unref();
    log('desktop app started again');
  } catch (e) { log('could not start the desktop app: ' + e.message); }
  process.exit(0);
})();
