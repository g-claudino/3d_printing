/* ===== Layerworks model definitions ===== */
const S={cat:'terrain',model:'terrain',vals:{},filament:'jade',printer:'bambu',
  place:null,mapCache:null,heightmapImg:null,heightmapName:'',hmCache:null,photo:null,tris:null,needFit:true,fileBase:'model'};
const IN_CLAUDE=!!(window.claude&&typeof window.claude.use==='function');
let SAMPLE_ISLAND=null;
const island=()=>SAMPLE_ISLAND||(SAMPLE_ISLAND=sampleIsland(257));

const DETAIL=[['draft','Draft · 0.5 mm grid'],['normal','Normal · 0.3 mm grid'],['fine','Fine · 0.2 mm grid']];
const DETAIL_MM={draft:0.5,normal:0.3,fine:0.2};
const cellFor=(d,W,H,cap=460)=>Math.max(DETAIL_MM[d]||0.3,Math.max(W,H)/cap);

const FONTS={
  archivo:{family:'Archivo Black',weight:400,label:'Archivo Black (bold sans)'},
  bebas:{family:'Bebas Neue',weight:400,label:'Bebas Neue (condensed)'},
  slab:{family:'Roboto Slab',weight:800,label:'Roboto Slab (slab serif)'},
  pacifico:{family:'Pacifico',weight:400,label:'Pacifico (script)'},
  marker:{family:'Permanent Marker',weight:400,label:'Permanent Marker (handwritten)'},
  stencil:{family:'Stardos Stencil',weight:700,label:'Stardos Stencil'}
};
const fmt=(v,d=1)=>Number(v).toFixed(d);
const slug=s=>(s||'model').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').trim().replace(/[\s_]+/g,'-').slice(0,40)||'model';
const tick=()=>new Promise(r=>setTimeout(r,0));

/* ---------- Terrain data ---------- */
async function fetchTerrain(lat,lon,areaKm,target=420){
  const C=40075016.686,m=areaKm*1000,cos=Math.cos(lat*Math.PI/180);
  let z=clamp(Math.ceil(Math.log2(C*cos*target/(256*m))),1,15),tiles,cx,cy,half,world;
  for(;;){
    world=256*2**z;cx=(lon+180)/360*world;const s=Math.sin(lat*Math.PI/180);
    cy=(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*world;half=m/2*world/(C*cos);
    const tx0=Math.floor((cx-half)/256),tx1=Math.floor((cx+half)/256),ty0=Math.floor((cy-half)/256),ty1=Math.floor((cy+half)/256);
    tiles={tx0,tx1,ty0,ty1};
    if((tx1-tx0+1)*(ty1-ty0+1)<=30||z<=1)break;z--;
  }
  const {tx0,tx1,ty0,ty1}=tiles,n=2**z,cw=(tx1-tx0+1)*256,ch=(ty1-ty0+1)*256;
  const cv=document.createElement('canvas');cv.width=cw;cv.height=ch;const ctx=cv.getContext('2d',{willReadFrequently:true});
  const jobs=[];
  for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){
    const x=((tx%n)+n)%n,y=clamp(ty,0,n-1);
    jobs.push(fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,{mode:'cors'})
      .then(r=>{if(!r.ok)throw new Error('tile '+r.status);return r.blob();}).then(b=>createImageBitmap(b))
      .then(img=>ctx.drawImage(img,(tx-tx0)*256,(ty-ty0)*256)));
  }
  await Promise.all(jobs);
  const px=ctx.getImageData(0,0,cw,ch).data,mos=new Float32Array(cw*ch);
  for(let i=0,k=0;i<mos.length;i++,k+=4)mos[i]=px[k]*256+px[k+1]+px[k+2]/256-32768;
  const N=Math.min(512,Math.max(64,Math.ceil(2*half)+1)),data=new Float32Array(N*N),g={w:cw,h:ch,data:mos};
  const ox=cx-half-tx0*256,oy=cy-half-ty0*256;
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const X=ox+2*half*i/(N-1),Y=oy+2*half*j/(N-1);
    data[j*N+i]=sampleGrid(g,X/(cw-1),Y/(ch-1));
  }
  return {w:N,h:N,data,metersWide:m,zoom:z};
}
async function geocode(q){
  const m=q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if(m){const lat=+m[1],lon=+m[2];if(Math.abs(lat)<=85&&Math.abs(lon)<=180)return[{name:`${fmt(lat,4)}, ${fmt(lon,4)}`,lat,lon}];}
  try{
    const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q='+encodeURIComponent(q),{headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error(r.status);
    const j=await r.json();return j.map(x=>({name:x.display_name,lat:+x.lat,lon:+x.lon}));
  }catch(e){
    const r=await fetch('https://photon.komoot.io/api/?limit=6&q='+encodeURIComponent(q));
    const j=await r.json();
    return j.features.map(f=>({name:[f.properties.name,f.properties.city,f.properties.state,f.properties.country].filter(Boolean).join(', '),lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]}));
  }
}
function heightmapData(terrarium){
  const key=terrarium?'t':'g';
  if(S.hmCache&&S.hmCache.key===key&&S.hmCache.img===S.heightmapImg)return S.hmCache.ds;
  const img=S.heightmapImg,sc=Math.min(1,600/Math.max(img.width,img.height)),w=Math.max(2,Math.round(img.width*sc)),h=Math.max(2,Math.round(img.height*sc));
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;const ctx=cv.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=!terrarium;ctx.drawImage(img,0,0,w,h);
  const px=ctx.getImageData(0,0,w,h).data,data=new Float32Array(w*h);
  for(let i=0,k=0;i<data.length;i++,k+=4)data[i]=terrarium?px[k]*256+px[k+1]+px[k+2]/256-32768:(0.2126*px[k]+0.7152*px[k+1]+0.0722*px[k+2]);
  const ds={w,h,data,metersWide:null};S.hmCache={key,img,ds};return ds;
}

