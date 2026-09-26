const vm=require('vm'),fs=require('fs');
const THREE=require('three');
const ctx={THREE,window:{},console,Float32Array,Uint8Array,Math,Promise,setTimeout,TextEncoder,module:undefined};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../src/core.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../src/models.js','utf8')+'\nthis.MODELS=MODELS;this.S=S;this.MODEL_BY_ID=MODEL_BY_ID;this.signedVolume=signedVolume;this.presets=MODEL_BY_ID.vase.params[0].items;',ctx);
function check(a){
  const key=(o)=>Math.round(a[o]*1e3)+','+Math.round(a[o+1]*1e3)+','+Math.round(a[o+2]*1e3);
  const ids=new Map();const id=o=>{const k=key(o);let v=ids.get(k);if(v===undefined){v=ids.size;ids.set(k,v);}return v;};
  const E=new Map();let degen=0;
  for(let o=0;o<a.length;o+=9){const v=[id(o),id(o+3),id(o+6)];if(v[0]===v[1]||v[1]===v[2]||v[0]===v[2]){degen++;continue;}
    for(let k=0;k<3;k++){const s=v[k],t=v[(k+1)%3];const e=s+'>'+t;E.set(e,(E.get(e)||0)+1);}}
  let open=0,bad=0;
  for(const [e,c] of E){const [s,t]=e.split('>');const r=E.get(t+'>'+s)||0;if(c!==r)open++;if(c>1)bad++;}
  return {tris:a.length/9,open,dup:bad,degen,vol:ctx.signedVolume(a).toFixed(1)};
}
for(const m of ctx.MODELS){ctx.S.vals[m.id]={};for(const p of m.params)if('value' in p)ctx.S.vals[m.id][p.id]=p.value;}
(async()=>{
  for(const m of ctx.MODELS){
    if(['litho','relief','plate','keychain'].includes(m.id))continue;
    const variants=[{...ctx.S.vals[m.id]}];
    if(m.id==='terrain'){for(const sh of['circle','hex'])variants.push({...variants[0],shape:sh,detail:'draft'});}
    if(m.id==='vase'){for(const p of ctx.presets)variants.push({...variants[0],...p.set});variants.push({...variants[0],mode:'walled',ripples:10,rippleD:3});}
    if(m.id==='coaster'){for(const sh of['circle','square'])variants.push({...variants[0],shape:sh,pattern:'waves',detail:'draft'});}
    if(m.id==='gear')variants.push({...variants[0],flat:true,teeth:9});
    if(m.id==='spacer')variants.push({...variants[0],style:'6'});
    for(const v of variants){
      const t0=Date.now();
      const res=await m.build(v,{busy(){}});
      console.log(m.id,JSON.stringify(res.shells.map(check)),Date.now()-t0+'ms');
    }
  }
})().catch(e=>console.error(e));
