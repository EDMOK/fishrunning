/* Shared metadata contract for generated runway segments. */
(function(global){
  'use strict';

  var DEFAULTS={
    family:'obstacle',role:'pressure',min:0,
    entry:'ground-run',exit:'ground-recover',
    requiredActions:[],optionalActions:[],
    safeRoute:true,riskRoute:false,recovery:'short',
    difficultyBudget:0,source:'pattern',
    // The speed the segment locks while the player is inside it, and the clear
    // runway that follows it. Both are filled in by the generator once the
    // geometry is placed; speed 0 / runway null mean "not declared yet".
    speed:0,runway:null
  };

  function normalize(spec){
    spec=spec||{};
    var out={};
    Object.keys(DEFAULTS).forEach(function(key){
      var value=spec[key];
      if(value===undefined)value=DEFAULTS[key];
      if(Array.isArray(value))value=value.slice();
      out[key]=value;
    });
    ['id','chunkId','frozen','topology','motif','start','end'].forEach(function(key){if(spec[key]!==undefined)out[key]=spec[key];});
    ['obstacles','platforms','gaps','pickups'].forEach(function(key){
      out[key]=Array.isArray(spec[key])?spec[key].slice():[];
    });
    if(spec.speed!==undefined)out.speed=spec.speed;
    if(spec.runway)out.runway={from:spec.runway.from,to:spec.runway.to};
    if(!out.id)out.id='segment';
    if(out.start===undefined)out.start=0;
    if(out.end===undefined)out.end=out.start;
    return out;
  }

  function create(spec){return normalize(spec);}

  function appendEntities(segment,entities){
    segment=normalize(segment);
    entities=entities||{};
    ['obstacles','platforms','gaps','pickups'].forEach(function(key){
      if(Array.isArray(entities[key]))segment[key]=segment[key].concat(entities[key]);
    });
    return segment;
  }

  function capture(spec,world,marks,bounds){
    world=world||{};marks=marks||{};bounds=bounds||{};
    var segment=create(spec);
    ['obstacles','platforms','gaps','pickups'].forEach(function(key){
      var list=world[key]||[],from=marks[key]||0;
      segment[key]=list.slice(from);
    });
    if(bounds.start!==undefined)segment.start=bounds.start;
    if(bounds.end!==undefined)segment.end=bounds.end;
    return segment;
  }

  global.DSRunSegments={defaults:DEFAULTS,create:create,normalize:normalize,
    appendEntities:appendEntities,capture:capture};
})(window);