/* ---------- Image helpers ---------- */
function sampleScene(){
  const w=720,h=520,c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  const sky=x.createLinearGradient(0,0,0,h*.7);sky.addColorStop(0,'#1d2b4a');sky.addColorStop(.6,'#c9a47a');sky.addColorStop(1,'#f3d9a8');
  x.fillStyle=sky;x.fillRect(0,0,w,h);
  const sun=x.createRadialGradient(470,250,6,470,250,120);sun.addColorStop(0,'#fff8e6');sun.addColorStop(.25,'#ffe6b0');sun.addColorStop(1,'rgba(255,220,160,0)');
  x.fillStyle=sun;x.fillRect(0,0,w,h);
  const ridge=(base,amp,seed,col,f)=>{x.beginPath();x.moveTo(0,h);for(let i=0;i<=w;i+=3){const y=base-amp*ridged(i/w*f,seed*.37,seed,5);x.lineTo(i,y);}x.lineTo(w,h);x.closePath();x.fillStyle=col;x.fill();};
  ridge(330,170,4,'#7a6f78',2.2);ridge(380,150,9,'#4c4a58',2.8);ridge(440,120,15,'#2c2d38',3.4);
  const lake=x.createLinearGradient(0,445,0,h);lake.addColorStop(0,'#d8b98e');lake.addColorStop(1,'#3a3540');
  x.fillStyle=lake;x.fillRect(0,448,w,h-448);
  x.fillStyle='#161820';for(let i=0;i<26;i++){const px=18+i*27+hash2(i,1,3)*14,th=40+hash2(i,2,5)*50;x.beginPath();x.moveTo(px,452);x.lineTo(px+8,452-th);x.lineTo(px+16,452);x.fill();}
  return c;
}
function lumGrid(src,nx,ny,crop){
  const W=nx+1,H=ny+1,c=document.createElement('canvas');c.width=W;c.height=H;
  const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,W,H);
  const sa=src.width/src.height,ta=W/H;let sw=src.width,sh=src.height,sx=0,sy=0;
  if(crop){if(sa>ta){sw=sh*ta;sx=(src.width-sw)/2;}else{sh=sw/ta;sy=(src.height-sh)/2;}}
  x.imageSmoothingQuality='high';x.drawImage(src,sx,sy,sw,sh,0,0,W,H);
  const px=x.getImageData(0,0,W,H).data,L=new Float32Array(W*H);
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){const k=((ny-j)*W+i)*4;L[j*W+i]=(0.2126*px[k]+0.7152*px[k+1]+0.0722*px[k+2])/255;}
  return L;
}
function roundRectPath(x,X,Y,W,H,r){r=Math.max(0,Math.min(r,W/2,H/2));x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+W,Y,X+W,Y+H,r);x.arcTo(X+W,Y+H,X,Y+H,r);x.arcTo(X,Y+H,X,Y,r);x.arcTo(X,Y,X+W,Y,r);x.closePath();}

