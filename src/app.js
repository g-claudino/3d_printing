/* ===== Layerworks app: viewport + controls ===== */
const $=s=>document.querySelector(s);
const PRINTERS=[
  {id:'bambu',label:'Bed 256 × 256 (Bambu X1/P1/A1)',w:256,d:256,h:256,short:'256 mm bed'},
  {id:'mk4',label:'Bed 250 × 210 (Prusa MK4/Core One)',w:250,d:210,h:220,short:'MK4 bed'},
  {id:'ender',label:'Bed 220 × 220 (Ender 3 class)',w:220,d:220,h:250,short:'220 mm bed'},
  {id:'mini',label:'Bed 180 × 180 (A1 mini, MINI)',w:180,d:180,h:180,short:'180 mm bed'},
  {id:'large',label:'Bed 350 × 350 (large format)',w:350,d:350,h:350,short:'350 mm bed'}
];
const FILAMENTS=[
  {id:'jade',name:'Jade',hex:'#2F9C84'},{id:'white',name:'White',hex:'#E6E8E3'},{id:'black',name:'Matte black',hex:'#2B2D2C'},
  {id:'grey',name:'Galaxy grey',hex:'#6C727A'},{id:'orange',name:'Signal orange',hex:'#DE6A2E'},{id:'cobalt',name:'Cobalt',hex:'#3A57C8'}
];
const store={get(k,d){try{const v=localStorage.getItem('lw.'+k);return v==null?d:v;}catch(e){return d;}},set(k,v){try{localStorage.setItem('lw.'+k,v);}catch(e){}}};
S.printer=store.get('printer','bambu');S.filament=store.get('filament','jade');
if(!PRINTERS.find(p=>p.id===S.printer))S.printer='bambu';
if(!FILAMENTS.find(f=>f.id===S.filament))S.filament='jade';
S.photo={src:sampleScene(),name:'sample',sample:true};

