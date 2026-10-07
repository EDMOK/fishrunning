/* Chunk selection owns pacing; authored geometry stays immutable. */
(function(global){
 'use strict';
 function create(a){
  var history=[],counts={},introduced={},lastDevice={},picks=0,pressure=0,rest=0,lastRest=-20;
  function reset(){history=[];counts={};introduced={};lastDevice={};picks=0;pressure=0;rest=0;lastRest=-20;}
  function family(p){return p.family||'mixed';}
  function choose(pool,opt){
   opt=opt||{};
   var legal=pool.filter(function(p){return p.min<=(opt.tier||0)&&(!p.requires||p.requires.every(function(d){return introduced[d];}));});
   if(!legal.length)return null;
   // One brief release per pressure phrase; a 12s release phase must not
   // repeatedly alternate empty reward chunks with tiny lessons.
   var safe=!rest&&(pressure>=5||(opt.transition&&pressure>=2)||
    (opt.phase==='release'&&pressure>=3&&picks-lastRest>=4));
   var wanted=legal.filter(function(p){return safe?family(p)==='reward':family(p)!=='reward';});
   if(!wanted.length)wanted=legal;
   if(picks<2){var lessons=wanted.filter(function(p){return !p.chain&&p.requiredActions.length<=2;});if(lessons.length)wanted=lessons;}
   // Exclude whole action orders across variants and materials. Only relax
   // when the current teaching tier genuinely has too few different phrases.
   var window=history.slice(-10);
   var fresh=wanted.filter(function(p){return !window.some(function(h){return p.id===h.id||p.motif===h.motif;});});
   if(fresh.length)wanted=fresh;
   else {
    var last=history[history.length-1];
    fresh=wanted.filter(function(p){return !last||p.motif!==last.motif;});
    if(fresh.length)wanted=fresh;
   }
   var long=wanted.filter(function(p){return p.chain;});
   // After two opening reads, continuous combinations are the main content.
   // New device lessons occasionally interrupt the chains to teach their read.
   var teach=legal.filter(function(p){return p.intro&&!introduced[p.intro];});
   if(!safe&&picks>=2){if(teach.length&&picks%3===2)wanted=teach;else if(long.length){var scores=long.filter(function(p){return p.handcrafted;});wanted=scores.length&&picks%2===0?scores:long;}}
   var weighted=wanted.map(function(p){
    var w=1;
    if(p.handcrafted)w*=12;
    if(p.chain)w*=p.requiredActions.length>=6?3:2;
    if(p.variety>=3)w*=1.8;
    if(opt.coast&&p.topology==='islands')w*=1.25;
    w/=(p.variantCount||1)*(1+(counts[p.id]||0)*.7);
    history.forEach(function(h,i){if(p.motif===h.motif)w*=.1;if(p.id===h.id)w*=.1;});
    if(p.intro&&!introduced[p.intro]&&!safe)w*=25;
    (p.devices||[]).forEach(function(d){if(introduced[d]&&picks-(lastDevice[d]||0)>10)w*=2;});
    return {p:p,w:w};
   });
   var total=weighted.reduce(function(n,v){return n+v.w;},0),roll=a.rand(0,total),chosen=weighted[weighted.length-1].p;
   for(var i=0;i<weighted.length;i++){roll-=weighted[i].w;if(roll<=0){chosen=weighted[i].p;break;}}
   record(chosen);return chosen;
  }
  function record(p){
   if(p.intro)introduced[p.intro]=true;
   picks++;counts[p.id]=(counts[p.id]||0)+1;
   (p.devices||[]).forEach(function(d){lastDevice[d]=picks;});
   rest=family(p)==='reward'?rest+1:0;pressure=rest?0:pressure+1;
   if(rest)lastRest=picks;
   history.push({motif:p.motif,topology:p.topology,id:p.id,chain:!!p.chain});if(history.length>18)history.shift();
  }
  return {choose:choose,record:record,reset:reset,family:family,state:function(){return {picks:picks,pressure:pressure,rest:rest,introduced:Object.keys(introduced),recent:history.slice()};}};
 }
 global.DSChunkDirector={create:create};
})(window);