/* ---------- Model catalogue ---------- */
const CATS=[
  {id:'terrain',label:'Terrain',icon:'<path d="M2 19l6-10 4 6 3-4 7 8z"/><path d="M6.5 11.5l1.5 1 1.3-1"/>'},
  {id:'photo',label:'Photo',icon:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>'},
  {id:'text',label:'Text',icon:'<path d="M5 7V4h14v3M12 4v16M9 20h6"/>'},
  {id:'storage',label:'Storage',icon:'<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>'},
  {id:'mech',label:'Mechanical',icon:'<circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'},
  {id:'deco',label:'Decorative',icon:'<path d="M9 3h6M10 3c0 3-4 5-4 10a6 6 0 0012 0c0-5-4-7-4-10"/><path d="M8 21h8"/>'}
];

const R=(id,label,min,max,step,value,unit,extra={})=>({id,label,type:'range',min,max,step,value,unit,...extra});
const SEL=(id,label,options,value,extra={})=>({id,label,type:'select',options,value,...extra});
const CHK=(id,label,value,extra={})=>({id,label,type:'check',value,...extra});

const textParams=(defaults)=>[
  {id:'text',label:'Text',type:'textarea',value:defaults.text,group:'Text'},
  SEL('font','Typeface',Object.entries(FONTS).map(([k,f])=>[k,f.label]),defaults.font),
  R('size','Letter size',5,40,0.5,defaults.size,'mm'),
  SEL('style','Letters',[['raised','Raised'],['engraved','Engraved']],'raised',{show:p=>p.plate!=='letters'}),
  R('textH','Letter depth',0.4,5,0.2,defaults.textH,'mm'),
  SEL('plate','Backing',[['plate','Rounded plate'],['contour','Follows the letters'],['letters','Letters only']],defaults.plate,{group:'Backing',rerender:true}),
  R('thick','Backing thickness',1,8,0.2,defaults.thick,'mm'),
  R('pad','Margin',1,15,0.5,defaults.pad,'mm',{show:p=>p.plate!=='letters'}),
  R('radius','Corner radius',0,15,0.5,4,'mm',{show:p=>p.plate==='plate'}),
  CHK('border','Raised border',defaults.border,{show:p=>p.plate==='plate'}),
  CHK('loop','Keyring loop',defaults.loop,{show:p=>p.plate!=='letters'}),
  CHK('holes','Screw holes at the ends',defaults.holes,{show:p=>p.plate==='plate'}),
  SEL('detail','Detail',DETAIL,'fine',{group:'Output'})
];

async function buildText(p){
  const f=FONTS[p.font]||FONTS.archivo,fam=`${f.weight} {S}px "${f.family}", "Arial Black", sans-serif`;
  try{await document.fonts.load(fam.replace('{S}',64),p.text||'A');}catch(e){}
  const lines=(p.text||' ').split('\n');while(lines.length>1&&!lines[lines.length-1].trim())lines.pop();
  const mc=document.createElement('canvas').getContext('2d');mc.font=fam.replace('{S}',100);
  const widths=lines.map(l=>mc.measureText(l).width/100*p.size);
  const lineH=p.size*1.12,textW=Math.max(1,...widths),textH=lines.length*lineH;
  const style=p.plate,pad=style==='letters'?1:p.pad,loop=p.loop&&style!=='letters',holes=p.holes&&style==='plate';
  const loopR=5.5,holeR=2.4,side=holes?9:0;
  let x0=pad+side+(loop?(style==='contour'?2*loopR-2.5:2*loopR-1):0);
  let W=x0+textW+pad+side,H=Math.max(textH+2*pad,loop?2*loopR+2:0);
  const cell=cellFor(p.detail,W,H,700),nx=Math.ceil(W/cell),ny=Math.ceil(H/cell);W=nx*cell;H=ny*cell;
  const cx=x0+textW/2,top=(H-textH)/2;
  const drawText=(x,extraStroke)=>{
    x.font=fam.replace('{S}',p.size);x.textAlign='center';x.textBaseline='middle';
    lines.forEach((l,k)=>{const y=top+lineH*(k+0.5)+p.size*0.04;if(extraStroke){x.strokeText(l,cx,y);}x.fillText(l,cx,y);});
  };
  const mk=(w,h,off)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.setTransform(1/cell,0,0,1/cell,off,off);x.fillStyle='#fff';x.strokeStyle='#fff';x.lineJoin='round';x.lineCap='round';return x;};
  // footprint mask (cell centres)
  const mx=mk(nx,ny,0);
  if(style==='plate'){roundRectPath(mx,0,0,W,H,p.radius);mx.fill();}
  else if(style==='contour'){mx.lineWidth=2*pad;drawText(mx,true);}
  else{drawText(mx,false);}
  if(loop){mx.beginPath();mx.arc(loopR,H/2,loopR,0,TAU);mx.fill();if(style==='contour')mx.fillRect(loopR,H/2-loopR*0.7,x0-loopR,loopR*1.4);}
  mx.globalCompositeOperation='destination-out';
  if(loop){mx.beginPath();mx.arc(loopR,H/2,holeR,0,TAU);mx.fill();}
  if(holes){mx.beginPath();mx.arc(side/2+pad*0.25,H/2,2,0,TAU);mx.arc(W-side/2-pad*0.25,H/2,2,0,TAU);mx.fill();}
  const md=mx.getImageData(0,0,nx,ny).data,mask=new Uint8Array(nx*ny);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)mask[j*nx+i]=md[((ny-1-j)*nx+i)*4+3]>110?1:0;
  // letter heights (vertices)
  const tx=mk(nx+1,ny+1,0.5);drawText(tx,false);
  if(style==='plate'&&p.border){tx.lineWidth=1.6;roundRectPath(tx,1.8,1.8,W-3.6,H-3.6,Math.max(0,p.radius-1.8));tx.stroke();}
  const td=tx.getImageData(0,0,nx+1,ny+1).data,Hh=new Float32Array((nx+1)*(ny+1));
  const eng=p.style==='engraved'&&style!=='letters',depth=eng?Math.min(p.textH,p.thick-0.6):p.textH;
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
    const a=td[((ny-j)*(nx+1)+i)*4+3]/255;
    Hh[j*(nx+1)+i]=style==='letters'?p.thick:eng?p.thick-a*depth:p.thick+a*depth;
  }
  let any=false;for(let i=0;i<mask.length;i++)if(mask[i]){any=true;break;}
  if(!any)throw new Error('Type some text to build the model.');
  const tris=heightfieldSolid(nx,ny,cell,Hh,mask);
  const notes=[['Footprint',`${fmt(W)} × ${fmt(H)} mm`],['Font',f.family]];
  if(style!=='letters'&&!eng)notes.push(['Colour swap at',`Z ${fmt(p.thick,2)} mm`]);
  return {shells:[tris],notes,file:slug(lines.join(' '))};
}

