// Rig adapters describe which parts a character rig really has and how to draw
// them in the 2D part diagram. The panel, part selection and gizmos read the
// adapter instead of hard-coding Bob, so another verified skeleton can be added
// by registering an adapter whose part ids match its joint groups.
//
// Only rigs that exist in this studio are registered. No mob adapters are
// included because no authentic Bloxd mob geometry/rig is available locally
// (see MOBS.md); an adapter without real geometry would be a fake.

export const RIG_ADAPTERS={
  bob:{
    id:'bob',label:'Classic player rig',view:[0,0,100,104],
    // Front view: the character's right side is drawn on the viewer's left.
    parts:[
      {id:'head',label:'Head',short:'Head',rect:[37,2,26,24]},
      {id:'body',label:'Torso',short:'Torso',rect:[37,28,26,36]},
      {id:'armR',label:'Right upper arm (shoulder)',short:'R arm',rect:[17,28,19,18]},
      {id:'forearmR',label:'Right forearm (elbow)',short:'R elbow',rect:[17,47,19,17]},
      {id:'armL',label:'Left upper arm (shoulder)',short:'L arm',rect:[64,28,19,18]},
      {id:'forearmL',label:'Left forearm (elbow)',short:'L elbow',rect:[64,47,19,17]},
      {id:'legR',label:'Right thigh (hip)',short:'R hip',rect:[35,65,14.5,18]},
      {id:'shinR',label:'Right shin (knee)',short:'R knee',rect:[35,84,14.5,18]},
      {id:'legL',label:'Left thigh (hip)',short:'L hip',rect:[50.5,65,14.5,18]},
      {id:'shinL',label:'Left shin (knee)',short:'L knee',rect:[50.5,84,14.5,18]},
    ],
  },
};

/** Adapter for a character, listing only parts that exist on its rig. */
export function rigAdapter(c){
  const base=RIG_ADAPTERS[c?.rig||'bob']||RIG_ADAPTERS.bob;
  return{...base,parts:base.parts.filter(p=>c?.joints?.[p.id])};
}

/** Is joint `a` an ancestor of joint `b` in this character's live hierarchy? */
export function isAncestorJoint(c,a,b){
  const target=c.joints[a];for(let o=c.joints[b]?.parent;o&&o!==c.root;o=o.parent)if(o===target)return true;return false;
}
/**
 * Selected parts whose transform should be driven directly: a part whose
 * selected ancestor already moves it is skipped, so group transforms never
 * apply twice down the hierarchy.
 */
export function topLevelParts(c,ids){return ids.filter(id=>c.joints[id]&&!ids.some(other=>other!==id&&isAncestorJoint(c,other,id)));}
