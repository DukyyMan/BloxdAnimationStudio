// Built-in changelog panel. Data lives in changelog-data.js; this module only
// renders it. Open it from the Project menu or the Help dialog.
import {CHANGELOG,CHANGELOG_CATEGORIES} from './changelog-data.js';

const STATUS_LABEL={release:'Release',development:'Development update',current:'Current build','in progress':'In progress'};

function fmtDate(iso){
  if(!iso)return 'Date not recorded';
  const [y,m,d]=iso.split('-').map(Number);
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[m-1]} ${d}, ${y}`;
}

export function initChangelog(){
  const dialog=document.querySelector('#changelog-dialog');
  if(!dialog)return null;
  const list=dialog.querySelector('#changelog-list');
  const search=dialog.querySelector('#changelog-search');
  const chips=dialog.querySelector('#changelog-chips');
  const empty=dialog.querySelector('#changelog-empty');
  let activeCategory='',query='';

  const cats=[...new Set(CHANGELOG.flatMap(e=>e.sections.map(s=>s.category)))];
  const order=c=>CHANGELOG_CATEGORIES.includes(c)?CHANGELOG_CATEGORIES.indexOf(c):99;
  const allCats=[...new Set([...CHANGELOG_CATEGORIES.filter(c=>cats.includes(c)),...cats])];

  for(const c of allCats){
    const b=document.createElement('button');
    b.className='cl-chip';b.textContent=c;b.dataset.category=c;
    b.onclick=()=>{activeCategory=activeCategory===c?'':c;render();};
    chips.append(b);
  }

  function entryMatches(e){
    if(activeCategory&&!e.sections.some(s=>s.category===activeCategory))return false;
    if(!query)return true;
    const hay=[e.version,e.title,fmtDate(e.date),e.note,...e.sections.flatMap(s=>[s.category,...s.items])].join(' ').toLowerCase();
    return query.split(/\s+/).every(w=>hay.includes(w));
  }

  function render(){
    search.parentElement.querySelector('.cl-count')?.remove();
    const matches=CHANGELOG.filter(entryMatches);
    list.replaceChildren();
    empty.hidden=!!matches.length;
    for(const e of matches){
      const article=document.createElement('article');
      article.className='cl-entry'+(e.status==='in progress'?' cl-current':'');
      const head=document.createElement('button');
      head.className='cl-head';
      const sections=e.sections.filter(s=>!activeCategory||s.category===activeCategory);
      head.innerHTML=`<span class="cl-version">v${e.version}</span><span class="cl-title"></span><span class="cl-status st-${e.status}">${STATUS_LABEL[e.status]||e.status}</span><span class="cl-date">${fmtDate(e.date)}</span><span class="cl-toggle">▾</span>`;
      head.querySelector('.cl-title').textContent=e.title;
      const body=document.createElement('div');
      body.className='cl-body';
      if(e.note){const n=document.createElement('p');n.className='cl-note';n.textContent=e.note;body.append(n);}
      for(const s of sections){
        const sec=document.createElement('div');sec.className='cl-section';
        const cat=document.createElement('span');cat.className='cl-cat';cat.textContent=s.category;sec.append(cat);
        const ul=document.createElement('ul');
        for(const item of s.items){const li=document.createElement('li');li.textContent=item;ul.append(li);}
        sec.append(ul);body.append(sec);
      }
      const open=e===CHANGELOG[0]||!!query||!!activeCategory;
      article.classList.toggle('open',open);
      head.onclick=()=>article.classList.toggle('open');
      article.append(head,body);
      list.append(article);
    }
    const total=CHANGELOG.reduce((n,e)=>n+e.sections.reduce((m,s)=>m+s.items.length,0),0);
    const info=document.createElement('span');
    info.className='cl-count';
    info.textContent=matches.length===CHANGELOG.length?`${CHANGELOG.length} updates · ${total} recorded changes`:`${matches.length} of ${CHANGELOG.length} updates match`;
    search.parentElement.append(info);
  }
  search.oninput=()=>{query=search.value.trim().toLowerCase();render();};
  render();
  return {open:()=>dialog.showModal()};
}
