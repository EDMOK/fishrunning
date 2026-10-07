/* Handwritten set pieces. The sequence, materials, heights and alternate
 * routes are deliberate; variants only nudge spacing within the same score. */
'use strict';
function create(a){
 const scores=[
  ['dock-breakout','码头破箱线',1,['dashBoxes','lowRoof','patrol','pit','crystals','duck'],['cargo'],'破双箱，压低身位，再跨断口；冲刺结束后仍要滑行。'],
  ['freight-switchback','货运折返节拍',1,['cargo','dashBoxes','duck','pit','lowRoof','patrol','pit'],['cargo'],'先读单箱，后破双箱；两次货箱遭遇承担不同操作。'],
  ['loading-bay','装卸区连锁',1,['dashBoxes','patrol','duck','terrace','cargo','pit','duck'],['cargo'],'地面提速后切上台阶，再回到滑行通道。'],
  ['dock-lowline','低檐码头',1,['lowRoof','dashBoxes','cargo','pit','duck','patrol','duck','pit'],['cargo'],'连续滑行先压节奏，破箱放开节奏，断口收尾。'],
  ['crystal-ladder','晶簇阶梯',1,['crystals','duck','terrace','patrol','pit','cargo','duck'],['cargo'],'高低轮替，阶梯跨越连接地面障碍。'],
  ['broken-causeway','断桥回落',1,['patrol','terrace','duck','pit','cargo','bridge','duck'],['cargo'],'台阶和断桥都承担必经落点，地面没有绕过路线。'],
  ['freight-islands','货箱与孤岛',1,['cargo','dashBoxes','duck','bridge','patrol','pit','lowRoof','crystals'],['cargo'],'破箱进入孤岛，再回到地面的滑行与晶簇；后半段完成冲刺充能。'],
  ['dock-three-read','码头三种读法',1,['crystals','lowRoof','dashBoxes','pit','cargo','duck','bridge'],['cargo'],'晶簇跃过、低檐滑过、货箱冲破；同一节奏三种处理。'],
  ['second-jump-spire','二段跳尖塔',2,['patrol','duck','highVault','cargo','pit','duck'],['cargo'],'高台高于普通跳跃上限，二段跳后落地接滑。'],
  ['double-jump-brake','高跳急降通道',2,['highVault','lowRoof','cargo','pit','duck','turret'],['cargo'],'高台退出后收住高度，滑入低檐，再读炮口。'],
  ['spire-to-islands','尖塔转断桥',2,['duck','highVault','patrol','bridge','cargo','duck'],['cargo'],'二段登高与连续落点相接，不能一口气滑翔到底。'],
  ['spring-observatory','鲸尾观测台',2,['springVault','duck','cargo','pit','patrol','lowRoof'],['spring','cargo'],'踩弹簧借力后二段登上高台，落地切换低姿态。'],
  ['spring-freight','借力越货运线',2,['dashBoxes','cargo','duck','springVault','pit','duck','bridge'],['spring','cargo'],'弹簧负责高度，货箱负责冲刺，不把两种素材当普通挡板。'],
  ['buoy-call-response','浮标问答',2,['buoyHop','buoySlide','pit','cargo','highVault','duck'],['buoy','cargo'],'先跃红标后滑黄标，换动作后再处理断口和高台。'],
  ['buoy-lowline','浮标低檐接力',2,['duck','buoyHop','lowRoof','buoySlide','cargo','pit','turret'],['buoy','cargo'],'滑行通道中插入跳跃信号，落地再续滑行。'],
  ['turret-cover','炮口与低檐',2,['turret','duck','highVault','cargo','buoySlide','pit','patrol'],['cargo','buoy'],'炮口先要求躲避高度，高台后换成贴地通过。'],
  ['firewall-downbeat','防火墙强拍',3,['pulse','duck','cargo','pit','highVault','cable','patrol'],['pulse','cable','cargo'],'墙是强拍，低檐是弱拍，末尾摆动机关需要读高度。'],
  ['cable-tide','摆缆潮汐',3,['cable','pit','cargo','duck','bridge','pulse','buoySlide'],['cable','pulse','cargo','buoy'],'摆缆、断口、落台形成不同的空间读法。'],
  ['fortress-switch','岗哨变奏',3,['sentry','duck','dashBoxes','pit','gate','cable','highVault'],['cargo','cable'],'不可破岗哨与可破货箱相邻，冲刺不能代替下一次起跳。'],
  ['vault-firewall','高台防火墙回路',3,['highVault','duck','pulse','cargo','cable','pit','sentry'],['pulse','cable','cargo'],'高台、滑行、防火墙、摆缆连续转换。'],
  ['collapsing-stair','塌台阶梯舞',4,['collapse','duck','cargo','highVault','scout','pit','sentry'],['scout','cargo'],'塌台不允许停留，紧接高台再落入巡逻高度。'],
  ['scout-freight','巡逻货运口',4,['scout','dashBoxes','lowRoof','collapse','patrol','pit','gate'],['scout','cargo'],'读巡逻后破箱，冲刺后的节拍由塌台接管。'],
  ['spring-collapse','鲸尾与崩塌',4,['springVault','collapse','duck','cargo','cable','pit','scout'],['spring','cargo','cable','scout'],'借力后二段登高，随后快速换落点，末段回到读摆动。'],
  ['harbour-finale','港区终章',4,['dashBoxes','lowRoof','highVault','buoyHop','collapse','cable','gate','scout'],['cargo','buoy','cable','scout'],'冲、滑、二段登高、信号、塌台、摆缆组成完整高潮。']
 ];
 const action={patrol:['jump'],crystals:['jump'],cargo:['jump'],turret:['jump'],gate:['jump'],sentry:['jump'],duck:['slide'],lowRoof:['slide'],pit:['jump'],bridge:['platform'],terrace:['platform'],collapse:['platform'],highVault:['jump','doubleJump','platform'],springVault:['jump','bounce','doubleJump','platform'],dashBoxes:['dash'],buoyHop:['jump'],buoySlide:['slide'],pulse:['jump'],cable:['slide'],scout:['slide']};
 function unit(key,x,s){
  const obs=(kind,at,opts={})=>a.addObstacle(kind,at,opts);
  const plat=(at,y,w,collapse=false)=>a.addPlatform(at,y,w,{exact:true,collapse,collapseDelay:.72});
  if(['patrol','crystals','cargo','turret','gate','sentry','pulse'].includes(key)){
   const o=obs(key==='pulse'?'gate':key,x+s*.34,key==='pulse'?{trap:'pulse',trapCycle:4.2,trapT:0}:{});
   if(key==='cargo'||key==='pulse')a.hint(key,x);return Math.max(x+s*.95,o.x+o.w+s*.23);
  }
  if(['duck','lowRoof','cable','scout'].includes(key)){
   const o=obs('drone',x+s*.32,{float:key==='scout'?170:142,bob:6,motion:0,...(['cable','scout'].includes(key)?{trap:key,trapCycle:key==='cable'?2.7:3.1,phase:0,soft:true}:{})});
   if(key==='lowRoof')obs('drone',o.x+128,{float:142,bob:6,motion:0});
   if(key==='cable'||key==='scout')a.hint(key,x);return Math.max(x+s*1.02,o.x+(key==='lowRoof'?242:114)+s*.22);
  }
  if(key==='pit'){a.addTrackGap(x+s*.28,s*.38);a.hint('gap',x);return x+s*.98;}
  if(key==='dashBoxes'){
   obs('cargo',x+s*.33);obs('cargo',x+s*.33+120);a.hint('cargo',x);
   return Math.max(x+s*1.18,x+s*.33+228+s*.18);
  }
  if(key==='highVault'){
   a.addTrackGap(x+s*.27,s*1.60);plat(x+s*.34,315,s*.74);plat(x+s*1.42,485,s*.58);
   a.hint('gap',x);return x+s*2.20;
  }
  if(key==='springVault'){
   const o=obs('spring',x+s*.46);a.hint('spring',x);
   a.addTrackGap(o.x+o.w+24,s*1.80);plat(o.x+s*.78,245,s*.78);plat(o.x+s*1.90,425,s*.7);
   return o.x+s*3.35;
  }
  if(key==='buoyHop'||key==='buoySlide'){
   obs('buoy',x+s*.34,{mode:key==='buoyHop'?'hop':'slide',float:key==='buoySlide'?142:0});a.hint('buoy',x);return x+s*1.08;
  }
  if(['bridge','terrace','collapse'].includes(key)){
   const pitch=s*.54,heights=key==='terrace'?[510,445,480]:[505,455,490];
   a.addTrackGap(x+s*.24,s*1.35);
   for(let i=0;i<3;i++)plat(x+s*.04+i*pitch,heights[i],s*.50,key==='collapse'&&i<2);
   a.hint('gap',x);return x+s*1.90;
  }
  throw Error('Unknown handwritten beat '+key);
 }
 return scores.map(([id,name,min,seq,requires,intent])=>{
  const skills=[];if(seq.includes('dashBoxes'))skills.push('dash');if(seq.includes('highVault'))skills.push('doubleJump');if(seq.includes('springVault'))skills.push('bounce','doubleJump');
  return {id:'prefab-score-'+id,name,min,family:'mixed',role:'climax',chain:true,handcrafted:true,intent,skills,
   topology:skills.includes('bounce')?'upper':seq.some(k=>['bridge','terrace','collapse','highVault'].includes(k))?'islands':'ground',
   motif:seq.join('>'),requiredActions:seq.flatMap(k=>action[k]),optionalActions:[],devices:requires,requires,keep:5,candidates:20,
   build(x){const s=Math.sqrt(320*a.speed());let cursor=x+s*.18;
    for(let i=0;i<seq.length;i++){
     // Micro nudges preserve the handwritten order and intentional rhythm.
     if(i)cursor+=s*([.02,.08,.03,.12][i%4]+a.rand(-.015,.015));
     cursor=unit(seq[i],cursor,s);
    }
   }
  };
 });
}
module.exports={create};
