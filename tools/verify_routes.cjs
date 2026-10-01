const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const manifest=JSON.parse(fs.readFileSync('assets/manifest.json','utf8'));let seed=8129;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const math=Object.create(Math);math.random=random;const sandbox={window:{},Math:math};vm.runInNewContext(fs.readFileSync('src/route-patterns.js','utf8'),sandbox);
let ob=[],plats=[],gaps=[],rice=[],base=665;
const rand=(a,b)=>a+random()*(b-a),ri=(a,b)=>Math.floor(rand(a,b+1));
const api={rand,randInt:ri,pick:a=>a[Math.floor(random()*a.length)],scale:()=>Math.sqrt(base*.7/320),hint:()=>{},
 addObstacle:(kind,x,opt={})=>{const m=manifest.obstacle[kind],o={kind,x,w:m.w,h:m.h,box:m.box,...opt};ob.push(o);return o;},
 addPlatform:(x,y,w)=>{const p={x,y:y+rand(-10,10),w:w-rand(0,14)};plats.push(p);return p;},
 addTrackGap:(x,w)=>{const g={x,w};gaps.push(g);return g;},addRice:(x,y,kind='rice')=>rice.push({x,y,kind}),
 addRiceLine:(x,y,n,dx)=>{for(let i=0;i<n;i++)rice.push({x:x+i*dx,y});},
 addRiceArc:(x,y,n,dx)=>{for(let i=0;i<n;i++)rice.push({x:x+i*dx,y:y-Math.sin(i/Math.max(1,n-1)*Math.PI)*(dx*.55+26)});}};
api.addRiskLine=api.addRiceLine;
const director=sandbox.window.DSRoutePatterns.create(api);
function reachable(speed){
 if(!gaps.length)return true;
 const nodes=[];let left=-500;
 for(const g of gaps){nodes.push({x:left,w:g.x-left,y:600});left=g.x+g.w;}
 nodes.push({x:left,w:1200,y:600});const goal=nodes.at(-1);
 nodes.push(...plats);nodes.sort((a,b)=>a.x-b.x);
 const earliest=new Map([[nodes[0],nodes[0].x+20]]),k=Math.sqrt(speed/320);
 for(let pass=0;pass<nodes.length;pass++)for(const from of nodes){
  if(!earliest.has(from))continue;
  for(const to of nodes){
   if(to===from||to.x+to.w<earliest.get(from)+20)continue;
   for(const power of [.85,.9,1]){
    const v=1020*power,A=v*v/4400,up=from.y-to.y;if(up>A)continue;
    const flight=(v/2200+Math.sqrt(2*(A-up)/(2200*1.55)))/k*speed;
    const lo=Math.max(to.x+20,earliest.get(from)+flight),hi=Math.min(to.x+to.w-20,from.x+from.w-20+flight);
    if(lo<=hi&&lo<(earliest.get(to)??Infinity))earliest.set(to,lo);
   }
  }
 }
 return earliest.has(goal);
}
const report={layouts:0,jumpChecks:0,variants:{},families:{}};
for(const p of director.patterns){
 const signatures=new Set();
 for(const b of (p.id==='jump-duet'?[367,450,550,665]:[450,550,665])){if(p.min>=2&&b<550&&p.id!=='slide-hop-triplet')continue;base=b;
  for(let n=0;n<100;n++){
   ob=[];plats=[];gaps=[];rice=[];p.build(1000);report.layouts++;
   signatures.add(JSON.stringify({ob,plats,gaps,rice}));
   assert.ok(rice.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
   for(const speed of [base*.7,base,base*1.45]){
    if(!reachable(speed)){fs.writeFileSync('docs/route-failure.json',JSON.stringify({pattern:p.id,speed,base,plats,gaps},null,2));throw Error(`${p.id}: unreachable platform route at speed ${speed}`);}report.jumpChecks++;
    for(const o of ob){if(o.float||(o.kind==='buoy'&&o.mode==='slide'))continue;
      const width=o.box.w+2*(o.motion||({patrol:22,mine:24}[o.kind]||0));
      const h=o.h-o.box.y+({mine:26,patrol:5,cargo:3}[o.kind]||0);
      const enter=(1020-Math.sqrt(1020**2-4400*h))/2200,exit=1020/2200+Math.sqrt(2*(1020**2/4400-h)/(2200*1.55));
      const budget=Math.sqrt(320*speed)*(exit-enter)-53-30;
      assert.ok(width<=budget,`${p.id}/${o.kind}: ${width} > ${budget.toFixed(1)} at ${speed}`);
      assert.ok(gaps.every(g=>o.x+o.w<=g.x||o.x>=g.x+g.w),`${p.id}: ground hazard inside pit`);
    }
   }
  }
 }
 assert.ok(signatures.size>40,p.id+' lacks layout variation');report.variants[p.id]=signatures.size;
}
for(const coast of [false,true]){
 director.reset();const recent=[],counts={};let streak=0;
 for(let i=0;i<2000;i++){
  const p=director.choose(director.patterns,{recent,tier:4,coast,transition:false});const f=director.family(p);counts[f]=(counts[f]||0)+1;
  streak=f==='reward'?0:streak+1;assert.ok(streak<=4);recent.push(p.id);if(recent.length>5)recent.shift();
 }
 report.families[coast?'coast':'city']=counts;
}
fs.writeFileSync('docs/route-generation-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
