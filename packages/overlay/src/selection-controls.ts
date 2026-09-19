import type { Api } from '../../contracts/src/index.js';
import { errorMessage, query } from '../../contracts/src/index.js';
import { shell } from './workspace.js';

export const modifiers = ['control', 'alt', 'shift', 'meta'] as const;
export type Modifier = typeof modifiers[number];
export interface SelectionControls {
  version: 1;
  revision: number;
  pointer: { button: number | null; modifiers: Modifier[] };
  keyboard: { code: string; modifiers: Modifier[] } | null;
  additiveModifier?: Modifier | null;
}
export const defaultSelectionControls = (): SelectionControls => ({ version: 1, revision: 0, pointer: { button: 2, modifiers: ['alt'] }, keyboard: { code: 'KeyD', modifiers: ['alt', 'shift'] }, additiveModifier: 'shift' });
const labels: Record<Modifier, string> = { control: 'Ctrl', alt: 'Alt / Option', shift: 'Shift', meta: 'Meta / Command / Windows' };
const buttons = ['Left click', 'Middle click', 'Right click', 'Side button: Back', 'Side button: Forward'];
export const validKey = (code: string) => /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Space|Enter|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown|Insert|Delete|Backspace|Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter))$/.test(code);
export function validSelectionControls(value: unknown): value is SelectionControls {
  if (!value || typeof value !== 'object') return false;
  const v = value as SelectionControls;
  const validModifiers = (m: unknown): m is Modifier[] => Array.isArray(m) && m.length <= 4 && new Set(m).size === m.length && m.every(k => modifiers.includes(k));
  return v.version === 1 && Number.isSafeInteger(v.revision) && v.revision >= 0 && !!v.pointer
    && (v.pointer.button === null || Number.isInteger(v.pointer.button) && v.pointer.button >= 0 && v.pointer.button <= 4)
    && validModifiers(v.pointer.modifiers) && (v.keyboard === null || !!v.keyboard && typeof v.keyboard.code === 'string' && validKey(v.keyboard.code) && validModifiers(v.keyboard.modifiers))
    && (v.additiveModifier === undefined || v.additiveModifier === null || modifiers.includes(v.additiveModifier));
}
export function eventModifiers(event: MouseEvent | KeyboardEvent): Modifier[] {
  return modifiers.filter(key => event[key === 'control' ? 'ctrlKey' : key === 'meta' ? 'metaKey' : key === 'alt' ? 'altKey' : 'shiftKey']);
}
export function matchesModifiers(event: MouseEvent | KeyboardEvent, expected: Modifier[]): boolean {
  const actual = eventModifiers(event);
  return actual.length === expected.length && expected.every(key => actual.includes(key));
}
export function pointerLabel(value: SelectionControls): string {
  return value.pointer.button === null ? 'Mouse gesture off' : [...value.pointer.modifiers.map(m => labels[m]), buttons[value.pointer.button]].join(' + ');
}
export function keyboardLabel(value: SelectionControls): string {
  return value.keyboard ? [...value.keyboard.modifiers.map(m => labels[m]), value.keyboard.code.replace(/^(Key|Digit)/, '')].join(' + ') : 'Keyboard shortcut off';
}

