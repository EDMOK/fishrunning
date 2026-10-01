/* Performance rewards are earned by actions, not elapsed distance. */
(function(global){
  'use strict';
  function phase(t){
    if(t<18)return 'warmup';
    var beat=(t-18)%40;
    return beat<8?'flow':beat<28?'pressure':'release';
  }
  function create(emit){
    var s;
    function reset(record){
      s={charge:0,spotlightT:0,spotlights:0,clears:0,streak:0,bestStreak:0,
        record:Math.max(0,record||0),styles:{},medals:[],readyClears:0,
        message:'跟着白饭起跳，一起试试！',mood:'idle',messageT:3};
    }
    function say(message,mood){s.message=message;s.mood=mood||'cheer';s.messageT=2.8;}
    function send(event){if(emit)emit(event);}
    function medal(id,title){
      if(s.medals.indexOf(id)>=0)return;
      s.medals.push(id);say(title+'！我们做到了！');send({type:'medal',id:id,title:title,points:180});
    }
    function activate(){
      // Collection helps fill the meter, but three successful actions are required.
      if(s.charge<100||s.readyClears<3||s.spotlightT>0)return;
      s.charge=0;s.readyClears=0;s.spotlightT=8;s.spotlights++;
      say('鲸跃时刻！白饭都过来～');
      send({type:'spotlight'});
    }
    function clear(kind,near){
      if(['jump','slide','dash','stomp','gap','bounce'].indexOf(kind)<0)return false;
      s.clears++;s.streak++;s.readyClears++;s.bestStreak=Math.max(s.bestStreak,s.streak);s.styles[kind]=true;
      var points=30+Math.min(s.streak,12)*5+(near?25:0);
      if(s.spotlightT>0)points*=2;
      if(s.spotlightT<=0)s.charge=Math.min(100,s.charge+(kind==='stomp'||kind==='dash'||kind==='bounce'?18:12)+(near?6:0));
      send({type:'clear',kind:kind,near:!!near,streak:s.streak,points:points});
      if(s.streak%5===0)say(s.streak>=10?'好厉害！继续连起来！':'漂亮！已经五连啦！');
      if(s.bestStreak>=5)medal('clean5','五连突破');
      if(Object.keys(s.styles).length>=3)medal('variety3','动作小大师');
      if(s.bestStreak>=12)medal('clean12','十二连高手');
      activate();return true;
    }
    function pickup(){if(s.spotlightT<=0)s.charge=Math.min(100,s.charge+1);activate();}
    function miss(){
      s.streak=0;s.readyClears=0;s.charge=Math.max(0,s.charge-25);s.spotlightT=0;
      say('没关系，下一段一起跳好！','hurt');send({type:'miss'});
    }
    function update(dt){
      s.spotlightT=Math.max(0,s.spotlightT-dt);s.messageT=Math.max(0,s.messageT-dt);
      if(!s.messageT)s.mood='idle';
    }
    function goal(){
      if(s.charge===100&&s.readyClears<3)return '高光已攒满，再突破 '+(3-s.readyClears)+' 道！';
      if(s.medals.indexOf('clean5')<0)return '连续突破 5 道 · '+Math.min(5,s.streak)+'/5';
      if(s.medals.indexOf('variety3')<0)return '用 3 种动作过关 · '+Object.keys(s.styles).length+'/3';
      if(s.medals.indexOf('clean12')<0)return '连续突破 12 道 · '+Math.min(12,s.streak)+'/12';
      return '挑战连段纪录 · '+s.streak+'/'+(Math.max(19,s.record)+1);
    }
    function summary(){
      var kinds=Object.keys(s.styles).length;
      var rank=s.bestStreak>=20&&kinds>=4?'S':s.bestStreak>=12&&kinds>=3?'A':s.bestStreak>=5?'B':'C';
      return {rank:rank,title:{S:'云端领跑',A:'漂亮连段',B:'流畅起步',C:'初露身手'}[rank],
        bestStreak:s.bestStreak,clears:s.clears,styles:kinds,spotlights:s.spotlights,
        medals:s.medals.slice(),recordBroken:s.bestStreak>s.record};
    }
    reset(0);
    return {reset:reset,clear:clear,pickup:pickup,miss:miss,update:update,
      state:function(){return s;},goal:goal,summary:summary,phase:phase};
  }
  global.DSExperience={create:create,phase:phase};
})(window);
