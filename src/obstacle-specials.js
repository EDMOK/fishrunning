/* Distinct obstacle states; rendering and collision share the same locked lift. */
(function(global){
  'use strict';
  var ARM_LEAD=1350,ARM_TIME=.32,SLIDE_LIFT=142;
  function init(o,options){
    options=options||{};
    if(o.kind==='buoy'){
      o.mode=options.mode==='slide'?'slide':'hop';
      o.bob=o.mode==='slide'?1:0;
      o.lift=71;o.armT=0;o.armed=false;o.locked=false;
    }
    if(o.kind==='spring'){o.springUsed=false;o.compressT=0;}
    if(options.trap){
      o.trap=options.trap;
      o.trapT=0;
      o.trapCycle=options.trapCycle||4.2;
      o.soft=!!options.soft;
      o.trapT=options.trapT||0;
      o.trapActive=false;
      o.trapWarning=false;
    }
  }
  function update(o,dt,lead){
    if(o.kind==='spring')o.compressT=Math.max(0,(o.compressT||0)-dt);
    if(o.trap==='pulse'){
      o.trapT=(o.trapT+dt)%o.trapCycle;
      var pulse=o.trapT/o.trapCycle;
      o.trapWarning=pulse>=.15&&pulse<.45;
      o.trapActive=pulse>=.45&&pulse<.75;
    }else if(o.trap==='cable'||o.trap==='scout'){
      o.trapT=(o.trapT+dt)%o.trapCycle;
      var phase=o.trapT/o.trapCycle;
      o.trapWarning=phase<.18||phase>.82;
      o.trapActive=true;
    }
    if(o.kind!=='buoy')return;
    if(!o.armed&&lead<=ARM_LEAD){o.armed=true;o.liftFrom=o.lift;}
    if(!o.armed||o.locked)return;
    o.armT=Math.min(ARM_TIME,o.armT+dt);
    var t=o.armT/ARM_TIME,e=t*t*(3-2*t),target=o.mode==='slide'?SLIDE_LIFT:0;
    o.lift=o.liftFrom+(target-o.liftFrom)*e;
    if(t>=1){o.locked=true;o.lift=target;}
  }
  function pose(o,t){
    if(o.kind==='buoy')return {dx:0,dy:-(o.lift||0)};
    if(o.kind==='cargo')return {dx:0,dy:-Math.abs(Math.sin(t*5+o.phase))*3};
    if(o.trap==='cable'){
      var cableW=6.2832/(o.trapCycle||2.7),cablePhase=(o.trapT||0)*cableW+o.phase;
      return {dx:Math.sin(cablePhase)*18,dy:-20+Math.sin(cablePhase)*40};
    }
    if(o.trap==='scout'){
      var scoutW=6.2832/(o.trapCycle||3.1),scoutPhase=(o.trapT||0)*scoutW+o.phase;
      return {dx:Math.sin(scoutPhase)*58,dy:Math.sin(scoutPhase)*45};
    }
    return null;
  }
  function cue(o){
    if(o.kind==='cargo')return '冲刺 / 下砸开箱';
    if(o.kind==='spring')return o.springUsed?'借力成功':'↓ 踩顶借力';
    if(o.kind==='buoy')return (o.locked?'':'即将 ')+(o.mode==='slide'?'↓ 下滑通过':'↑ 跳过浮标');
    if(o.trap==='pulse')return o.trapActive?'✕ 等待防火墙关闭':'✓ 通道开启';
    if(o.trap==='cable')return '↕ 看轨迹 · 跳 / 滑';
    if(o.trap==='scout')return '↕ 巡逻中 · 看高度';
    return '';
  }
  function active(o){return o.trap!=='pulse'||o.trapActive;}
  function isSoft(o){return !!o.soft;}
  function canBounce(o,ob,prevFoot,foot,vy){
    return o.kind==='spring'&&!o.springUsed&&vy>0&&prevFoot<=ob.y+14&&foot>=ob.y;
  }
  global.DSObstacleSpecials={init:init,update:update,pose:pose,cue:cue,canBounce:canBounce,
    active:active,isSoft:isSoft,armLead:ARM_LEAD,armTime:ARM_TIME,slideLift:SLIDE_LIFT};
})(window);