const MODELS=[
/* ---------------- Terrain ---------------- */
{id:'terrain',cat:'terrain',name:'Terrain map',
 tip:'<b>Print tip:</b> 0.12–0.16 mm layers bring out ridgelines. Pause for a white filament swap two-thirds of the way up for snowcaps.',
 params:[
  SEL('source','Elevation source',[['map','Map location'],['sample','Sample island'],['upload','Heightmap image']],'sample',{group:'Source',rerender:true}),
  {id:'place',type:'place',show:p=>p.source==='map'},
  R('area','Area width',0.5,60,0.5,8,'km',{show:p=>p.source==='map',refetch:true}),
  {id:'hm',label:'Heightmap',type:'image',target:'heightmap',show:p=>p.source==='upload'},
  CHK('terrarium','Terrarium-encoded (RGB) tile',false,{show:p=>p.source==='upload'}),
  R('size','Model width',30,250,1,120,'mm',{group:'Model'}),
  SEL('shape','Outline',[['square','Square'],['circle','Circle'],['hex','Hexagon']],'square'),
  R('exag','Vertical exaggeration',0.5,6,0.1,1.6,'×',{show:p=>p.source!=='upload'}),
  R('relief','Relief height',2,60,0.5,18,'mm',{show:p=>p.source==='upload'}),
  R('base','Base thickness',0.8,12,0.2,3,'mm'),
  CHK('sea','Flatten water below sea level',true,{show:p=>p.source!=='upload'}),
  SEL('detail','Detail',DETAIL,'normal',{group:'Output'})
 ],
 async build(p,ui){
  let ds,badge=null,label;
  if(p.source==='map'&&S.place){
    const key=`${S.place.lat.toFixed(5)},${S.place.lon.toFixed(5)},${p.area}`;
    if(!S.mapCache||S.mapCache.key!==key){
      ui.busy('Downloading elevation tiles');
      try{S.mapCache={key,ds:await fetchTerrain(S.place.lat,S.place.lon,p.area)};}
      catch(e){throw new Error(IN_CLAUDE?'Map elevation can’t load inside claude.ai. Open the desktop copy of Layerworks, or switch the source to Heightmap image.':'Couldn’t download elevation tiles. Check your connection and try again.');}
      ui.busy('Generating');
    }
    ds=S.mapCache.ds;label=S.place.name.split(',')[0];
  }else if(p.source==='upload'&&S.heightmapImg){ds=heightmapData(p.terrarium);label=S.heightmapName.replace(/\.\w+$/,'');}
  else{ds=island();label='sample-island';badge=p.source==='map'?'Sample terrain · choose a place':p.source==='upload'?'Sample terrain · load a heightmap':'Sample terrain';}
  const size=p.size,cell=cellFor(p.detail,size,size),n=Math.round(size/cell),c=size/n;
  const uv=(i,j)=>{let u=i/n,v=1-j/n;if(ds.w>ds.h)u=.5+(u-.5)*ds.h/ds.w;else if(ds.h>ds.w)v=.5+(v-.5)*ds.w/ds.h;return[u,v];};
  const E=new Float32Array((n+1)*(n+1)),sea=p.sea&&ds.metersWide&&p.source!=='upload';
  let emin=Infinity,emax=-Infinity;
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    const [u,v]=uv(i,j);let e=sampleGrid(ds,u,v);if(sea)e=Math.max(e,0);E[j*(n+1)+i]=e;
    if(shapeTest(p.shape,i/n,j/n)){if(e<emin)emin=e;if(e>emax)emax=e;}
  }
  if(!isFinite(emin)){emin=0;emax=1;}
  let mask=null;
  if(p.shape!=='square'){mask=new Uint8Array(n*n);for(let j=0;j<n;j++)for(let i=0;i<n;i++)mask[j*n+i]=shapeTest(p.shape,(i+.5)/n,(j+.5)/n)?1:0;}
  const scale=ds.metersWide&&p.source!=='upload'?size/ds.metersWide*p.exag:p.relief/Math.max(emax-emin,1e-6);
  const H=new Float32Array(E.length);for(let k=0;k<E.length;k++)H[k]=p.base+Math.max(0,E[k]-emin)*scale;
  await tick();
  const tris=heightfieldSolid(n,n,c,H,mask);
  const notes=[];
  if(ds.metersWide&&p.source!=='upload'){
    notes.push(['Real area',`${fmt(ds.metersWide/1000,1)} × ${fmt(ds.metersWide/1000,1)} km`],['Scale',`1 mm = ${fmt(ds.metersWide/size,1)} m`],['Elevation',`${Math.round(emin)} – ${Math.round(emax)} m`],['Relief',`${fmt((emax-emin)*scale)} mm (${fmt(p.exag)}× true)`]);
    if(S.place&&p.source==='map')notes.unshift(['Centre',`${fmt(S.place.lat,4)}, ${fmt(S.place.lon,4)}`]);
  }else notes.push(['Relief',`${fmt(p.relief)} mm`]);
  notes.push(['Grid',`${n} × ${n} @ ${fmt(c,2)} mm`]);
  return {shells:[tris],notes,badge,file:'terrain-'+slug(label)};
 }},

