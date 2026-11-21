// Centralized, configurable keyboard shortcuts.
//
// Every keyboard action in the editor is declared once here: its label, group,
// context and default bindings. The editor asks the manager which action a key
// event maps to in the contexts that are currently active, so the settings UI,
// conflict detection and persistence all share one source of truth.
//
// Contexts:
//   global     — always active (undo, save …)
//   editor     — normal editing (tool keys, Space action …)
//   navigation — fly/navigation mode; overrides editor keys while it is on
//   placing    — a ghost placement preview is following the cursor
// Two bindings conflict when they use the same combo in the same context, or
// when either one is global. Navigation/placing deliberately shadow editor keys
// (e.g. W moves forward while flying, but selects the Move tool otherwise).

export const CONTEXT_LABELS={global:'Everywhere',editor:'Editing',navigation:'Navigation mode',placing:'While placing'};

export const SHORTCUT_ACTIONS=[
  // Camera & navigation
  {id:'nav.toggle',label:'Toggle navigation (fly) mode',group:'Camera',context:'global',defaults:['N']},
  {id:'nav.forward',label:'Fly forward',group:'Camera',context:'navigation',hold:true,defaults:['W']},
  {id:'nav.back',label:'Fly backward',group:'Camera',context:'navigation',hold:true,defaults:['S']},
  {id:'nav.left',label:'Fly left',group:'Camera',context:'navigation',hold:true,defaults:['A']},
  {id:'nav.right',label:'Fly right',group:'Camera',context:'navigation',hold:true,defaults:['D']},
  {id:'nav.up',label:'Fly up',group:'Camera',context:'navigation',hold:true,defaults:['Space','E']},
  {id:'nav.down',label:'Fly down',group:'Camera',context:'navigation',hold:true,defaults:['Q','C']},
  {id:'nav.fast',label:'Fly faster (hold)',group:'Camera',context:'navigation',hold:true,defaults:['Shift']},
  {id:'camera.focus',label:'Focus selection',group:'Camera',context:'editor',defaults:['F']},
  {id:'camera.focusAnimation',label:'Focus animation camera',group:'Camera',context:'editor',defaults:['Shift+F']},
  {id:'camera.key',label:'Add camera key',group:'Camera',context:'editor',defaults:['Shift+K']},
  {id:'view.clean',label:'Clean view',group:'Camera',context:'editor',defaults:['H']},
  // Animation
  {id:'anim.key',label:'Add keyframe for selection',group:'Animation',context:'editor',defaults:['Space','K']},
  {id:'anim.play',label:'Play / pause',group:'Animation',context:'editor',defaults:['P']},
  {id:'anim.start',label:'Go to start',group:'Animation',context:'editor',defaults:['Home']},
  {id:'anim.end',label:'Go to end',group:'Animation',context:'editor',defaults:['End']},
  // Editing
  {id:'edit.undo',label:'Undo',group:'Editing',context:'global',defaults:['Ctrl+Z']},
  {id:'edit.redo',label:'Redo',group:'Editing',context:'global',defaults:['Ctrl+Shift+Z','Ctrl+Y']},
  {id:'edit.save',label:'Save project',group:'Editing',context:'global',defaults:['Ctrl+S']},
  {id:'edit.copy',label:'Copy selected keys',group:'Editing',context:'editor',defaults:['Ctrl+C']},
  {id:'edit.paste',label:'Paste keys at playhead',group:'Editing',context:'editor',defaults:['Ctrl+V']},
  {id:'edit.duplicate',label:'Duplicate keys / object',group:'Editing',context:'editor',defaults:['Ctrl+D']},
  {id:'edit.selectAll',label:'Select all keys in track',group:'Editing',context:'editor',defaults:['Ctrl+A']},
  {id:'edit.selectAllObjects',label:'Select all scene objects',group:'Editing',context:'editor',defaults:['Ctrl+Shift+A']},
  {id:'edit.delete',label:'Delete selected keys / object',group:'Editing',context:'editor',defaults:['Delete','Backspace']},
  {id:'edit.cancel',label:'Cancel / clear selection',group:'Editing',context:'global',defaults:['Escape']},
  {id:'edit.confirm',label:'Confirm path / chain',group:'Editing',context:'editor',defaults:['Enter']},
  {id:'edit.search',label:'Search the library',group:'Editing',context:'editor',defaults:['/']},
  // Tools & transforms
  {id:'tool.select',label:'Select tool',group:'Tools & transforms',context:'editor',defaults:['V']},
  {id:'tool.move',label:'Move gizmo',group:'Tools & transforms',context:'editor',defaults:['W']},
  {id:'tool.rotate',label:'Rotate gizmo',group:'Tools & transforms',context:'editor',defaults:['E']},
  {id:'tool.scale',label:'Scale gizmo',group:'Tools & transforms',context:'editor',defaults:['R']},
  {id:'tool.build',label:'Place blocks',group:'Tools & transforms',context:'editor',defaults:['B']},
  {id:'tool.erase',label:'Remove blocks',group:'Tools & transforms',context:'editor',defaults:['X']},
  {id:'tool.fill',label:'Toggle drag-fill blocks',group:'Tools & transforms',context:'editor',defaults:['G']},
  {id:'tool.zone',label:'Cinematic build zone',group:'Tools & transforms',context:'editor',defaults:['Z']},
  {id:'tool.terrain',label:'Terrain brush',group:'Tools & transforms',context:'editor',defaults:['T']},
  {id:'parts.all',label:'Select all body parts',group:'Tools & transforms',context:'editor',defaults:['Alt+A']},
  {id:'parts.detach',label:'Detach / reattach selected parts',group:'Tools & transforms',context:'editor',defaults:[]},
  {id:'place.rotate',label:'Rotate placement preview',group:'Tools & transforms',context:'placing',defaults:['R']},
];

