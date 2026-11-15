/** Rows of the controls hint: keys, then Vietnamese and English. */
export const controlRows: readonly { keys: string; vi: string; en: string }[] = [
  { keys: 'W A S D', vi: 'Chạy', en: 'Run' },
  { keys: 'Shift', vi: 'Chạy nhanh', en: 'Sprint' },
  { keys: 'Space', vi: 'Nhảy', en: 'Jump' },
  { keys: 'Shift + giữ Space', vi: 'Khinh công', en: 'Lightness leap' },
  { keys: 'Nhấp chuột', vi: 'Khóa chuột', en: 'Click: capture mouse' },
  { keys: 'Chuột', vi: 'Xoay camera', en: 'Mouse: orbit' },
  { keys: 'Lăn chuột', vi: 'Gần / xa', en: 'Zoom' },
  { keys: 'Esc', vi: 'Thả chuột', en: 'Release mouse' },
];

/** A small controls list over the canvas, top left. Returns a function that removes it. */
export function showControlsHint(host: HTMLElement): () => void {
  const box = document.createElement('div');
  box.dataset.role = 'controls-hint';
  box.style.cssText =
    'position:absolute;left:24px;top:22px;padding:10px 14px;border-radius:6px;background:rgba(20,18,16,.42);' +
    'color:#f6efe2;font:13px/1.55 system-ui,"Segoe UI",sans-serif;text-shadow:0 1px 4px rgba(0,0,0,.6);max-width:460px';
  for (const row of controlRows) {
    const line = document.createElement('div');
    const keys = document.createElement('b');
    keys.textContent = row.keys;
    keys.style.cssText = 'display:inline-block;min-width:136px;font-weight:600;color:#ffd9a0';
    const text = document.createElement('span');
    text.textContent = `${row.vi} · ${row.en}`;
    line.append(keys, text);
    box.append(line);
  }
  host.append(box);
  return () => box.remove();
}
