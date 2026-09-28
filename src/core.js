/* ===== Layerworks geometry core (no DOM) ===== */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const TAU=Math.PI*2;

class TriBuf{
  constructor(cap){this.a=new Float32Array(Math.max(1024,cap|0)*9);this.n=0;}
  t(ax,ay,az,bx,by,bz,cx,cy,cz){
    const o=this.n*9;
    if(o+9>this.a.length){const b=new Float32Array(this.a.length*2);b.set(this.a);this.a=b;}
    const a=this.a;a[o]=ax;a[o+1]=ay;a[o+2]=az;a[o+3]=bx;a[o+4]=by;a[o+5]=bz;a[o+6]=cx;a[o+7]=cy;a[o+8]=cz;this.n++;
  }
  q(a,b,c,d){this.t(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);this.t(a[0],a[1],a[2],c[0],c[1],c[2],d[0],d[1],d[2]);}
  out(){return this.a.slice(0,this.n*9);}
}

function signedVolume(a){
  let v=0;
  for(let o=0;o<a.length;o+=9){
    const ax=a[o],ay=a[o+1],az=a[o+2],bx=a[o+3],by=a[o+4],bz=a[o+5],cx=a[o+6],cy=a[o+7],cz=a[o+8];
    v+=ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx);
  }
  return v/6;
}
function orientShell(a){
  if(signedVolume(a)<0){
    for(let o=0;o<a.length;o+=9){for(let k=0;k<3;k++){const t=a[o+3+k];a[o+3+k]=a[o+6+k];a[o+6+k]=t;}}
  }
  return a;
}
function transformTris(a,fn){
  const p=[0,0,0];
  for(let o=0;o<a.length;o+=3){p[0]=a[o];p[1]=a[o+1];p[2]=a[o+2];fn(p);a[o]=p[0];a[o+1]=p[1];a[o+2]=p[2];}
  return a;
}
function boxTris(x0,y0,z0,x1,y1,z1){
  const tb=new TriBuf(12);
  const P=(x,y,z)=>[x,y,z];
  const a=P(x0,y0,z0),b=P(x1,y0,z0),c=P(x1,y1,z0),d=P(x0,y1,z0),e=P(x0,y0,z1),f=P(x1,y0,z1),g=P(x1,y1,z1),h=P(x0,y1,z1);
  tb.q(a,d,c,b); tb.q(e,f,g,h); tb.q(a,b,f,e); tb.q(b,c,g,f); tb.q(c,d,h,g); tb.q(d,a,e,h);
  return orientShell(tb.out());
}

/* Remove cells that touch only diagonally (keeps the surface manifold). */
function cleanMask(mask,nx,ny){
  for(let pass=0;pass<4;pass++){
    let changed=false;
    for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
      const k=j*nx+i,a=mask[k],b=mask[k+1],c=mask[k+nx],d=mask[k+nx+1];
      if(a&&d&&!b&&!c){mask[k+1]=1;changed=true;}
      else if(b&&c&&!a&&!d){mask[k]=1;changed=true;}
    }
    if(!changed)break;
  }
}

/* Watertight solid from a height grid.
   H: (nx+1)*(ny+1) vertex heights (z of top surface, bottom at z=0); index j*(nx+1)+i, j = +y.
   mask: optional Uint8Array nx*ny (cell j*nx+i) – cells to include. */
