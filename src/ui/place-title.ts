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

export interface ArrivalTitle {
  /** Opacity of the name, 0..1, set every frame from the flight's progress. Reduced motion snaps it to 0 or 1. */
  setOpacity(opacity: number): void;
  /** Fade out (or vanish at once under reduced motion) and remove. */
  dismiss(): void;
  /** Remove now. */
  remove(): void;
}

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/**
 * The place name, large and centred low on the screen, for the arrival flight, with a quiet "press any key
 * to skip" line under it. Opacity is driven by the caller so a frozen frame is repeatable.
 */
export function showArrivalTitle(host: HTMLElement, name: PlaceName): ArrivalTitle {
  const reduced = prefersReducedMotion();
  const box = document.createElement('div');
  box.dataset.role = 'arrival-title';
  box.style.cssText =
    'position:absolute;left:0;right:0;bottom:15%;text-align:center;color:#f6efe2;opacity:0;' +
    'text-shadow:0 2px 16px rgba(0,0,0,.6);font-family:"Noto Serif","Songti SC",Georgia,serif;line-height:1.3';
  const zh = document.createElement('div');
  zh.lang = 'zh';
  zh.textContent = name.zh;
  zh.style.cssText = 'font-size:84px;letter-spacing:.2em;padding-left:.2em';
  const sub = document.createElement('div');
  sub.textContent = `${name.vi} · ${name.en}`;
  sub.style.cssText = 'font-size:26px;opacity:.92;margin-top:10px;letter-spacing:.04em';
  box.append(zh, sub);
  const skip = document.createElement('div');
  skip.dataset.role = 'arrival-skip';
  skip.textContent = 'Nhấn phím bất kỳ để bỏ qua · Press any key to skip';
  skip.style.cssText =
    'position:absolute;left:0;right:0;bottom:24px;text-align:center;color:#f6efe2;opacity:.6;' +
    'font:13px/1.4 system-ui,"Segoe UI",sans-serif;letter-spacing:.06em;text-shadow:0 1px 4px rgba(0,0,0,.7)';
  host.append(box, skip);
  const setOpacity = (opacity: number): void => {
    const value = reduced ? (opacity >= 0.5 ? 1 : 0) : Math.min(1, Math.max(0, opacity));
    box.style.opacity = String(value);
  };
  const remove = (): void => {
    box.remove();
    skip.remove();
  };
  return {
    setOpacity,
    remove,
    dismiss() {
      skip.remove();
      if (reduced) return remove();
      // The CSS transition does the fade; the flight's per-frame opacity no longer applies.
      box.style.transition = 'opacity .45s linear';
      box.style.opacity = '0';
      window.setTimeout(remove, 500);
    },
  };
}
