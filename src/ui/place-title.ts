import type { PlaceName } from '../places/types';

/** Shows the place name in Chinese, Vietnamese and English. Plain DOM over the canvas. */
export function showPlaceTitle(host: HTMLElement, name: PlaceName): () => void {
  const box = document.createElement('div');
  box.style.cssText =
    'position:absolute;left:32px;bottom:28px;color:#f6efe2;text-shadow:0 1px 8px rgba(0,0,0,.55);' +
    'font-family:"Noto Serif","Songti SC",Georgia,serif;line-height:1.25';
  const zh = document.createElement('div');
  zh.lang = 'zh';
  zh.textContent = name.zh;
  zh.style.cssText = 'font-size:34px;letter-spacing:.12em';
  const sub = document.createElement('div');
  sub.textContent = `${name.vi} · ${name.en}`;
  sub.style.cssText = 'font-size:15px;opacity:.9;margin-top:4px';
  box.append(zh, sub);
  host.append(box);
  return () => box.remove();
}