function heightfieldSolid(nx,ny,cell,H,mask){
  if(mask)cleanMask(mask,nx,ny);
  const W=nx+1, tb=new TriBuf(nx*ny*(mask?4:2)+8*(nx+ny)+16);
  const inside=mask?((i,j)=>i>=0&&j>=0&&i<nx&&j<ny&&mask[j*nx+i]):((i,j)=>i>=0&&j>=0&&i<nx&&j<ny);
  for(let j=0;j<ny;j++){
    const y0=j*cell,y1=y0+cell;
    for(let i=0;i<nx;i++){
      if(mask&&!mask[j*nx+i])continue;
      const x0=i*cell,x1=x0+cell;
      const h00=H[j*W+i],h10=H[j*W+i+1],h01=H[(j+1)*W+i],h11=H[(j+1)*W+i+1];
      tb.t(x0,y0,h00, x1,y0,h10, x1,y1,h11);
      tb.t(x0,y0,h00, x1,y1,h11, x0,y1,h01);
      if(mask){tb.t(x0,y0,0, x1,y1,0, x1,y0,0);tb.t(x0,y0,0, x0,y1,0, x1,y1,0);}
      if(!inside(i-1,j))tb.q([x0,y0,0],[x0,y0,h00],[x0,y1,h01],[x0,y1,0]);
      if(!inside(i+1,j))tb.q([x1,y0,0],[x1,y1,0],[x1,y1,h11],[x1,y0,h10]);
      if(!inside(i,j-1))tb.q([x0,y0,0],[x1,y0,0],[x1,y0,h10],[x0,y0,h00]);
      if(!inside(i,j+1))tb.q([x0,y1,0],[x0,y1,h01],[x1,y1,h11],[x1,y1,0]);
    }
  }
  if(!mask){
    const cx=nx*cell/2,cy=ny*cell/2,per=[];
    for(let i=0;i<nx;i++)per.push([i*cell,0]);
    for(let j=0;j<ny;j++)per.push([nx*cell,j*cell]);
    for(let i=nx;i>0;i--)per.push([i*cell,ny*cell]);
    for(let j=ny;j>0;j--)per.push([0,j*cell]);
    for(let k=0;k<per.length;k++){const p=per[k],q=per[(k+1)%per.length];tb.t(cx,cy,0,q[0],q[1],0,p[0],p[1],0);}
  }
  return tb.out();
}

/* Bilinear sample from a grid (w*h, row 0 = top). u,v in [0,1]. */
function sampleGrid(g,u,v){
  const x=clamp(u,0,1)*(g.w-1),y=clamp(v,0,1)*(g.h-1);
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,g.w-1),y1=Math.min(y0+1,g.h-1),fx=x-x0,fy=y-y0,d=g.data;
  return lerp(lerp(d[y0*g.w+x0],d[y0*g.w+x1],fx),lerp(d[y1*g.w+x0],d[y1*g.w+x1],fx),fy);
}

/* Shape masks in normalised coords (u,v in 0..1, square footprint) */
function shapeTest(shape,u,v){
  const x=u-.5,y=v-.5;
  if(shape==='circle')return x*x+y*y<=.25;
  if(shape==='hex'){const qx=Math.abs(x),qy=Math.abs(y),R=.5,s=Math.sqrt(3);return qy<=R*s/2&&s*qx+qy<=s*R;}
  return true;
}

/* ---------- noise ---------- */
function hash2(i,j,seed){let h=(i*374761393+j*668265263+seed*1442695041)|0;h=(h^(h>>>13))*1274126177|0;return((h^(h>>>16))>>>0)/4294967295;}
function vnoise(x,y,seed){
  const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  return lerp(lerp(hash2(i,j,seed),hash2(i+1,j,seed),u),lerp(hash2(i,j+1,seed),hash2(i+1,j+1,seed),u),v);
}
function fbm(x,y,seed,oct=6){let a=.5,f=1,s=0,n=0;for(let k=0;k<oct;k++){s+=a*vnoise(x*f,y*f,seed+k*17);n+=a;a*=.5;f*=2.03;}return s/n;}
function ridged(x,y,seed,oct=6){let a=.5,f=1,s=0,n=0;for(let k=0;k<oct;k++){const v=1-Math.abs(vnoise(x*f,y*f,seed+k*31)*2-1);s+=a*v*v;n+=a;a*=.5;f*=2.1;}return s/n;}

function sampleIsland(N=257){
  const data=new Float32Array(N*N);
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const u=i/(N-1),v=j/(N-1),dx=u-.52,dy=v-.47;
    const d=Math.sqrt(dx*dx*1.1+dy*dy)*2;
    const warp=fbm(u*3,v*3,7,4)*.6;
    let h=ridged(u*4+warp,v*4-warp,3,6)*.85+fbm(u*6,v*6,11,5)*.35;
    h=h*(1-smooth(.35,.98,d+fbm(u*5,v*5,2,4)*.3))-0.18+.12*(1-d);
    data[j*N+i]=h*2300;
  }
  return {w:N,h:N,data,metersWide:12000,name:'Sample island'};
}

