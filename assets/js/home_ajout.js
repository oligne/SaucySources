const storeKey = "creatorVault_v1";

function loadVault(){ try{const raw=localStorage.getItem(storeKey);return raw?JSON.parse(raw):{creators:[],sources:[]};}catch{return {creators:[],sources:[]};} }
function saveVault(v){ localStorage.setItem(storeKey, JSON.stringify(v)); }

function showError(msg){ const e=document.getElementById("error"); e.textContent=msg; e.style.display=msg?"block":"none"; }

function normalizeUrl(u){ try{const url=new URL(u.trim()); const drop=new Set(["utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_id","gclid","fbclid","igsh","si","s"]); for(const k of [...url.searchParams.keys()]){ if(drop.has(k.toLowerCase())) url.searchParams.delete(k); } url.protocol="https:"; return url.toString(); }catch{ return u.trim(); } }

async function followRedirects(u){ try{ const res=await fetch(u,{method:"GET",redirect:"follow",mode:"cors"}); return res.url||u; } catch{ return u; } }

function compositeKey(p,k){ return p+"|"+k.toLowerCase(); }

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
  vault.sources.unshift({ creatorCompositeKey:k, originalURL:sourceUrl, addedAt:new Date().toISOString() });
  saveVault(vault);
  return k;
}

function renderLast(vault){
  const last = document.getElementById("last");
  last.innerHTML = "";
  const items = vault.creators.slice(0,6);
  for(const c of items){
    const card = document.createElement("div"); card.className="creator";
    const badge = document.createElement("div"); badge.className="badge"; badge.textContent = c.platform==="x"?"X":(c.platform==="substack"?"Substack":(c.platform==="linkedin"?"LinkedIn":"YouTube"));
    const text = document.createElement("div");
    const t = document.createElement("div"); t.className="title"; t.textContent = c.displayName || c.key;
    const s = document.createElement("div"); s.className="sub"; s.textContent = c.profileURL;
    text.appendChild(t); text.appendChild(s);
    const actions = document.createElement("div"); actions.className="stack";
    const open=document.createElement("a"); open.href=c.profileURL; open.target="_blank"; open.rel="noopener"; open.textContent="Ouvrir";
    const lib=document.createElement("a"); lib.href="library_creator_vault.html"; lib.textContent="Voir dans la bibliothèque";
    actions.appendChild(open); actions.appendChild(lib);
    card.appendChild(badge); card.appendChild(text); card.appendChild(actions);
    last.appendChild(card);
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
  const raw=input.value;
  if(!raw.trim()) return;
  try{
    const creator = await extractCreator(raw);
    const vault = loadVault();
    upsertCreator(vault, creator, raw);
    input.value="";
    renderLast(loadVault());
  }catch(e){ showError(e.message||String(e)); }
}

document.getElementById("addBtn").addEventListener("click", handleAdd);

document.getElementById("urlInput").addEventListener("keydown", e => { if(e.key==="Enter") handleAdd(); });

renderLast(loadVault());
