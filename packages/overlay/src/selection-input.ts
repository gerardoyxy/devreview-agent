import { matchesModifiers, type Modifier, type SelectionControls } from './selection-controls.js';

export type SelectionMode = 'single' | 'multiple' | 'area';
export interface SelectionRect { x: number; y: number; width: number; height: number }

/** Consume complete gestures, including their synthesized clicks, before they activate the app. */
export function bindSelectionInput(options: {
  host: HTMLElement;
  areaSurface: HTMLElement;
  controls: () => SelectionControls;
  available: () => boolean;
  select: (element: Element, additive: boolean) => void;
  area: (rect: SelectionRect) => void;
  rectangle: (rect: SelectionRect | null) => void;
  armed: (value: SelectionMode | null) => void;
  hover: (element: Element | null) => void;
}) {
  let armed: SelectionMode | null = null;
  let gesture: { button: number; pointer: number; target: Element; picked: boolean; additive: boolean; until: number; start?: { x: number; y: number }; end?: { x: number; y: number } } | undefined;
  const signal = new AbortController();
  const own = (event: Event) => event.composedPath().includes(options.host);
  const stop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const setArmed = (value: SelectionMode | null) => { armed = value; options.armed(value); options.hover(null); };
  const release = () => {
    if (gesture && options.areaSurface.hasPointerCapture(gesture.pointer)) options.areaSurface.releasePointerCapture(gesture.pointer);
    options.rectangle(null);
  };
  const reset = () => { release(); if (gesture) { gesture.picked = true; gesture.until = performance.now() + 1000; } setArmed(null); };
  const pending = (event: MouseEvent) => gesture && gesture.button === event.button && performance.now() <= gesture.until;
  const point = (event: PointerEvent) => ({ x: Math.max(0, Math.min(innerWidth, event.clientX)), y: Math.max(0, Math.min(innerHeight, event.clientY)) });
  const rectangle = (): SelectionRect => ({ x: Math.min(gesture!.start!.x, gesture!.end!.x), y: Math.min(gesture!.start!.y, gesture!.end!.y), width: Math.abs(gesture!.start!.x - gesture!.end!.x), height: Math.abs(gesture!.start!.y - gesture!.end!.y) });
  const additiveMatch = (event: MouseEvent | KeyboardEvent, base: Modifier[]) => {
    const modifier = options.controls().additiveModifier === undefined ? 'shift' : options.controls().additiveModifier;
    return !!modifier && !base.includes(modifier) && matchesModifiers(event, [...base, modifier]);
  };
  const select = () => {
    if (!gesture || gesture.picked) return;
    gesture.picked = true;
    if (gesture.start) {
      const rect = rectangle(); release(); setArmed('multiple');
      if (options.available() && rect.width >= 4 && rect.height >= 4) options.area(rect);
    } else {
      const additive = gesture.additive;
      setArmed(additive ? 'multiple' : null);
      if (gesture.target.isConnected && options.available()) options.select(gesture.target, additive);
    }
  };
  document.addEventListener('pointerdown', event => {
    if (!event.isPrimary) return;
    release(); gesture = undefined;
    if (!options.available() || !(event.target instanceof Element)) return;
    if (armed === 'area' && event.composedPath().includes(options.areaSurface) && event.button === 0) {
      gesture = { button: 0, pointer: event.pointerId, target: event.target, picked: false, additive: true, until: Infinity, start: point(event), end: point(event) };
      stop(event); options.areaSurface.setPointerCapture(event.pointerId); options.rectangle(rectangle()); return;
    }
    if (own(event) || armed === 'area') return;
    const pointer = options.controls().pointer;
    const configured = event.pointerType === 'mouse' && pointer.button === event.button;
    const additive = armed === 'multiple' || configured && additiveMatch(event, pointer.modifiers);
    if (!((armed === 'single' || armed === 'multiple') && event.button === 0) && !(configured && (matchesModifiers(event, pointer.modifiers) || additiveMatch(event, pointer.modifiers)))) return;
    gesture = { button: event.button, pointer: event.pointerId, target: event.target, picked: false, additive, until: Infinity };
    stop(event);
  }, { capture: true, signal: signal.signal });
  document.addEventListener('mousedown', event => { if (pending(event)) stop(event); }, { capture: true, signal: signal.signal });
  document.addEventListener('pointerup', event => {
    if (!pending(event) || gesture!.pointer !== event.pointerId) return;
    stop(event); gesture!.until = performance.now() + 1000;
    if (gesture!.start) gesture!.end = point(event);
    select();
  }, { capture: true, signal: signal.signal });
  for (const name of ['mouseup', 'click', 'auxclick', 'contextmenu'] as const) {
    document.addEventListener(name, event => {
      if (!pending(event)) return;
      stop(event);
      if (name === 'contextmenu' && !gesture!.start) select();
    }, { capture: true, signal: signal.signal });
  }
  document.addEventListener('pointercancel', reset, { capture: true, signal: signal.signal });
  document.addEventListener('pointermove', event => {
    if (gesture?.start && !gesture.picked && event.pointerId === gesture.pointer) {
      stop(event); gesture.end = point(event); options.rectangle(rectangle()); return;
    }
    if (armed) options.hover(!own(event) && event.target instanceof Element ? event.target : null);
  }, { capture: true, signal: signal.signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && armed) { stop(event); reset(); return; }
    if (own(event) || !options.available() || event.repeat || event.isComposing) return;
    const binding = options.controls().keyboard;
    if (!binding || event.code !== binding.code) return;
    const additive = armed === 'multiple' || additiveMatch(event, binding.modifiers);
    if (!matchesModifiers(event, binding.modifiers) && !additiveMatch(event, binding.modifiers)) return;
    const target = document.activeElement;
    if (!(target instanceof Element) || target === document.body || target === document.documentElement) return;
    if (!event.ctrlKey && !event.altKey && !event.metaKey && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
    stop(event); setArmed(additive ? 'multiple' : null); options.select(target, additive);
  }, { capture: true, signal: signal.signal });
  window.addEventListener('blur', reset, { signal: signal.signal });
  return {
    toggle(mode: SelectionMode = 'single') { if (!options.available()) return; release(); gesture = undefined; setArmed(armed === mode ? null : mode); },
    cancel: reset,
    destroy() { signal.abort(); reset(); }
  };
}
