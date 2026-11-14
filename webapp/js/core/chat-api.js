import { api, apiJson } from './api.js?v=1';
import * as TouchLog from './touch-log.js?v=2';
import * as Feel from './feel/feel.js?v=4';
import { lastDelve } from './delve/last.js?v=1';

export async function listModels() {
  const r = await api('models.php');
  if (!r.ok) throw new Error(`models http ${r.status}`);
  return r.json();
}

export function chat({ messages, model, reasoning, think, outfit_context, mod_items, conversation_id, idle, ephemeral, client_time, audio, voice, hear_all, invite, tts, regenerate, frames, watch }, { onToken, onThinking, onDone, onError, onDebug, onStats, onToolStatus, onOutfit, onGo, onSilence, onFled, onRestart }) {
  const ctrl = new AbortController();

  // his own message counts toward her needs (attention) and the session (core feel #27)
  if (!idle && !ephemeral && !regenerate && !watch) { try { Feel.message(); } catch (e) { /* never in the way of a chat */ } }
  let feel = null;
  try { feel = Feel.forChat(); } catch (e) { feel = null; }
  // the last delve (#32), for a day and a half: what happened down there feeds what she says at home
  let delve = null;
  try { delve = lastDelve(); } catch (e) { delve = null; }

  (async () => {
    try {
      const res = await apiJson('chat.php',
        { messages, model, reasoning, think, outfit_context, mod_items, conversation_id, idle, ephemeral, client_time, audio, voice, hear_all, invite, tts: !!tts, regenerate: !!regenerate, frames, watch,
          tz: -new Date().getTimezoneOffset(),
          // his touches since the last turn, and what his hands are doing
          // right now, so this reply already knows (lib/touch.php)
          touches: TouchLog.takeBatch(), touch_now: TouchLog.now(),
          // how she is inside right now (needs, what she's had plenty of, the session), in words
          // on the server (lib/feel.php)
          feel, delve },
        { signal: ctrl.signal });
      if (!res.ok || !res.body) {
        const error = new Error(`http ${res.status}`);
        error.status = res.status;
        onError && onError(error);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const event = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of event.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') {
              onDone && onDone();
              return;
            }
            try {
              const obj = JSON.parse(payload);
              if (obj.error) {
                const err = new Error(obj.error);
                err.data = obj;
                onError && onError(err);
                continue;
              }
              if (obj.restart) { onRestart && onRestart(obj.restart); continue; }
              if (obj.silence) { onSilence && onSilence(obj.silence); continue; }
              if (obj.fled) { onFled && onFled(obj.fled); continue; }
              if (obj.debug) { onDebug && onDebug(obj.debug); continue; }
              if (obj.stats) { onStats && onStats(obj.stats); continue; }
              if (obj.tool_status) { onToolStatus && onToolStatus(obj.tool_status); continue; }
              if (obj.outfit) { onOutfit && onOutfit(obj.outfit); continue; }
              if (obj.go) { onGo && onGo(obj.go); continue; }
              if (typeof obj.thinking === 'string') { onThinking && onThinking(obj.thinking); continue; }
              if (typeof obj.token === 'string') onToken && onToken(obj.token);
            } catch (e) {}
          }
        }
      }
      onDone && onDone();
    } catch (e) {
      if (e.name !== 'AbortError') onError && onError(e);
    }
  })();

  return () => ctrl.abort();
}