/* ---------- viewport ---------- */
const canvas=$('#view'),stage=$('#stage');
let webglOK=true,renderer;
try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
}catch(e){
  webglOK=false;
  renderer={setPixelRatio(){},setClearColor(){},setSize(){},render(){},dispose(){},domElement:canvas,capabilities:{getMaxAnisotropy:()=>1}};
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setClearColor(0x000000,0);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(32,1,1,8000);camera.up.set(0,0,1);camera.position.set(160,-260,190);
const controls=new THREE.OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=0.12;controls.target.set(0,0,20);controls.maxPolarAngle=Math.PI*0.495;
const hemi=new THREE.HemisphereLight(0xffffff,0x5d5a52,0.46);hemi.position.set(0,0,1);scene.add(hemi);
const key=new THREE.DirectionalLight(0xffffff,0.52);key.position.set(-160,-240,320);scene.add(key);
const fill=new THREE.DirectionalLight(0xffffff,0.2);fill.position.set(220,160,140);scene.add(fill);
const mat=new THREE.MeshStandardMaterial({color:0x2F9C84,roughness:0.58,metalness:0.02});
let mesh=null,plate=null,frame=null,emissiveTex=null;
const cssVar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()||'#888';

function buildPlate(){
  const P=PRINTERS.find(p=>p.id===S.printer);
  if(plate){scene.remove(plate);plate.geometry.dispose();plate.material.map.dispose();plate.material.dispose();}
  if(frame){scene.remove(frame);frame.geometry.dispose();frame.material.dispose();}
  const sc=Math.min(6,2048/Math.max(P.w,P.d)),cw=Math.round(P.w*sc),ch=Math.round(P.d*sc);
  const c=document.createElement('canvas');c.width=cw;c.height=ch;const x=c.getContext('2d');
  x.fillStyle=cssVar('--plate');x.fillRect(0,0,cw,ch);
  for(let i=0;i<cw*ch/90;i++){x.fillStyle=Math.random()<.5?'rgba(255,255,255,.06)':'rgba(0,0,0,.07)';x.fillRect(Math.random()*cw,Math.random()*ch,1.4,1.4);}
  x.strokeStyle=cssVar('--plate-line');
  for(let m=0;m<=Math.max(P.w,P.d);m+=10){
    x.globalAlpha=m%50===0?0.55:0.22;x.lineWidth=m%50===0?1.6:1;
    const cx=(P.w/2+m)*sc,cx2=(P.w/2-m)*sc,cy=(P.d/2+m)*sc,cy2=(P.d/2-m)*sc;
    x.beginPath();
    if(cx<=cw){x.moveTo(cx,0);x.lineTo(cx,ch);} if(m&&cx2>=0){x.moveTo(cx2,0);x.lineTo(cx2,ch);}
    if(cy<=ch){x.moveTo(0,cy);x.lineTo(cw,cy);} if(m&&cy2>=0){x.moveTo(0,cy2);x.lineTo(cw,cy2);}
    x.stroke();
  }
  x.globalAlpha=1;
  const tex=new THREE.CanvasTexture(c);tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
  plate=new THREE.Mesh(new THREE.PlaneGeometry(P.w,P.d),new THREE.MeshStandardMaterial({map:tex,roughness:0.9,metalness:0.05}));
  plate.position.z=-0.04;scene.add(plate);
  frame=new THREE.Mesh(new THREE.BoxGeometry(P.w+8,P.d+8,3),new THREE.MeshStandardMaterial({color:new THREE.Color(cssVar('--frame')),roughness:0.7}));
  frame.position.z=-1.6;scene.add(frame);
}
function resize(){const r=stage.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);
(function loop(){requestAnimationFrame(loop);if(document.hidden)return;controls.update();renderer.render(scene,camera);})();
if(!webglOK){
  const note=document.createElement('div');
  note.id='webglNote';
  note.style.cssText='position:absolute;left:12px;right:12px;top:64px;background:var(--hud);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:13px;line-height:1.5;color:var(--ink)';
  note.innerHTML='<strong>3D preview unavailable.</strong> WebGL is disabled in this browser. Every generator and the STL download still work — turning on WebGL (or trying another browser) brings back the live preview.';
  stage.appendChild(note);
}

function fitCamera(b){
  const size=Math.max(b.x,b.y,b.z*1.3,24),d=size*2.05;
  camera.position.set(d*0.52,-d*0.86,d*0.66);controls.target.set(0,0,Math.min(b.z*0.35,size*0.3));
  camera.near=Math.max(0.5,d/200);camera.far=d*30;camera.updateProjectionMatrix();controls.update();
}

/* ---------- apply generated model ---------- */
function applyResult(res){
  let total=0;for(const s of res.shells)total+=s.length;
  const tris=new Float32Array(total);let o=0,vol=0;
  for(const s of res.shells){tris.set(s,o);o+=s.length;vol+=Math.abs(signedVolume(s));}
  let mnx=1e9,mny=1e9,mnz=1e9,mxx=-1e9,mxy=-1e9,mxz=-1e9;
  for(let i=0;i<tris.length;i+=3){const x=tris[i],y=tris[i+1],z=tris[i+2];if(x<mnx)mnx=x;if(x>mxx)mxx=x;if(y<mny)mny=y;if(y>mxy)mxy=y;if(z<mnz)mnz=z;if(z>mxz)mxz=z;}
  let uv=null;
  if(res.emissive){
    uv=new Float32Array(tris.length/3*2);const sx=1/Math.max(mxx-mnx,1e-6),sy=1/Math.max(mxy-mny,1e-6);
    for(let i=0,k=0;i<tris.length;i+=3,k+=2){uv[k]=(tris[i]-mnx)*sx;uv[k+1]=(tris[i+1]-mny)*sy;}
  }
  const cx=(mnx+mxx)/2,cy=(mny+mxy)/2;
  for(let i=0;i<tris.length;i+=3){tris[i]-=cx;tris[i+1]-=cy;tris[i+2]-=mnz;}
  const b={x:mxx-mnx,y:mxy-mny,z:mxz-mnz};
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(tris,3));
  if(uv)g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.computeVertexNormals();
  if(mesh){mesh.geometry.dispose();mesh.geometry=g;}else{mesh=new THREE.Mesh(g,mat);scene.add(mesh);}
  if(emissiveTex){emissiveTex.dispose();emissiveTex=null;}
  if(res.emissive){emissiveTex=res.emissive;mat.emissiveMap=emissiveTex;mat.emissive.set(0xffffff);mat.emissiveIntensity=1.2;}
  else{mat.emissiveMap=null;mat.emissive.set(0x000000);mat.emissiveIntensity=0;}
  mat.needsUpdate=true;
  S.tris=tris;S.bbox=b;S.fileBase=res.file||MODEL_BY_ID[S.model].id;
  if(S.needFit){fitCamera(b);S.needFit=false;}
  renderStats(b,tris.length/9,vol);
  $('#readout').innerHTML=(res.notes||[]).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  const badge=$('#mBadge');badge.hidden=!res.badge;badge.textContent=res.badge||'';
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function renderStats(b,n,vol){
  const P=PRINTERS.find(p=>p.id===S.printer);
  const fits=((b.x<=P.w&&b.y<=P.d)||(b.x<=P.d&&b.y<=P.w))&&b.z<=P.h;
  const cm3=vol/1000;
  $('#stats').innerHTML=
    `<div class="stat"><span class="k">Size</span><span class="v">${fmt(b.x)} × ${fmt(b.y)} × ${fmt(b.z)} mm</span></div>`+
    `<div class="stat"><span class="k">Triangles</span><span class="v">${n.toLocaleString('en-US')}</span></div>`+
    `<div class="stat"><span class="k">Volume</span><span class="v">${fmt(cm3,1)} cm³</span></div>`+
    `<div class="stat"><span class="k">PLA if solid</span><span class="v">≈ ${fmt(cm3*1.24,0)} g</span></div>`+
    `<span class="pill ${fits?'ok':'bad'}">${fits?'Fits '+P.short:'Too big for '+P.short}</span>`;
}

/* ---------- build pipeline ---------- */
let token=0,timer=null;
const ui={busy(t){const e=$('#busy');e.hidden=!t;if(t)e.textContent=t;}};
function schedule(ms=80){clearTimeout(timer);timer=setTimeout(rebuild,ms);}
async function rebuild(){
  const my=++token,m=MODEL_BY_ID[S.model],p=S.vals[m.id];
  ui.busy('Generating');hideMsg();
  await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
  if(my!==token)return;
  try{const res=await m.build(p,ui);if(my!==token)return;applyResult(res);}
  catch(e){if(my===token){showMsg(e.message||String(e));console.error(e);}}
  finally{if(my===token)ui.busy(null);}
}
function showMsg(t){$('#msgText').textContent=t;$('#msg').hidden=false;}
function hideMsg(){$('#msg').hidden=true;}
$('#msgX').onclick=hideMsg;
let toastT=null;
function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>e.hidden=true,3200);}

