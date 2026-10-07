/* Legacy reference only: not loaded by index.html or the prefab compiler. */
/* Authored action phrases. Distances use the same sqrt(speed) scale as jump arcs. */
(function(global){
  'use strict';
  var templates=[
    {id:'combo-drop-gates',name:'跃落低门',min:1,family:'mixed',role:'pressure',parts:['drop','drop'],requiredActions:['jump','stomp','slide'],cue:'二段跳越刺 → 下砸 → 滑铲'},
    {id:'combo-slide-pits',name:'低门断桥',min:2,family:'mixed',role:'pressure',parts:['pit','pit'],requiredActions:['slide','jump'],cue:'滑铲 → 起跳 → 延迟二段跳'},
    {id:'combo-terraces',name:'高低接力',min:2,family:'platform',role:'pressure',parts:['terrace','drop'],requiredActions:['jump','djump','stomp'],cue:'逐台起跳 → 控制落点 → 下砸滑铲'},
    {id:'combo-switchback',name:'高低交错',min:2,family:'mixed',role:'pressure',parts:['drop','pit'],requiredActions:['djump','stomp','slide'],cue:'二段跳下砸 → 滑铲起跳'},
    {id:'combo-collapse',name:'塌陷接力',min:3,family:'gap',role:'pressure',parts:['collapse','pit'],requiredActions:['jump','stomp','slide'],cue:'塌台不停留 → 低门接断桥'},
    {id:'combo-reverse',name:'断桥低门',min:3,family:'mixed',role:'pressure',parts:['pit','drop','pit'],requiredActions:['slide','jump','stomp'],cue:'滑跳切换 → 二段跳下砸'},
    {id:'combo-sky-relay',name:'云台连段',min:4,family:'platform',role:'climax',parts:['terrace','collapse','drop'],requiredActions:['jump','djump','stomp','slide'],cue:'连续落台 → 下砸 → 滑铲'},
    {id:'combo-gauntlet',name:'极限连锁',min:4,family:'mixed',role:'climax',parts:['drop','pit','collapse','drop'],requiredActions:['jump','slide','djump','stomp'],cue:'读完整路线，连续切换动作'}
  ];
  function create(a){
    function build(id,x,speed){
      var spec=templates.find(function(p){return p.id===id;});
      if(!spec)throw new Error('Unknown action phrase: '+id);
      var q=Math.sqrt(320*speed),offset=0;
      var block={id:id,name:spec.name,cue:spec.cue,start:x,end:x,speed:speed,failed:false,done:false,entered:false,entities:[],
        family:spec.family||'mixed',role:spec.role||'pressure',min:spec.min||0,source:'action-route',
        entry:'ground-run',exit:'ground-recover',requiredActions:(spec.requiredActions||[]).slice(),optionalActions:[],
        safeRoute:true,riskRoute:false,recovery:'short',difficultyBudget:spec.difficultyBudget||spec.parts.length};
      // Width budget: one jump arc covers `q * span(h)` of ground, minus the
      // player box (53) and the landing slack (30). For a 92px-tall bed that is
      // q*0.6535 - 83, so anything wider than ~0.65q is unclearable at EVERY
      // speed — at 0.70q this bed was impossible to pass, double jump or not,
      // and no audit covered action routes to catch it. 0.34 clears with margin
      // down to the slowest a phrase can be locked to (a 0.7x slowdown event at
      // the earliest action gate, ~330px/s using 31% of the budget).
      function bed(u,w){var o=a.rect('route-spikes',x+q*u,508,q*w,92);o.combo=block;block.entities.push(o);}
      function roof(u,w,floor){var bottom=(floor||600)-135;var o=a.rect('route-roof',x+q*u,-180,q*w,bottom+180);o.combo=block;o.bob=1;block.entities.push(o);}
      function pit(u,w){var g=a.gap(x+q*u,q*w);g.combo=block;block.entities.push(g);}
      function platform(u,y,w,collapse){var p=a.platform(x+q*u,y,q*w,{exact:true,collapse:collapse,collapseDelay:.55});block.entities.push(p);return p;}
      function rice(u,y,n){a.riceLine(x+q*u,y,n,Math.max(40,q*.13));}
      spec.parts.forEach(function(part){
        var b=offset;
        if(part==='drop'){
          // The bed and the roof are two DIFFERENT verbs and they pull in
          // opposite directions: sliding needs the down key, and the down key
          // fast-falls you into the bed. So the player has to clear the bed,
          // land, and only then press down — which makes the ground between
          // them the whole combo. At 0.66q apart the latest possible landing
          // left ~0.1s before the roof, i.e. not passable. This spacing turns
          // it into a real "clear, land, duck" phrase.
          bed(b+.55,.34);roof(b+2.05,.35);
          a.riceArc(x+q*(b+.48),350,5,q*.14);rice(b+1.52,550,3);
          offset+=3.15;
        }else if(part==='pit'){
          // 0.55q, not 0.70q: a flat jump covers 0.836q of ground, and the
          // landing tolerance eats ~40px of that, so 0.70q left almost nothing
          // at the slow end. This size keeps real margin across the whole speed
          // range the phrase can be locked to.
          roof(b+.25,.35);pit(b+1.24,.55);
          rice(b+.20,550,3);a.riceArc(x+q*(b+1.20),385,5,q*.15);
          offset+=2.95;
        }else{
          pit(b+.60,2.50);
          platform(b+.48,505,.68,part==='collapse');
          platform(b+1.50,425,.64,part==='collapse');
          platform(b+2.52,520,.59,false);
          roof(b+3.53,.32);
          rice(b+.55,440,3);rice(b+1.56,355,3);rice(b+2.57,450,3);rice(b+3.50,550,3);
          offset+=4.65;
        }
      });
      block.end=x+q*offset;
      block.obstacles=block.entities.filter(function(entity){return entity.kind==='route-spikes'||entity.kind==='route-roof';});
      block.platforms=block.entities.filter(function(entity){return entity.kind===undefined&&entity.h===28;});
      block.gaps=block.entities.filter(function(entity){return entity.w!==undefined&&entity.kind===undefined&&entity.h===undefined;});
      block.pickups=[];
      return block;
    }
    return {build:build,templates:templates};
  }
  global.DSActionRoutes={create:create,templates:templates};
})(window);