const MODIFIERS=['Ctrl','Alt','Shift'];
const CODE_NAMES={Space:'Space',Escape:'Escape',Enter:'Enter',NumpadEnter:'Enter',Tab:'Tab',Backspace:'Backspace',Delete:'Delete',Insert:'Insert',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown',
  ArrowUp:'ArrowUp',ArrowDown:'ArrowDown',ArrowLeft:'ArrowLeft',ArrowRight:'ArrowRight',Slash:'/',Backslash:'\\',Comma:',',Period:'.',Semicolon:';',Quote:"'",Backquote:'`',BracketLeft:'[',BracketRight:']',Minus:'-',Equal:'=',
  ShiftLeft:'Shift',ShiftRight:'Shift',ControlLeft:'Ctrl',ControlRight:'Ctrl',AltLeft:'Alt',AltRight:'Alt',MetaLeft:'Ctrl',MetaRight:'Ctrl'};
const KEY_NAMES={' ':'Space',Esc:'Escape',Del:'Delete',Control:'Ctrl',Meta:'Ctrl',OS:'Ctrl'};

/** Base key name of an event (layout-independent where possible). */
export function keyName(e){
  const code=e.code||'';
  if(/^Key[A-Z]$/.test(code))return code.slice(3);
  if(/^Digit\d$/.test(code))return code.slice(5);
  if(/^Numpad\d$/.test(code))return 'Num'+code.slice(6);
  if(/^F\d{1,2}$/.test(code))return code;
  if(CODE_NAMES[code])return CODE_NAMES[code];
  const k=e.key||'';
  if(KEY_NAMES[k])return KEY_NAMES[k];
  if(k.length===1)return k.toUpperCase();
  return k;
}
export const isModifierName=name=>MODIFIERS.includes(name);

