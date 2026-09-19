import type { Api, ElementContext } from '../../contracts/src/index.js';
import { errorMessage, query } from '../../contracts/src/index.js';
import { shell } from './workspace.js';
import { myStyleCss } from './my-style-css.js';

type Direction = 'quiet' | 'editorial' | 'bold';
type Scope = 'global' | 'buttons' | 'inputs' | 'headings' | 'surfaces';
type Colors = 'background' | 'surface' | 'text' | 'muted' | 'accent' | 'onAccent' | 'border';
interface Tokens extends Record<Colors, string> { bodyFont: string; headingFont: string; fontSize: number; spacing: number; radius: number; headingWeight: number }
interface Rule { scope: Scope; property: string; value: string; source?: string; evidence?: string[] }
interface Profile { id: string; name: string; direction: Direction; branch: string; tokens: Tokens; rules: Rule[]; notes: string; version: number; updatedAt: string }
interface Suggestion { id: string; property: string; value: string; scope: Scope; count: number; evidence: { id: string; route: string; tagName: string }[] }
interface Library { version: 1; revision: number; profiles: Profile[]; activeId: string | null; dismissed: string[]; suggestions: Suggestion[]; guides: Record<string, string> }
export interface StyleSeed { request: string; context?: ElementContext; contextIds: string[] }
const colors: Record<Colors, string> = { background: 'Page', surface: 'Surface', text: 'Text', muted: 'Secondary text', accent: 'Accent', onAccent: 'Text on accent', border: 'Borders' };
const scopes: Record<Scope, string> = { global: 'Base style', buttons: 'Buttons & links', inputs: 'Form fields', headings: 'Headings', surfaces: 'Containers' };
const properties: Record<string, string> = { 'border-radius': 'Corners', padding: 'Inner space', gap: 'Space between items', 'font-size': 'Text size', 'font-weight': 'Text weight', 'line-height': 'Line spacing', 'font-family': 'Font family', color: 'Text color', 'background-color': 'Background color', 'border-color': 'Border color' };
const palette = {
  blue: { background: '#f4f6ff', surface: '#ffffff', text: '#172143', muted: '#566480', accent: '#2147cc', onAccent: '#ffffff', border: '#bdc8de' },
  warm: { background: '#faf6ee', surface: '#fffdf8', text: '#34271e', muted: '#74604e', accent: '#963c24', onAccent: '#ffffff', border: '#c9bbaa' },
  forest: { background: '#f0f5f1', surface: '#ffffff', text: '#193629', muted: '#526d5c', accent: '#216345', onAccent: '#ffffff', border: '#b1c9b9' },
  dark: { background: '#171b24', surface: '#252d3c', text: '#f4f6ff', muted: '#b9c3d6', accent: '#a8beff', onAccent: '#101c47', border: '#536589' }
};
const fresh = (): Profile => ({ id: `style-${crypto.randomUUID()}`, name: 'My style', direction: 'quiet', branch: 'balanced', tokens: { ...palette.blue, bodyFont: 'system-ui, sans-serif', headingFont: 'system-ui, sans-serif', fontSize: 16, spacing: 16, radius: 6, headingWeight: 700 }, rules: [], notes: '', version: 0, updatedAt: '' });
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => { const e = document.createElement(tag); e.textContent = text; e.className = className; return e; };
function ratio(a: string, b: string) { const l = (v: string) => [1,3,5].map(i => parseInt(v.slice(i,i+2),16)/255).map(n => n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4).reduce((n,v,i) => n + v * [.2126,.7152,.0722][i],0); return (Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05); }
const branchOptions: Record<Direction, { title: string; options: [string,string,string,Partial<Tokens>][] }> = {
  quiet: { title: 'How much room should it have?', options: [['airy','Room to breathe','Generous spacing and relaxed reading.',{spacing:28,fontSize:18}],['balanced','A comfortable balance','Clear groups, with room between them.',{spacing:16,fontSize:16}],['compact','More in view','Closer groups and a smaller reading size.',{spacing:10,fontSize:14}]] },
  editorial: { title: 'What should lead the reading?', options: [['reading','A reading voice','Serif headings, quiet contrast.',{headingFont:'Georgia, serif',headingWeight:700,spacing:24}],['publication','A strong headline','Heavier headings and tighter corners.',{headingFont:'system-ui, sans-serif',headingWeight:900,radius:0}],['technical','Precise and direct','Monospace headings with compact groups.',{headingFont:'ui-monospace, monospace',headingWeight:600,spacing:12}]] },
  bold: { title: 'Where should the emphasis come from?', options: [['color','The accent','Warm color on a light surface.',{...palette.warm,headingWeight:800}],['contrast','Light against dark','Clear contrast on deep surfaces.',{...palette.dark,headingWeight:800}],['shape','Softer shapes','Rounded controls and open spacing.',{radius:20,spacing:24,headingWeight:700}]] }
};

