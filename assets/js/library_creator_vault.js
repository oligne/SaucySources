const PROFILE_KEY = 'saucy_current_profile';
const VAULT_PREFIX = 'creatorVault_v1';
function getCurrentProfile(){ return (localStorage.getItem(PROFILE_KEY)||'').trim().toLowerCase(); }
function getStoreKey(){ const p=getCurrentProfile(); return p?`${VAULT_PREFIX}_${p}`:VAULT_PREFIX; }
(function ensureProfile(){ if(!getCurrentProfile()){ window.location.href = 'login.html'; } })();

function loadVault(){ try{const raw=localStorage.getItem(getStoreKey());return raw?JSON.parse(raw):{creators:[],sources:[]};}catch{return {creators:[],sources:[]};} }
function saveVault(v){ localStorage.setItem(getStoreKey(), JSON.stringify(v)); }

const platforms=["youtube","x","substack","linkedin"];
function compositeKey(p,k){ return p+"|"+k.toLowerCase(); }
function platformLabel(p){ if(p==="x")return "X"; if(p==="substack")return "PRESS"; if(p==="linkedin")return "PRESS"; return "YOUTUBE"; }
function mediumWord(p){ if(p==="youtube") return "video"; if(p==="substack") return "article"; return "post"; }

// topic helpers
function normalizeTopic(t){ return (t||'').replace(/^#/, '').trim().toLowerCase(); }
function parseTopicsText(txt){ return [...new Set((txt||'').split(/[\s,;]+/).map(normalizeTopic).filter(Boolean))]; }
function getUserTopics(c, v){ const key=compositeKey(c.platform,c.key); const cc=(v.creators||[]).find(x=>compositeKey(x.platform,x.key)===key); return Array.isArray(cc?.userTopics)? [...cc.userTopics] : []; }
function setUserTopics(c, topics){ const v=loadVault(); const key=compositeKey(c.platform,c.key); const idx=(v.creators||[]).findIndex(x=>compositeKey(x.platform,x.key)===key); if(idx>=0){ v.creators[idx].userTopics=[...new Set(topics.map(normalizeTopic))]; saveVault(v); } }
function addTopicToCreator(c, t){ const v=loadVault(); const key=compositeKey(c.platform,c.key); const idx=(v.creators||[]).findIndex(x=>compositeKey(x.platform,x.key)===key); if(idx>=0){ const cur=new Set((v.creators[idx].userTopics||[]).map(normalizeTopic)); const nt=normalizeTopic(t); if(nt){ cur.add(nt); v.creators[idx].userTopics=[...cur]; saveVault(v); } } }
function removeTopicFromCreator(c, t){ const v=loadVault(); const key=compositeKey(c.platform,c.key); const idx=(v.creators||[]).findIndex(x=>compositeKey(x.platform,x.key)===key); if(idx>=0){ const nt=normalizeTopic(t); v.creators[idx].userTopics=(v.creators[idx].userTopics||[]).filter(x=>normalizeTopic(x)!==nt); saveVault(v); } }

// MODE state: 'media' | 'topic' | 'recent'
let mode='media';
let recentView='latest'; // 'latest' | 'unread'
let platformFilterValue='';
let topicFilterValue='';

function setMode(m){
  mode=m; 
  document.getElementById('byMedia').classList.toggle('active', m==='media');
  document.getElementById('byTopic').classList.toggle('active', m==='topic');
  document.getElementById('byRecent').classList.toggle('active', m==='recent');
  document.getElementById('platformToggle').style.display = (m==='media')? 'inline' : 'none';
  document.getElementById('topicToggle').style.display = (m==='topic')? 'inline' : 'none';
  document.getElementById('recentToggle').style.display = (m==='recent')? 'inline' : 'none';
  if(m==='topic') populateTopicToggle();
  renderPlatformToggle();
  render();
}

function renderPlatformToggle(){
  const host=document.getElementById('platformToggle'); if(!host) return;
  if(mode!=='media'){ host.innerHTML=''; return; }
  const items=[
    {v:'', label:'all'},
    {v:'youtube', label:'youtube'},
    {v:'x', label:'twitter'},
    {v:'substack', label:'press'},
    {v:'linkedin', label:'substack'}
  ];
  host.innerHTML='';
  items.forEach(({v,label})=>{
    const a=document.createElement('a'); a.href='#'; a.dataset.val=v; a.textContent=label; if(platformFilterValue===v) a.classList.add('active');
    a.addEventListener('click', (e)=>{ e.preventDefault(); platformFilterValue=v; renderPlatformToggle(); render(); });
    host.appendChild(a);
  });
}

function populateTopicToggle(){
  const host=document.getElementById('topicToggle'); if(!host) return;
  const v=loadVault();
  const tags=new Set();
  for(const c of (v.creators||[])){
    for(const t of (c.userTopics||[])) tags.add(normalizeTopic(t));
  }
  const items=['', ...[...tags].sort()];
  host.innerHTML='';
  items.forEach((t)=>{
    const a=document.createElement('a'); a.href='#'; a.dataset.val=t; a.textContent= t? ('#'+t) : 'all'; if(topicFilterValue===t) a.classList.add('active');
    a.addEventListener('click', (e)=>{ e.preventDefault(); topicFilterValue=t; populateTopicToggle(); render(); });
    host.appendChild(a);
  });
}

function filterCreators(creators){
  const q=(document.getElementById('search').value||'').trim().toLowerCase();
  return creators.filter(c=>{
    const matchText=!q || (c.displayName||'').toLowerCase().includes(q) || (c.key||'').toLowerCase().includes(q) || (c.profileURL||'').toLowerCase().includes(q);
    const matchPlat= mode!=='media' || !platformFilterValue || c.platform===platformFilterValue;
    let matchTopic=true;
    if(mode==='topic' && topicFilterValue){
      const v=loadVault();
      const hasFromUser=(getUserTopics(c,v)||[]).map(normalizeTopic).includes(topicFilterValue);
      matchTopic = !!hasFromUser;
    }
    return matchText && matchPlat && matchTopic;
  });
}

function humanMonth(n){return ["January","February","March","April","May","June","July","August","September","October","November","December"][n]}
function dayOrdinal(d){const j=d%10,k=d%100; if(j==1&&k!=11) return 'st'; if(j==2&&k!=12) return 'nd'; if(j==3&&k!=13) return 'rd'; return 'th'; }
function humanDate(iso){ const dt=new Date(iso||Date.now()); const m=humanMonth(dt.getMonth()); const d=dt.getDate(); return `${m}, ${d}${dayOrdinal(d)}`; }

function extractTopicFromUrl(u){
  try{
    const url = new URL(u);
    const hashTopic = url.hash && url.hash.slice(1);
    if(hashTopic) return hashTopic;
    const lastSeg = url.pathname.split('/').filter(Boolean).pop()||'';
    const guess = lastSeg.replace(/[-_]/g,' ').trim();
    if(guess && guess.length>2) return guess;
  }catch{}
  return null;
}

// Utils for source id (in case of legacy entries without id)
function genSrcId(){ return 'src_'+Math.random().toString(36).slice(2)+Date.now().toString(36); }
function toggleSourceReadByObject(src){
  const v=loadVault();
  let target=null;
  if(src.id){ target=(v.sources||[]).find(x=>x.id===src.id); }
  if(!target){
    target=(v.sources||[]).find(x=> x.creatorCompositeKey===src.creatorCompositeKey && x.originalURL===src.originalURL && x.addedAt===src.addedAt);
  }
  if(target){
    if(!target.id) target.id=genSrcId();
    target.read = !target.read;
    target.updatedAt=new Date().toISOString();
    saveVault(v);
  }
}

function render(){
  const v=loadVault();
  const items=[...v.creators];
  const filtered=filterCreators(items);
  const groupedEl=document.getElementById('grouped');
  const listEl=document.getElementById('list');
  groupedEl.innerHTML=''; listEl.innerHTML='';

  if(mode==='media'){
    const groups={}; for(const p of platforms) groups[p]=[];
    for(const c of filtered){ groups[c.platform]?.push(c); }
    const platformsToShow = platformFilterValue ? [platformFilterValue] : platforms;
    for(const p of platformsToShow){
      const arr=groups[p]||[]; if(arr.length===0) continue; // skip empty
      const section=document.createElement('section'); section.className='section';
      const pill=document.createElement('div'); pill.className='label-pill media-pill'; pill.textContent=platformLabel(p); section.appendChild(pill);
      const stack=document.createElement('div'); stack.className='stack';
      for(const c of arr){ stack.appendChild(renderCreatorCard(c, v)); }
      section.appendChild(stack);
      groupedEl.appendChild(section);
    }
  }
  else if(mode==='topic'){
    const topicsMap={};
    for(const c of filtered){
      const userTs = (getUserTopics(c, v)||[]).map(normalizeTopic);
      if(userTs.length===0) (topicsMap['misc'] ||= []).push(c);
      else for(const t of userTs){ (topicsMap[t] ||= []).push(c); }
    }
    const topics=Object.keys(topicsMap).sort();
    for(const t of topics){
      const section=document.createElement('section'); section.className='section';
      const pill=document.createElement('div'); pill.className='label-pill topic-pill'; pill.textContent = `#${t}`; section.appendChild(pill);
      const stack=document.createElement('div'); stack.className='stack';
      for(const c of topicsMap[t]) stack.appendChild(renderCreatorCard(c, v, t));
      section.appendChild(stack); groupedEl.appendChild(section);
    }
  }
  else {
    const vAll=loadVault();
    const listWithActivity = filtered.map(c=>{
      const key=compositeKey(c.platform,c.key);
      const srcs=(vAll.sources||[]).filter(s=>s.creatorCompositeKey===key);
      const lastAt = srcs.length ? Math.max(...srcs.map(s=> new Date(s.addedAt||0).getTime())) : new Date(c.createdAt||0).getTime();
      const unread = srcs.filter(s=>!s.read).length;
      return { c, lastAt, unread };
    });
    let list=[];
    if(recentView==='latest'){
      list = listWithActivity.sort((a,b)=> b.lastAt - a.lastAt).map(x=>x.c);
    }else{
      list = listWithActivity.filter(x=>x.unread>0).map(x=>x.c);
    }
    for(const c of list){ listEl.appendChild(renderCreatorCard(c, v)); }
    listEl.style.display='grid';
    groupedEl.style.display='none';
    return;
  }
  groupedEl.style.display='block';
  listEl.style.display='none';
}

// Mark a source read/unread (scaffold for future per-source UI)
function setSourceRead(sourceId, read){ const v=loadVault(); const s=(v.sources||[]).find(x=>x.id===sourceId); if(s){ s.read=!!read; s.updatedAt=new Date().toISOString(); saveVault(v); }}
function getUnreadCountForCreator(c){ const v=loadVault(); const key=compositeKey(c.platform,c.key); return (v.sources||[]).filter(s=>s.creatorCompositeKey===key && !s.read).length; }

function placeCaretAtEnd(el){ try{ const r=document.createRange(); r.selectNodeContents(el); r.collapse(false); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);}catch{} }

function renderCreatorCard(c, v, topicHint){
  const card=document.createElement('div'); card.className='creator';
  const count=document.createElement('div'); count.className='new-count'; count.textContent=`(${getUnreadCountForCreator(c)})`; card.appendChild(count);
  const body=document.createElement('div');
  const t=document.createElement('div'); t.className='title';
  const a=document.createElement('a'); a.href=c.profileURL; a.target='_blank'; a.rel='noopener'; a.textContent=(c.displayName||c.key).toUpperCase(); a.className='creator-link';
  t.appendChild(a); body.appendChild(t);

  const key=compositeKey(c.platform,c.key);
  const recent=(v.sources||[]).filter(s=>s.creatorCompositeKey===key).sort((a,b)=> new Date(b.addedAt||0) - new Date(a.addedAt||0)).slice(0,2);
  recent.forEach(s=>{
    const row=document.createElement('div'); row.className='sub';
    const date=document.createElement('span'); date.textContent=humanDate(s.addedAt)+"  "; row.appendChild(date);
    const about=document.createElement('span'); about.textContent='…'; row.appendChild(about);
    const sep=document.createElement('span'); sep.textContent='  '; row.appendChild(sep);
    const mark=document.createElement('a'); mark.href='#'; mark.className='mark'; mark.textContent= s.read? 'mark unread' : 'mark read';
    mark.addEventListener('click',(e)=>{ e.preventDefault(); toggleSourceReadByObject(s); render(); });
    row.appendChild(mark);
    body.appendChild(row);
  });

  const topicRow=document.createElement('div'); topicRow.className='topic-row';
  const topics=getUserTopics(c, v);
  topics.forEach(tp=>{
    const chip=document.createElement('span'); chip.className='topic-chip'; chip.textContent='#'+tp;
    const x=document.createElement('a'); x.href='#'; x.className='x'; x.setAttribute('aria-label','Remove'); x.textContent='×';
    x.addEventListener('click',(e)=>{ e.preventDefault(); removeTopicFromCreator(c, tp); if(mode==='topic') populateTopicToggle(); render(); });
    chip.appendChild(x); topicRow.appendChild(chip);
  });
  const add=document.createElement('a'); add.href='#'; add.className='topic-add'; add.textContent='+ topic';
  add.addEventListener('click',(e)=>{ e.preventDefault(); add.style.display='none'; input.style.display='inline-block'; input.focus(); });
  const input=document.createElement('input'); input.type='text'; input.className='topic-input'; input.placeholder='topic'; input.style.display='none';
  input.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ const t=normalizeTopic(input.value); if(t){ addTopicToCreator(c,t); input.value=''; add.style.display='inline'; input.style.display='none'; if(mode==='topic') populateTopicToggle(); render(); } e.preventDefault(); } else if(e.key==='Escape'){ add.style.display='inline'; input.style.display='none'; }});
  input.addEventListener('blur',()=>{ const t=normalizeTopic(input.value); if(t){ addTopicToCreator(c,t); } input.value=''; add.style.display='inline'; input.style.display='none'; if(mode==='topic') populateTopicToggle(); render(); });
  topicRow.appendChild(add); topicRow.appendChild(input);
  body.appendChild(topicRow);

  card.appendChild(body);
  const del=document.createElement('a'); del.href='#'; del.className='del'; del.title='Delete'; del.textContent='🗑';
  del.addEventListener('click',(e)=>{ e.preventDefault(); removeCreator(compositeKey(c.platform,c.key)); });
  card.appendChild(del);
  return card;
}

// Real-time refresh across tabs/windows
window.addEventListener('storage', (e)=>{ try{ if(e.key && e.key.startsWith(getStoreKey())){ if(mode==='topic') populateTopicToggle(); render(); } }catch{} });

// Wire UI
['byMedia','byTopic','byRecent'].forEach(id=>document.getElementById(id).addEventListener('click',e=>{e.preventDefault(); setMode(id==='byMedia'?'media':id==='byTopic'?'topic':'recent');}));
document.getElementById('search').addEventListener('input', render);

document.getElementById('recentToggle').addEventListener('click', (e)=>{
  if(e.target.tagName==='A'){
    e.preventDefault();
    recentView=e.target.dataset.val;
    [...e.currentTarget.querySelectorAll('a')].forEach(a=>a.classList.toggle('active', a.dataset.val===recentView));
    render();
  }
});

// init
setMode('media');
