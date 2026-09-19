import { matchesModifiers, type SelectionControls } from './selection-controls.js';

/** Capture a complete selection gesture so it cannot also activate the inspected app. */
export function bindSelectionInput(options: {
  host: HTMLElement;
  controls: () => SelectionControls;
  available: () => boolean;
  select: (element: Element) => void;
  armed: (value: boolean) => void;
  hover: (element: Element | null) => void;
}) {
  let armed = false;
  let gesture: { button: number; target: Element; picked: boolean; until: number } | undefined;
  const signal = new AbortController();
  const own = (event: Event) => event.composedPath().includes(options.host);
  const stop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const setArmed = (value: boolean) => { armed = value; options.armed(value); if (!value) options.hover(null); };
  const reset = () => { gesture = undefined; setArmed(false); };
  const pending = (event: MouseEvent) => gesture && gesture.button === event.button && performance.now() <= gesture.until;
  const select = () => {
    if (!gesture || gesture.picked) return;
    gesture.picked = true;
    setArmed(false);
    if (gesture.target.isConnected && options.available()) options.select(gesture.target);
  };
  document.addEventListener('pointerdown', event => {
    gesture = undefined;
    if (own(event) || !options.available() || !(event.target instanceof Element)) return;
    const pointer = options.controls().pointer;
    if (!(armed && event.button === 0) && !(event.pointerType === 'mouse' && pointer.button === event.button && matchesModifiers(event, pointer.modifiers))) return;
    gesture = { button: event.button, target: event.target, picked: false, until: Infinity };
    stop(event);
  }, { capture: true, signal: signal.signal });
  document.addEventListener('mousedown', event => { if (pending(event)) stop(event); }, { capture: true, signal: signal.signal });
  document.addEventListener('pointerup', event => {
    if (!pending(event)) return;
    stop(event); gesture!.until = performance.now() + 1000; select();
  }, { capture: true, signal: signal.signal });
  for (const name of ['mouseup', 'click', 'auxclick', 'contextmenu'] as const) {
    document.addEventListener(name, event => {
      if (!pending(event)) return;
      stop(event);
      if (name === 'contextmenu') select();
    }, { capture: true, signal: signal.signal });
  }
  document.addEventListener('pointercancel', reset, { capture: true, signal: signal.signal });
  document.addEventListener('pointermove', event => {
    if (armed) options.hover(!own(event) && event.target instanceof Element ? event.target : null);
  }, { capture: true, signal: signal.signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && armed) { stop(event); reset(); return; }
    if (own(event) || !options.available() || event.repeat || event.isComposing) return;
    const binding = options.controls().keyboard;
    if (!binding || event.code !== binding.code || !matchesModifiers(event, binding.modifiers)) return;
    const target = document.activeElement;
    if (!(target instanceof Element) || target === document.body || target === document.documentElement) return;
    if (!event.ctrlKey && !event.altKey && !event.metaKey && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
    stop(event); setArmed(false); options.select(target);
  }, { capture: true, signal: signal.signal });
  window.addEventListener('blur', reset, { signal: signal.signal });
  return {
    toggle() { gesture = undefined; setArmed(!armed); },
    cancel: reset,
    destroy() { signal.abort(); reset(); }
  };
}
