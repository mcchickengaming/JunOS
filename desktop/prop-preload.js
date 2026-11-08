// the spots and the ball (desktop/props.js): drag them, right-click
// them, and let clicks through where they're see-through
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('junProp', {
  setClickThrough: (on) => ipcRenderer.send('prop:click-through', !!on),
  dragStart: () => ipcRenderer.send('prop:drag', 'start'),
  dragEnd: () => ipcRenderer.send('prop:drag', 'end'),
  menu: () => ipcRenderer.send('prop:menu'),
  onColors: (cb) => ipcRenderer.on('prop:colors', (_e, q) => cb(q)),
});
