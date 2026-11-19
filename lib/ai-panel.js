// Local JSON command-plan editor. The scene compiler remains shared with Code Studio.
import { COMMAND_HELP, OFFLINE_PLAN, compilePlan, makeSceneContext } from './ai-commands.js';
export function initCommandPanel(bridge){
 const $=s=>document.querySelector(s),dialog=$('#ai-dialog');let compiled=null,origin='',lastUndo=null,failedIndex=null,workingPlan=null,skipped=[];
 const status=(message,error=false)=>{const el=$('#ai-status');el.textContent=message;el.classList.toggle('error',error);};
 const invalidate=()=>{compiled=null;$('#ai-apply').disabled=true;};
 function validate(plan=null){invalidate();failedIndex=null;$('#ai-error-actions').hidden=true;try{
  const snapshot=bridge.snapshot();
  if(!plan)skipped=[];workingPlan=plan||JSON.parse($('#ai-json').value);
  compiled=compilePlan(workingPlan,snapshot,bridge.catalog,$('#ai-mode').value);origin=JSON.stringify(snapshot);
  $('#ai-result').hidden=false;$('#ai-plan-title').textContent=compiled.title;$('#ai-plan-summary').textContent=compiled.summary;
  const list=$('#ai-command-list');list.replaceChildren();for(const line of compiled.log){const li=document.createElement('li');li.textContent=line;list.append(li);}
  $('#ai-warnings').textContent=[...skipped,...compiled.warnings].join(' ');$('#ai-warnings').hidden=!skipped.length&&!compiled.warnings.length;
  const destructive=compiled.warnings.some(w=>/replaces|removes|clears/i.test(w));$('#ai-ack-row').hidden=!destructive;$('#ai-ack').checked=false;
  $('#ai-apply').disabled=destructive||!compiled.stats.commands;status('Validated. Review the changes before applying.');
 }catch(e){status(e.message,true);const match=/^Command (\d+) \(([^)]*)\):/.exec(e.message);if(match&&workingPlan&&Array.isArray(workingPlan.commands)){failedIndex=+match[1]-1;$('#ai-error-actions').hidden=false;$('#ai-error-details').textContent=e.message+'\n'+JSON.stringify(workingPlan.commands[failedIndex],null,2);}}}
 $('#ai-skip').onclick=()=>{if(failedIndex===null)return;const rejected=workingPlan.commands[failedIndex];skipped.push('Skipped command '+(failedIndex+1)+' ('+(rejected?.op||'?')+').');const commands=workingPlan.commands.filter((_,i)=>i!==failedIndex);validate({...workingPlan,commands});};
 $('#ai-keep-prefix').onclick=()=>{if(failedIndex===null)return;skipped.push('Only the '+failedIndex+' commands before the failure are included.');validate({...workingPlan,commands:workingPlan.commands.slice(0,failedIndex)});};
 $('#ai-stop').onclick=()=>{invalidate();failedIndex=null;$('#ai-error-actions').hidden=true;status('Stopped. No scene changes were applied.');};
 $('#open-ai').onclick=()=>{if(bridge.prepare()){invalidate();dialog.showModal();}};
 $('#ai-example').onclick=()=>{$('#ai-json').value=JSON.stringify(OFFLINE_PLAN,null,2);$('#ai-mode').value='edit';validate();};
 $('#ai-validate').onclick=()=>validate();
 $('#ai-json').oninput=()=>{failedIndex=null;$('#ai-error-actions').hidden=true;invalidate();status('Plan changed. Validate again.');};
 $('#ai-mode').onchange=()=>{invalidate();status('Mode changed. Validate again.');};
 $('#ai-ack').onchange=()=>{$('#ai-apply').disabled=!compiled||!$('#ai-ack').checked;};
 $('#ai-apply').onclick=()=>{if(!compiled)return;try{lastUndo=bridge.apply(compiled,origin,'Command plan');invalidate();dialog.close();if($('#ai-play-after').checked)bridge.play();}catch(e){invalidate();status(e.message,true);}};
 $('#ai-undo').onclick=()=>{if(lastUndo&&bridge.canUndo(lastUndo)){bridge.undo();lastUndo=null;invalidate();status('Command plan undone.');}};
 const help=$('#ai-command-help');for(const [name,description] of COMMAND_HELP){const p=document.createElement('p');p.textContent=name+' — '+description;help.append(p);}
 return {open:()=>$('#open-ai').click(),compile:(plan,mode='edit')=>compilePlan(plan,bridge.snapshot(),bridge.catalog,mode),context:()=>makeSceneContext(bridge.snapshot(),bridge.catalog)};
}