/* ---------- STL + ZIP ---------- */
function toSTL(tris,label){
  const n=tris.length/9|0,buf=new ArrayBuffer(84+n*50),dv=new DataView(buf),hdr=(label||'Layerworks STL').slice(0,79);
  for(let i=0;i<hdr.length;i++)dv.setUint8(i,hdr.charCodeAt(i)&127);
  dv.setUint32(80,n,true);let o=84;
  for(let k=0;k<n;k++){
    const p=k*9,ax=tris[p],ay=tris[p+1],az=tris[p+2],bx=tris[p+3],by=tris[p+4],bz=tris[p+5],cx=tris[p+6],cy=tris[p+7],cz=tris[p+8];
    const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
    dv.setFloat32(o,nx,true);dv.setFloat32(o+4,ny,true);dv.setFloat32(o+8,nz,true);
    for(let q=0;q<9;q++)dv.setFloat32(o+12+q*4,tris[p+q],true);
    dv.setUint16(o+48,0,true);o+=50;
  }
  return buf;
}
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(u8){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=CRC_T[(c^u8[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}
function zipOne(name,data){
  const u8=new Uint8Array(data),nm=new TextEncoder().encode(name),crc=crc32(u8),n=nm.length;
  const out=new Uint8Array(30+n+u8.length+46+n+22),dv=new DataView(out.buffer);
  let o=0;
  dv.setUint32(o,0x04034b50,true);dv.setUint16(o+4,20,true);dv.setUint16(o+6,0,true);dv.setUint16(o+8,0,true);
  dv.setUint16(o+10,0,true);dv.setUint16(o+12,33,true);dv.setUint32(o+14,crc,true);dv.setUint32(o+18,u8.length,true);
  dv.setUint32(o+22,u8.length,true);dv.setUint16(o+26,n,true);dv.setUint16(o+28,0,true);out.set(nm,o+30);out.set(u8,o+30+n);
  const cd=30+n+u8.length;o=cd;
  dv.setUint32(o,0x02014b50,true);dv.setUint16(o+4,20,true);dv.setUint16(o+6,20,true);dv.setUint16(o+8,0,true);dv.setUint16(o+10,0,true);
  dv.setUint16(o+12,0,true);dv.setUint16(o+14,33,true);dv.setUint32(o+16,crc,true);dv.setUint32(o+20,u8.length,true);dv.setUint32(o+24,u8.length,true);
  dv.setUint16(o+28,n,true);dv.setUint16(o+30,0,true);dv.setUint16(o+32,0,true);dv.setUint16(o+34,0,true);dv.setUint16(o+36,0,true);
  dv.setUint32(o+38,0,true);dv.setUint32(o+42,0,true);out.set(nm,o+46);
  o=cd+46+n;
  dv.setUint32(o,0x06054b50,true);dv.setUint16(o+8,1,true);dv.setUint16(o+10,1,true);dv.setUint32(o+12,46+n,true);dv.setUint32(o+16,cd,true);
  return out;
}

/* ---------- THREE-based solids ---------- */
function geomTris(g){
  const gg=g.index?g.toNonIndexed():g;
  const src=gg.attributes.position.array,a=new Float32Array(src.length);let n=0;
  for(let o=0;o<src.length;o+=9){
    const ux=src[o+3]-src[o],uy=src[o+4]-src[o+1],uz=src[o+5]-src[o+2],vx=src[o+6]-src[o],vy=src[o+7]-src[o+1],vz=src[o+8]-src[o+2];
    if(Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)<1e-9)continue;
    for(let k=0;k<9;k++)a[n+k]=src[o+k];n+=9;
  }
  if(gg!==g)gg.dispose();g.dispose();
  return orientShell(a.slice(0,n));
}
function extrude(shape,z0,depth,segs=32){
  const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:segs});
  g.translate(0,0,z0);return geomTris(g);
}
function rrPath(w,h,r,cx=0,cy=0,path=false){
  const s=path?new THREE.Path():new THREE.Shape();
  r=Math.max(0,Math.min(r,w/2-0.01,h/2-0.01));const x=cx-w/2,y=cy-h/2;
  if(r<0.05){s.moveTo(x,y);s.lineTo(x+w,y);s.lineTo(x+w,y+h);s.lineTo(x,y+h);s.lineTo(x,y);return s;}
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.absarc(x+w-r,y+r,r,-Math.PI/2,0,false);
  s.lineTo(x+w,y+h-r);s.absarc(x+w-r,y+h-r,r,0,Math.PI/2,false);
  s.lineTo(x+r,y+h);s.absarc(x+r,y+h-r,r,Math.PI/2,Math.PI,false);
  s.lineTo(x,y+r);s.absarc(x+r,y+r,r,Math.PI,1.5*Math.PI,false);
  return s;
}
function polyPath(R,sides,cx=0,cy=0,path=false,rot=0){
  const s=path?new THREE.Path():new THREE.Shape();
  if(sides>=40){s.absarc(cx,cy,R,0,TAU,false);return s;}
  for(let k=0;k<=sides;k++){const a=rot+k*TAU/sides,x=cx+R*Math.cos(a),y=cy+R*Math.sin(a);k?s.lineTo(x,y):s.moveTo(x,y);}
  return s;
}
function circlePath(r,cx=0,cy=0){const p=new THREE.Path();p.absarc(cx,cy,r,0,TAU,true);return p;}
function ringTris(Ro,Ri,z0,h,sides=96,cx=0,cy=0,rot=0){
  const s=polyPath(Ro,sides,cx,cy,false,rot);
  if(Ri>0.05)s.holes.push(polyPath(Ri,sides,cx,cy,true,rot));
  return extrude(s,z0,h,48);
}

