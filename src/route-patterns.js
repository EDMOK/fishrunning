/* Shared procedural encounters for the city and sunset road. */
(function(global){
  'use strict';
  function create(a){
    var r=a.rand,ri=a.randInt,pick=a.pick;
    function scale(){return a.scale();}
    function ground(x){return a.addObstacle(pick(['patrol','crystals','mine']),x);}
    function arc(x,y,n,dx){a.addRiceArc(x,y,n,dx);}
    // The platform builder returns the actual jittered position. Pickups follow
    // that surface, so random height and width never detach the reward trail.
    function island(x,y,w){var p=a.addPlatform(x,y,w);a.addRiceLine(p.x+28,p.y-70,Math.max(2,Math.floor((p.w-30)/57)),57);return p;}
    function chain(x,mode,count){
      var k=scale(),start=x+160*k,pitch=r(285,310)*k,n=count||ri(4,6);
      var gapW=(n-1)*pitch+120*k;
      a.addTrackGap(start,gapW);
      for(var i=0;i<n;i++){
        var h=mode==='stairs'?[55,110,160,115,70,110][i%6]:mode==='valley'?[65,135,95,150,85,55][i%6]:ri(55,135);
        var p=island(start-105*k+i*pitch,600-h,r(235,265)*k);
        if(i===n-2)a.addRice(p.x+p.w*.5,p.y-142,'bigrice');
      }
      a.hint('gap',start-360);
    }
    var patterns=[
      {id:'islands-zigzag',min:1,family:'gap',build:function(x){chain(x,'zigzag');}},
      {id:'islands-stairs',min:2,family:'gap',build:function(x){chain(x,'stairs',ri(4,6));}},
      {id:'islands-valley',min:2,family:'gap',build:function(x){chain(x,'valley',ri(4,6));}},
      {id:'broken-road',min:1,family:'gap',build:function(x){
        var k=scale(),count=ri(2,3),pitch=r(650,730)*k;
        for(var i=0;i<count;i++){
          var at=x+140*k+i*pitch,w=r(140,170)*k;
          a.addTrackGap(at,w);arc(at-45*k,435,5,48*k);
          a.addRiceLine(at+w+90*k,520,3,52*k);
        }a.hint('gap',x-200);
      }},
      {id:'pit-and-island',min:2,family:'gap',build:function(x){
        var k=scale(),at=x+130*k;
        a.addTrackGap(at,r(155,180)*k);arc(at-45*k,440,5,48*k);
        var at2=at+750*k;a.addTrackGap(at2,560*k);
        island(at2-90*k,535,205*k);island(at2+160*k,465,205*k);island(at2+410*k,525,210*k);
        a.hint('gap',at-280);
      }},
      {id:'pit-landing-hop',min:3,family:'mixed',build:function(x){
        var k=scale(),at=x+130*k,w=r(145,175)*k;
        a.addTrackGap(at,w);arc(at-40*k,440,5,46*k);
        var o=ground(at+w+720*k);arc(o.x-50,600-o.h-65,5,46);
        a.addRiceLine(o.x+o.w+170,520,4,56);a.hint('gap',at-300);
      }},
      {id:'upper-staircase',min:1,family:'platform',build:function(x){
        var k=scale(),n=ri(3,5),pitch=r(275,310)*k;
        for(var i=0;i<n;i++)island(x+i*pitch,600-[60,115,170,120,70][i],r(190,230)*k);
        a.addRiceLine(x+75,535,ri(8,11),80*k);
      }},
      {id:'platform-wave',min:1,family:'platform',build:function(x){
        var k=scale(),n=ri(4,6),pitch=r(260,295)*k;
        for(var i=0;i<n;i++)island(x+i*pitch,600-(i%2?ri(115,155):ri(45,75)),r(180,225)*k);
        a.addRice(x+(n-1)*pitch+65,350,'bigrice');
      }},
      {id:'upper-or-hop',min:2,family:'mixed',build:function(x){
        var k=scale();island(x,525,220*k);island(x+285*k,455,245*k);
        ground(x+370*k);arc(x+325*k,360,5,48*k);
        a.addRiceLine(x+680*k,520,5,55*k);
      }},
      {id:'obstacle-rhythm',min:2,family:'obstacle',build:function(x){
        var k=scale(),n=ri(2,3),pitch=r(740,850)*k;
        for(var i=0;i<n;i++){var o=ground(x+i*pitch);arc(o.x-50,600-o.h-65,ri(4,6),46);}
      }},
      {id:'slide-jump-shuffle',min:3,family:'mixed',build:function(x){
        var k=scale(),reverse=Math.random()<.5,pitch=r(820,940)*k;
        for(var i=0;i<3;i++){
          var at=x+i*pitch,slide=(i%2===0)===reverse;
          if(slide){a.addObstacle('drone',at,{float:142,bob:6,motion:ri(0,1)?32:0});a.addRiceLine(at-50,544,5,49);}
          else{var o=ground(at);arc(at-55,600-o.h-60,5,48);}
        }
      }},
      {id:'patrol-slalom',min:3,family:'obstacle',build:function(x){
        var k=scale(),pitch=r(760,900)*k,n=ri(2,3);
        for(var i=0;i<n;i++){var at=x+i*pitch;a.addObstacle('patrol',at,{motion:ri(12,28)});arc(at-60,425,5,49);}
        a.hint('stomp',x);
      }},
      {id:'jump-duet',min:1,family:'obstacle',trial:1,build:function(x){
        var k=scale(),pitch=r(690,760)*k;
        for(var i=0;i<2;i++){var kind=pick(['patrol','crystals']);var o=a.addObstacle(kind,x+i*pitch,{motion:kind==='patrol'?ri(6,8):0});arc(o.x-55,600-o.h-62,5,46);}
      }},
      {id:'slide-hop-triplet',min:2,family:'mixed',trial:1,build:function(x){
        var k=scale(),pitch=r(760,850)*k,reverse=Math.random()<.5;
        for(var i=0;i<3;i++){
          var at=x+i*pitch,slide=(i%2===0)!==reverse;
          if(slide){a.addObstacle('drone',at,{float:142,bob:6,motion:24});a.addRiceLine(at-35,544,5,47);}
          else{var kind=pick(['patrol','crystals']);var o=a.addObstacle(kind,at,{motion:kind==='patrol'?8:0});arc(at-50,600-o.h-62,5,46);}
        }
      }},
      {id:'rush-ribbon',min:0,family:'reward',build:function(x){
        var n=ri(12,17),dx=r(52,60);a.addRiskLine(x,520,n,dx);
        arc(x+160,395,7,52);a.addRice(x+(n-2)*dx,495,'bigrice');
      }},
      {id:'cargo-payday',devices:['cargo'],min:1,intro:'cargo',family:'obstacle',build:function(x){
        var k=scale(),at=x+r(0,80)*k;
        a.addObstacle('cargo',at);arc(at-50,435,ri(4,6),48*k);
        a.addRiceLine(at+250*k,520,ri(3,5),55*k);a.hint('cargo',at-180);
      }},
      {id:'spring-vault',devices:['spring'],min:1,intro:'spring',family:'mixed',build:function(x){
        var k=scale(),at=x+r(0,55)*k;
        a.addObstacle('spring',at);island(at+r(300,340)*k,r(430,460),r(235,270)*k);
        arc(at+110*k,305,6,50*k);a.addRice(at+265*k,255,'bigrice');
        a.addRiceLine(at+90*k,530,4,60*k);a.hint('spring',at-180);
      }},
      {id:'signal-choice',devices:['buoy'],min:2,intro:'buoy',family:'obstacle',build:function(x){
        var k=scale(),at=x+r(0,75)*k,mode=pick(['hop','slide']);
        a.addObstacle('buoy',at,{mode:mode});
        if(mode==='slide')a.addRiceLine(at-40,544,ri(4,6),48*k);else arc(at-50,420,ri(4,6),48*k);
        a.hint('buoy',at-180);
      }},
      {id:'cargo-signal-duet',devices:['cargo','buoy'],min:3,requires:['cargo','buoy'],family:'mixed',trial:1,build:function(x){
        var k=scale(),pitch=r(1000,1140)*k,mode=pick(['hop','slide']);
        a.addObstacle('cargo',x);arc(x-50,435,5,47*k);
        a.addObstacle('buoy',x+pitch,{mode:mode});
        if(mode==='slide')a.addRiceLine(x+pitch-40,544,5,48*k);else arc(x+pitch-50,420,5,48*k);
        a.hint('cargo',x-180);a.hint('buoy',x+pitch-180);
      }},
      {id:'signal-hop-chain',devices:['buoy'],min:3,requires:['buoy'],family:'mixed',trial:1,build:function(x){
        var k=scale(),pitch=r(950,1100)*k,first=ri(0,1),count=ri(2,3);
        for(var i=0;i<count;i++){
          var at=x+i*pitch,mode=(i+first)%2?'slide':'hop';
          a.addObstacle('buoy',at,{mode:mode});
          if(mode==='slide')a.addRiceLine(at-35,544,5,47*k);else arc(at-50,420,5,48*k);
        }a.hint('buoy',x-180);
      }},
      {id:'spring-pit-relay',devices:['spring'],min:3,requires:['spring'],family:'gap',build:function(x){
        var k=scale(),at=x+r(0,45)*k,pit=at+650*k;
        a.addObstacle('spring',at);island(at+r(250,280)*k,r(420,445),r(235,260)*k);
        arc(at+110*k,310,6,48*k);a.addRice(at+250*k,260,'bigrice');
        a.addTrackGap(pit,r(145,165)*k);arc(pit-45*k,430,5,48*k);
        a.hint('spring',at-180);a.hint('gap',pit-260);
      }},
      {id:'signal-pit-finish',devices:['cargo','buoy'],min:4,requires:['cargo','buoy'],family:'mixed',trial:1,build:function(x){
        var k=scale(),at=x+r(0,60)*k,mode=pick(['hop','slide']),pit=at+r(1160,1250)*k,w=r(150,175)*k;
        a.addObstacle('buoy',at,{mode:mode});
        if(mode==='slide')a.addRiceLine(at-35,544,5,47*k);else arc(at-50,420,5,48*k);
        a.addTrackGap(pit,w);arc(pit-45*k,430,5,48*k);
        a.addObstacle('cargo',pit+w+850*k);arc(pit+w+800*k,435,5,48*k);
        a.hint('buoy',at-180);a.hint('gap',pit-260);
      }},
      {id:'rice-fan',min:0,family:'reward',build:function(x){
        var n=ri(7,11),dx=r(55,72),rise=ri(12,20);
        for(var i=0;i<n;i++)a.addRice(x+i*dx,520-Math.min(i,n-1-i)*rise,i===Math.floor(n/2)?'bigrice':'rice');
      }},
      {id:'rice-switchback',min:1,family:'reward',build:function(x){
        var n=ri(8,13),dx=r(58,76),phase=r(0,Math.PI);
        for(var i=0;i<n;i++)a.addRice(x+i*dx,465-Math.sin(i*.65+phase)*75);
        a.addRiceLine(x+75,540,5,68);
      }},
      {id:'rice-double-arc',min:1,family:'reward',build:function(x){
        var dx=r(50,65);arc(x,440,6,dx);arc(x+430,405,6,dx);
        a.addRice(x+570,340,'bigrice');a.addRiceLine(x+200,530,4,65);
      }}
    ];
    var originalFamilies={rice:'reward','wave-trail':'reward','glide-trail':'reward','cloud-bridge':'gap','island-hop':'gap','fork-trail':'mixed',choice:'mixed','sweep-and-hop':'mixed','slide-then-wall':'mixed','stomp-chain':'obstacle','slide-corridor':'obstacle','dash-lane':'obstacle'};
    function family(p){return p.family||originalFamilies[p.id]||'obstacle';}
    var families=[],challengeStreak=0,counts={},introduced={},lastDevice={},choicesMade=0;
    function reset(){families=[];challengeStreak=0;counts={};introduced={};lastDevice={};choicesMade=0;}
    function choose(pool,opt){
      pool=pool.filter(function(p){return !p.requires||p.requires.every(function(kind){return introduced[kind];});});
      var safe=opt.transition||challengeStreak>=4||opt.phase==='release';
      var candidates=pool.filter(function(p){
        var f=family(p);
        return opt.recent.indexOf(p.id)<0 && (!safe||f==='reward') &&
          !(families.length>=2&&families[families.length-1]===f&&families[families.length-2]===f);
      });
      if(!candidates.length)candidates=pool.filter(function(p){return !safe||family(p)==='reward';});
      var weighted=candidates.map(function(p){
        var f=family(p),weight=p.family?1.45:1;
        if(f==='gap')weight*=opt.tier===0?.4:opt.coast?1.7:1.5;
        if(f==='platform')weight*=1.55;
        if(f==='mixed')weight*=opt.coast?1.9:opt.tier>=3?1.3:.8;
        if(f==='reward')weight*=safe?4:.85;
        if(!safe&&opt.phase==='flow'){
          if(f==='reward')weight*=2.5;
          if(f==='platform')weight*=1.5;
        }
        if(!safe&&opt.phase==='pressure'){
          if(f==='reward')weight*=.12;
          if(f==='gap'||f==='platform')weight*=.10;
          if(f==='mixed'||f==='obstacle')weight*=4.5;
          if(p.trial)weight*=2.3;
        }
        if(!safe&&opt.phase==='release')weight*=f==='reward'?5:f==='gap'?.25:.6;
        if(p.id==='rush-ribbon'&&(opt.phase==='release'||opt.spotlight))weight*=3;
        if(opt.spotlight&&f==='reward')weight*=2;
        return {p:p,w:weight/(1+(counts[p.id]||0)*.12)};
      });
      var total=weighted.reduce(function(sum,e){return sum+e.w;},0),roll=r(0,total),chosen=weighted[weighted.length-1].p;
      for(var i=0;i<weighted.length;i++){roll-=weighted[i].w;if(roll<=0){chosen=weighted[i].p;break;}}
      // Teach each new device in its single-device encounter before random chains.
      // Rest segments and the scene handoff keep their existing reward-only rule.
      if(!safe){
        var intro=candidates.find(function(p){return p.intro&&!introduced[p.intro];});
        if(intro)chosen=intro;
        else{
          // With a larger pool, a device can otherwise disappear for minutes.
          // Prefer a device absent for ten choices; retain rest and family limits.
          var overdue=Object.keys(introduced).sort(function(a,b){return lastDevice[a]-lastDevice[b];});
          for(var j=0;j<overdue.length;j++){
            var kind=overdue[j];if(choicesMade-lastDevice[kind]<10)break;
            var options=candidates.filter(function(p){return p.devices&&p.devices.indexOf(kind)>=0;});
            if(options.length){chosen=options[Math.floor(r(0,options.length))];break;}
          }
        }
      }
      if(chosen.intro)introduced[chosen.intro]=true;
      choicesMade++;
      (chosen.devices||[]).forEach(function(kind){lastDevice[kind]=choicesMade;});
      var f=family(chosen);families.push(f);if(families.length>3)families.shift();
      challengeStreak=f==='reward'?0:challengeStreak+1;counts[chosen.id]=(counts[chosen.id]||0)+1;
      return chosen;
    }
    return {patterns:patterns,choose:choose,reset:reset,family:family};
  }
  global.DSRoutePatterns={create:create};
})(window);
