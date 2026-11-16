// how a story event shows on screen (#34): one small renderer shared by the scene page in the game world
// (story.html) and the story lab. Stand-in look on purpose: a dialogue box, her stand-in ASCII face, choice
// buttons, cards. It only draws what the engine's events say and reports the player's answer; no rules here.
//
//   const view = createView(host, { onAnswer: (input) => …, onGameOver: () => …, debug: false });
//   view.show(events, wait)     // wait = g.x.play?.wait: 'next' | 'choice' | 'hook' | 'scene' | undefined
//   onScene(event, box)         // a full scene (#22) to play in `box`; answer onAnswer({ scene: { end } }) when it's over
//   view.clear()

export const FACES = { neutral: '·_·', uneasy: '·~·', scared: 'O_O', focused: '>_·', proud: '^_^', grin: '^v^', worried: '·_·;', relieved: '-u-', yawn: '-o-', curious: '·o·', pout: '·3·' };
const WHO = { narrator: '', you: 'You' };
const TIER = { everyday: 'Everyday', flirty: 'Flirty', adult: '18+' };

export const CSS = `
.sv { display: grid; gap: 8px; }
.sv-beat { background: var(--sv-box, #1c1830); border: 1px solid var(--sv-edge, #37305a); border-radius: 10px; padding: 9px 12px; }
.sv-beat.narr { background: none; border-style: dashed; color: var(--sv-dim, #b9b4d6); }
.sv-who { font-size: 12px; color: var(--sv-accent, #ff7aa2); margin-bottom: 2px; display: flex; gap: 8px; align-items: center; }
.sv-face { font: 600 13px ui-monospace, monospace; border: 1px solid var(--sv-her, #7ac8ff); border-radius: 8px; padding: 1px 6px; color: var(--sv-ink, #fff); }
.sv-card { border: 2px solid var(--sv-card, #ffd76a); border-radius: 12px; padding: 12px 14px; text-align: center; background: var(--sv-cardbg, #221c12); }
.sv-card small { display: block; color: var(--sv-dim, #b9b4d6); letter-spacing: .08em; text-transform: uppercase; font-size: 11px; }
.sv-card b { display: block; font-size: 16px; margin: 2px 0 6px; }
.sv-card i { color: var(--sv-dim, #b9b4d6); font-size: 12px; }
.sv-nod, .sv-note { color: var(--sv-dim, #b9b4d6); font-size: 12px; }
.sv-note.dbg { font-family: ui-monospace, monospace; font-size: 11px; opacity: .8; }
.sv-acts { display: flex; flex-wrap: wrap; gap: 6px; }
.sv-acts button { background: var(--sv-btn, #2f2640); color: var(--sv-ink, #fff); border: 1px solid var(--sv-edge, #37305a); border-radius: 8px; padding: 7px 12px; font: inherit; cursor: pointer; text-align: left; }
.sv-acts button:hover:not(:disabled) { border-color: var(--sv-accent, #ff7aa2); }
.sv-acts button:disabled { opacity: .5; cursor: default; }
.sv-over { border: 1px solid var(--sv-accent, #ff7aa2); border-radius: 10px; padding: 12px; text-align: center; }
`;

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export function createView(host, { onAnswer, onGameOver, onScene, debug = false, names = {}, npcs = {} } = {}) {
  if (!document.getElementById('sv-css')) { const st = el('style'); st.id = 'sv-css'; st.textContent = CSS; document.head.append(st); }
  host.classList.add('sv');
  let acts = null;
  const dropActs = () => { if (acts) { acts.remove(); acts = null; } };
  const add = (node) => { host.append(node); node.scrollIntoView({ block: 'nearest' }); return node; };
  const whoName = (who) => (who === 'jun' ? (names.her || 'Jun') : who in WHO ? WHO[who] : (npcs[who]?.name || who));

  function beat(who, face, text) {
    const b = el('div', 'sv-beat' + (who === 'narrator' ? ' narr' : ''));
    const name = whoName(who);
    if (name) { const w = el('div', 'sv-who', name); if (who === 'jun') w.append(el('span', 'sv-face', FACES[face] || FACES.neutral)); b.append(w); }
    b.append(el('div', '', text));
    add(b);
  }
  function buttons(list) {
    dropActs();
    acts = el('div', 'sv-acts');
    for (const [label, fn, off, tip] of list) {
      const b = el('button', '', label);
      b.type = 'button'; b.disabled = !!off; if (tip) b.title = tip;
      b.addEventListener('click', () => { dropActs(); fn(); });
      acts.append(b);
    }
    add(acts);
  }

  function show(events, wait) {
    let asked = false;
    for (const e of events) {
      if (e.type === 'beat') beat(e.who, e.face, e.text);
      else if (e.type === 'quiet') add(el('div', 'sv-beat narr', e.text));
      else if (e.type === 'arrived') add(el('div', 'sv-note', '— ' + e.name + ' —'));
      else if (e.type === 'resumed') add(el('div', 'sv-note', 'Carrying on: ' + e.name));
      else if (e.type === 'card' && e.first) {
        const c = el('div', 'sv-card');
        c.append(el('small', '', e.kind === 'person' && e.standing ? `${e.kind} · ${e.standing}` : e.kind), el('b', '', e.title), el('div', '', e.text), el('i', '', e.by === 'jun' ? '— ' + (names.her || 'Jun') : ''));
        add(c);
      }
      else if (e.type === 'card') add(el('div', 'sv-nod', '(' + e.title + ')'));
      else if (e.type === 'scene' && e.play && onScene) {
        // a full scene (#22): the page plays it in this box (js/scene-view.js) and answers with how it ended
        asked = true; dropActs();
        if (debug) add(el('div', 'sv-note dbg', `scene slot "${e.slot}": the ${TIER[e.tier]} version "${e.id}" (a full scene)` + (e.tried.length ? ' · passed over: ' + e.tried.map(k => `${k.id || k.tier} (${k.why})`).join(', ') : '')));
        onScene(e, add(el('div')));
      }
      else if (e.type === 'scene') { for (const b of e.beats) beat('jun', b.face, b.t); if (debug) add(el('div', 'sv-note dbg', `scene slot "${e.slot}": the ${TIER[e.tier]} version "${e.id}"` + (e.tried.length ? ' · passed over: ' + e.tried.map(k => `${k.id || k.tier} (${k.why})`).join(', ') : ''))); }
      else if (e.type === 'codex_page') add(el('div', 'sv-note', `Your notebook's "${e.name}" page is complete.`));
      else if (e.type === 'defeat') add(el('div', 'sv-note', e.how === 'saved' ? 'She reached you in time.' : e.how === 'care' ? 'You went down. She took care of you; nothing was lost.' : ''));
      else if (e.type === 'choices') {
        asked = true;
        buttons(e.list.map(c => [c.text, () => { add(el('div', 'sv-note', '› ' + c.text)); onAnswer({ choice: c.id }); }, !c.ok, c.why]));
      }
      else if (e.type === 'hook') {
        asked = true;
        add(el('div', 'sv-note', `${e.name} would play here${e.args.area ? ' (' + e.args.area + ')' : e.args.what ? ' (' + e.args.what + ')' : ''}. Stand-in: say how it went.`));
        buttons(e.outcomes.map(o => [o.replace(/_/g, ' '), () => onAnswer({ result: o })]));
      }
      else if (e.type === 'gameover') {
        asked = true; dropActs();
        const box = el('div', 'sv-over');
        box.append(el('b', '', 'Game over'), el('div', 'sv-note', 'It went badly, and she couldn\'t reach you in time. Nothing is lost but the moment: go back to your last save.'));
        const b = el('button', '', 'Load your last save'); b.type = 'button';
        b.addEventListener('click', () => { b.disabled = true; onGameOver && onGameOver(box); });
        const row = el('div', 'sv-acts'); row.style.justifyContent = 'center'; row.append(b); box.append(row);
        add(box);
      }
      else if (debug) {
        const t = e.type === 'picked' ? `asked "${e.trig}": ${e.id ? e.id + ' (' + ({ spine: 'main story', thread: 'loose end', pool: 'by chance', queue: 'set going earlier' }[e.cls] || e.cls) + ')' : 'nothing'} · ${e.why}`
          : e.type === 'flag' ? `flag ${e.id} = ${e.to}` : e.type === 'quest' ? `quest ${e.id}: ${e.step}${e.done ? ' (done)' : ''}`
          : e.type === 'thread' ? `loose end "${e.id}" ${e.change}${e.as ? ' as ' + e.as : ''}` : e.type === 'grant' ? `story grant: ${e.id}`
          : e.type === 'tell' ? `desktop Jun would hear: ${e.kind}` : e.type === 'autosave' ? `autosave: ${e.reason}` : e.type === 'rep' || e.type === 'aff' ? `${e.npc}: ${e.word}`
          : e.type === 'time' ? `day ${e.day}, ${e.slot}` : e.type === 'chose' ? `remembered: ${e.event}.${e.node} = ${e.choice}` : e.type === 'ended' ? `ended: ${e.event}` : e.type === 'error' ? `ERROR: ${e.why}` : '';
        if (t) add(el('div', 'sv-note dbg', t));
      }
    }
    if (!asked && wait === 'next') buttons([['Go on', () => onAnswer({})]]);
  }
  return { show, clear: () => { host.textContent = ''; acts = null; }, buttons, note: (t) => add(el('div', 'sv-note', t)) };
}