/** Normalized combo string for a key event, e.g. "Ctrl+Shift+Z" or "Shift". */
export function comboFromEvent(e){
  const key=keyName(e);
  if(isModifierName(key))return key;
  const mods=[];if(e.ctrlKey||e.metaKey)mods.push('Ctrl');if(e.altKey)mods.push('Alt');if(e.shiftKey)mods.push('Shift');
  return [...mods,key].join('+');
}
/** Normalize user/stored combo text into canonical order. Returns '' when invalid. */
export function normalizeCombo(text){
  if(typeof text!=='string')return '';
  const parts=text.split('+').map(s=>s.trim()).filter(Boolean);
  if(!parts.length)return '';
  // "Ctrl++" style is not supported; a trailing '+' key is spelled "=" on most layouts.
  const alias={control:'Ctrl',ctrl:'Ctrl',cmd:'Ctrl',meta:'Ctrl',command:'Ctrl',alt:'Alt',option:'Alt',shift:'Shift',space:'Space',esc:'Escape',escape:'Escape',del:'Delete',delete:'Delete',enter:'Enter',return:'Enter',backspace:'Backspace'};
  const named=parts.map(p=>alias[p.toLowerCase()]||(p.length===1?p.toUpperCase():p[0].toUpperCase()+p.slice(1)));
  const mods=MODIFIERS.filter(m=>named.includes(m)),keys=named.filter(p=>!MODIFIERS.includes(p));
  if(keys.length>1)return '';
  if(!keys.length)return mods.length===1?mods[0]:'';
  return [...mods,keys[0]].join('+');
}
/** Display label, e.g. "Ctrl+Shift+Z" → "Ctrl + Shift + Z". */
export const comboLabel=combo=>combo.split('+').join(' + ');
/** The non-modifier key of a combo ("Ctrl+Z" → "Z", "Shift" → "Shift"). */
export function comboBase(combo){const parts=combo.split('+');return parts[parts.length-1];}

export function contextsOverlap(a,b){return a===b||a==='global'||b==='global';}