/* ---------------- Photo ---------------- */
{id:'litho',cat:'photo',name:'Lithophane',
 tip:'<b>Print tip:</b> white PLA, 100% infill, 0.12 mm layers, printed standing up (curved panels already stand). Hold it against a light to see the photo.',
 params:[
  {id:'img',label:'Photo',type:'image',target:'photo',group:'Image'},
  R('bright','Brightness',-0.5,0.5,0.01,0,''),
  R('contrast','Contrast',0.5,2.5,0.05,1.1,'×'),
  R('width','Width',30,220,1,100,'mm',{group:'Panel'}),
  SEL('shape','Outline',[['rect','Rectangle'],['circle','Circle']],'rect',{rerender:true}),
  R('minT','Thinnest (highlights)',0.4,2,0.1,0.8,'mm'),
  R('maxT','Thickest (shadows)',1.5,6,0.1,3.2,'mm'),
  R('frame','Frame width',0,10,0.5,3,'mm'),
  R('curve','Curve',0,180,5,0,'°',{show:p=>p.shape==='rect'}),
  SEL('detail','Detail',DETAIL,'normal',{group:'Output'})
 ],
 async build(p){
  const src=S.photo.src,circle=p.shape==='circle',Wm=p.width,Hm=circle?Wm:Wm*src.height/src.width;
  const cell=cellFor(p.detail,Wm,Hm),nx=Math.round(Wm/cell),c=Wm/nx,ny=Math.max(2,Math.round(Hm/c));
  const L=lumGrid(src,nx,ny,circle),W=nx+1,H=new Float32Array(L.length),Wt=nx*c,Ht=ny*c;
  const maxT=Math.max(p.maxT,p.minT+0.2);
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
    const k=j*W+i,x=i*c,y=j*c;let l=clamp((L[k]-.5)*p.contrast+.5+p.bright,0,1);
    let t=p.minT+(1-l)*(maxT-p.minT);
    const edge=circle?Wt/2-Math.hypot(x-Wt/2,y-Ht/2):Math.min(x,y,Wt-x,Ht-y);
    if(p.frame>0&&edge<p.frame)t=maxT;
    H[k]=t;
  }
  let mask=null;
  if(circle){mask=new Uint8Array(nx*ny);for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const dx=(i+.5)*c-Wt/2,dy=(j+.5)*c-Ht/2;mask[j*nx+i]=dx*dx+dy*dy<=(Wt/2)**2?1:0;}}
  else if(p.curve>0)mask=new Uint8Array(nx*ny).fill(1);
  await tick();
  let tris=heightfieldSolid(nx,ny,c,H,mask);
  if(!circle&&p.curve>0){
    const ang=p.curve*Math.PI/180,Rr=Wt/ang;
    transformTris(tris,q=>{const th=(q[0]-Wt/2)/Rr,r=Rr+q[2],y=q[1];q[0]=r*Math.sin(th);q[1]=r*Math.cos(th)-Rr;q[2]=y;});
    orientShell(tris);
  }
  const notes=[['Panel',`${fmt(Wt)} × ${fmt(Ht)} mm`],['Thickness',`${fmt(p.minT)} – ${fmt(maxT)} mm`],['Grid',`${nx} × ${ny} @ ${fmt(c,2)} mm`]];
  if(!circle&&p.curve>0)notes.push(['Arc radius',`${fmt(Wt/(p.curve*Math.PI/180))} mm`]);
  return {shells:[tris],notes,badge:S.photo.sample?'Sample photo':null,file:'lithophane-'+slug(S.photo.name)};
 }},
{id:'relief',cat:'photo',name:'Photo relief',
 tip:'<b>Print tip:</b> bright areas rise highest. Print flat with 0.12 mm layers; a filament swap near the top makes the high points pop.',
 params:[
  {id:'img',label:'Photo',type:'image',target:'photo',group:'Image'},
  R('bright','Brightness',-0.5,0.5,0.01,0,''),
  R('contrast','Contrast',0.5,2.5,0.05,1.2,'×'),
  CHK('invert','Invert (dark areas rise)',false),
  R('width','Width',30,220,1,110,'mm',{group:'Tile'}),
  SEL('shape','Outline',[['rect','Rectangle'],['circle','Circle']],'rect'),
  R('base','Base thickness',0.8,8,0.2,2,'mm'),
  R('depth','Relief depth',0.4,10,0.1,3,'mm'),
  SEL('detail','Detail',DETAIL,'normal',{group:'Output'})
 ],
 async build(p){
  const src=S.photo.src,circle=p.shape==='circle',Wm=p.width,Hm=circle?Wm:Wm*src.height/src.width;
  const cell=cellFor(p.detail,Wm,Hm),nx=Math.round(Wm/cell),c=Wm/nx,ny=Math.max(2,Math.round(Hm/c));
  const L=lumGrid(src,nx,ny,circle),H=new Float32Array(L.length);
  for(let k=0;k<L.length;k++){let l=clamp((L[k]-.5)*p.contrast+.5+p.bright,0,1);if(p.invert)l=1-l;H[k]=p.base+l*p.depth;}
  let mask=null;const Wt=nx*c,Ht=ny*c;
  if(circle){mask=new Uint8Array(nx*ny);for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const dx=(i+.5)*c-Wt/2,dy=(j+.5)*c-Ht/2;mask[j*nx+i]=dx*dx+dy*dy<=(Wt/2)**2?1:0;}}
  await tick();
  const tris=heightfieldSolid(nx,ny,c,H,mask);
  return {shells:[tris],notes:[['Tile',`${fmt(Wt)} × ${fmt(Ht)} mm`],['Height',`${fmt(p.base)} – ${fmt(p.base+p.depth)} mm`],['Grid',`${nx} × ${ny} @ ${fmt(c,2)} mm`]],badge:S.photo.sample?'Sample photo':null,file:'relief-'+slug(S.photo.name)};
 }},

/* ---------------- Text ---------------- */
{id:'plate',cat:'text',name:'Name plate',
 tip:'<b>Two colours:</b> add a filament change at the Z height shown below and the letters print in a second colour.',
 params:textParams({text:'Gui’s Workshop',font:'archivo',size:12,textH:1.2,plate:'plate',thick:2.4,pad:6,border:true,loop:false,holes:false}),
 build:buildText},
{id:'keychain',cat:'text',name:'Keychain',
 tip:'<b>Print tip:</b> 3 walls keep the loop strong. Swap filament at the Z height below for two-tone letters.',
 params:textParams({text:'Gui',font:'pacifico',size:16,textH:1.4,plate:'contour',thick:2.6,pad:2.5,border:false,loop:true,holes:false}),
 build:buildText},

