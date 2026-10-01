/* Four illustrated districts. Original fictional game content, independent of news events. */
(function (global) {
  'use strict';
  var LENGTH = 4800;
  var scenes = [
    { id:'dawn', name:'晨光云港', tag:'CLOUD HARBOR', at:0, layers:'dawn',
      rule:null, ruleText:'风羽 ×5：恢复滑翔 · 弹跳垫自动起飞',
      line:'借一阵风，去云端送信。', mascot:'deepseek',
      goal:{kind:'special',target:6,label:'收集风羽'}, item:'feather', itemName:'风羽', color:'#62afd0',
      hazards:['gustbot','rotor'], src:'游戏原创场景与机制' },
    { id:'market', name:'开源市集', tag:'PARCEL MARKET', at:4800, layers:'market',
      rule:{riceMul:1.5}, ruleText:'包裹 ×5：白饭 +8、吸附 · 滑铲完成配送',
      line:'市集开张，顺路把包裹送到。', mascot:'qwen',
      goal:{kind:'special',target:6,label:'收集包裹'}, item:'parcel', itemName:'包裹', color:'#d39a60',
      hazards:['crate','courier'], src:'游戏原创场景与机制' },
    { id:'vault', name:'算力花园', tag:'COMPUTE GARDEN', at:9600, layers:'vault',
      rule:{powerMul:1.25}, ruleText:'电池 ×5：充满冲刺 · 下砸关闭散热扇',
      line:'让算力也能自在呼吸。', mascot:'zhipu',
      goal:{kind:'special',target:6,label:'收集电池'}, item:'battery', itemName:'电池', color:'#6da993',
      hazards:['cooler','heatfan'], src:'游戏原创场景与机制' },
    { id:'wall', name:'边境空站', tag:'SKY CHECKPOINT', at:14400, layers:'wall',
      rule:null, ruleText:'印章 ×5：获得护盾 · 冲刺继电器打开扫描梁',
      line:'带好通行证，下一站还是天空。', mascot:'claude',
      goal:{kind:'special',target:6,label:'收集印章'}, item:'stamp', itemName:'印章', color:'#a397c1',
      hazards:['checkpoint','scanner'], src:'游戏原创场景与机制' }
  ];
  var run, devices = [], api, selected = -1, hud, lastHud = '';
  function reset() {
    devices.length = 0;
    run = { collected:[0,0,0,0], stamps:[false,false,false,false], interactions:0, specials:0, loops:0 };
    lastHud = '';
  }
  reset();
  function sceneAt(distance) {
    return selected >= 0 ? selected : Math.floor(Math.max(0,distance) / LENGTH) % 4;
  }
  function addDevice(kind,x,w,target) {
    var d = {kind:kind,x:x,w:w || 100,used:false,t:0,target:target};
    devices.push(d); return d;
  }
  function special(x,y,i) { return api.addRice(x,y,scenes[i].item); }
  function trail(x,y,n,dx,i) { for(var j=0;j<n;j++) special(x+j*dx,y-Math.sin(j/(n-1)*Math.PI)*24,i); }
  function patterns(i) {
    var kinds = scenes[i].hazards;
    return [
      {id:scenes[i].id+'-workshop',min:0,build:function(x) {
        if(i===0) {
          addDevice('spring',x+100,130);
          trail(x+230,340,6,64,i);
          api.addPlatform(x+330,445,300);
          api.addRiceLine(x+150,530,4,75);
        } else if(i===1) {
          api.addObstacle(kinds[1],x+260,{float:142,bob:6});
          addDevice('delivery',x+165,110);
          trail(x+130,GROUND()-58,7,57,i);
        } else if(i===2) {
          addDevice('charge',x+70,120);
          api.addObstacle(kinds[0],x+380);
          trail(x+315,GROUND()-175,5,46,i);
        } else {
          addDevice('relay',x+130,110);
          var gate=api.addObstacle('scanner',x+600,{float:142,bob:6});
          devices[devices.length-1].target=gate;
          trail(x+230,GROUND()-60,6,65,i);
        }
      }},
      {id:scenes[i].id+'-upper-route',min:0,build:function(x) {
        api.addPlatform(x+150,GROUND()-100,260);
        api.addPlatform(x+485,GROUND()-165,285);
        trail(x+225,GROUND()-195,3,65,i);
        trail(x+520,GROUND()-255,4,60,i);
        api.addRiceLine(x+80,GROUND()-65,8,80);
        if(i===0) addDevice('wind',x+390,300);
        if(i===2) addDevice('vent',x+525,120);
        if(i===1) addDevice('delivery',x+420,115);
        if(i===3) addDevice('relay',x+380,110);
      }},
      {id:scenes[i].id+'-hazard',min:0,build:function(x) {
        api.addObstacle(kinds[0],x+230);
        api.addRiceArc(x+150,GROUND()-175,5,50);
        trail(x+650,GROUND()-85,5,60,i);
        if(i===0) addDevice('wind',x+620,280);
        if(i===1) addDevice('delivery',x+625,120);
        if(i===2) addDevice('charge',x+640,120);
        if(i===3) addDevice('relay',x+630,110);
      }}
    ];
  }
  function GROUND() { return 600; }
  function activate(d,text,color) {
    d.used=true; d.t=.65; run.interactions++;
    api.burst(d.x+d.w/2,GROUND()-25,{n:18,col:[color,'#fff'],sp0:90,sp1:270,r0:3,r1:7,l0:.3,l1:.65,g:400});
    api.popText(d.x+d.w/2,GROUND()-190,text,color,25);
    api.audio('power');
    api.game().score+=35;
  }
  function update(dt) {
    var p=api.player(), px=api.world().camX+300;
    for(var j=devices.length-1;j>=0;j--) {
      var d=devices[j];
      if(d.x+d.w<api.world().camX-160) {devices.splice(j,1);continue;}
      d.t=Math.max(0,d.t-dt);
      if(d.used || px<d.x || px>d.x+d.w) continue;
      if(d.kind==='wind') {
        if(p.gliding && p.y>300 && p.y<570) {
          p.vy=Math.min(p.vy,35*Math.sqrt(api.world().speed/320));
          p.glideT=Math.max(0,p.glideT-dt*.85);
          if(!d.announced) {d.announced=true;api.popText(px,p.y-165,'顺风滑翔','#62afd0',23);}
        }
        continue;
      }
      if(d.kind==='spring' && p.onGround && p.y>580) {
        var k=Math.sqrt(api.world().speed/320);
        p.vy=-1120*k; p.onGround=false;p.sliding=false;p.jumps=1;
        p.gravMul=k*k;p.riseMul=1;p.fallMul=1.3;p.glideT=0;p.coyote=0;
        activate(d,'云端弹跳','#62afd0');api.audio('jump');
      }
      if(d.kind==='delivery' && p.sliding && p.y>580) {
        api.game().rice+=6;api.game().score+=90;
        p.power.magnet=Math.max(p.power.magnet,3);
        activate(d,'配送成功 · 白饭 +6','#d39a60');
      }
      if(d.kind==='charge' && p.onGround && p.y>580) {
        p.dashCd=0;p.charges=api.dashMax();activate(d,'冲刺充满','#6da993');
      }
      // The cooling pad is on the optional upper platform, resolved after landing.
      if(d.kind==='vent' && p.onGround && p.y<480 && api.downHeld()) {
        api.clearNearby(d.x,650);p.power.overclock=Math.max(p.power.overclock,4);
        activate(d,'散热成功 · 超频 4 秒','#6da993');
      }
      if(d.kind==='relay' && p.dashT>0 && p.y>500) {
        if(d.target) {d.target.dead=true;api.burst(d.target.x,450,{n:20,col:['#a397c1','#fff'],sp0:70,sp1:250,r0:3,r1:7,l0:.3,l1:.7});}
        p.shield=true;activate(d,'验证通过 · 护盾启动','#a397c1');
      }
    }
  }
  function collect(p) {
    var i=scenes.findIndex(function(s){return s.item===p.kind;});
    if(i<0)return;
    run.collected[i]++;run.specials++;
    if(i===api.zone()) api.progressGoal('special');
    if(run.collected[i]===6) {
      run.stamps[i]=true;api.game().score+=120;
      api.popText(p.x,p.y-85,scenes[i].name+' · 印记 +120',scenes[i].color,26);
      if(run.stamps.every(Boolean)) {
        api.game().score+=600;api.game().rice+=25;
        api.popText(p.x,p.y-135,'四境巡游完成 · +600 / 白饭 +25','#d39a60',29);
        api.audio('milestone');
      }
    }
    if(run.collected[i]%5!==0)return;
    var hero=api.player(), message;
    if(i===0) {hero.glideT=0;message='风羽共鸣 · 滑翔恢复';}
    if(i===1) {api.game().rice+=8;hero.power.magnet=Math.max(hero.power.magnet,4);message='包裹签收 · 白饭 +8 / 吸附';}
    if(i===2) {hero.charges=api.dashMax();hero.dashCd=0;message='电池满格 · 冲刺充满';}
    if(i===3) {hero.shield=true;message='通行许可 · 护盾启动';}
    api.popText(p.x,p.y-50,message,scenes[i].color,25);api.audio('combo',2);
  }
  function drawDevices(ctx) {
    var world=api.world(), time=world.time;
    devices.forEach(function(d) {
      var x=d.x-world.camX;if(x+d.w<-80 || x>world.viewW+80)return;
      ctx.save();
      var color=d.kind==='delivery'?'#d39a60':d.kind==='relay'?'#a397c1':d.kind==='charge'||d.kind==='vent'?'#6da993':'#62afd0';
      if(d.kind==='wind') {
        ctx.strokeStyle='rgba(100,175,208,.35)';ctx.lineWidth=3;
        for(var n=0;n<7;n++) {
          var yy=580-((time*90+n*41)%260);
          ctx.beginPath();ctx.moveTo(x+20+n*28,yy+25);ctx.quadraticCurveTo(x+45+n*28,yy,x+20+n*28,yy-25);ctx.stroke();
        }
        ctx.fillStyle=color;ctx.font='700 17px sans-serif';ctx.textAlign='center';ctx.fillText('长按跳跃 · 风道',x+d.w/2,590);
      } else {
        var y=d.kind==='vent'?435:600;
        var bounce=d.t>0?Math.sin(d.t*15)*5:0;
        ctx.fillStyle='rgba(65,106,134,.15)';ctx.beginPath();ctx.ellipse(x+d.w/2,y+10,d.w/2,7,0,0,Math.PI*2);ctx.fill();
        ctx.translate(0,bounce);
        var image=api.image('district/'+d.kind);
        if(image)ctx.drawImage(image,x,y-40,d.w,50);
        ctx.strokeStyle=color;ctx.lineWidth=2;ctx.globalAlpha=d.used?.35:.75;
        ctx.beginPath();ctx.ellipse(x+d.w/2,y-6,d.w*.55,9,0,0,Math.PI*2);ctx.stroke();
        ctx.globalAlpha=1;
        var captions={spring:'自动弹跳',delivery:'↓ 滑铲配送',charge:'补充冲刺',vent:'↓ 下砸散热',relay:'Shift 冲刺验证'};
        ctx.font='700 18px sans-serif';ctx.textAlign='center';
        var text=d.used?'✓ 已激活':captions[d.kind], width=ctx.measureText(text).width+24;
        ctx.fillStyle='rgba(255,255,255,.94)';ctx.beginPath();ctx.roundRect(x+d.w/2-width/2,y-84,width,31,10);ctx.fill();
        ctx.fillStyle=color;ctx.fillText(text,x+d.w/2,y-62);
      }
      ctx.restore();
    });
  }
  function ambience(ctx) {
    var w=api.world(), i=api.zone();if(i<0)i=selected>=0?selected:0;
    var col=scenes[i].color, t=w.time;
    ctx.save();ctx.globalAlpha=.65;
    // Slow foreground motifs preserve the same lighting/materials in all districts.
    for(var n=0;n<9;n++) {
      var x=((n*211-w.camX*.17)% (w.viewW+160)+w.viewW+160)%(w.viewW+160)-80;
      var y=120+(n%3)*85+Math.sin(t*.7+n)*13;
      ctx.strokeStyle=col;ctx.fillStyle='rgba(255,255,255,.75)';ctx.lineWidth=2;
      ctx.beginPath();
      if(i===0) {
        ctx.ellipse(x,y,23,7,-.35,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.beginPath();ctx.moveTo(x-15,y+8);ctx.lineTo(x+13,y-7);ctx.stroke();
      } else if(i===1) {
        ctx.roundRect(x-14,y-10,28,20,5);ctx.fill();ctx.stroke();
        ctx.beginPath();ctx.moveTo(x,y-10);ctx.lineTo(x,y+10);ctx.stroke();
      } else if(i===2) {
        ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.beginPath();ctx.arc(x,y,16,t+n,t+n+Math.PI*1.4);ctx.stroke();
      } else {
        ctx.roundRect(x-18,y-7,36,14,7);ctx.fill();ctx.stroke();
        ctx.beginPath();ctx.moveTo(x-7,y);ctx.lineTo(x+7,y);ctx.stroke();
      }
    }
    // A district-specific moving skyline detail, deliberately above the action.
    var ax=((t*25-w.camX*.08)% (w.viewW+240)+w.viewW+240)%(w.viewW+240)-120;
    ctx.globalAlpha=.75;
    var art=api.image('district/'+['airship','parcelship','solarship','airship'][i]);
    if(art)ctx.drawImage(art,ax,180+Math.sin(t)*8,140,70);
    ctx.restore();
  }
  function updateHud() {
    if(!hud)return;
    var i=api.zone();if(i<0)i=selected>=0?selected:0;
    var w=api.world(), part=selected>=0?(w.dist%LENGTH)/LENGTH:(w.dist%LENGTH)/LENGTH;
    var sig=i+'|'+Math.floor(part*100)+'|'+run.collected.join(',')+'|'+run.stamps.join(',')+'|'+selected+'|'+api.game().state;
    if(sig===lastHud)return;lastHud=sig;
    hud.hidden=api.game().state!=='playing'&&api.game().state!=='paused'&&api.game().state!=='shop';
    hud.style.setProperty('--district-color',scenes[i].color);
    hud.querySelector('b').textContent=(selected>=0?'场景练习 · ':'巡游 '+(Math.floor(w.dist/(LENGTH*4))+1)+' · ')+scenes[i].itemName+' '+run.collected[i]+' / 共鸣 '+(run.collected[i]%5)+'/5';
    hud.querySelector('.districtMeter i').style.transform='scaleX('+part+')';
    hud.querySelectorAll('.travelStamp').forEach(function(el,n) {
      el.classList.toggle('earned',run.stamps[n]);el.classList.toggle('current',n===i);
      el.title=scenes[n].name+' · 收集 '+run.collected[n]+'/6';
    });
    hud.querySelector('small').textContent=selected>=0?'练习不会计入历史最佳':'下一站：'+scenes[(i+1)%4].name;
  }
  function mount(bridge) {
    api=bridge;
    var strip=document.querySelector('.zoneStrip');
    strip.innerHTML='<button type="button" class="districtChoice active" data-district="-1" aria-pressed="true">四境巡游</button>'+scenes.map(function(s,i) {
      return '<button type="button" class="districtChoice" data-district="'+i+'" aria-pressed="false"><img src="assets/district/'+s.item+'.svg" alt="">'+s.name+'</button>';
    }).join('');
    var desc=document.createElement('p');desc.id='districtDescription';desc.textContent='四个场景依次循环 · 集齐旅行印记，领取巡游奖励';strip.after(desc);
    strip.addEventListener('click',function(e) {
      var button=e.target.closest('[data-district]');if(!button)return;
      selected=Number(button.dataset.district);
      strip.querySelectorAll('button').forEach(function(b){var active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
      desc.textContent=selected<0?'四个场景依次循环 · 集齐旅行印记，领取巡游奖励':scenes[selected].ruleText+' · 独立练习';
      document.getElementById('btnStart').lastChild.textContent=selected<0?'开始巡游':'开始练习';
    });
    hud=document.createElement('div');hud.id='districtHud';hud.hidden=true;
    hud.innerHTML='<b></b><div class="districtMeter"><i></i></div><div class="travelStamps">'+scenes.map(function(s){return '<span class="travelStamp"><img src="assets/district/'+s.item+'.svg" alt="'+s.itemName+'"></span>';}).join('')+'</div><small></small>';
    document.getElementById('hud').appendChild(hud);
  }
  global.DSDistricts={scenes:scenes,length:LENGTH,sceneAt:sceneAt,patterns:patterns,reset:reset,mount:mount,
    update:update,collect:collect,drawDevices:drawDevices,ambience:ambience,updateHud:updateHud,
    practice:function(){return selected>=0;},selected:function(){return selected;},devices:function(){return devices;},stats:function(){return run;}};
})(window);