/* Involute spur gear outline */
function gearPoints(N,m,paDeg,backlash){
  const pa=paDeg*Math.PI/180,rp=m*N/2,rb=rp*Math.cos(pa),ra=rp+m,rf=Math.max(rp-1.25*m,0.5);
  const inv=a=>Math.tan(a)-a;
  const half=Math.PI/(2*N)+inv(pa)-(backlash/2)/rp;
  const pts=[],steps=8,r0=Math.max(rb,rf);
  for(let k=0;k<N;k++){
    const c=k*TAU/N;
    const flank=[];
    for(let s=0;s<=steps;s++){const r=lerp(r0,ra,s/steps),al=Math.acos(clamp(rb/r,-1,1));flank.push([r,half-inv(al)]);}
    const tipHalf=flank[steps][1];
    // root before rising flank
    pts.push([rf*Math.cos(c-Math.min(half,Math.PI/N*0.98)),rf*Math.sin(c-Math.min(half,Math.PI/N*0.98))]);
    for(const [r,h] of flank){const a=c-Math.max(h,0.002);pts.push([r*Math.cos(a),r*Math.sin(a)]);}
    if(tipHalf>0.004){for(let s=1;s<4;s++){const a=c-tipHalf+2*tipHalf*s/4;pts.push([ra*Math.cos(a),ra*Math.sin(a)]);}}
    for(let s=steps;s>=0;s--){const [r,h]=flank[s];const a=c+Math.max(h,0.002);pts.push([r*Math.cos(a),r*Math.sin(a)]);}
    const a1=c+Math.min(half,Math.PI/N*0.98),a2=c+TAU/N-Math.min(half,Math.PI/N*0.98);
    for(let s=0;s<=3;s++){const a=lerp(a1,a2,s/3);pts.push([rf*Math.cos(a),rf*Math.sin(a)]);}
  }
  // drop near-duplicates
  const out=[];for(const p of pts){const q=out[out.length-1];if(!q||Math.hypot(p[0]-q[0],p[1]-q[1])>1e-3)out.push(p);}
  const f=out[0],l=out[out.length-1];if(Math.hypot(f[0]-l[0],f[1]-l[1])<1e-3)out.pop();
  return {pts:out,rp,ra,rf,rb};
}
function borePath(d,flat){
  const r=d/2,p=new THREE.Path();
  if(!flat){p.absarc(0,0,r,0,TAU,true);return p;}
  const fy=r*0.6,a=Math.asin(fy/r);           // D-flat at y = +0.6r  (≈ 5 mm shaft with 4.5 mm flat width)
  p.moveTo(-Math.cos(a)*r,fy);p.lineTo(Math.cos(a)*r,fy);p.absarc(0,0,r,a,Math.PI-a,true);
  return p;
}

