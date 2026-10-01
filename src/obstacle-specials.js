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
  }
  function update(o,dt,lead){
    if(o.kind==='spring')o.compressT=Math.max(0,(o.compressT||0)-dt);
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
    return null;
  }
  function cue(o){
    if(o.kind==='cargo')return '冲刺 / 下砸开箱';
    if(o.kind==='spring')return o.springUsed?'借力成功':'↓ 踩顶借力';
    if(o.kind==='buoy')return (o.locked?'':'即将 ')+(o.mode==='slide'?'↓ 下滑通过':'↑ 跳过浮标');
    return '';
  }
  function canBounce(o,ob,prevFoot,foot,vy){
    return o.kind==='spring'&&!o.springUsed&&vy>0&&prevFoot<=ob.y+14&&foot>=ob.y;
  }
  global.DSObstacleSpecials={init:init,update:update,pose:pose,cue:cue,canBounce:canBounce,
    armLead:ARM_LEAD,armTime:ARM_TIME,slideLift:SLIDE_LIFT};
})(window);
