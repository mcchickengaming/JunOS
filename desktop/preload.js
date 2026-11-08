// the only door between her pages and the desktop app. the page
// gets a small, fixed set of calls, never ipcRenderer itself, so a
// page can't send the main process anything it doesn't expect.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const fn = (_e, data) => cb(data);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('junDesktop', {
  // the transparent parts of her window let clicks through to
  // whatever is under it, only she and her bubble catch them
  setClickThrough: (on) => ipcRenderer.send('jun:click-through', !!on),
  dragStart: () => ipcRenderer.send('jun:drag', 'start'),
  dragEnd: () => ipcRenderer.send('jun:drag', 'end'),
  // px between her feet and the bottom of the window, so she
  // stands ON the taskbar and not half a leg above it
  reportFeet: (px) => ipcRenderer.send('jun:feet', Number(px) || 0),
  // opts: { speed, hop }, her mood sets them
  wander: (opts) => ipcRenderer.send('jun:walk', { what: 'wander', speed: Number(opts?.speed) || 1, hop: Number(opts?.hop) || 0, back: !!opts?.back }),
  stopWalk: () => ipcRenderer.send('jun:walk', 'stop'),
  goInside: () => ipcRenderer.send('jun:mode', 'inside'),
  stepOut: () => ipcRenderer.send('jun:mode', 'stepout'),
  openWindow: () => ipcRenderer.send('jun:mode', 'window'),
  compact: () => ipcRenderer.send('jun:mode', 'compact'),
  hide: () => ipcRenderer.send('jun:mode', 'hide'),
  menu: () => ipcRenderer.send('jun:menu'),
  // the window grabs keyboard focus only while he's typing to her
  wantFocus: (on) => ipcRenderer.send('jun:focus', !!on),
  onWalk: on('jun:walk-state'),
  onIdle: on('jun:idle'),
  // the mouse anywhere on screen, in this window's coordinates
  onCursor: on('jun:cursor'),
  // thrown or falling: her speed, so her limbs swing with it
  onFly: on('jun:fly'),
  // the tray's "On the desktop" settings
  onSettings: on('jun:settings'),
  // the settings window (webapp/desktop-settings.html)
  spots: (action, a, b, c) => ipcRenderer.invoke('jun:spots', action, a, b, c),
  onSettingsTab: on('jun:settings-tab'),
  onCommand: on('jun:command'),
});