/* ---------- controls ---------- */
for(const m of MODELS){S.vals[m.id]={};for(const p of m.params)if('value' in p)S.vals[m.id][p.id]=p.value;}

function renderCats(){
  $('#cats').innerHTML=CATS.map(c=>`<button class="cat" data-cat="${c.id}" aria-pressed="${c.id===S.cat}"><svg viewBox="0 0 24 24" aria-hidden="true">${c.icon}</svg>${c.label}</button>`).join('');
  $('#cats').querySelectorAll('.cat').forEach(b=>b.onclick=()=>{
    if(S.cat===b.dataset.cat)return;S.cat=b.dataset.cat;S.model=MODELS.find(m=>m.cat===S.cat).id;S.needFit=true;renderAll();schedule(0);
  });
}
function renderModels(){
  const list=MODELS.filter(m=>m.cat===S.cat);
  $('#models').innerHTML=list.map(m=>`<button class="chip" data-m="${m.id}" aria-pressed="${m.id===S.model}">${m.name}</button>`).join('');
  $('#models').querySelectorAll('.chip').forEach(b=>b.onclick=()=>{if(S.model===b.dataset.m)return;S.model=b.dataset.m;S.needFit=true;renderAll();schedule(0);});
}
function renderAll(){
  renderCats();renderModels();renderParams();
  const m=MODEL_BY_ID[S.model];$('#mTitle').textContent=m.name;$('#tips').innerHTML=m.tip||'';$('#readout').innerHTML='';
}
function renderParams(){
  const m=MODEL_BY_ID[S.model],v=S.vals[m.id],root=$('#params');root.innerHTML='';let group=null;
  for(const p of m.params){
    if(p.show&&!p.show(v))continue;
    if(p.group&&p.group!==group){group=p.group;const h=document.createElement('div');h.className='group';h.textContent=group;root.appendChild(h);}
    root.appendChild(control(m,p,v));
  }
}
function changed(p,m){
  if(p.rerender)renderParams();
  schedule(p.refetch&&S.vals[m.id].source==='map'&&S.place?700:(p.type==='range'?60:0));
}
function control(m,p,v){
  const row=document.createElement('div');row.className='row';const id=`p-${m.id}-${p.id}`;
  if(p.type==='range'){
    row.innerHTML=`<label for="${id}"><span>${p.label}</span><span><input class="num" type="number" id="${id}-n" aria-label="${p.label} value" min="${p.min}" max="${p.max}" step="${p.step}" value="${v[p.id]}"><span class="unit">${p.unit||''}</span></span></label><input type="range" id="${id}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v[p.id]}">`;
    const r=row.querySelector('input[type=range]'),n=row.querySelector('.num');
    r.oninput=()=>{v[p.id]=+r.value;n.value=r.value;changed(p,m);};
    n.onchange=()=>{let x=+n.value;if(!isFinite(x))x=p.value;x=clamp(x,p.min,p.max);v[p.id]=x;n.value=x;r.value=x;changed(p,m);};
  }else if(p.type==='select'){
    row.innerHTML=`<label for="${id}">${p.label}</label><select id="${id}">${p.options.map(([k,l])=>`<option value="${k}"${String(v[p.id])===k?' selected':''}>${esc(l)}</option>`).join('')}</select>`;
    const s=row.querySelector('select');s.onchange=()=>{v[p.id]=s.value;if(p.id==='source')S.needFit=true;changed(p,m);};
  }else if(p.type==='check'){
    row.className='row check';row.innerHTML=`<input type="checkbox" id="${id}"${v[p.id]?' checked':''}><label for="${id}">${p.label}</label>`;
    const c=row.querySelector('input');c.onchange=()=>{v[p.id]=c.checked;changed(p,m);};
  }else if(p.type==='textarea'){
    row.innerHTML=`<label for="${id}">${p.label}</label><textarea id="${id}" rows="2" spellcheck="false">${esc(v[p.id])}</textarea><span class="hint">Press Enter for a second line.</span>`;
    const t=row.querySelector('textarea');t.oninput=()=>{v[p.id]=t.value;schedule(250);};
  }else if(p.type==='presets'){
    row.innerHTML=`<div class="presets">${p.items.map((it,i)=>`<button class="chip" data-i="${i}">${it.label}</button>`).join('')}</div>`;
    row.querySelectorAll('button').forEach(b=>b.onclick=()=>{Object.assign(v,p.items[+b.dataset.i].set);S.needFit=true;renderParams();schedule(0);});
  }else if(p.type==='image'){
    const cur=p.target==='photo'?(S.photo.sample?'Sample photo (generated)':S.photo.name):(S.heightmapImg?S.heightmapName:'No image yet');
    row.innerHTML=`<span class="lab">${p.label}</span><div class="file"><label class="btn" for="${id}">Choose image…</label><input type="file" id="${id}" accept="image/*" hidden><span class="fname">${esc(cur)}</span></div><span class="hint">Or drop an image onto the preview.</span>`;
    const f=row.querySelector('input');f.onchange=()=>{if(f.files[0])loadImage(f.files[0],p.target);};
  }else if(p.type==='place'){
    row.innerHTML=`<label for="place-q">Place or coordinates</label>
      <div class="search"><input type="search" id="place-q" placeholder="Pão de Açúcar, or -22.95, -43.16" autocomplete="off"><button class="btn" id="place-go">Search</button></div>
      <div class="results" id="place-results"></div><p class="status" id="place-status"></p>`;
    const q=row.querySelector('#place-q'),go=row.querySelector('#place-go'),st=row.querySelector('#place-status'),res=row.querySelector('#place-results');
    if(S.place){st.className='status ok';st.textContent=`Loaded: ${S.place.name.split(',').slice(0,2).join(',')} (${fmt(S.place.lat,4)}, ${fmt(S.place.lon,4)})`;}
    else if(IN_CLAUDE){st.textContent='Inside claude.ai the map servers are out of reach, so place search works in the desktop copy of Layerworks. Here, use Sample island or Heightmap image.';}
    else st.textContent='Search a mountain, city or park, or paste latitude, longitude.';
    const pick=r=>{S.place=r;S.mapCache=null;S.needFit=true;res.innerHTML='';renderParams();schedule(0);};
    const run=async()=>{
      const text=q.value.trim();if(!text)return;st.className='status';st.textContent='Searching…';res.innerHTML='';
      try{
        const list=await geocode(text);
        if(!list.length){st.textContent='No matches. Try a nearby town or paste coordinates.';return;}
        if(list.length===1){pick(list[0]);return;}
        st.textContent='Choose a result:';
        list.forEach(r=>{const b=document.createElement('button');b.innerHTML=`${esc(r.name)}<span class="co">${fmt(r.lat,4)}, ${fmt(r.lon,4)}</span>`;b.onclick=()=>pick(r);res.appendChild(b);});
      }catch(e){st.className='status err';st.textContent=IN_CLAUDE?'Search can’t reach the map service from inside claude.ai. Paste coordinates in the desktop copy instead.':'The place search service didn’t respond. Paste coordinates like 45.83, 6.86 instead.';}
    };
    go.onclick=run;q.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();run();}};
  }
  return row;
}
async function loadImage(file,target){
  try{
    const bmp=await createImageBitmap(file);
    if(target==='photo')S.photo={src:bmp,name:file.name.replace(/\.\w+$/,''),sample:false};
    else{S.heightmapImg=bmp;S.heightmapName=file.name;S.hmCache=null;}
    S.needFit=true;renderParams();schedule(0);
  }catch(e){showMsg('That file couldn’t be read as an image. Try a PNG or JPEG.');}
}
stage.addEventListener('dragover',e=>{e.preventDefault();});
stage.addEventListener('drop',e=>{
  e.preventDefault();const f=[...(e.dataTransfer?.files||[])].find(f=>f.type.startsWith('image/'));if(!f)return;
  if(S.cat==='terrain'){S.vals.terrain.source='upload';loadImage(f,'heightmap');}
  else{if(S.cat!=='photo'){S.cat='photo';S.model='litho';renderAll();}loadImage(f,'photo');}
});

