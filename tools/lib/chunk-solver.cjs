/* Offline completion search: real player boxes, input buffering and skills.
 * Moving hazards use their full envelopes; pulse gates stay closed. Dash may
 * destroy only the same breakable kinds as game.js; spring routes must bounce.
 * No upgrades, damage, shields or automatic invulnerability are used. */
'use strict';
const {GRAVITY,JUMP_V,FALL_MUL,DJUMP_V,DJ_RISE_G}=require('./chunk-audit.cjs');
const DT=1/120,STEP=8,SLACK=12;
const BREAKABLE=new Set(['patrol','crystals','mine','drone','turret','cargo']);
function prepare(c,speed,origin=0){
 const end=Math.max(...c.obstacles.map(o=>o.x+o.w+((o.opts&&o.opts.motion)||o.motion||0)),...c.platforms.map(p=>p.x+p.w),...c.gaps.map(g=>g.x+g.w),origin+100);
 const start=origin-220,k=Math.sqrt(speed/320);
 const bounds=c.obstacles.map(o=>{
  const opt=o.opts||{},kind=o.kind,box=o.box;
  let dx=opt.motion||o.motion||({patrol:22,mine:24,drone:34,sentry:14,turret:7}[kind]||0),lo=0,hi=0;
  if(kind==='patrol')lo=-5;if(kind==='mine'){lo=-26;hi=-2;}if(kind==='cargo')lo=-3;
  if(kind==='drone'){lo=-(opt.bob||16);hi=-lo;}
  if(opt.trap==='cable'){dx=18;lo=-60;hi=20;}if(opt.trap==='scout'){dx=58;lo=-45;hi=45;}
  const float=kind==='buoy'&&opt.mode==='slide'?142:(opt.float||0);
  return {x:o.x+box.x-dx,w:box.w+dx*2,y:600-float-o.h+box.y+lo,h:box.h+hi-lo,dx,dy:hi-lo,baseW:box.w,baseH:box.h};
 });
 const shots=[];
 for(const o of c.obstacles.filter(o=>o.kind==='turret')){
  const enter=(o.x-850-start)/speed,leave=(o.x-260-start)/speed;
  for(let t=enter+.85;t<leave;t+=2.6)shots.push({t,x:o.x-12,y:600-o.h+o.h*.36-6});
 }
 return {c,speed,start,end:end+220,k,bounds,shots,steps:Math.ceil((end+220-start)/speed/DT/STEP)};
}
function initial(env){return {x:env.start,y:600,vy:0,ground:600,on:true,jumps:0,rise:1,fall:FALL_MUL,grav:1,slide:0,sliding:false,down:false,bufferDown:0,coyote:.12,dash:0,grace:0,cooldown:0,usedDash:false,usedBounce:false,visited:{},broken:{},collapse:{},trace:null};}
function advance(env,state,action,tick,trace=false,observe){
 const s={...state,collapse:{...state.collapse},broken:{...state.broken},visited:{...state.visited}};
 const {c,speed,k}=env;
 for(let f=0;f<STEP;f++){
  const time=(tick*STEP+f+1)*DT,down=action===2;
  if(action===3&&f===0&&c.allowDash&&s.cooldown===0&&s.dash===0){s.dash=.34;s.grace=.54;s.cooldown=2.6;s.usedDash=true;s.sliding=false;}
  s.x+=speed*DT*(s.dash>0?1.9:1);const x=s.x;
  s.dash=Math.max(0,s.dash-DT);s.grace=Math.max(0,s.grace-DT);s.cooldown=Math.max(0,s.cooldown-DT);
  const downEdge=down&&!s.down;s.down=down;
  if(downEdge){s.bufferDown=.16;if(s.sliding)s.slide=0;}
  if(action===1&&f===0&&s.on)s.bufferDown=0;
  s.bufferDown=Math.max(0,s.bufferDown-DT);const requested=down||s.bufferDown>0||downEdge;
  s.coyote=Math.max(0,s.coyote-DT);
  const exists=p=>!(p.opts&&p.opts.collapse&&s.collapse[p.x]!==undefined&&time-s.collapse[p.x]>=p.opts.collapseDelay);
  if(s.on){
   const support=c.platforms.some(p=>exists(p)&&Math.abs(p.y-s.ground)<1.5&&x>=p.x-20&&x<=p.x+p.w+20)||
    (s.ground===600&&!c.gaps.some(g=>x>=g.x&&x<g.x+g.w));
   if(!support){s.on=false;s.sliding=false;s.coyote=.12;}
  }
  if(requested&&s.on&&!s.sliding&&s.dash===0){s.sliding=true;s.slide=0;}
  if(s.sliding){s.slide=Math.min(.34,s.slide+DT);if((!down&&s.slide>.32)||!s.on||s.dash>0)s.sliding=false;}
  if(action===1&&f===0&&(s.on||s.coyote>0||s.jumps<2)){
   const first=s.on||s.coyote>0;s.vy=first?-JUMP_V*k:Math.min(s.vy,-DJUMP_V*k);
   s.rise=first?1:DJ_RISE_G;s.fall=first?FALL_MUL:1.3;s.jumps=first?1:2;s.grav=k*k;s.coyote=0;s.on=false;s.sliding=false;
  }
  const prev=s.y;
  if(!s.on){
   let g=GRAVITY*s.grav*(s.vy>0?s.fall:s.rise);
   if(downEdge&&s.vy<0)s.vy=220*k;
   if(requested&&s.vy>0)g*=2.4;
   s.vy+=g*DT;s.y+=s.vy*DT;
   let land=Infinity;
   if(s.y>=prev){
    for(const p of c.platforms)if(exists(p)&&p.y>=prev&&p.y<=s.y&&x+53*.46>=p.x&&x-53*.46<=p.x+p.w)land=Math.min(land,p.y);
    if(prev<=600&&s.y>=600&&!c.gaps.some(g=>x>=g.x&&x<g.x+g.w))land=Math.min(land,600);
   }
   if(land<Infinity){
    for(const p of c.platforms)if((c.requiredPlatforms||[]).includes(p.x)&&p.y===land&&x>=p.x-25&&x<=p.x+p.w+25)s.visited[p.x]=true;
    s.y=s.ground=land;s.vy=0;s.on=true;s.jumps=0;s.rise=1;s.fall=FALL_MUL;s.grav=1;s.slide=0;s.sliding=requested&&s.dash===0;
    const p=c.platforms.find(p=>Math.abs(p.y-land)<1.5&&x>=p.x-20&&x<=p.x+p.w+20&&p.opts&&p.opts.collapse);
    if(p&&s.collapse[p.x]===undefined)s.collapse[p.x]=time;
   }
  }
  if(s.on)s.coyote=.12;if(s.y>760)return null;
  if((c.requiredPlatforms||[]).some(at=>{const p=c.platforms.find(p=>p.x===at);return p&&x>p.x+p.w+25&&!s.visited[at];}))return null;
  const pb=s.on&&s.sliding?{x:x-119,y:s.y-113,w:184,h:113}:{x:x-41.01,y:s.y-157.13,w:53.01,h:157.13};
  const hit=b=>pb.x<b.x+b.w+SLACK&&pb.x+pb.w>b.x-SLACK&&pb.y<b.y+b.h+SLACK&&pb.y+pb.h>b.y-SLACK;
  for(let i=0;i<env.bounds.length;i++){
   if(s.broken[i]||!hit(env.bounds[i]))continue;
   const o=c.obstacles[i],b=env.bounds[i],opt=o.opts||{};
   if(c.allowBounce&&o.kind==='spring'&&s.vy>0&&prev<=b.y+14){
    if(pb.x<b.x+b.w&&pb.x+pb.w>b.x&&s.y>=b.y){
     s.y=b.y;s.vy=-1120*k;s.grav=k*k;s.rise=1;s.fall=FALL_MUL;s.on=false;s.sliding=false;s.jumps=1;s.coyote=0;s.usedBounce=true;s.broken[i]=true;
    }
    continue;
   }
   if(s.grace>0&&BREAKABLE.has(o.kind)&&!opt.bob&&!opt.eventHazard&&!opt.rigid){
    // Destroy only after every possible moving pose has really intersected
    // the body; the inflated safety margin must never shatter an object early.
    if(pb.x<b.x+b.baseW&&pb.x+pb.w>b.x+2*b.dx&&pb.y<b.y+b.baseH&&pb.y+pb.h>b.y+b.dy)s.broken[i]=true;
    continue;
   }
   return null;
  }
  for(const shot of env.shots)if(s.dash===0&&time>=shot.t&&time<=shot.t+3&&hit({x:shot.x-200*(time-shot.t),y:shot.y,w:24,h:12}))return null;
  if(observe)observe({x,y:s.y-86,on:s.on,slide:s.sliding});
 }
 if(trace)s.trace={prev:state.trace,action,x:state.x};return s;
}
function goal(env,s){return s.on&&s.ground===600&&!s.sliding&&s.x>=env.end&&(!env.c.requireDash||(s.usedDash&&s.cooldown===0&&env.c.obstacles.some((o,i)=>o.kind==='cargo'&&s.broken[i])))&&(!env.c.requireBounce||s.usedBounce)&&(env.c.requiredPlatforms||[]).every(x=>s.visited[x]);}
function replay(c,speed,origin,proof){
 const env=prepare(c,speed,origin);let s=initial(env);
 if(!proof||proof.length!==env.steps)return false;
 for(let tick=0;tick<env.steps;tick++){s=advance(env,s,proof[tick],tick);if(!s)return false;}
 return goal(env,s);
}
function solve(c,speed,origin=0){
 const env=prepare(c,speed,origin);let states=[initial(env)];
 for(let tick=0;tick<env.steps;tick++){
  const next=new Map(),actions=c.allowDash?[0,1,2,3]:[0,1,2];
  for(const state of states)for(const action of actions){
   if(state.x<origin&&action!==0)continue;
   if(state.x>env.end-220&&(action===1||action===3))continue;
   if(action===1&&!state.on&&state.coyote===0&&state.jumps>=2)continue;
   if(action===3&&(state.cooldown>0||state.dash>0||!state.on||state.ground!==600))continue;
   const s=advance(env,state,action,tick,true);if(!s)continue;
   const key=[c.allowDash?Math.round((s.x-env.start)/8):0,Math.round(s.y/8),Math.round(s.vy/65),s.on?1:0,s.jumps,s.sliding?Math.round(s.slide*12)+1:0,s.ground,s.rise,s.grav,Math.ceil(s.coyote*60),Math.ceil(s.bufferDown*60),s.down?1:0,Math.ceil(s.dash*30),Math.ceil(s.grace*30),Math.ceil(s.cooldown*10),Object.keys(s.broken).join(','),Object.keys(s.visited).join(','),Object.keys(s.collapse).join(',')].join('/');
   if(!next.has(key))next.set(key,s);
  }
  states=[...next.values()];if(!states.length)return null;
  const cap=c.requiredPlatforms?.length?320:c.allowDash||c.allowBounce?220:100;
  if(states.length>cap){states.sort((a,b)=>rank(a)-rank(b));states.length=cap;}
  function rank(s){
   const target=c.platforms.find(p=>(c.requiredPlatforms||[]).includes(p.x)&&!s.visited[p.x]);
   const vertical=target?s.jumps*3+Math.abs(s.y-target.y)*.08:s.jumps*20+Math.abs(s.y-500)*.04;
   return vertical-Object.keys(s.visited).length*100+(c.requireDash&&!s.usedDash?15:0)+(c.requireBounce&&!s.usedBounce?45:0);
  }
 }
 const win=states.find(s=>goal(env,s));if(!win)return null;
 const proof=[],positions=[];for(let n=win.trace;n;n=n.prev){proof.push(n.action);positions.push(n.x-origin);}proof.reverse();positions.reverse();
 Object.defineProperty(proof,'positions',{value:positions});return replay(c,speed,origin,proof)?proof:null;
}
// Rice is placed in loose spatial clusters. The completion trace only defines
// a reachable area; it is never drawn as a continuous trail.
function ribbon(c,speed,proof){
 const env=prepare(c,speed);let state=initial(env),path=[];
 for(let tick=0;tick<env.steps;tick++){
  state=advance(env,state,proof[tick],tick,false,p=>{if(p.x>=0)path.push(p);});
  if(!state)throw new Error('Invalid completion area');
 }
 if(!goal(env,state))throw new Error('Rewards need a grounded exit');
 const exit=state.x,end=Math.round(exit+136),points=[];
 path.push({x:exit+96,y:514,on:true,slide:false});
 let seed=(speed*997+c.obstacles.reduce((n,o)=>n+Math.round(o.x)*31+o.kind.length*17,0)+c.platforms.length*43+c.gaps.length*71)>>>0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 function at(x){let lo=0,hi=path.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(path[m].x<x)lo=m;else hi=m;}
  const a=path[lo],b=path[hi],t=Math.max(0,Math.min(1,(x-a.x)/Math.max(.01,b.x-a.x)));return a.y+(b.y-a.y)*t;
 }
 function add(x,dy){
  if(x<0||x>exit+96)return false;
  const center=at(x),y=Math.max(80,Math.min(564,center+dy));
  // Every dot is inside the unupgraded collection radius on a safe witness.
  if(Math.abs(y-center)>74)return false;
  if(env.bounds.some(b=>x>=b.x-12&&x<=b.x+b.w+12&&y>=b.y-12&&y<=b.y+b.h+12))return false;
  if(c.platforms.some(p=>x>=p.x-12&&x<=p.x+p.w+12&&y>=p.y-26&&y<=p.y+28))return false;
  if(points.some(p=>Math.hypot(p.x-x,p.y-y)<82))return false;
  points.push({x,y});return true;
 }
 add(0,-60);
 const shapes=[ [[-43,-62],[45,54]], [[-62,48],[8,-64],[74,24]], [[-65,40],[12,-60]], [[18,55]], [[-55,-58],[53,48]], [[-70,36],[10,-64],[80,36]] ];
 for(let anchor=150;anchor<exit-70;anchor+=210+random()*80){
  const shape=shapes[Math.floor(random()*shapes.length)],jitter=(random()-.5)*38;
  for(const [dx,dy] of shape)add(Math.max(30,Math.min(exit-70,anchor+dx+jitter)),dy+(random()-.5)*10);
 }
 // Keep sparse boundary dots, then repair only holes larger than one screen.
 add(exit+96,44);points.sort((a,b)=>a.x-b.x);
 for(let pass=0;pass<4;pass++){
  const snapshot=points.slice();let filled=false;
  for(let i=1;i<snapshot.length;i++){
   const left=snapshot[i-1].x,right=snapshot[i].x;if(right-left<=420)continue;
   const middle=(left+right)/2;
   find:for(const shift of [0,-48,48,-96,96,-144,144])for(const dy of [-62,55,-38,34,-20,22]){
    const x=middle+shift;if(x<=left+80||x>=right-80)continue;
    if(add(x,dy)){filled=true;break find;}
   }
  }
  points.sort((a,b)=>a.x-b.x);if(!filled)break;
 }
 if(!points.length)throw new Error('Empty reward scatter');
 return {points,end};
}
module.exports={solve,replay,prepare,advance,ribbon,STEP,DT};
