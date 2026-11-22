// Bob appearance customization. Options are limited to appearance data that is
// actually available in this studio: the verified built-in skin tints from the
// official Code API snapshot, the studio's armor sets, and custom skin PNGs the
// user provides. Nothing here invents an official Bloxd cosmetic.
//
// An appearance of null (or every value unset) leaves Bob exactly at his
// default look — the existing classic skin, tinted white.
import { ARMOR_SETS, ARMOR_SLOTS, armorSpec, wearArmor } from './armor.js';

// Same values the Code Editor path has always used for `skin` tints
// (see restoreAIScene in app.js) — one shared source of truth now.
export const SKIN_TINTS={
  default:{label:'Classic Bob (default)',color:0xffffff},
  ember:{label:'Ember',color:0xff9a5a},
  frost:{label:'Frost',color:0x7fd4ff},
  moss:{label:'Moss',color:0x8fd17a},
};
export function tintHex(id){return SKIN_TINTS[id]?.color??SKIN_TINTS.default.color;}

/** Normalize untrusted appearance input; null/undefined → null (default look). */
export function normalizeAppearance(input){
  if(!input||typeof input!=='object')return null;
  const out={};
  if(typeof input.tint==='string'&&SKIN_TINTS[input.tint])out.tint=input.tint;
  const armor=armorSpec(input.armor);
  if(ARMOR_SLOTS.some(s=>armor[s]))out.armor=armor;
  if(typeof input.skin==='string'&&input.skin.startsWith('data:image/')&&input.skin.length<12e6)out.skin=input.skin;
  return Object.keys(out).length?out:null;
}
export function appearanceSummary(appearance){
  const a=normalizeAppearance(appearance);
  if(!a)return 'Default appearance';
  const parts=[];
  if(a.tint&&a.tint!=='default')parts.push(SKIN_TINTS[a.tint].label+' tint');
  const worn=ARMOR_SLOTS.filter(s=>a.armor?.[s]);
  if(worn.length)parts.push(worn.map(s=>ARMOR_SETS[a.armor[s]].label+' '+({helmet:'helmet',chestplate:'chestplate',leggings:'leggings',boots:'boots'})[s]).join(', '));
  if(a.skin)parts.push('Custom skin PNG');
  return parts.length?parts.join(' · '):'Default appearance';
}
/**
 * Apply an appearance to a live character. With null/empty input this restores
 * the default: white tint, no armor. A custom skin PNG is handled by the
 * caller (it is async) — normalizeAppearance validates it, `skinData` is set there.
 */
export function applyAppearance(c,appearance){
  if(!c)return null;
  const a=normalizeAppearance(appearance);
  c.material.color.setHex(tintHex(a?.tint));
  if(a&&a.armor)wearArmor(c,a.armor);
  return a;
}
