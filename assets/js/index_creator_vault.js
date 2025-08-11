// Use a profile-specific storage key and redirect to login if not set
const PROFILE_KEY = "saucy_current_profile";
const VAULT_PREFIX = "creatorVault_v1";
function getCurrentProfile(){ return (localStorage.getItem(PROFILE_KEY)||"").trim().toLowerCase(); }
function getStoreKey(){ const p=getCurrentProfile(); return p?`${VAULT_PREFIX}_${p}`:VAULT_PREFIX; }
(function ensureProfile(){ if(!getCurrentProfile()){ window.location.href = "login.html"; } })();

function loadVault(){ try{const raw=localStorage.getItem(getStoreKey());return raw?JSON.parse(raw):{creators:[],sources:[]};}catch{return {creators:[],sources:[]};} }
function saveVault(v){ localStorage.setItem(getStoreKey(), JSON.stringify(v)); }

function showError(msg){ const e=document.getElementById("error"); if(!e) return; e.textContent=msg; e.style.display=msg?"block":"none"; }

function normalizeUrl(u){ try{const url=new URL(u.trim()); const drop=new Set(["utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_id","gclid","fbclid","igsh","si","s"]); for(const k of [...url.searchParams.keys()]){ if(drop.has(k.toLowerCase())) url.searchParams.delete(k); } url.protocol="https:"; return url.toString(); }catch{ return u.trim(); } }

async function followRedirects(u){ try{ const res=await fetch(u,{method:"GET",redirect:"follow",mode:"cors"}); return res.url||u; } catch{ return u; } }

function compositeKey(p,k){ return p+"|"+k.toLowerCase(); }

function genId(){ return 'src_'+Math.random().toString(36).slice(2)+Date.now().toString(36); }

