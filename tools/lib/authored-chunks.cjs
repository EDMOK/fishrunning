/* Offline prefab authoring: obstacles and rewards share a physical route. */
'use strict';
const {GRAVITY,JUMP_V,FALL_MUL,GROUND_Y}=require('./chunk-audit.cjs');
function create(a){
 const recipes=[
 ['first-hop',0,['hop']],['hop-duet',0,['hop','hop']],
 ['low-high',0,['duck','hop']],['high-low',0,['hop','duck']],['low-duet',0,['duck','duck']],
 ['hop-skip',1,['hop','pit']],['under-over',1,['duck','pit']],['land-and-duck',1,['pit','duck']],
 ['three-step',1,['hop','duck','hop']],['ground-switch',1,['duck','hop','duck']],
 ['broken-rhythm',1,['pit','hop','pit']],['roof-break',2,['duck','pit','duck']],
 ['wall-switch',2,['tall','duck','hop']],['wall-relay',2,['hop','tall']],
 ['cloud-relay',1,['bridge']],['cloud-exit',2,['bridge','duck']],['cloud-entry',2,['hop','bridge']],
 ['fall-and-rise',3,['bridge','pit','hop']],['upper-choice',1,['fork']],
 ['choice-exit',2,['fork','duck']],['choice-entry',2,['duck','fork']],['double-choice',3,['fork','hop','fork']],
 ['terrace-flow',1,['terrace']],['terrace-gate',2,['terrace','duck']],['terrace-break',3,['pit','terrace','hop']],
 ['cargo-intro',1,['cargo']],['cargo-switch',2,['cargo','duck','hop']],
 ['spring-intro',1,['spring']],['spring-exit',3,['spring','duck']],
 ['buoy-intro',2,['buoy']],['buoy-switch',3,['buoy','hop','duck']],
 ['pulse-intro',3,['pulse']],['pulse-switch',3,['duck','pulse','hop']],
 ['cable-intro',3,['cable']],['cable-break',3,['cable','pit','hop']],
 ['scout-intro',4,['scout']],['scout-relay',4,['hop','scout','pit']],
 ['collapse-relay',3,['collapse']],['collapse-exit',4,['collapse','duck','tall']],
 ['final-switch',4,['tall','duck','pit','hop']],['final-reverse',4,['duck','hop','duck','tall']],
 ['rest-ground',0,['rest']],['rest-vault',0,['vault']],['rest-terrace',1,['restUpper']],
 ['event-wall',0,['hop']],['event-captcha',0,['duck']],['event-doublecheck',0,['duck','duck']],
 ['event-sweep',2,['sweep','hop']],['event-cacheflush',0,['mine','hop']],['event-rice',0,['rest','vault']]];
 // Compose full encounters, not extra copies of the same two-step beat.
 // The short lessons remain available; the director prioritises these chains.
 const chains=[
  ['cargo','duck','pit','hop','duck','cargo'],
  ['hop','duck','bridge','cargo','duck','pit'],
  ['pit','cargo','duck','terrace','hop','duck'],
  ['duck','hop','fork','pit','duck','cargo'],
  ['cargo','pit','duck','hop','bridge','duck','hop'],
  ['duck','tall','pit','cargo','duck','bridge','hop'],
  ['hop','cable','pit','cargo','duck','tall'],
  ['pulse','duck','bridge','hop','cable','pit','cargo'],
  ['duck','buoy','pit','tall','duck','cargo'],
  ['cargo','duck','collapse','hop','scout','pit','tall'],
  ['spring','duck','pit','cargo','cable','hop'],
  ['tall','duck','pit','buoy','cargo','duck','collapse','hop']
 ];
 let seed=7919;
 const roll=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 const seen=new Set(chains.map(s=>s.join('-')));
 const vocabulary=[['hop','duck','pit','cargo','bridge','fork','terrace'],
  ['hop','duck','pit','cargo','tall','bridge','fork','buoy','spring'],
  ['hop','duck','pit','cargo','tall','collapse','pulse','cable','scout','bridge']];
 for(let i=0;i<168;i++){
  const group=i%3,depth=4+roll(group===0?3:5),seq=[];
  for(let j=0;j<depth;j++){
   const choices=vocabulary[group].filter(k=>k!==seq.at(-1)&&
    !(j&&['bridge','terrace','fork','spring','collapse'].includes(k)&&['bridge','terrace','fork','spring','collapse'].includes(seq.at(-1))));
   seq.push(choices[roll(choices.length)]);
  }
  if(!seq.includes('duck'))seq[1]='duck';
  if(!seq.some(k=>['hop','pit','cargo','tall'].includes(k)))seq[0]='hop';
  if(new Set(seq).size<3||seen.has(seq.join('-'))){i--;continue;}
  seen.add(seq.join('-'));chains.push(seq);
 }
 chains.forEach((seq,i)=>{
  let min=seq.some(k=>['scout','collapse'].includes(k))?4:
   seq.some(k=>['pulse','cable'].includes(k))?3:seq.some(k=>['tall','buoy'].includes(k))?2:1;
  recipes.push(['chain-'+String(i+1).padStart(3,'0')+'-'+seq.join('-'),min,seq]);
 });
 // A few continuous four-step phrases are available immediately after the
 // opening lessons, before the distance/time gate unlocks the richer material.
 for(const seq of [['hop','duck','hop','duck'],['duck','hop','duck','hop'],
  ['hop','hop','duck','hop'],['duck','hop','hop','duck'],['hop','duck','duck','hop']])
  recipes.push(['opening-'+seq.join('-'),0,seq]);
 const verbs={hop:'jump',tall:'jump',pit:'jump',duck:'slide',sweep:'slide',mine:'jump',bridge:'platform',collapse:'platform',terrace:'platform',fork:'choice',cargo:'jump',spring:'bounce',buoy:'signal',pulse:'jump',cable:'read',scout:'read',rest:'run',vault:'jump',restUpper:'platform'};
 const names={hop:'跳',tall:'高跳',pit:'跳坑',duck:'滑',sweep:'滑',mine:'跳',bridge:'落台',collapse:'连续落台',terrace:'登台',fork:'选路',cargo:'跃箱',spring:'借力登高',buoy:'读信号',pulse:'跃墙',cable:'读摆动',scout:'读巡逻',rest:'收集',vault:'跃取',restUpper:'登台收集'};
 const q=()=>Math.sqrt(320*a.speed());
 const coin=(x,y,big)=>a.addRice(x,y,big?'bigrice':'rice');
 function lane(x,y,w,big){const n=Math.max(3,Math.floor(w/54));for(let i=0;i<n;i++)coin(x+w*i/(n-1),y,big&&i===Math.floor(n/2));}
 // Actual first-jump feet with collectibles 55px up inside the player's torso.
 function flight(x,y,power=1){
  const v=JUMP_V*power,apex=v/GRAVITY,h=v*v/(2*GRAVITY),end=apex+Math.sqrt(2*h/(GRAVITY*FALL_MUL));
  const n=Math.max(7,Math.ceil(q()*end/48));
  for(let i=0;i<n;i++){const t=end*(.08+.84*i/(n-1)),rise=t<apex?v*t-GRAVITY*t*t/2:h-GRAVITY*FALL_MUL*(t-apex)**2/2;coin(x+q()*t,y-rise-55,i===Math.floor(n/2));}
  return x+q()*end;
 }
 function ledge(x,y,w,collapse=false){const p=a.addPlatform(x,y,w,{exact:true,collapse,collapseDelay:.72});lane(p.x+24,p.y-60,p.w-48,true);return p;}
 function module(key,x,t,used,event){
  const s=q(),variant=a.rand(0,1),eventOpt=event?{eventHazard:true}:{};
  function obstacle(kind,opt={}){return a.addObstacle(kind,x+s*.36,{...eventOpt,...opt});}
  function jump(kind,opt={}){const o=obstacle(kind,opt);flight(x,GROUND_Y);return Math.max(x+s*.90,o.x+o.w+s*.23);}
  switch(key){
   case 'hop':case 'tall':{let pool=key==='tall'?['turret'].concat(t>=3?['gate','sentry']:[]):['patrol','crystals','mine'];const fresh=pool.filter(k=>!used.has(k)),kind=a.pick(fresh.length?fresh:pool);used.add(kind);return jump(kind,{motion:kind==='mine'?a.pick([0,12,20]):0});}
   case 'mine':return jump('mine',{motion:20});
   case 'duck':case 'sweep':{const motion=key==='sweep'?58:0,o=obstacle('drone',{float:142,bob:6,motion});lane(o.x-motion-45,548,o.w+motion*2+90,true);return o.x+o.w+motion+s*.16;}
   case 'pit':{const at=x+s*.28,w=s*a.rand(.30,.39);a.addTrackGap(at,w);flight(x,600);a.hint('gap',at-s*.35);return x+s*.94;}
   case 'bridge':case 'collapse':{const at=x+s*.22,count=a.pick([3,4]),pitch=s*.55,heights=variant<.5?[505,440,495,525]:[520,470,415,510];a.addTrackGap(at,(count-1)*pitch+s*.37);for(let i=0;i<count;i++)ledge(at-s*.20+i*pitch,heights[i],s*a.rand(.48,.53),key==='collapse'&&i<count-1);a.hint('gap',at-s*.4);return at+(count-1)*pitch+s*.62;}
   case 'terrace':{a.addTrackGap(x+q()*.30,q()*1.42);const heights=variant<.5?[525,445,500]:[505,470,420];for(let i=0;i<3;i++)ledge(x+i*s*.60,heights[i],s*.52);lane(x+30,548,s*1.45,false);return x+s*1.94;}
   case 'fork':{ledge(x,505,s*.52);ledge(x+s*.65,430,s*.75);const o=a.addObstacle(a.pick(['crystals','cargo']),x+s*.87,eventOpt);flight(x+s*.50,600);coin(x+s*1.1,350,true);return Math.max(x+s*2.12,o.x+o.w+s*.60);}
   case 'cargo':a.hint('cargo',x);return jump('cargo');
   case 'spring':{const o=obstacle('spring');a.hint('spring',x);flight(x-s*.13,600,.85);ledge(o.x+s*.74,245,s*.62);ledge(o.x+s*1.57,425,s*.56);coin(o.x+s*.54,280,false);return o.x+s*2.72;}
   case 'buoy':{const slide=variant<.5,o=obstacle('buoy',{mode:slide?'slide':'hop',float:slide?142:0});a.hint('buoy',x);if(slide)lane(o.x-40,548,o.w+90,true);else flight(x,600);return x+s*1.15;}
   case 'pulse':a.hint('pulse',x);return jump('gate',{trap:'pulse',trapCycle:4.2,trapT:a.pick([0,.6,1.2])});
   case 'cable':case 'scout':{const o=obstacle('drone',{float:key==='scout'?170:142,bob:6,trap:key,trapCycle:key==='cable'?2.7:3.1,soft:true,phase:a.pick([0,1.57,3.14])});lane(o.x-90,548,o.w+180,true);a.hint(key,x);return x+s*1.16;}
   case 'rest':lane(x+26,535,s*a.rand(.90,1.25),true);return x+s*1.35;
   case 'vault':flight(x+26,600,a.pick([.85,.92,1]));return x+s*1.10;
   case 'restUpper':ledge(x,520,s*.60);ledge(x+s*.73,450,s*.65);return x+s*2.05;
   default:throw new Error('Unknown prefab module '+key);
  }
 }
 return recipes.map(([id,min,seq])=>{
  const event=id.startsWith('event-')?id.slice(6):'',rest=id.startsWith('rest-')||event==='rice';
  const devices=seq.filter(k=>['cargo','spring','buoy','pulse','cable','scout'].includes(k)),actions=seq.map(k=>verbs[k]);
  const topology=seq.includes('fork')?'fork':seq.some(k=>['bridge','collapse'].includes(k))?'islands':seq.some(k=>['terrace','spring','restUpper'].includes(k))?'upper':seq.includes('pit')?'broken':'ground';
  return {id:'prefab-'+id,min,family:rest?'reward':topology==='islands'?'gap':topology==='upper'?'platform':'mixed',name:seq.map(k=>names[k]).join(' · '),role:rest?'release':seq.length>=4?'climax':'pressure',requiredActions:rest?[]:actions,optionalActions:topology==='fork'?['platform','dash']:[],topology,motif:actions.join('>'),riskRoute:topology==='fork',devices,intro:id.endsWith('-intro')?devices[0]:undefined,requires:id.endsWith('-intro')?[]:devices,event,recovery:seq.includes('spring')?'long':'short',chain:id.startsWith('chain-')||id.startsWith('opening-'),keep:id.startsWith('chain-')?5:6,candidates:id.startsWith('chain-')?48:80,
   build(x,t){const used=new Set();let cursor=x+q()*a.rand(.17,.31);seq.forEach((key,i)=>{if(i)cursor+=q()*a.pick([.02,.07,.13]);cursor=module(key,cursor,t,used,!!event);});}};
 });
}
module.exports={create};
