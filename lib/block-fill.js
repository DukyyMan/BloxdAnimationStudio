// Drag-to-fill block placement: grid-snapped rectangular boxes.
//
// A drag starts on a block face (or the ground). The face normal picks the
// fill plane: top/bottom faces fill horizontally (floors, ceilings, platforms),
// side faces fill vertically (walls). `layers` extrudes the rectangle along the
// normal; `raise` lifts the whole box away from the clicked surface (e.g. a
// floating platform). The result is a min/max cell box, clamped to a size limit.

export const FILL_MAX_BLOCKS=4096;
export const FILL_MAX_SIDE=64;
export const FILL_MAX_LAYERS=32;

const AXES=['x','y','z'];
/** Dominant axis of a normal vector ([x,y,z]) and its sign. */
export function normalAxis(n){
  const a=n.map(Math.abs);const i=a[0]>=a[1]&&a[0]>=a[2]?0:a[1]>=a[2]?1:2;
  return{axis:i,sign:n[i]>=0?1:-1};
}
/** Resolve the fill plane from a user choice ('auto' | 'floor' | 'wall-x' | 'wall-z') and the face normal. */
export function resolvePlane(choice,normal){
  const {axis,sign}=normalAxis(normal);
  if(choice==='floor')return{axis:1,sign:axis===1?sign:1};
  if(choice==='wall-x')return{axis:2,sign:axis===2?sign:1}; // wall runs along X; its normal is Z
  if(choice==='wall-z')return{axis:0,sign:axis===0?sign:1}; // wall runs along Z; its normal is X
  return{axis,sign};
}
/**
 * Build the fill box.
 * @param anchor first cell [x,y,z] (the cell that a single click would fill)
 * @param end    cell under the cursor, projected on the plane
 * @param plane  {axis,sign} from resolvePlane
 * @returns {min,max,size,count,trimmed,plane}
 */
export function fillBox(anchor,end,plane,{layers=1,raise=0,maxBlocks=FILL_MAX_BLOCKS,maxSide=FILL_MAX_SIDE}={}){
  layers=Math.max(1,Math.min(FILL_MAX_LAYERS,Math.round(layers)||1));raise=Math.max(-FILL_MAX_LAYERS,Math.min(FILL_MAX_LAYERS,Math.round(raise)||0));
  const min=[0,0,0],max=[0,0,0];let trimmed=false;
  for(let i=0;i<3;i++){
    if(i===plane.axis){
      const base=anchor[i]+plane.sign*raise,far=base+plane.sign*(layers-1);
      min[i]=Math.min(base,far);max[i]=Math.max(base,far);continue;
    }
    let lo=Math.min(anchor[i],end[i]),hi=Math.max(anchor[i],end[i]);
    if(hi-lo+1>maxSide){trimmed=true;if(end[i]>=anchor[i])hi=anchor[i]+maxSide-1,lo=anchor[i];else lo=anchor[i]-maxSide+1,hi=anchor[i];}
    min[i]=lo;max[i]=hi;
  }
  // Total block budget: shrink the in-plane extents (keeping the anchor) until it fits.
  const size=()=>[0,1,2].map(i=>max[i]-min[i]+1);
  let guard=0;
  while(size().reduce((a,b)=>a*b,1)>maxBlocks&&guard++<512){
    trimmed=true;const s=size();
    const i=[0,1,2].filter(j=>j!==plane.axis).sort((a,b)=>s[b]-s[a])[0];
    if(s[i]<=1)break;
    if(end[i]>=anchor[i])max[i]--;else min[i]++;
  }
  const s=size();
  return{min,max,size:s,count:s[0]*s[1]*s[2],trimmed,plane};
}
/** Human-readable dimensions: width × height × depth (x × y × z). */
export function describeBox(box){
  const [x,y,z]=box.size,kind=box.plane.axis===1?(box.plane.sign<0?'Ceiling':'Floor'):'Wall';
  return kind+' · '+x+' × '+y+' × '+z+' · '+box.count.toLocaleString('en-US')+' block'+(box.count===1?'':'s')+(box.trimmed?' · trimmed to limit':'');
}
export function* boxCells(box){
  for(let x=box.min[0];x<=box.max[0];x++)for(let y=box.min[1];y<=box.max[1];y++)for(let z=box.min[2];z<=box.max[2];z++)yield[x,y,z];
}
export const axisName=i=>AXES[i];