/* ---------------- Storage ---------------- */
{id:'box',cat:'storage',name:'Box with lid',
 tip:'<b>Print tip:</b> the lid prints upside down with its lip facing up. 0.2–0.3 mm clearance suits most printers; go looser for PETG.',
 params:[
  R('w','Width',20,250,1,90,'mm',{group:'Size (outside)'}),R('d','Depth',20,250,1,60,'mm'),R('h','Height',8,200,1,40,'mm'),
  R('wall','Wall',0.8,4,0.1,1.6,'mm',{group:'Walls'}),R('floor','Floor',0.6,4,0.1,1.4,'mm'),R('r','Corner radius',0,20,0.5,5,'mm'),
  R('dx','Dividers across',0,8,1,1,'',{group:'Compartments'}),R('dy','Dividers along',0,8,1,0,''),
  CHK('lid','Include lid',true,{group:'Lid',rerender:true}),
  R('clear','Lid clearance',0.1,0.8,0.05,0.25,'mm',{show:p=>p.lid}),R('lidT','Lid thickness',1,4,0.1,1.6,'mm',{show:p=>p.lid}),R('lip','Lip height',2,10,0.5,4,'mm',{show:p=>p.lid})
 ],
 async build(p){
  const sh=[],w=Math.min(p.wall,p.w/4,p.d/4),iw=p.w-2*w,id=p.d-2*w,ir=Math.max(p.r-w,0.3);
  sh.push(extrude(rrPath(p.w,p.d,p.r),0,p.floor));
  const ws=rrPath(p.w,p.d,p.r);ws.holes.push(rrPath(iw,id,ir,0,0,true));sh.push(extrude(ws,p.floor-0.02,p.h-p.floor+0.02));
  const dTop=p.lid?p.h-p.lip-0.8:p.h;
  for(let k=1;k<=p.dx;k++){const x=-iw/2+k*iw/(p.dx+1);sh.push(boxTris(x-w/2,-id/2-w/2,p.floor-0.02,x+w/2,id/2+w/2,dTop));}
  for(let k=1;k<=p.dy;k++){const y=-id/2+k*id/(p.dy+1);sh.push(boxTris(-iw/2-w/2,y-w/2,p.floor-0.02,iw/2+w/2,y+w/2,dTop));}
  const notes=[['Inside',`${fmt(iw)} × ${fmt(id)} × ${fmt(p.h-p.floor)} mm`],['Compartments',String((p.dx+1)*(p.dy+1))]];
  if(p.lid){
    const along=p.w<=p.d,ox=along?p.w+8:0,oy=along?0:p.d+8;
    sh.push(extrude(rrPath(p.w,p.d,p.r,ox,oy),0,p.lidT));
    const lw=iw-2*p.clear,ld=id-2*p.clear,lt=Math.max(1.2,w);
    const ls=rrPath(lw,ld,Math.max(ir-p.clear,0.3),ox,oy);ls.holes.push(rrPath(lw-2*lt,ld-2*lt,Math.max(ir-p.clear-lt,0.3),ox,oy,true));
    sh.push(extrude(ls,p.lidT-0.02,p.lip+0.02));
    notes.push(['Closed height',`${fmt(p.h+p.lidT)} mm`]);
  }
  return {shells:sh,notes,file:`box-${p.w}x${p.d}x${p.h}`};
 }},
{id:'canister',cat:'storage',name:'Round canister',
 tip:'<b>Print tip:</b> good for pens, brushes and loose parts. Hexagon and octagon versions print without overhangs on the lid lip.',
 params:[
  R('dia','Diameter',20,200,1,70,'mm',{group:'Size (outside)'}),R('h','Height',10,250,1,90,'mm'),
  SEL('sides','Shape',[['96','Round'],['6','Hexagon'],['8','Octagon'],['12','12-sided']],'96'),
  R('wall','Wall',0.8,4,0.1,1.6,'mm',{group:'Walls'}),R('floor','Floor',0.6,4,0.1,1.4,'mm'),
  CHK('lid','Include lid',true,{group:'Lid',rerender:true}),
  R('clear','Lid clearance',0.1,0.8,0.05,0.25,'mm',{show:p=>p.lid}),R('lidT','Lid thickness',1,4,0.1,1.6,'mm',{show:p=>p.lid}),R('lip','Lip height',2,12,0.5,5,'mm',{show:p=>p.lid})
 ],
 async build(p){
  const n=+p.sides,R0=p.dia/2/(n<40?Math.cos(Math.PI/n):1),k=n<40?1/Math.cos(Math.PI/n):1,rot=n<40?Math.PI/n:0,sh=[];
  const Ri=R0-p.wall*k;
  sh.push(ringTris(R0,0,0,p.floor,n,0,0,rot));
  sh.push(ringTris(R0,Ri,p.floor-0.02,p.h-p.floor+0.02,n,0,0,rot));
  const notes=[['Inside',`Ø ${fmt(p.dia-2*p.wall)} × ${fmt(p.h-p.floor)} mm`],['Capacity',`${fmt(Math.PI*((p.dia/2-p.wall)**2)*(p.h-p.floor)/1000,0)} ml`]];
  if(p.lid){
    const ox=p.dia*(n<40?1/Math.cos(Math.PI/n):1)+8,lt=Math.max(1.2,p.wall);
    sh.push(ringTris(R0,0,0,p.lidT,n,ox,0,rot));
    sh.push(ringTris(Ri-p.clear*k,Ri-(p.clear+lt)*k,p.lidT-0.02,p.lip+0.02,n,ox,0,rot));
  }
  return {shells:sh,notes,file:`canister-${p.dia}x${p.h}`};
 }},
{id:'hook',cat:'storage',name:'Pegboard hook',
 tip:'<b>Print tip:</b> prints lying on its side so layers run along the arm, which makes it much stronger. Standard pegboard uses 1 in. (25.4 mm) hole spacing.',
 params:[
  SEL('spacing','Hole spacing',[['25.4','1 in. (25.4 mm)'],['38','38 mm'],['50','50 mm']],'25.4',{group:'Board'}),
  R('peg','Peg size',3,8,0.1,5.2,'mm'),R('board','Board thickness',3,8,0.5,5,'mm'),
  R('arm','Arm length',10,120,1,45,'mm',{group:'Hook'}),R('tip','Tip height',0,30,1,10,'mm'),
  R('t','Profile thickness',3,10,0.5,5,'mm'),R('width','Width',4,30,0.5,8,'mm')
 ],
 async build(p){
  const s=+p.spacing,T=p.t,g=p.peg,b=p.board+0.8,y0=2,Hh=y0+s+g+2,W=p.width,sh=[];
  const rect=(x0,y0_,x1,y1)=>sh.push(boxTris(x0,y0_,0,x1,y1,W));
  rect(0,0,T,Hh);
  rect(-b,y0,0.02,y0+g);
  rect(-b,y0+s,0.02,y0+s+g); rect(-b-g,y0+s-g*1.2,-b+0.02,y0+s+g);
  rect(T-0.02,0,T+p.arm,T);
  if(p.tip>0)rect(T+p.arm-T,T-0.02,T+p.arm,T+p.tip);
  return {shells:sh,notes:[['Reach',`${fmt(p.arm+T)} mm`],['Peg centres',`${fmt(s)} mm apart`]],file:`pegboard-hook-${p.arm}mm`};
 }},

