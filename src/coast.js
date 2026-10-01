/* Sunset coast is a visual district; gameplay is shared with the original runner. */
(function(global){
  'use strict';
  var api;
  var scene={id:'coast',name:'夕阳海岸公路',tag:'SUNSET COAST',at:36000,startTime:270,layers:null,
    rule:null,ruleText:'跳跃、滑铲与冲刺 · 沿途收集白饭',
    line:'鲸鱼娘跑在海岸高架，鹈鹕骑行在远处的公路。',mascot:'deepseek',
    goal:{kind:'rice',target:15,label:'收集白饭'},src:'游戏原创场景'};
  function active(){return api && api.zone()===api.coastIndex();}
  // Alternate artwork only. The engine retains each original kind's dimensions,
  // collision box, movement, minimum tier and interaction rules.
  var skins={patrol:'sweeper',crystals:'barrier',mine:'cone',drone:'gull'};
  function skin(kind){return skins[kind];}
  function drawBackground(ctx,alpha){
    if(!active()||alpha<=0)return;
    var w=api.world(),t=w.time,W=w.viewW;
    ctx.save();ctx.globalAlpha=alpha;
    // Decorative cycling bridge: entirely above the player's collision track.
    var road=api.image('coast/road'),off=w.camX*.19%1024;
    if(road){ctx.globalAlpha=.78*alpha;for(var x=-off;x<W;x+=1024)ctx.drawImage(road,x,252,1024,75);}
    ctx.globalAlpha=alpha;
    ctx.strokeStyle='rgba(255,225,183,.7)';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(0,246);ctx.lineTo(W,246);ctx.stroke();
    for(var j=0;j<7;j++){var bx=((j*310-w.camX*.19)%(W+310)+W+310)%(W+310)-40;ctx.fillStyle='#78718a';ctx.fillRect(bx,236,7,23);ctx.fillRect(bx,320,18,200);}
    var pelican=api.image('coast/pelican');
    var cx=440+Math.sin(t*.12)*280,cy=252+Math.sin(t*7)*1.4;
    if(pelican){var ph=pelican.naturalHeight*.78,pw=pelican.naturalWidth*.78;ctx.drawImage(pelican,cx,cy-ph,pw,ph);
      // Rotating spokes and crank provide continuous visible pedalling.
      [[.255,.845],[.855,.845]].forEach(function(c){ctx.save();ctx.translate(cx+pw*c[0],cy-ph+ph*c[1]);ctx.rotate(-t*6);ctx.strokeStyle='rgba(255,226,169,.75)';ctx.lineWidth=1.2;for(var s=0;s<3;s++){ctx.rotate(Math.PI/3);ctx.beginPath();ctx.moveTo(-ph*.1,0);ctx.lineTo(ph*.1,0);ctx.stroke();}ctx.restore();});
      ctx.save();ctx.translate(cx+pw*.56,cy-ph*.18);ctx.rotate(t*6);ctx.strokeStyle='#ffc56d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(8,0);ctx.stroke();ctx.restore();
      ctx.fillStyle='#fff2d5';ctx.font='24px sans-serif';ctx.fillText('♪',cx+pw+12,cy-ph*.5+Math.sin(t*3)*8);
    }
    // Parallax gulls, sea glints, wind strokes and lantern pulse.
    for(var k=0;k<9;k++){
      var xx=(k*217+t*13-w.camX*.06)%(W+180);if(xx<0)xx+=W+180;
      var yy=365+k%3*39+Math.sin(t*1.2+k)*4;
      ctx.strokeStyle='rgba(255,224,166,'+(.25+.2*Math.sin(t*2+k))+')';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx+30+(k%3)*12,yy);ctx.stroke();
    }
    if(Math.sin(t*.35)>.35){
      ctx.fillStyle='rgba(255,243,190,.14)';ctx.beginPath();ctx.moveTo(W-80,125);ctx.lineTo(W-780,200+Math.sin(t)*70);ctx.lineTo(W-650,320+Math.sin(t)*60);ctx.closePath();ctx.fill();
    }
    ctx.restore();
  }
  function mount(bridge){
    api=bridge;
    var strip=document.querySelector('.zoneStrip');
    strip.innerHTML='<span class="zchip">语料海</span><em>›</em><span class="zchip">榜单擂台</span><em>›</em><span class="zchip">开源市集</span><em>›</em><span class="zchip">算力金库</span><em>›</em><span class="zchip">合规边境</span><em>›</em><span class="zchip coastChip">☀ 夕阳公路</span>';
    var desc=document.createElement('p');desc.id='coastDescription';desc.textContent='城市长跑约 4 分 30 秒 · 穿过晚霞，驶入夕阳公路';strip.after(desc);
  }
  global.DSCoast={scene:scene,skin:skin,drawBackground:drawBackground,mount:mount};
})(window);