/* Vase / container of revolution with optional twist, polygon and ripple */
function vaseTris(o){
  const {height,profile,sides,twist,ripples,rippleDepth,walled,wall,floor}=o;
  const segs=192,rings=clamp(Math.round(height/0.8),24,240),tb=new TriBuf(segs*rings*4+segs*6);
  const rAt=(t,th,off)=>{
    let r=profile(t)-off;
    if(sides<40){const sec=TAU/sides,a=((th%sec)+sec)%sec-sec/2;r=r*Math.cos(Math.PI/sides)/Math.cos(a);}
    if(ripples>0)r+=rippleDepth*Math.cos(ripples*th)*0.5;
    return Math.max(r,1);
  };
  const ring=(t,z,off)=>{const out=[];const tw=twist*Math.PI/180*t;for(let s=0;s<segs;s++){const th=s*TAU/segs;const r=rAt(t,th-tw,off);out.push([r*Math.cos(th),r*Math.sin(th),z]);}return out;};
  const outer=[];for(let k=0;k<=rings;k++){const t=k/rings;outer.push(ring(t,t*height,0));}
  for(let k=0;k<rings;k++)for(let s=0;s<segs;s++){const s1=(s+1)%segs;tb.q(outer[k][s],outer[k][s1],outer[k+1][s1],outer[k+1][s]);}
  for(let s=0;s<segs;s++){const s1=(s+1)%segs,a=outer[0][s],b=outer[0][s1];tb.t(0,0,0,b[0],b[1],b[2],a[0],a[1],a[2]);}
  if(!walled){
    const top=outer[rings];for(let s=0;s<segs;s++){const s1=(s+1)%segs,a=top[s],b=top[s1];tb.t(0,0,height,a[0],a[1],a[2],b[0],b[1],b[2]);}
  }else{
    const k0=Math.ceil(floor/height*rings);const inner=[];
    const zs=[floor];for(let k=k0;k<=rings;k++){const z=k/rings*height;if(z>floor+0.05)zs.push(z);}
    for(const z of zs)inner.push(ring(z/height,z,wall));
    for(let k=0;k<inner.length-1;k++)for(let s=0;s<segs;s++){const s1=(s+1)%segs;tb.q(inner[k][s],inner[k+1][s],inner[k+1][s1],inner[k][s1]);}
    const fl=inner[0];for(let s=0;s<segs;s++){const s1=(s+1)%segs,a=fl[s],b=fl[s1];tb.t(0,0,floor,a[0],a[1],a[2],b[0],b[1],b[2]);}
    const O=outer[rings],I=inner[inner.length-1];
    for(let s=0;s<segs;s++){const s1=(s+1)%segs;tb.q(I[s],O[s],O[s1],I[s1]);}
  }
  return orientShell(tb.out());
}

/* Coaster / tile patterns: returns 0..1 */
function patternValue(kind,x,y,scale,lw){
  if(kind==='hex'){
    const s=scale,ri=s*Math.sqrt(3)/2;let best=1e9;
    const col=Math.round(x/(1.5*s));
    for(let c=col-1;c<=col+1;c++){
      const cx=c*1.5*s,off=(c&1)?ri:0,row=Math.round((y-off)/(2*ri));
      for(let r=row-1;r<=row+1;r++){const cy=r*2*ri+off,dx=Math.abs(x-cx),dy=Math.abs(y-cy);const d=Math.max(dy,dx*Math.sqrt(3)/2+dy/2);if(d<best)best=d;}
    }
    return smooth(ri-lw,ri-lw*0.35,best);
  }
  if(kind==='waves'){const v=Math.sin(TAU*x/scale+2.2*Math.sin(TAU*y/(scale*2.6)));return smooth(0.35,0.85,v*0.5+0.5);}
  if(kind==='rings'){const r=Math.hypot(x,y);const v=Math.cos(TAU*r/scale);return smooth(0.3,0.8,v*0.5+0.5);}
  if(kind==='lattice'){const a=(x+y)/Math.SQRT2,b=(x-y)/Math.SQRT2;const la=Math.abs(((a/scale)%1+1)%1-.5)*scale,lb=Math.abs(((b/scale)%1+1)%1-.5)*scale;return Math.max(smooth(lw,lw*0.4,la),smooth(lw,lw*0.4,lb));}
  return 0;
}

if(typeof module!=='undefined'&&module.exports)module.exports={TriBuf,heightfieldSolid,orientShell,signedVolume,boxTris,sampleIsland,sampleGrid,shapeTest,toSTL,zipOne,crc32,extrude,rrPath,polyPath,circlePath,ringTris,gearPoints,borePath,vaseTris,patternValue,transformTris};