/* ---------------- Mechanical ---------------- */
{id:'gear',cat:'mech',name:'Spur gear',
 tip:'<b>Meshing:</b> two gears mesh when module and pressure angle match. Centre distance = module × (teeth₁ + teeth₂) ÷ 2.',
 params:[
  R('teeth','Teeth',8,100,1,24,'',{group:'Tooth form'}),R('module','Module',0.5,5,0.1,2,'mm'),
  SEL('pa','Pressure angle',[['20','20°'],['14.5','14.5°'],['25','25°']],'20'),R('backlash','Backlash',0,0.4,0.02,0.1,'mm'),
  R('thick','Face width',2,40,0.5,8,'mm',{group:'Body'}),R('bore','Bore',0,40,0.1,5,'mm'),CHK('flat','D-flat bore',false),
  R('hubD','Hub diameter',0,60,0.5,14,'mm'),R('hubH','Hub height',0,30,0.5,5,'mm')
 ],
 async build(p){
  const g=gearPoints(p.teeth,p.module,+p.pa,p.backlash);
  const shp=new THREE.Shape(g.pts.map(q=>new THREE.Vector2(q[0],q[1])));
  const bore=Math.min(p.bore,g.rf*2-2);
  if(bore>0.5)shp.holes.push(borePath(bore,p.flat));
  const sh=[extrude(shp,0,p.thick,12)];
  if(p.hubH>0&&p.hubD>bore+1.5){const hs=polyPath(p.hubD/2,96);if(bore>0.5)hs.holes.push(borePath(bore,p.flat));sh.push(extrude(hs,p.thick-0.02,p.hubH+0.02,48));}
  return {shells:sh,notes:[['Pitch Ø',`${fmt(g.rp*2,2)} mm`],['Outside Ø',`${fmt(g.ra*2,2)} mm`],['Root Ø',`${fmt(g.rf*2,2)} mm`],['Circular pitch',`${fmt(Math.PI*p.module,2)} mm`]],file:`gear-m${p.module}-${p.teeth}t`};
 }},
{id:'spacer',cat:'mech',name:'Spacers',
 tip:'<b>Sizing:</b> M3 clearance ≈ 3.4 mm, M4 ≈ 4.5 mm, M5 ≈ 5.5 mm. Holes print slightly small, so add 0.2 mm if bolts are tight.',
 params:[
  SEL('style','Shape',[['96','Round'],['6','Hex']],'96',{group:'Spacer'}),
  R('od','Outside size',3,60,0.1,12,'mm'),R('id','Hole',0,50,0.1,5.5,'mm'),R('h','Length',0.5,80,0.1,10,'mm'),
  R('count','Quantity',1,24,1,6,'',{group:'Batch'})
 ],
 async build(p){
  const n=+p.style,k=n<40?1/Math.cos(Math.PI/n):1,Ro=p.od/2*k,Ri=Math.min(p.id/2,p.od/2-0.6),cols=Math.ceil(Math.sqrt(p.count)),pitch=p.od*k+4,sh=[];
  for(let q=0;q<p.count;q++){const cx=(q%cols)*pitch,cy=Math.floor(q/cols)*pitch;sh.push(ringTris(Ro,Ri>0.3?Ri:0,0,p.h,n,cx,cy,n<40?Math.PI/n:0));}
  return {shells:sh,notes:[['Each',`${n<40?'hex '+fmt(p.od)+' AF':'Ø '+fmt(p.od)} × ${fmt(p.h)} mm`],['Hole',`Ø ${fmt(p.id)} mm`]],file:`spacer-${p.od}x${p.h}-x${p.count}`};
 }},
{id:'bracket',cat:'mech',name:'L-bracket',
 tip:'<b>Print tip:</b> prints as shown with no supports. Use 4 walls and 40% infill for load-bearing brackets.',
 params:[
  R('a','Base leg',15,150,1,50,'mm',{group:'Legs'}),R('b','Upright leg',15,150,1,40,'mm'),R('w','Width',8,80,1,24,'mm'),R('t','Thickness',2,10,0.5,4,'mm'),
  R('hole','Hole diameter',0,12,0.1,4.5,'mm',{group:'Holes'}),R('holes','Holes per leg',0,4,1,2,''),
  CHK('gusset','Side gussets',true,{group:'Reinforcement'})
 ],
 async build(p){
  const sh=[],t=p.t,W=p.w,hr=p.hole/2;
  const leg=(len)=>{const s=rrPath(len,W,Math.min(3,W/4),len/2,W/2);s.holes=[];
    if(hr>0.2)for(let k=0;k<p.holes;k++){const x=t+(len-t)*(k+1)/(p.holes+1);if(x-hr>t+0.6&&x+hr<len-0.6)s.holes.push(circlePath(hr,x,W/2));}return s;};
  sh.push(extrude(leg(p.a),0,t));
  const up=extrude(leg(p.b),0,t);transformTris(up,q=>{const a=q[0],b=q[1],c=q[2];q[0]=c;q[1]=b;q[2]=a;});orientShell(up);sh.push(up);
  if(p.gusset){
    const gz=Math.min(p.a,p.b)*0.6,gt=Math.min(t,W/4);
    const tri=new THREE.Shape([new THREE.Vector2(t-0.05,t-0.05),new THREE.Vector2(t+gz,t-0.05),new THREE.Vector2(t-0.05,t+gz)]);
    for(const y0 of [0,W-gt]){const g=extrude(tri,y0,gt);transformTris(g,q=>{const a=q[0],b=q[1],c=q[2];q[0]=a;q[1]=c;q[2]=b;});orientShell(g);sh.push(g);}
  }
  return {shells:sh,notes:[['Legs',`${p.a} × ${p.b} mm`],['Fastener',hr>0?`Ø ${fmt(p.hole)} mm × ${p.holes} per leg`:'none']],file:`l-bracket-${p.a}x${p.b}`};
 }},