function upsertCreator(vault, c, sourceUrl){
  const k = compositeKey(c.platform, c.key);
  const idx = vault.creators.findIndex(x => compositeKey(x.platform,x.key)===k);
  if (idx>=0){
    const ex=vault.creators[idx];
    if(!ex.displayName && c.displayName) ex.displayName=c.displayName;
    if(!ex.profileURL && c.profileURL) ex.profileURL=c.profileURL;
    vault.creators[idx]=ex;
  } else {
    vault.creators.unshift({ ...c, createdAt:new Date().toISOString() });
  }
  vault.sources.unshift({ id:genId(), creatorCompositeKey:k, originalURL:sourceUrl, topics:[], read:false, addedAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
  saveVault(vault);
  return k;
}

function getUnreadCountForCreator(c){ const v=loadVault(); const key=compositeKey(c.platform,c.key); return (v.sources||[]).filter(s=>s.creatorCompositeKey===key && !s.read).length; }
function normalizeTopic(t){ return (t||'').replace(/^#/, '').trim().toLowerCase(); }

function setSourceRead(sourceId, read){ const v=loadVault(); const s=(v.sources||[]).find(x=>x.id===sourceId); if(s){ s.read=!!read; s.updatedAt=new Date().toISOString(); saveVault(v); } }
function toggleSourceReadByObject(src){
  const v=loadVault();
  let target=null;
  if(src.id){ target=(v.sources||[]).find(x=>x.id===src.id); }
  if(!target){
    target=(v.sources||[]).find(x=> x.creatorCompositeKey===src.creatorCompositeKey && x.originalURL===src.originalURL && x.addedAt===src.addedAt);
  }
  if(target){
    if(!target.id) target.id='src_'+Math.random().toString(36).slice(2)+Date.now().toString(36);
    target.read = !target.read;
    target.updatedAt=new Date().toISOString();
    saveVault(v);
  }
}

function renderLast(vault){
  const last = document.getElementById("last"); if(!last) return;
  last.innerHTML = "";
  const items = vault.creators.slice(0,6);
  for(const c of items){
    const row=document.createElement('div'); row.className='creator';
    const count=document.createElement('div'); count.className='new-count'; count.textContent=`(${getUnreadCountForCreator(c)})`; row.appendChild(count);
    const body=document.createElement('div');
    const t=document.createElement('div'); t.className='title';
    const a=document.createElement('a'); a.href=c.profileURL; a.target='_blank'; a.rel='noopener'; a.textContent=c.displayName||c.key; a.className='creator-link';
    t.appendChild(a); body.appendChild(t);
    const key=compositeKey(c.platform,c.key);
    const sources=(vault.sources||[]).filter(s=>s.creatorCompositeKey===key).sort((a,b)=> new Date(b.addedAt||0)- new Date(a.addedAt||0)).slice(0,2);
    sources.forEach(s=>{
      const line=document.createElement('div'); line.className='sub';
      const dt=document.createElement('span'); dt.textContent=new Date(s.addedAt).toLocaleDateString(undefined,{month:'long', day:'numeric'})+"  "; line.appendChild(dt);
      const desc=document.createElement('span'); desc.textContent='…'; line.appendChild(desc);
      const sep=document.createElement('span'); sep.textContent='  '; line.appendChild(sep);
      const mark=document.createElement('a'); mark.href='#'; mark.className='mark'; mark.textContent= s.read? 'mark unread' : 'mark read';
      mark.addEventListener('click',(e)=>{ e.preventDefault(); toggleSourceReadByObject(s); renderLast(loadVault()); });
      line.appendChild(mark);
      body.appendChild(line);
    });
    row.appendChild(body);
    const actions=document.createElement('div'); actions.className='stack';
    const open=document.createElement('a'); open.href=c.profileURL; open.target='_blank'; open.rel='noopener'; open.textContent='open'; actions.appendChild(open);
    row.appendChild(actions);
    last.appendChild(row);
  }
}

async function extractCreator(raw){
  let urlStr = normalizeUrl(raw);
  try{ new URL(urlStr); }catch{ throw new Error("URL invalide"); }
  const first = new URL(urlStr);
  if (first.host.toLowerCase()==="t.co" || first.host.toLowerCase()==="lnkd.in"){ urlStr = await followRedirects(urlStr); }
  const u = new URL(urlStr);
  const h = u.host.toLowerCase();
  if (h.includes("youtube.com") || h.includes("youtu.be")) return await extractYouTube(u);
  if (h.includes("twitter.com") || h.includes("x.com")) return extractX(u);
  if (h.includes("linkedin.com")) return await extractLinkedIn(u);
  if (h.endsWith(".substack.com") || h.includes("substack.com") || (!h.includes("linkedin.com") && !h.includes("x.com") && !h.includes("twitter.com") && !h.includes("youtube.com") && h.includes("substack"))) return await extractSubstack(u);
  throw new Error("Plateforme non supportée");
}

async function extractYouTube(u){
  const segs=u.pathname.split("/").filter(Boolean);
  if (u.pathname.toLowerCase().includes("/channel/")) {
    const idx=segs.indexOf("channel"); if(idx>=0 && segs[idx+1]){
      const id=segs[idx+1];
      return { platform:"youtube", key:id, displayName:"", profileURL:"https://www.youtube.com/channel/"+id };
    }
  }
  const at = segs.find(s=>s.startsWith("@"));
  if (at){
    const handle=at.replace(/^@/,"").toLowerCase();
    return { platform:"youtube", key:handle, displayName:"", profileURL:"https://www.youtube.com/@"+handle };
  }
  const oe="https://www.youtube.com/oembed?format=json&url="+encodeURIComponent(u.toString());
  const res = await fetch(oe, { mode:"cors" });
  if(!res.ok) throw new Error("YouTube oEmbed non disponible");
  const data = await res.json();
  const au = new URL(data.author_url);
  const s2 = au.pathname.split("/").filter(Boolean);
  const at2 = s2.find(x=>x.startsWith("@"));
  if (at2){
    const h = at2.replace(/^@/,"").toLowerCase();
    return { platform:"youtube", key:h, displayName:data.author_name||"", profileURL:"https://www.youtube.com/@"+h };
  }
  const idx = s2.indexOf("channel");
  if (idx>=0 && s2[idx+1]){
    const id=s2[idx+1];
    return { platform:"youtube", key:id, displayName:data.author_name||"", profileURL:"https://www.youtube.com/channel/"+id };
  }
  return { platform:"youtube", key:data.author_url.toLowerCase(), displayName:data.author_name||"", profileURL:data.author_url };
}

function extractX(u){
  const segs=u.pathname.split("/").filter(Boolean);
  const idx=segs.indexOf("status");
  if(idx>0){
    const handle=segs[idx-1];
    return { platform:"x", key:handle.toLowerCase(), displayName:"", profileURL:"https://x.com/"+handle };
  }
  if (segs[0] && !["i","home","share","explore","settings","messages","notifications","compose","search"].includes(segs[0])){
    const handle=segs[0];
    return { platform:"x", key:handle.toLowerCase(), displayName:"", profileURL:"https://x.com/"+handle };
  }
  throw new Error("Compte X introuvable dans cette URL");
}

async function extractSubstack(u){
  const host=u.host.toLowerCase();
  const base=u.protocol+"//"+host;
  let display="";
  try{
    const res=await fetch(base,{mode:"cors"});
    const html=await res.text();
    const og=html.match(/<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i);
    const title=html.match(/<title>([^<]+)<\/title>/i);
    display=og?og[1]:(title?title[1]:"");
  }catch{}
  return { platform:"substack", key:host, displayName:display, profileURL:base };
}

async function extractLinkedIn(u){
  const segs=u.pathname.split("/").filter(Boolean);
  const i=segs.indexOf("in");
  if(i>=0 && segs[i+1]){
    const slug=segs[i+1];
    return { platform:"linkedin", key:"in/"+slug.toLowerCase(), displayName:"", profileURL:"https://www.linkedin.com/in/"+slug };
  }
  const c=segs.indexOf("company");
  if(c>=0 && segs[c+1]){
    const slug=segs[c+1];
    return { platform:"linkedin", key:"company/"+slug.toLowerCase(), displayName:"", profileURL:"https://www.linkedin.com/company/"+slug };
  }
  try{
    const res=await fetch(u.toString(), { mode:"cors" });
    const html=await res.text();
    const m=html.match(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i);
    if(m){ return await extractLinkedIn(new URL(m[1])); }
  }catch{}
  throw new Error("Créateur LinkedIn non détecté");
}

async function handleAdd(){
  showError("");
  const input=document.getElementById("urlInput");
  const raw = input ? input.value : "";
  if(!raw.trim()) return;
  try{
    const creator = await extractCreator(raw);
    const vault = loadVault();
    upsertCreator(vault, creator, raw);
    if(input) input.value="";
    renderLast(loadVault());
    updateBadgeCount();
  }catch(e){ showError(e.message||String(e)); }
}

// Bindings (all guarded so missing elements don't break the page)
const addBtnEl = document.getElementById("addBtn");
if(addBtnEl) addBtnEl.addEventListener("click", handleAdd);

const addEnterLink = document.getElementById("addEnter");
if(addEnterLink) addEnterLink.addEventListener("click", (e)=>{ e.preventDefault(); handleAdd(); });

const urlInputEl = document.getElementById("urlInput");
if(urlInputEl) urlInputEl.addEventListener("keydown", e => { if(e.key==="Enter") handleAdd(); });

renderLast(loadVault());
updateBadgeCount();
setOwnerInHeader();

function updateBadgeCount(){
  try{
    const v=loadVault();
    const el=document.querySelector('.badge-count');
    if(el) el.textContent=`(${v.creators?.length||0})`;
  }catch{}
}

function setOwnerInHeader(){
  const p=getCurrentProfile();
  const owner=p? (p.charAt(0).toUpperCase()+p.slice(1)) : "";
  const el=document.querySelector('.owner-name'); if(el) el.textContent = owner? `${owner}'s` : "";
}