/* ---------- toolbar ---------- */
$('#printer').innerHTML=PRINTERS.map(p=>`<option value="${p.id}"${p.id===S.printer?' selected':''}>${p.label}</option>`).join('');
$('#printer').onchange=e=>{S.printer=e.target.value;store.set('printer',S.printer);buildPlate();if(S.bbox){renderStats(S.bbox,S.tris.length/9,Math.abs(signedVolume(S.tris)));}};
function renderSwatches(){
  $('#swatches').innerHTML=FILAMENTS.map(f=>`<button class="sw" style="background:${f.hex}" data-f="${f.id}" aria-pressed="${f.id===S.filament}" title="${f.name}" aria-label="${f.name}"></button>`).join('');
  $('#swatches').querySelectorAll('.sw').forEach(b=>b.onclick=()=>{S.filament=b.dataset.f;store.set('filament',S.filament);setFilament();renderSwatches();});
}
function setFilament(){mat.color.set(FILAMENTS.find(f=>f.id===S.filament).hex);}
const dlBtn=$('#dl');
if(IN_CLAUDE)dlBtn.title='Saves a .zip containing the STL file';
dlBtn.onclick=async()=>{
  if(!S.tris)return;dlBtn.disabled=true;
  try{
    const name=S.fileBase+'.stl',stl=toSTL(S.tris,'Layerworks '+name);
    let dl=null;if(IN_CLAUDE){try{dl=await window.claude.use('downloads');}catch(e){dl=null;}}
    if(dl){
      try{await dl.save({filename:S.fileBase+'.zip',data:new Blob([zipOne(name,stl)])});toast(`Saved ${S.fileBase}.zip with ${name} inside`);}
      catch(e){if(e&&e.code==='declined')return;showMsg(e&&e.code==='rate_limited'?'A save prompt is already open. Finish that one first.':'Downloads aren’t available in this view. Open the artifact in claude.ai to save files.');}
    }else if(IN_CLAUDE){showMsg('Downloads aren’t available in this view. Open the artifact in claude.ai to save files.');}
    else{
      const url=URL.createObjectURL(new Blob([stl],{type:'model/stl'})),a=document.createElement('a');
      a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);toast('Saved '+name);
    }
  }finally{dlBtn.disabled=false;}
};

function refreshTheme(){buildPlate();}
const narrowMQ=window.matchMedia('(max-width:860px)');
function placeTools(){const t=narrowMQ.matches?$('#mtools'):$('.actions');t.prepend($('#swatches'));t.prepend($('#printer'));}
narrowMQ.addEventListener('change',placeTools);placeTools();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',refreshTheme);
new MutationObserver(refreshTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

buildPlate();setFilament();renderSwatches();renderAll();resize();schedule(0);