export function createSelectionControls(mount: HTMLElement | ShadowRoot, api: Api, onChange: (value: SelectionControls) => void = () => {}, fallback = defaultSelectionControls()) {
  const ui = shell(mount, 'Selection controls');
  const body = document.createElement('div');
  body.innerHTML = `<style>.nt-selection-keys{display:flex;gap:8px 18px;flex-wrap:wrap;border:0;padding:0;margin:12px 0}.nt-selection-keys legend{font-weight:700;margin-bottom:8px}.nt-workspace-dialog .nt-selection-keys label{display:flex;flex-direction:row;align-items:center;gap:8px;margin:0;font-weight:400}.nt-workspace-dialog .nt-selection-keys input{width:18px;height:18px;padding:0;accent-color:var(--dr-accent)}.nt-selection-shortcut{display:flex;gap:8px;flex-wrap:wrap}.nt-selection-test{width:100%;min-height:64px;margin-top:14px;touch-action:none}</style>
    <p>Choose how you point at an element. Preferences are saved locally for this repository and shared with its connected overlays.</p>
    <label for="nt-selection-button">Mouse button</label><select id="nt-selection-button"><option value="-1">Off — use Pick element or the keyboard</option>${buttons.map((label, n) => `<option value="${n}">${label}</option>`).join('')}</select>
    <fieldset class="nt-selection-keys"><legend>Hold these keys</legend>${modifiers.map(m => `<label><input type="checkbox" data-modifier="${m}">${labels[m]}</label>`).join('')}</fieldset>
    <p class="nt-workspace-note" data-pointer-summary></p>
    <label for="nt-selection-additive">Add to selection modifier</label><select id="nt-selection-additive"><option value="">Off</option>${modifiers.map(m => `<option value="${m}">${labels[m]}</option>`).join('')}</select>
    <p>Hold this extra key with your mouse gesture or keyboard shortcut to add or remove an element. Choose a key not already used by that gesture. You can also use <strong>Select multiple</strong> to pick with clicks or taps, or <strong>Select area</strong> to drag a rectangle.</p>
    <h3>Keyboard shortcut</h3><p>Focus an element with Tab, then use your shortcut to select it. Unmodified typing keys are ignored inside text fields.</p>
    <div class="nt-selection-shortcut"><button type="button" data-record aria-label="Record keyboard shortcut"></button><button type="button" data-disable>Turn shortcut off</button></div>
    <p>Press Record, then your preferred key combination. Escape cancels recording. Some shortcuts and side buttons are reserved by your browser or operating system; test your choice below.</p>
    <button type="button" class="nt-selection-test" data-test>Test your mouse gesture here</button><p data-test-status role="status"></p>
    <p>For a one-time selection, use <strong>Pick element</strong> in the page overlay, then click or tap your target. Escape cancels picking.</p>
    <p data-status role="status"></p><div class="nt-workspace-actions"><button type="button" data-reset>Reset defaults</button><button type="button" data-cancel>Cancel</button><button type="button" class="primary" data-save>Save controls</button></div>`;
  ui.dialog.append(body);
  const $ = <E extends HTMLElement = HTMLElement>(selector: string) => query<E>(body, selector);
  let saved = structuredClone(fallback), draft = structuredClone(saved), dirty = false, busy = false, recording = false, loading = false, alive = true;
  const status = (message: string, error = false) => { $('[data-status]').textContent = message; $('[data-status]').classList.toggle('nt-workspace-error', error); };
  const setRecording = (value: boolean) => { recording = value; $('[data-record]').textContent = value ? 'Press your shortcut…' : `Record: ${keyboardLabel(draft)}`; };
  const summary = () => { $('[data-pointer-summary]').textContent = `${pointerLabel(draft)}. ${draft.pointer.button !== null && !draft.pointer.modifiers.length ? 'This replaces the normal action of that button on the inspected page.' : 'Other mouse gestures keep their normal action.'}`; };
  const render = () => {
    $<HTMLSelectElement>('#nt-selection-button').value = String(draft.pointer.button ?? -1);
    $<HTMLSelectElement>('#nt-selection-additive').value = draft.additiveModifier === undefined ? 'shift' : draft.additiveModifier || '';
    for (const m of modifiers) $<HTMLInputElement>(`[data-modifier="${m}"]`).checked = draft.pointer.modifiers.includes(m);
    setRecording(false); summary();
  };
  const receive = (value: unknown) => {
    if (!alive) return;
    if (value !== null && !validSelectionControls(value)) throw new Error('Invalid selection controls from server');
    const next = value === null ? structuredClone(fallback) : value as SelectionControls;
    if (next.revision < saved.revision) return;
    saved = structuredClone(next); onChange(structuredClone(saved));
    if (!ui.dialog.open || !dirty) { draft = structuredClone(saved); if (ui.dialog.open) render(); }
  };
  const controls = () => {
    for (const input of body.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('button,input,select')) input.disabled = busy || loading;
    ui.close.disabled = busy;
  };
  const close = () => { if (busy) return; setRecording(false); ui.dialog.close(); };
  ui.close.onclick = close; $('[data-cancel]').onclick = close;
  ui.dialog.addEventListener('cancel', event => { event.preventDefault(); if (recording) setRecording(false); else close(); });
  $<HTMLSelectElement>('#nt-selection-button').onchange = () => { const button = Number($<HTMLSelectElement>('#nt-selection-button').value); draft.pointer.button = button < 0 ? null : button; dirty = true; summary(); };
  $<HTMLSelectElement>('#nt-selection-additive').onchange = () => { draft.additiveModifier = $<HTMLSelectElement>('#nt-selection-additive').value as Modifier || null; dirty = true; };
  for (const m of modifiers) $<HTMLInputElement>(`[data-modifier="${m}"]`).onchange = () => { draft.pointer.modifiers = modifiers.filter(key => $<HTMLInputElement>(`[data-modifier="${key}"]`).checked); dirty = true; summary(); };
  $('[data-record]').onclick = () => { setRecording(true); $('[data-record]').focus(); };
  $('[data-record]').onblur = () => setRecording(false);
  $('[data-record]').onkeydown = event => {
    if (!recording) return;
    if (event.key === 'Tab') { setRecording(false); return; }
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape') { setRecording(false); return; }
    if (event.repeat || event.isComposing || !validKey(event.code)) return;
    draft.keyboard = { code: event.code, modifiers: eventModifiers(event) }; dirty = true; setRecording(false); status(`Shortcut recorded: ${keyboardLabel(draft)}. Save to use it.`);
  };
  // Avoid a recorded Space/Enter key releasing into another button activation.
  $('[data-record]').onkeyup = event => { if (event.code === 'Space' || event.code === 'Enter') event.preventDefault(); };
  $('[data-disable]').onclick = () => { draft.keyboard = null; dirty = true; setRecording(false); };
  $('[data-reset]').onclick = () => { draft = { ...defaultSelectionControls(), revision: saved.revision }; dirty = true; render(); status('Defaults selected. Save to keep them.'); };
  const test = $('[data-test]');
  test.onpointerdown = event => { event.preventDefault(); const match = event.button === draft.pointer.button && matchesModifiers(event, draft.pointer.modifiers); $('[data-test-status]').textContent = match ? 'Matches your mouse gesture.' : `Received ${[...eventModifiers(event).map(m => labels[m]), buttons[event.button] || `Button ${event.button}`].join(' + ')}. Expected ${pointerLabel(draft)}.`; };
  test.oncontextmenu = event => event.preventDefault(); test.onauxclick = event => event.preventDefault();
  $('[data-save]').onclick = async () => {
    if (busy || loading) return;
    busy = true; controls(); setRecording(false); status('Saving…');
    try { const next = await api<SelectionControls>('/api/selection-controls', { method: 'POST', body: JSON.stringify(draft) }); dirty = false; receive(next); status('Saved. Connected page overlays now use these controls.'); }
    catch (error) { status(errorMessage(error), true); }
    finally { busy = false; controls(); }
  };
  onChange(structuredClone(saved));
  return {
    load: async () => receive(await api<SelectionControls | null>('/api/selection-controls')),
    receive: (value: unknown) => { try { receive(value); } catch (error) { status(errorMessage(error), true); } },
    async open() {
      if (ui.dialog.open) return;
      draft = structuredClone(saved); dirty = false; render(); status('Loading controls…'); $('[data-test-status]').textContent = '';
      loading = true; controls(); ui.dialog.showModal();
      try { receive(await api<SelectionControls | null>('/api/selection-controls')); status(''); }
      catch (error) { status(errorMessage(error), true); }
      finally { loading = false; controls(); }
    },
    destroy() { alive = false; ui.destroy(); }
  };
}