export function createMyStyle(mount: HTMLElement | ShadowRoot, api: Api, onApply: (seed: StyleSeed) => void, onEvidence: (id: string) => void) {
  const ui = shell(mount, 'My Style'); ui.dialog.classList.add('nt-style-dialog');
  const style = element('style', myStyleCss), body = element('div');
  body.innerHTML = `<p class="ms-intro">A style for the things you make. Build it visually, refine its rules, and carry it into your next change.</p>
    <div class="ms-library"><label for="ms-profile">Saved styles<select id="ms-profile" aria-label="Saved styles"><option value="">New style</option></select></label><button type="button" data-new>New style</button><button type="button" data-import>Import style</button><input type="file" accept=".json,application/json" data-file hidden></div>
    <div class="ms-workbench"><section class="ms-editor" aria-label="Style editor"><label for="ms-name">Style name<input id="ms-name" maxlength="100"></label>
    <div class="ms-tabs" role="tablist" aria-label="Style sections"><button type="button" role="tab" data-tab="build">Build</button><button type="button" role="tab" data-tab="rules">Rules</button><button type="button" role="tab" data-tab="suggestions">Suggestions</button></div>
    <section class="ms-content" role="tabpanel" tabindex="-1"></section></section>
    <aside class="ms-preview" aria-label="Style preview"><div class="ms-preview-heading"><h3>See your choices together</h3><span data-version></span></div>
    <div class="ms-canvas"><div class="ms-example-nav"><strong>Studio</strong><span>Your workspace</span></div><h4 class="ms-example-heading">A place for your ideas.</h4><p class="ms-example-copy">Keep the details that matter. Give everything else a little room.</p><div class="ms-example-surface"><strong>Project details</strong><label>Project name<input class="ms-example-input" value="My next project" readonly></label><div class="ms-example-actions"><button type="button" class="ms-example-button">Save changes</button><a class="ms-example-link" href="#">View project</a></div></div></div>
    <p class="ms-preview-note">Example components. Your website changes only through a reviewed change.</p><p data-contrast class="ms-contrast" hidden></p><div class="ms-path" aria-label="Your design choices"></div></aside></div>
    <p data-status role="status"></p><footer class="ms-footer"><span data-saved></span><div class="ms-tools"><button type="button" data-reload>Reload saved</button><button type="button" data-export>Export style</button><button type="button" data-guide>Export rules</button><button type="button" data-delete>Delete style</button><button type="button" class="primary" data-save>Save style</button></div></footer>
    <div class="ms-use"><div><h3>Put your style to work</h3><p data-default-status></p><button type="button" data-default>Use for new changes</button></div><div><label for="ms-scope">Apply to<select id="ms-scope" aria-label="Apply to"><option value="element">Selected element</option><option value="page">A page</option><option value="project">The project</option></select></label><label for="ms-page">Page path<input id="ms-page" maxlength="1000" placeholder="/settings"></label><button type="button" class="primary" data-apply>Apply my style</button><p>Prepares a change with these rules. Review the proposed code before applying it.</p></div></div>`;
  ui.dialog.append(style, body);
  const $ = <E extends HTMLElement = HTMLElement>(selector: string) => query<E>(body,selector);
  let library: Library = { version:1,revision:0,profiles:[],activeId:null,dismissed:[],suggestions:[],guides:{} }, draft = fresh(), tab = 'build', step = 0, dirty = false, busy = false, loaded = false, context: ElementContext | undefined;
  const status = (message: string, error = false) => { $('[data-status]').textContent = message; $('[data-status]').classList.toggle('nt-workspace-error',error); };
  const current = () => library.profiles.find(p => p.id === draft.id);
  const changed = () => { dirty = true; $('[data-saved]').textContent = 'Unsaved choices'; status(''); preview(); locks(); };
  const button = (text: string, action: () => void) => { const b = element('button',text); b.type = 'button'; b.onclick = action; return b; };
  const selectOptions = (values: Record<string,string>, value: string, change: (value: string) => void) => { const select = element('select'); for (const [id,label] of Object.entries(values)) { const o=element('option',label);o.value=id;select.append(o); } select.value=value;select.onchange=()=>change(select.value);return select; };
  const download = (name: string, content: string, type: string) => { const url=URL.createObjectURL(new Blob([content],{type}));const link=element('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000); };
  function locks() {
    for (const field of body.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('button,input,select,textarea')) field.disabled=busy || !loaded;
    for (const name of ['export','guide','delete','default','apply']) $<HTMLButtonElement>(`[data-${name}]`).disabled=busy || !current() || dirty;
    for (const b of body.querySelectorAll<HTMLButtonElement>('[data-needs-saved]')) b.disabled=busy || !current() || dirty;
    const add=body.querySelector<HTMLButtonElement>('[data-add-rule]');if(add)add.disabled=busy || !loaded || draft.rules.length>=32;
    $<HTMLButtonElement>('[data-reload]').disabled=busy;
    ui.close.disabled=busy;
  }
  function preview() {
    const canvas=$('.ms-canvas'), t=draft.tokens;
    for (const key of Object.keys(colors) as Colors[]) canvas.style.setProperty(`--ms-${key}`,t[key]);
    for (const key of ['fontSize','spacing','radius'] as const) canvas.style.setProperty(`--ms-${key}`,`${t[key]}px`);
    canvas.style.setProperty('--ms-body-font',t.bodyFont);canvas.style.setProperty('--ms-heading-font',t.headingFont);canvas.style.setProperty('--ms-heading-weight',String(t.headingWeight));
    for (const e of canvas.querySelectorAll<HTMLElement>('[data-rule-preview]')) { e.removeAttribute('style'); e.removeAttribute('data-rule-preview'); }
    const targets: Record<Scope,string> = { global: '.ms-example-copy', buttons: '.ms-example-button,.ms-example-link', inputs: '.ms-example-input', headings: '.ms-example-heading', surfaces: '.ms-example-surface' };
    for (const rule of draft.rules) for (const e of canvas.querySelectorAll<HTMLElement>(targets[rule.scope])) { e.style.setProperty(rule.property,rule.value);e.dataset.rulePreview=''; }
    $('[data-version]').textContent=draft.version ? `Saved v${draft.version}${dirty?' · editing':''}` : 'New style';
    const low=[['Text',t.text,t.surface],['Secondary text',t.muted,t.background],['Accent text',t.onAccent,t.accent]].filter(([,a,b])=>ratio(a,b)<4.5);
    $('[data-contrast]').hidden=!low.length;$('[data-contrast]').textContent=low.length?`${low.map(([label])=>label).join(', ')} may be hard to read. Adjust those colors before applying.`:'';
    const branch=branchOptions[draft.direction].options.find(([id])=>id===draft.branch)?.[1] || '';
    $('.ms-path').replaceChildren(element('strong','Your choices'),element('p',`${{quiet:'Quiet',editorial:'Editorial',bold:'Expressive'}[draft.direction]} → ${branch} → ${t.radius}px corners · ${t.spacing}px spacing`));
  }
  function choice(title: string, detail: string, tokens: Tokens, selected: boolean, choose: () => void) {
    const b=button('',choose);b.className='ms-choice';b.setAttribute('aria-pressed',String(selected));
    const sample=element('span','','ms-choice-sample');sample.setAttribute('aria-hidden','true');sample.style.background=tokens.background;sample.style.color=tokens.text;sample.style.fontFamily=tokens.headingFont;sample.style.gap=`${Math.max(5,tokens.spacing/2)}px`;
    sample.append(element('strong','Your next idea.'));const mini=element('span','Save changes','ms-mini-button');mini.style.background=tokens.accent;mini.style.color=tokens.onAccent;mini.style.borderRadius=`${tokens.radius}px`;sample.append(mini);
    b.append(sample,element('strong',title),element('span',detail));return b;
  }
  function content() {
    const area=$('.ms-content'), restoreFocus=area.contains(ui.dialog.getRootNode() instanceof ShadowRoot ? (ui.dialog.getRootNode() as ShadowRoot).activeElement : document.activeElement);area.replaceChildren();area.setAttribute('aria-label',tab==='build'?'Build your style':tab==='rules'?'Style rules':'Style suggestions');
    for (const b of body.querySelectorAll<HTMLButtonElement>('[data-tab]')) { b.setAttribute('aria-selected',String(b.dataset.tab===tab));b.tabIndex=b.dataset.tab===tab?0:-1; }
    if (tab==='build') build(area); else if (tab==='rules') rules(area); else suggestions(area);
    locks();
    if(restoreFocus)area.focus();
  }
  function build(area: HTMLElement) {
    const steps=element('nav','','ms-steps');steps.setAttribute('aria-label','Style builder steps');
    ['Direction','Details','Fine-tune'].forEach((label,index)=>{const b=button(`${index+1}. ${label}`,()=>{step=index;content();});b.setAttribute('aria-current',step===index?'step':'false');steps.append(b);});area.append(steps);
    if(step<2){
      area.append(element('h3',step===0?'Which feels closer to you?':branchOptions[draft.direction].title));const choices=element('div','','ms-choices');area.append(choices);
      if(step===0){
        for(const [direction,title,detail,branch,patch] of [
          ['quiet','Quiet','Clear groups and a calm reading rhythm.','balanced',{...palette.blue,spacing:16,radius:6,headingFont:'system-ui, sans-serif',headingWeight:700}],
          ['editorial','Editorial','Let type and reading set the pace.','reading',{...palette.warm,spacing:24,radius:2,headingFont:'Georgia, serif',headingWeight:700}],
          ['bold','Expressive','Stronger accents and more presence.','color',{...palette.warm,spacing:20,radius:12,headingFont:'system-ui, sans-serif',headingWeight:800}]
        ] as const){choices.append(choice(title,detail,{...draft.tokens,...patch},draft.direction===direction,()=>{draft.direction=direction;draft.branch=branch;Object.assign(draft.tokens,patch);changed();step=1;content();}));}
      }else for(const [id,title,detail,patch] of branchOptions[draft.direction].options) choices.append(choice(title,detail,{...draft.tokens,...patch},draft.branch===id,()=>{draft.branch=id;Object.assign(draft.tokens,patch);changed();step=2;content();}));
      area.append(element('p','Choose an example to continue. You can change any detail later.','ms-help'));
    }else{
      area.append(element('h3','Make the details yours'));const palettes=element('div','','ms-palette-choices');
      for(const [name,values] of Object.entries(palette)){const b=button(name[0].toUpperCase()+name.slice(1),()=>{Object.assign(draft.tokens,values);changed();content();});const swatches=element('span','','ms-swatches');swatches.setAttribute('aria-hidden','true');for(const color of [values.background,values.text,values.accent]){const swatch=element('i');swatch.style.background=color;swatches.append(swatch);}b.prepend(swatches);palettes.append(b);}area.append(palettes);
      const grid=element('div','','ms-token-grid');area.append(grid);
      for(const [key,label] of Object.entries(colors) as [Colors,string][]){const l=element('label',label);const input=element('input');input.type='color';input.value=draft.tokens[key];input.setAttribute('aria-label',`${label} color`);input.oninput=()=>{draft.tokens[key]=input.value;changed();};l.append(input);grid.append(l);}
      for(const [key,label] of [['bodyFont','Body font'],['headingFont','Heading font']] as const){const l=element('label',label);const input=element('input');input.value=draft.tokens[key];input.maxLength=160;input.oninput=()=>{draft.tokens[key]=input.value;changed();};l.append(input);grid.append(l);}
      area.append(element('p','Use an installed font family or your project’s font name. This preview uses local fallbacks; font files are not exported.','ms-help'));
      const sizes=element('div','','ms-token-grid');area.append(sizes);
      for(const [key,label,min,max,increment] of [['fontSize','Text size',12,24,1],['spacing','Spacing',4,48,1],['radius','Corners',0,32,1],['headingWeight','Heading weight',400,900,100]] as const){const l=element('label',label);const input=element('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(increment);input.value=String(draft.tokens[key]);const output=element('output',`${draft.tokens[key]}${key==='headingWeight'?'':' px'}`);input.oninput=()=>{draft.tokens[key]=Number(input.value);output.textContent=`${input.value}${key==='headingWeight'?'':' px'}`;changed();};l.append(input,output);sizes.append(l);}
      area.append(button('Review my rules',()=>{tab='rules';content();}));
    }
    if(step>0)area.append(button('Back',()=>{step--;content();}));
  }
  function rules(area: HTMLElement) {
    area.append(element('h3','The details you want to repeat'),element('p','Use scoped rules for exceptions, like softer buttons or tighter form fields. These override the base style only where you choose.','ms-help'));
    const list=element('div','','ms-rule-list');area.append(list);
    draft.rules.forEach((rule,index)=>{
      const row=element('div','','ms-rule');const scope=selectOptions(scopes,rule.scope,v=>{rule.scope=v as Scope;changed();});scope.setAttribute('aria-label',`Rule ${index+1} scope`);
      const property=selectOptions(properties,rule.property,v=>{rule.property=v;rule.value=v.includes('color')?'#2147cc':v==='font-family'?'system-ui, sans-serif':v==='font-weight'?'700':v==='line-height'?'1.5':'12px';changed();content();});property.setAttribute('aria-label',`Rule ${index+1} property`);
      const input=element('input');input.value=rule.value;input.maxLength=160;input.setAttribute('aria-label',`Rule ${index+1} value`);input.oninput=()=>{rule.value=input.value;changed();};
      const remove=button('Remove',()=>{draft.rules.splice(index,1);changed();content();});remove.setAttribute('aria-label',`Remove rule ${index+1}`);row.append(scope,property,input,remove);
      if(rule.evidence?.length)row.append(element('small',`Accepted from ${rule.evidence.join(', ')}`));list.append(row);
    });
    const add=button('Add a rule',()=>{draft.rules.push({scope:'buttons',property:'border-radius',value:'12px'});changed();content();});add.dataset.addRule='';area.append(add);
    area.append(element('p','Use px for sizes, #RRGGBB for colors, a numeric weight, or a font family. Keep one rule per property and scope.','ms-help'));
    const label=element('label','Anything else that makes it yours?');const notes=element('textarea');notes.rows=4;notes.maxLength=4000;notes.value=draft.notes;notes.placeholder='For example: keep buttons concise, avoid decorative gradients, and preserve visible focus states.';notes.oninput=()=>{draft.notes=notes.value;changed();};label.append(notes);area.append(label);
  }
  function suggestions(area: HTMLElement) {
    area.append(element('h3','Patterns in your corrections'),element('p','Repeated CSS values from at least three applied changes appear here. A pattern is a suggestion: choose its scope and accept it before it becomes a rule.','ms-help'));
    area.append(button('Refresh suggestions',()=>{void refreshSuggestions();}));
    if(!library.suggestions.length)area.append(element('p','No repeated corrections found yet. Keep refining your project, or add a rule yourself. Only explicit CSS declaration corrections are recognized; chat wording and utility classes are not analyzed.','ms-empty'));
    for(const suggestion of library.suggestions){
      const row=element('article','','ms-suggestion');row.append(element('h4',`${properties[suggestion.property]}: ${suggestion.value}`),element('p',`Seen in ${suggestion.count} applied changes.`));
      const evidence=element('div','','ms-evidence');for(const task of suggestion.evidence)evidence.append(button(task.id,()=>{if(dirty&&!window.confirm('Discard unsaved style choices before opening this change?'))return;ui.dialog.close();onEvidence(task.id);}));row.append(evidence);
      let scope=suggestion.scope;const label=element('label','Where should this become a rule?');label.append(selectOptions(scopes,scope,v=>{scope=v as Scope;}));row.append(label);
      const accepted=draft.rules.some(r=>r.property===suggestion.property && r.value===suggestion.value);
      const accept=button(accepted?'Add in another scope':'Accept rule',()=>{void mutate('accept',{profileId:draft.id,suggestionId:suggestion.id,scope});});accept.dataset.needsSaved='';
      const dismiss=button('Dismiss',()=>{void mutate('dismiss',{suggestionId:suggestion.id});});row.append(accept,dismiss);area.append(row);
    }
    if(library.dismissed.length)area.append(button('Show dismissed suggestions again',()=>{void mutate('reset-dismissed');}));
    area.append(element('p','Accepted rules keep their source change IDs. Undoing a change removes its support from future suggestions; rules you already accepted remain yours to edit or remove.','ms-help'));
  }
  function render() {
    const select=$<HTMLSelectElement>('#ms-profile');select.replaceChildren();
    if(!current()){const o=element('option','New style');o.value=draft.id;select.append(o);}
    for(const p of library.profiles){const o=element('option',`${p.name} · v${p.version}${library.activeId===p.id?' · Default':''}`);o.value=p.id;select.append(o);}select.value=draft.id;
    $<HTMLInputElement>('#ms-name').value=draft.name;$('[data-saved]').textContent=dirty?'Unsaved choices':current()?`Saved locally · v${draft.version}`:'Save to reuse this style';
    $('[data-default-status]').textContent=library.activeId===draft.id?'Included in the context of new changes. Existing conversations keep their recorded version.':'Include this profile in new changes by default, or apply it only when you choose.';
    $('[data-default]').textContent=library.activeId===draft.id?'Stop using by default':'Use for new changes';content();preview();locks();
    for(const b of body.querySelectorAll<HTMLButtonElement>('[data-needs-saved]')) b.disabled=busy || !current() || dirty;
  }
  async function mutate(action: string, extra: Record<string,unknown> = {}) {
    if(busy || !loaded)return;
    busy=true;locks();status('Saving…');
    try{library=await api<Library>('/api/my-style',{method:'POST',body:JSON.stringify({action,revision:library.revision,...extra})});const saved=library.profiles.find(p=>p.id===draft.id);if(saved&&!['dismiss','reset-dismissed'].includes(action)){draft=structuredClone(saved);dirty=false;}render();status('Saved. Existing conversations keep their captured style version.');return true;}
    catch(error){status(errorMessage(error),true);return false;}
    finally{busy=false;locks();for(const b of body.querySelectorAll<HTMLButtonElement>('[data-needs-saved]'))b.disabled=!current()||dirty;}
  }
  async function refreshSuggestions() { if(busy)return;busy=true;locks();try{const next=await api<Library>('/api/my-style');library.suggestions=next.suggestions;library.dismissed=next.dismissed;content();status(next.revision!==library.revision?'Your saved style changed in another window. Reload saved before editing.':'Suggestions refreshed.');}catch(error){status(errorMessage(error),true);}finally{busy=false;locks();} }
  async function load() { busy=true;locks();status('Loading your styles…');try{library=await api<Library>('/api/my-style');loaded=true;draft=structuredClone(library.profiles.find(p=>p.id===draft.id)||library.profiles.find(p=>p.id===library.activeId)||library.profiles[0]||fresh());dirty=false;render();status('');}catch(error){status(errorMessage(error),true);}finally{busy=false;locks();} }
  const close=()=>{if(busy)return;if(dirty&&!window.confirm('Discard unsaved style choices?'))return;ui.dialog.close();};ui.close.onclick=close;ui.dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  $<HTMLInputElement>('#ms-name').oninput=()=>{draft.name=$<HTMLInputElement>('#ms-name').value;changed();};
  $<HTMLSelectElement>('#ms-profile').onchange=()=>{if(dirty&&!window.confirm('Discard unsaved style choices?')){$<HTMLSelectElement>('#ms-profile').value=draft.id;return;}const p=library.profiles.find(p=>p.id===$<HTMLSelectElement>('#ms-profile').value);if(p){draft=structuredClone(p);dirty=false;step=2;render();}};
  $('[data-new]').onclick=()=>{if(dirty&&!window.confirm('Discard unsaved style choices?'))return;draft=fresh();dirty=false;step=0;tab='build';render();};
  for(const b of body.querySelectorAll<HTMLButtonElement>('[data-tab]')){b.onclick=()=>{tab=b.dataset.tab!;content();};b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...body.querySelectorAll<HTMLButtonElement>('[data-tab]')],index=tabs.indexOf(b);const next=tabs[e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];tab=next.dataset.tab!;content();next.focus();};}
  $('[data-save]').onclick=()=>{void mutate('save',{profile:draft});};
  $('[data-reload]').onclick=()=>{if(!dirty||window.confirm('Discard unsaved choices and reload?'))void load();};
  $('[data-default]').onclick=()=>{void mutate(library.activeId===draft.id?'deactivate':'activate',{profileId:draft.id});};
  $('[data-delete]').onclick=async()=>{if(!window.confirm(`Delete “${draft.name}”? Existing task snapshots remain in history.`))return;if(await mutate('delete',{profileId:draft.id})){draft=structuredClone(library.profiles[0]||fresh());dirty=false;step=0;render();}};
  $('[data-export]').onclick=()=>{const p=current()!;download('nudgethis-style.json',JSON.stringify({format:'nudgethis-style',version:1,profile:{name:p.name,direction:p.direction,branch:p.branch,tokens:p.tokens,notes:p.notes,rules:p.rules.map(({scope,property,value})=>({scope,property,value}))}},null,2),'application/json');};
  $('[data-guide]').onclick=()=>download('nudgethis-style.md',library.guides[draft.id]||'','text/markdown');
  $('[data-import]').onclick=()=>$<HTMLInputElement>('[data-file]').click();
  $<HTMLInputElement>('[data-file]').onchange=async()=>{const file=$<HTMLInputElement>('[data-file]').files?.[0];if(!file)return;try{if(file.size>65536)throw new Error('Choose a NudgeThis style JSON file up to 64 KiB.');if(dirty&&!window.confirm('Discard unsaved style choices before importing?'))return;const value=JSON.parse(await file.text());if(value.format!=='nudgethis-style'||value.version!==1||!value.profile||typeof value.profile!=='object')throw new Error('Choose an exported NudgeThis style file.');const id=`style-${crypto.randomUUID()}`;if(await mutate('import',{profile:{...value.profile,id}})){draft=structuredClone(library.profiles.find(p=>p.id===id)!);dirty=false;step=2;render();}}catch(error){status(errorMessage(error),true);}finally{$<HTMLInputElement>('[data-file]').value='';}};
  const scope=()=>{$<HTMLInputElement>('#ms-page').parentElement!.hidden=$<HTMLSelectElement>('#ms-scope').value!=='page';};$<HTMLSelectElement>('#ms-scope').onchange=scope;
  $('[data-apply]').onclick=async()=>{
    const target=$<HTMLSelectElement>('#ms-scope').value,path=$<HTMLInputElement>('#ms-page').value.trim();
    if(target==='element'&&!context){status('Select an element in your page first, or choose a page or project.',true);return;}
    if(target==='page'&&(!path.startsWith('/')||path.startsWith('//')||/[?#\\\s]/.test(path))){status('Enter a page path such as /settings, without a query or fragment.',true);return;}
    if(!await mutate('publish',{profileId:draft.id}))return;
    const area=target==='element'?'the selected element':target==='page'?`the page at ${path}`:'the frontend across this project';
    ui.dialog.close();onApply({request:`Apply my style “${draft.name}” (v${draft.version}) to ${area}. Use the attached style instructions. Preserve functionality and content, reuse the existing design system where possible, and check desktop and mobile layouts. Explain any conflicts before changing them.`,...(target==='element'&&context?{context}:{}),contextIds:[`my-${draft.id}`]});
  };
  $('.ms-example-button').onclick=()=>status('This is a style preview. Use Apply my style to prepare a project change.');$('.ms-example-link').onclick=e=>{e.preventDefault();status('This is an example link in your style preview.');};
  return {async open(selected?: ElementContext){context=selected;$<HTMLOptionElement>('#ms-scope option[value="element"]').disabled=!context;$<HTMLSelectElement>('#ms-scope').value=context?'element':'project';$<HTMLInputElement>('#ms-page').value=context?.route||'';scope();if(!ui.dialog.open)ui.dialog.showModal();await load();},destroy:ui.destroy};
}