/* ---------------- Decorative ---------------- */
{id:'vase',cat:'deco',name:'Vase',
 tip:'<b>Spiral mode:</b> the solid version is meant for your slicer’s spiral/vase mode, which prints one continuous wall. Choose Walled to print it normally.',
 params:[
  {id:'presets',type:'presets',group:'Presets',items:[
    {label:'Twisted hex',set:{sides:'6',twist:120,ripples:0,rBase:32,rBelly:48,rNeck:30,rTop:36,belly:0.35}},
    {label:'Ripple',set:{sides:'96',twist:40,ripples:14,rippleD:4,rBase:34,rBelly:52,rNeck:34,rTop:40,belly:0.4}},
    {label:'Classic urn',set:{sides:'96',twist:0,ripples:0,rBase:28,rBelly:58,rNeck:22,rTop:34,belly:0.38}},
    {label:'Planter',set:{sides:'8',twist:45,ripples:0,rBase:40,rBelly:48,rNeck:52,rTop:56,belly:0.5,height:110,mode:'walled'}}]},
  R('height','Height',30,300,1,160,'mm',{group:'Profile'}),
  R('rBase','Base radius',10,120,0.5,32,'mm'),R('rBelly','Belly radius',10,140,0.5,48,'mm'),R('belly','Belly position',0.1,0.8,0.01,0.35,''),
  R('rNeck','Neck radius',8,140,0.5,30,'mm'),R('rTop','Lip radius',8,140,0.5,36,'mm'),
  SEL('sides','Cross-section',[['96','Round'],['5','Pentagon'],['6','Hexagon'],['8','Octagon'],['12','12-sided']],'6',{group:'Surface'}),
  R('twist','Twist',-360,360,5,120,'°'),R('ripples','Ripples',0,36,1,0,''),R('rippleD','Ripple depth',0,8,0.1,3,'mm',{show:p=>p.ripples>0}),
  SEL('mode','Print as',[['solid','Solid (spiral vase mode)'],['walled','Walled container']],'solid',{group:'Output',rerender:true}),
  R('wall','Wall',0.8,5,0.1,2,'mm',{show:p=>p.mode==='walled'}),R('floor','Floor',0.8,6,0.1,2,'mm',{show:p=>p.mode==='walled'})
 ],
 async build(p){
  const knots=[[0,p.rBase],[p.belly,p.rBelly],[Math.max(p.belly+0.1,0.84),p.rNeck],[1,p.rTop]];
  const profile=t=>{for(let k=0;k<knots.length-1;k++){const [t0,r0]=knots[k],[t1,r1]=knots[k+1];if(t<=t1||k===knots.length-2){const u=clamp((t-t0)/(t1-t0),0,1);return lerp(r0,r1,(1-Math.cos(Math.PI*u))/2);}}return p.rTop;};
  const tris=vaseTris({height:p.height,profile,sides:+p.sides,twist:p.twist,ripples:p.ripples,rippleDepth:p.rippleD,walled:p.mode==='walled',wall:p.wall,floor:p.floor});
  return {shells:[tris],notes:[['Height',`${fmt(p.height)} mm`],['Max Ø',`${fmt(2*Math.max(p.rBase,p.rBelly,p.rNeck,p.rTop))} mm`]],file:`vase-${p.height}mm`};
 }},
{id:'coaster',cat:'deco',name:'Pattern coaster',
 tip:'<b>Print tip:</b> a filament swap at the Z height below makes the pattern a second colour. Add felt pads underneath for a finished look.',
 params:[
  R('dia','Diameter',50,160,1,96,'mm',{group:'Coaster'}),SEL('shape','Outline',[['circle','Circle'],['hex','Hexagon'],['square','Square']],'hex'),
  R('base','Base thickness',1.2,6,0.2,3,'mm'),R('rim','Rim width',0,10,0.5,3,'mm'),
  SEL('pattern','Pattern',[['hex','Honeycomb'],['waves','Waves'],['rings','Rings'],['lattice','Lattice']],'hex',{group:'Pattern'}),
  R('scale','Pattern size',4,30,0.5,9,'mm'),R('lw','Line width',0.6,4,0.1,1.4,'mm'),R('depth','Pattern height',0.4,4,0.1,1.2,'mm'),
  SEL('detail','Detail',DETAIL,'normal',{group:'Output'})
 ],
 async build(p){
  const D=p.dia,cell=cellFor(p.detail,D,D),n=Math.round(D/cell),c=D/n,Rr=D/2,s3=Math.sqrt(3);
  const H=new Float32Array((n+1)*(n+1));
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    const x=i*c-Rr,y=j*c-Rr,qx=Math.abs(x),qy=Math.abs(y);
    const edge=p.shape==='circle'?Rr-Math.hypot(x,y):p.shape==='square'?Math.min(Rr-qx,Rr-qy):Math.min(Rr*s3/2-qy,(s3*Rr-s3*qx-qy)/2);
    const v=edge<p.rim?1:patternValue(p.pattern,x,y,p.scale,p.lw);
    H[j*(n+1)+i]=p.base+p.depth*v;
  }
  let mask=null;
  if(p.shape!=='square'){mask=new Uint8Array(n*n);for(let j=0;j<n;j++)for(let i=0;i<n;i++)mask[j*n+i]=shapeTest(p.shape,(i+.5)/n,(j+.5)/n)?1:0;}
  await tick();
  return {shells:[heightfieldSolid(n,n,c,H,mask)],notes:[['Colour swap at',`Z ${fmt(p.base,2)} mm`],['Grid',`${n} × ${n} @ ${fmt(c,2)} mm`]],file:`coaster-${p.pattern}`};
 }}
];
const MODEL_BY_ID=Object.fromEntries(MODELS.map(m=>[m.id,m]));
