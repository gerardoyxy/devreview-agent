import type { Api } from '../../contracts/src/index.js';
import { errorMessage } from '../../contracts/src/index.js';

export const colorLabels = {
  page: 'Page', surface: 'Surface', elevated: 'Raised surface', text: 'Text', muted: 'Secondary text', border: 'Borders',
  accent: 'Accent / focus', onAccent: 'Text on accent', accentSoft: 'Selected background', success: 'Success text', successSoft: 'Success background',
  danger: 'Error text', dangerSoft: 'Error background', warning: 'Warning text', warningSoft: 'Warning background', info: 'Activity text', infoSoft: 'Activity background', backdrop: 'Modal backdrop'
};
export type Palette = Record<keyof typeof colorLabels, string>;
export interface Appearance {
  version: 1; mode: 'system' | 'light' | 'dark'; palettes: { light: Palette; dark: Palette };
  fonts: { body: string; heading: string; mono: string }; fontSize: number; radius: number;
  customFonts: Array<{ name: string; data: string }>;
}
const light: Palette = { page:'#f4f5f1',surface:'#ffffff',elevated:'#edf0e8',text:'#243026',muted:'#59665b',border:'#c4cec0',accent:'#38633e',onAccent:'#ffffff',accentSoft:'#e0eddc',success:'#35683b',successSoft:'#e2f0df',danger:'#a33232',dangerSoft:'#fbe5e2',warning:'#775515',warningSoft:'#faf0d6',info:'#385c91',infoSoft:'#e8edf8',backdrop:'#152319' };
const dark: Palette = { page:'#151a17',surface:'#1e2621',elevated:'#28322b',text:'#edf3eb',muted:'#b2c0b1',border:'#536052',accent:'#b9d8a7',onAccent:'#1c321c',accentSoft:'#32452d',success:'#b4dda7',successSoft:'#2e4229',danger:'#ffb9b2',dangerSoft:'#4b2b2a',warning:'#ead08d',warningSoft:'#473d25',info:'#b4cdf9',infoSoft:'#2c3b50',backdrop:'#050906' };
export const defaultAppearance = (): Appearance => ({ version:1,mode:'system',palettes:{light:{...light},dark:{...dark}},fonts:{body:'system-ui, sans-serif',heading:'system-ui, sans-serif',mono:'ui-monospace, monospace'},fontSize:14,radius:10,customFonts:[] });
const loadedFonts = new Map<string, {data:string;face:FontFace}>();
const escapeFamily = (family: string) => family.split(',').map(s => s.trim()).map(s => /^(serif|sans-serif|monospace|system-ui|ui-monospace|ui-serif|ui-sans-serif)$/.test(s) ? s : `"${s.replace(/["\\]/g,'')}"`).join(', ');
export function validAppearance(value: unknown): value is Appearance {
  if (!value || typeof value !== 'object') return false;
  const v = value as Appearance;
  return v.version===1 && ['system','light','dark'].includes(v.mode) && [v.palettes?.light,v.palettes?.dark].every(p => p && Object.keys(colorLabels).every(key => /^#[\da-f]{6}$/i.test(p[key as keyof Palette])))
    && ['body','heading','mono'].every(key => typeof v.fonts?.[key as keyof Appearance['fonts']]==='string' && /^[\p{L}\p{N} ,_-]{1,160}$/u.test(v.fonts[key as keyof Appearance['fonts']]))
    && Number.isInteger(v.fontSize) && v.fontSize>=12 && v.fontSize<=20 && Number.isInteger(v.radius) && v.radius>=0 && v.radius<=24
    && Array.isArray(v.customFonts) && v.customFonts.length<=3 && v.customFonts.every(f=>/^NudgeThisFont[a-z0-9]{1,48}$/i.test(f.name) && typeof f.data==='string' && f.data.length<=1_400_000 && /^(d09GMg|d09GRg)/.test(f.data));
}
export async function applyAppearance(target: HTMLElement, value: Appearance): Promise<void> {
  for (const font of value.customFonts) {
    const existing=loadedFonts.get(font.name); if (existing?.data===font.data) continue;
    const bytes=Uint8Array.from(atob(font.data),c=>c.charCodeAt(0));
    const face=await new FontFace(font.name,bytes.buffer).load();
    if (existing) document.fonts.delete(existing.face);
    document.fonts.add(face); loadedFonts.set(font.name,{data:font.data,face});
  }
  const mode = value.mode==='system' ? (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light') : value.mode;
  target.style.colorScheme=mode;
  for (const [name,color] of Object.entries(value.palettes[mode])) target.style.setProperty(`--dr-${name}`,color);
  for (const [name,font] of Object.entries(value.fonts)) target.style.setProperty(`--dr-font-${name}`,escapeFamily(font));
  target.style.setProperty('--dr-size',`${value.fontSize}px`); target.style.setProperty('--dr-radius',`${value.radius}px`);
}
export const themeDefaults = `
:host,:root{${Object.entries(light).map(([k,v])=>`--dr-${k}:${v}`).join(';')};--dr-font-body:system-ui,sans-serif;--dr-font-heading:system-ui,sans-serif;--dr-font-mono:ui-monospace,monospace;--dr-size:14px;--dr-radius:10px}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
const editorStyles = `
${themeDefaults}
:host{font:var(--dr-size)/1.5 var(--dr-font-body);color:var(--dr-text)}*{box-sizing:border-box}
[hidden]{display:none!important}button,input,select{font:inherit;color:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:wait}
button,input,select{border:1px solid var(--dr-border);border-radius:calc(var(--dr-radius)*.6);background:var(--dr-surface);padding:9px 12px}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--dr-accent);outline-offset:3px}
dialog{pointer-events:auto;width:min(720px,calc(100vw - 24px));max-height:calc(100dvh - 32px);margin:auto;padding:0;border:1px solid var(--dr-border);border-radius:var(--dr-radius);background:var(--dr-surface);color:var(--dr-text);font:var(--dr-size)/1.5 var(--dr-font-body)}
dialog::backdrop{background:color-mix(in srgb,var(--dr-backdrop) 65%,transparent)}
header,footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 24px;background:var(--dr-surface);position:sticky;z-index:1}header{top:0;border-bottom:1px solid var(--dr-border)}footer{bottom:0;border-top:1px solid var(--dr-border);flex-wrap:wrap}
h2{font:600 22px/1.3 var(--dr-font-heading);margin:0}h3{font:600 16px/1.4 var(--dr-font-heading);margin:24px 0 12px}p{color:var(--dr-muted);margin:8px 0 18px;font-size:.92em}.body{padding:0 24px 24px}.row{display:flex;flex-wrap:wrap;align-items:end;gap:12px}.row>label{flex:1;min-width:130px}label{display:flex;flex-direction:column;gap:6px;font-size:.9em}input,select{max-width:100%;width:100%}.colors{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px}.color{display:grid;grid-template-columns:1fr 36px 90px;align-items:center;gap:8px}.color span{font-size:.85em}input[type=color]{width:36px;height:36px;padding:2px;border-radius:6px}.hex{font:12px var(--dr-font-mono);padding:8px;min-width:0}.sample{background:var(--dr-page);border:1px solid var(--dr-border);border-radius:var(--dr-radius);padding:18px;margin:18px 0}.sample h3{margin:0 0 8px}.primary{background:var(--dr-accent);color:var(--dr-onAccent);border-color:var(--dr-accent)}.status{font-size:.9em;white-space:pre-wrap}.error{color:var(--dr-danger)}.warning{color:var(--dr-warning);background:var(--dr-warningSoft);padding:12px;border-radius:var(--dr-radius)}.small{font-size:.8em}.font-uploads{display:grid;gap:12px}.font-item{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.file-label{font-size:.85em}input[type=file]{padding:6px;font-size:12px}.tools{display:flex;gap:8px;flex-wrap:wrap}.tools button{font-size:12px}code{font-family:var(--dr-font-mono)}
@media(max-width:540px){.colors{grid-template-columns:1fr}header,footer{padding:16px}.body{padding:0 16px 16px}h2{font-size:20px}.font-item{grid-template-columns:1fr}.color{grid-template-columns:1fr 36px 90px}}
`;
function contrast(a:string,b:string):number {
  const luminance=(s:string)=>{ const rgb=[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4); return .2126*rgb[0]!+.7152*rgb[1]!+.0722*rgb[2]!; };
  const l1=luminance(a),l2=luminance(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
}
/** Scope all custom properties to NudgeThis. The inspected app is never restyled. */
export function createAppearance({api,target,mount}: {api:Api;target:HTMLElement;mount:HTMLElement|ShadowRoot}) {
  let saved=defaultAppearance(),draft=structuredClone(saved),dirty=false,busy=false;
  const host=document.createElement('div'); const root=host.attachShadow({mode:'open'}); mount.append(host);
  root.innerHTML=`<style>${editorStyles}</style><dialog aria-label="Appearance"><header><h2>Make it yours.</h2><button type="button" data-close aria-label="Close appearance">Close</button></header><div class="body"><p>Your workspace, your type and color. These preferences apply to NudgeThis's dashboard and overlay.</p><div class="row"><label>Color mode<select data-mode aria-label="Color mode"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label>Edit palette<select data-palette aria-label="Edit palette"><option value="light">Light palette</option><option value="dark">Dark palette</option></select></label></div><div class="sample"><h3>A clear space for your changes.</h3><p>Conversations, reviewed code and a history you can follow.</p><button type="button" class="primary" data-sample>Preview accent</button> <code>button.css</code></div><h3>Colors</h3><div class="colors"></div><p class="warning" data-contrast hidden></p><h3>Typography & shape</h3><p class="small">Enter any installed font family, or upload a WOFF/WOFF2 file. Unavailable fonts use your fallback. No external font service is contacted.</p><div class="font-uploads"></div><div class="row"><label>Base text size<input type="number" min="12" max="20" data-size aria-label="Base text size"></label><label>Corner radius<input type="number" min="0" max="24" data-radius aria-label="Corner radius"></label></div><h3>Theme file</h3><div class="tools"><button type="button" data-export>Export JSON</button><button type="button" data-import>Import JSON</button><button type="button" data-reset>Reset defaults</button></div><input data-import-file type="file" accept="application/json,.json" hidden><p class="small">Export includes uploaded fonts. Use fonts you have permission to share. Maximum total font size: 1 MiB.</p><p class="status" role="status"></p></div><footer><span class="small" data-state>Saved for this repository</span><div class="tools"><button type="button" data-cancel>Cancel</button><button type="button" class="primary" data-save>Save appearance</button></div></footer></dialog>`;
  const $=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
  const dialog=$<HTMLDialogElement>('dialog');
  const status=(message:string,error=false)=>{ $('.status').textContent=message; $('.status').classList.toggle('error',error); };
  const renderTheme=async(value:Appearance)=>{ await applyAppearance(target,value); await applyAppearance(host,value); };
  const notice=()=>{
    const mode=$<HTMLSelectElement>('[data-palette]').value as 'light'|'dark'; const p=draft.palettes[mode];
    const issues:[string,number][]=[['Text / surface',contrast(p.text,p.surface)],['Secondary text / surface',contrast(p.muted,p.surface)],['Accent text / accent',contrast(p.onAccent,p.accent)],['Text / page',contrast(p.text,p.page)]];
    const failed=issues.filter(([,ratio])=>ratio<4.5); $('[data-contrast]').hidden=!failed.length; $('[data-contrast]').textContent=failed.map(([name,ratio])=>`${name}: ${ratio.toFixed(2)}:1`).join(' · ')+(failed.length?' - below WCAG AA for normal text. You can still save your chosen colors.':'');
  };
  const preview=()=>{ dirty=true; $('[data-state]').textContent='Preview · not saved'; notice(); void renderTheme(draft).catch(e=>status(errorMessage(e),true)); };
  function colors() {
    $('.colors').replaceChildren(); const mode=$<HTMLSelectElement>('[data-palette]').value as 'light'|'dark';
    for(const [key,label] of Object.entries(colorLabels)) {
      const row=document.createElement('label');row.className='color';
      const title=document.createElement('span');title.textContent=label;
      const picker=document.createElement('input');picker.type='color';picker.value=draft.palettes[mode][key as keyof Palette];picker.setAttribute('aria-label',label+' color');
      const hex=document.createElement('input');hex.className='hex';hex.value=picker.value;hex.maxLength=7;hex.setAttribute('aria-label',label+' hex');hex.pattern='#[0-9a-fA-F]{6}';
      picker.oninput=()=>{ hex.value=picker.value;draft.palettes[mode][key as keyof Palette]=picker.value;preview(); };
      hex.oninput=()=>{ if(/^#[0-9a-f]{6}$/i.test(hex.value)){ picker.value=hex.value;draft.palettes[mode][key as keyof Palette]=hex.value;preview(); } };
      row.append(title,picker,hex);$('.colors').append(row);
    } notice();
  }
  function form() {
    $<HTMLSelectElement>('[data-mode]').value=draft.mode; $<HTMLInputElement>('[data-size]').value=String(draft.fontSize);$<HTMLInputElement>('[data-radius]').value=String(draft.radius);colors();$('.font-uploads').replaceChildren();
    for(const [key,label] of [['body','Body font'],['heading','Heading font'],['mono','Code font']] as const){
      const row=document.createElement('div');row.className='font-item';const nameLabel=document.createElement('label');nameLabel.textContent=label;
      const name=document.createElement('input');name.value=draft.fonts[key];name.maxLength=160;name.setAttribute('aria-label',label);nameLabel.append(name);
      name.onchange=()=>{ const previous=draft.fonts[key];draft.fonts[key]=name.value.trim();if(validAppearance(draft as unknown)){preview();status('');}else{draft.fonts[key]=previous;name.value=previous;status('Use font family names separated by commas.',true);} };
      const uploadLabel=document.createElement('label');uploadLabel.className='file-label';uploadLabel.textContent=`Upload ${key} font`;
      const upload=document.createElement('input');upload.type='file';upload.accept='.woff,.woff2';upload.setAttribute('aria-label',`Upload ${key} font`);uploadLabel.append(upload);
      upload.onchange=async()=>{ try {const file=upload.files?.[0];if(!file)return;if(file.size>1_048_576)throw new Error('Font files must total at most 1 MiB.');const bytes=new Uint8Array(await file.arrayBuffer());const signature=new TextDecoder().decode(bytes.slice(0,4));if(!['wOFF','wOF2'].includes(signature))throw new Error('Choose a WOFF or WOFF2 font.');let binary='';for(const b of bytes)binary+=String.fromCharCode(b);const fontName=`NudgeThisFont${key}`;const fonts=draft.customFonts.filter(f=>f.name!==fontName);fonts.push({name:fontName,data:btoa(binary)});if(fonts.reduce((n,f)=>n+atob(f.data).length,0)>1_048_576)throw new Error('Font files must total at most 1 MiB.');await new FontFace(fontName,bytes.buffer).load();draft.customFonts=fonts;draft.fonts[key]=`${fontName}, ${key==='mono'?'monospace':'sans-serif'}`;name.value=draft.fonts[key];preview();status(`${file.name} is ready to save.`);}catch(e){status(errorMessage(e),true);} };
      row.append(nameLabel,uploadLabel);$('.font-uploads').append(row);
    }
  }
  const close=()=>{ if(busy)return;dialog.close();draft=structuredClone(saved);dirty=false;void renderTheme(saved).catch(e=>status(errorMessage(e),true)); };
  $('[data-close]').onclick=close;$('[data-cancel]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  $<HTMLSelectElement>('[data-mode]').onchange=()=>{draft.mode=$<HTMLSelectElement>('[data-mode]').value as Appearance['mode'];preview();};
  $<HTMLSelectElement>('[data-palette]').onchange=colors;
  for(const [selector,key,min,max] of [['[data-size]','fontSize',12,20],['[data-radius]','radius',0,24]] as const){$<HTMLInputElement>(selector).onchange=()=>{const input=$<HTMLInputElement>(selector);const n=Number(input.value);draft[key]=Number.isInteger(n)?Math.max(min,Math.min(max,n)):min;input.value=String(draft[key]);preview();};}
  $('[data-reset]').onclick=()=>{draft=defaultAppearance();form();preview();};
  $('[data-sample]').onclick=()=>status('This preview uses your current colors and fonts.');
  $('[data-save]').onclick=async()=>{ if(busy)return; if(!validAppearance(draft)){status('Review your theme values before saving.',true);return;}busy=true;$<HTMLButtonElement>('[data-save]').disabled=true;status('Saving…');try{saved=await api<Appearance>('/api/appearance',{method:'POST',body:JSON.stringify(draft)});dirty=false;$('[data-state]').textContent='Saved for this repository';status('Saved. Dashboard and overlay will use this appearance.');}catch(e){status(errorMessage(e),true);}finally{busy=false;$<HTMLButtonElement>('[data-save]').disabled=false;} };
  $('[data-export]').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='nudgethis-theme.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('[data-import]').onclick=()=>$<HTMLInputElement>('[data-import-file]').click();
  $<HTMLInputElement>('[data-import-file]').onchange=async()=>{try{const file=$<HTMLInputElement>('[data-import-file]').files?.[0];if(!file)return;if(file.size>2_097_152)throw new Error('Theme file is too large.');const value:unknown=JSON.parse(await file.text());if(!validAppearance(value))throw new Error('Invalid NudgeThis theme file.');await renderTheme(value);draft=value;form();preview();status('Imported. Save to keep these preferences.');}catch(e){status(errorMessage(e),true);}};
  const media=matchMedia('(prefers-color-scheme: dark)');const system=()=>void renderTheme(dialog.open?draft:saved).catch(()=>{});media.addEventListener('change',system);
  async function receive(value:unknown) { if(value!==null&&!validAppearance(value))throw new Error('The server returned an invalid appearance.');saved=value===null?defaultAppearance():value as Appearance;if(!dialog.open||!dirty){draft=structuredClone(saved);await renderTheme(saved);if(dialog.open)form();} }
  void renderTheme(saved);
  return {
    async load(){await receive(await api<Appearance|null>('/api/appearance'));},
    receive(value:unknown){void receive(value).catch(e=>status(errorMessage(e),true));},
    async open(){draft=structuredClone(saved);dirty=false;form();status('');dialog.scrollTop=0;$('[data-state]').textContent='Saved for this repository';await renderTheme(draft);if(!dialog.open)dialog.showModal();},
    destroy(){media.removeEventListener('change',system);host.remove();}
  };
}
