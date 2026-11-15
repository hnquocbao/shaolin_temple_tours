import { startApp } from './engine/app';
import { parseRunParams } from './engine/params';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const ui = document.querySelector<HTMLElement>('#ui');

try {
  if (!canvas || !ui) throw new Error('Page is missing #scene or #ui');
  startApp(canvas, ui, parseRunParams(window.location.search));
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  window.__game = {
    ready: false,
    error: message,
    place: '',
    stop: '',
    frozen: false,
    catalog: [],
    stats: { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
  };
  console.error(message);
  if (ui) {
    const note = document.createElement('p');
    note.textContent = message;
    note.style.cssText = 'color:#f6efe2;font:16px/1.4 system-ui;padding:24px;margin:0';
    ui.append(note);
  }
}