export class ShortcutManager{
  constructor({actions=SHORTCUT_ACTIONS,storage=null,storageKey='studioShortcutsV1'}={}){
    this.actions=actions;this.byId=new Map(actions.map(a=>[a.id,a]));this.storage=storage;this.storageKey=storageKey;
    this.bindings=new Map();this.listeners=new Set();this.resetAll(false);this.load();
  }
  defaults(id){return(this.byId.get(id)?.defaults||[]).slice();}
  get(id){return(this.bindings.get(id)||[]).slice();}
  resetAll(save=true){this.bindings.clear();for(const a of this.actions)this.bindings.set(a.id,a.defaults.map(normalizeCombo).filter(Boolean));if(save)this.save();this.emit();}
  resetAction(id,save=true){if(!this.byId.has(id))return;this.bindings.set(id,this.defaults(id).map(normalizeCombo).filter(Boolean));if(save)this.save();this.emit();}
  /** Actions (other than `id`) that already use `combo` in an overlapping context. */
  conflicts(id,combo){
    const action=this.byId.get(id),c=normalizeCombo(combo);if(!action||!c)return[];
    const out=[];for(const other of this.actions){if(other.id===id)continue;if(!contextsOverlap(action.context,other.context))continue;if(this.get(other.id).includes(c))out.push(other);}
    return out;
  }
  /** Validate a combo for an action. Returns an error string or ''. */
  validate(id,combo){
    const action=this.byId.get(id),c=normalizeCombo(combo);
    if(!action)return 'Unknown action.';
    if(!c)return 'That key cannot be used as a shortcut.';
    if(isModifierName(c)&&!action.hold)return 'A modifier key on its own can only be used for hold actions such as Fly faster.';
    if(action.hold&&c.includes('+'))return 'Hold actions use a single key (modifiers are ignored while flying).';
    if(['Ctrl+W','Ctrl+T','Ctrl+N','Ctrl+Shift+W','Ctrl+Shift+T','Ctrl+Shift+N','Ctrl+Tab','Alt+F4'].includes(c))return c+' is reserved by the browser and cannot be captured.';
    return '';
  }
  /**
   * Add (or replace) a binding. With replace=true, conflicting actions lose that
   * combo; without it a conflict leaves everything unchanged and is reported.
   */
  bind(id,combo,{replace=false,previous=null}={}){
    const error=this.validate(id,combo);if(error)return{ok:false,error,conflicts:[]};
    const c=normalizeCombo(combo),conflicts=this.conflicts(id,c);
    if(conflicts.length&&!replace)return{ok:false,error:'',conflicts};
    for(const other of conflicts)this.bindings.set(other.id,this.get(other.id).filter(x=>x!==c));
    let list=this.get(id).filter(x=>x!==c);
    const prevIndex=previous?list.indexOf(normalizeCombo(previous)):-1;
    if(prevIndex>=0)list.splice(prevIndex,1,c);else list.push(c);
    this.bindings.set(id,list);this.save();this.emit();return{ok:true,error:'',conflicts};
  }
  unbind(id,combo){const c=normalizeCombo(combo);this.bindings.set(id,this.get(id).filter(x=>x!==c));this.save();this.emit();}
  /** First action bound to `combo` in the given ordered contexts (earlier contexts win). */
  actionFor(combo,contexts){
    for(const ctx of contexts)for(const a of this.actions)if(a.context===ctx&&!a.hold&&this.get(a.id).includes(combo))return a.id;
    return null;
  }
  /** Map a keydown event to an action id for the active contexts (non-hold actions). */
  match(e,contexts){return this.actionFor(comboFromEvent(e),contexts);}
  /** Hold actions whose key matches this event's base key, ignoring modifiers. */
  holdActionsFor(e,context='navigation'){
    const key=keyName(e);const out=[];
    for(const a of this.actions)if(a.hold&&a.context===context&&this.get(a.id).some(c=>comboBase(c)===key))out.push(a.id);
    return out;
  }
  /** Label of the first binding of an action, for hints and tooltips. */
  label(id){const b=this.get(id)[0];return b?comboLabel(b):'unassigned';}
  serialize(){
    const changed={};for(const a of this.actions){const now=this.get(a.id),def=a.defaults.map(normalizeCombo);if(JSON.stringify(now)!==JSON.stringify(def))changed[a.id]=now;}
    return{version:1,bindings:changed};
  }
  load(){
    if(!this.storage)return;let data=null;
    try{const raw=this.storage.getItem(this.storageKey);if(raw)data=JSON.parse(raw);}catch(e){data=null;}
    if(!data||data.version!==1||typeof data.bindings!=='object'||!data.bindings)return;
    for(const[id,list]of Object.entries(data.bindings)){
      if(!this.byId.has(id)||!Array.isArray(list))continue;
      const clean=[...new Set(list.slice(0,6).map(normalizeCombo).filter(c=>c&&!this.validate(id,c)))];
      this.bindings.set(id,clean);
    }
    // Stored data can never introduce conflicts: drop later duplicates.
    for(const a of this.actions)for(const c of this.get(a.id))for(const other of this.conflicts(a.id,c))if(this.actions.indexOf(other)>this.actions.indexOf(a))this.bindings.set(other.id,this.get(other.id).filter(x=>x!==c));
  }
  save(){if(!this.storage)return;try{this.storage.setItem(this.storageKey,JSON.stringify(this.serialize()));}catch(e){}}
  onChange(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  emit(){for(const fn of this.listeners)try{fn();}catch(e){}}
}

/** True when keyboard events should go to a text control instead of the editor. */
export function isTypingTarget(el){
  if(!el)return false;
  if(el.isContentEditable)return true;
  const tag=el.tagName;
  if(tag==='TEXTAREA'||tag==='SELECT')return true;
  if(tag==='INPUT')return true;
  return false;
}
