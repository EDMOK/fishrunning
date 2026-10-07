/* Runtime side of the frozen chunk library.
 *
 * The recipes in tools/lib/authored-chunks.cjs are an AUTHORING tool: their layouts
 * are rolled offline by tools/build_chunks.cjs, validated there, and frozen
 * into src/chunks-data.js. At runtime this module only replays them. Nothing
 * here may invent geometry — if a chunk is not in the library, it does not
 * exist, and that is what makes "every layout the player sees has been
 * validated" true rather than aspirational.
 *
 * A chunk carries the speed it was validated at. The director filters by speed
 * band before choosing, so the run still escalates (bands step up as the curve
 * climbs) but every chunk is played at exactly the speed it was proven at, and
 * the recovery runway lerps between one band and the next.
 */
(function(global){
  'use strict';

  function create(data, api){
    if(!data || !data.chunks || !data.chunks.length) return null;
    var S = data.strings || [];
    var chunks = data.chunks;
    var tolerance = data.tolerance || 110;
    var bands = [];
    chunks.forEach(function(c){ if(bands.indexOf(c.speed)<0) bands.push(c.speed); });
    bands.sort(function(a,b){ return a-b; });

    function str(i){ return i>=0 ? S[i] : undefined; }

    function replay(chunk, x){
      var i;
      for(i=0;i<chunk.h.length;i++) api.hint(str(chunk.h[i][0]), x + chunk.h[i][1]);
      for(i=0;i<chunk.g.length;i++) api.gap(x + chunk.g[i][0], chunk.g[i][1]);
      for(i=0;i<chunk.p.length;i++) api.platform(x + chunk.p[i][0], chunk.p[i][1], chunk.p[i][2], chunk.p[i][3] || {exact:true});
      for(i=0;i<chunk.o.length;i++) api.addObstacle(str(chunk.o[i][0]), x + chunk.o[i][1], chunk.o[i][2] || {});
      for(i=0;i<chunk.k.length;i++){ var k=chunk.k[i]; api.riskLine(x + k[0], k[1], k[2], k[3]); }
      for(i=0;i<chunk.r.length;i++){ var r=chunk.r[i]; api.rice(x + r[0], r[1], str(r[2])); }
    }

    // A chunk presents itself to the director as a pattern: same id space (so
    // the anti-repeat window and per-id counts work across variants), same
    // family / device / teaching metadata, but a build() that replays frozen
    // geometry and a declared speed.
    function asPattern(chunk){
      var base = str(chunk.base);
      // How many DIFFERENT obstacle kinds this beat asks the player to handle.
      // One kind is a single read; two is where the beat stops being "an
      // obstacle" and starts being a phrase.
      var kinds = {};
      chunk.o.forEach(function(o){ kinds[str(o[0])] = 1; });
      var variety = Object.keys(kinds).length;
      return {
        id: base,
        chunkId: chunk.id,
        speed: chunk.speed,
        length: chunk.len,
        name: chunk.name || base, role: chunk.role || 'pressure',
        topology: chunk.topology || 'ground', motif: chunk.motif || base,
        requiredActions: chunk.actions || [], optionalActions: chunk.optional || [],
        riskRoute: !!chunk.riskRoute, recovery: chunk.recovery || 'short',
        event: chunk.event || '', proof: chunk.proof, chain:!!chunk.chain,handcrafted:!!chunk.handcrafted,intent:chunk.intent,skills:chunk.skills||[], ribbon:chunk.ribbon,
        variety: variety,
        // The director weights by family, and combinations are rarely a single
        // family — so without this they lose to reward and platform beats and
        // the track reads as a list of single obstacles no matter how many
        // combinations the library holds.
        weightBoost: variety >= 3 ? 3.2 : variety === 2 ? 2.4 : variety === 1 ? 0.8 : 0.9,
        // How much this beat asks of the player. The director uses it to keep a
        // drought of hazards from turning into a stretch of empty track.
        hazards: chunk.o.length,
        structure: chunk.p.length + chunk.g.length,
        min: chunk.min,
        family: str(chunk.family),
        devices: chunk.devices.map(str),
        intro: str(chunk.intro),
        requires: (chunk.requires||[]).map(str),
        trial: !!chunk.trial,
        frozen: true,
        build: function(x){ replay(chunk, x); }
      };
    }

    var patterns = chunks.map(asPattern);
    var perBand = {}, byId = {}, variantCounts = {};
    patterns.forEach(function(p){
      var key=p.id+'@'+p.speed;variantCounts[key]=(variantCounts[key]||0)+1;
      byId[p.chunkId]=p;
      (perBand[p.speed]||(perBand[p.speed]=[])).push(p);
    });
    patterns.forEach(function(p){p.variantCount=variantCounts[p.id+'@'+p.speed];});

    /**
     * The pool for a wanted speed: the NEAREST band only.
     *
     * Pulling in every band within a tolerance would let a 380 chunk be chosen
     * at a natural 490 — a 110px/s step the player feels as a lurch. Restricting
     * to the nearest band caps the live step at half a band gap, and the runway
     * blend then eases it out over a full second of clear ground.
     */
    function poolFor(speed, opt){
      opt = opt || {};
      var order = bands.slice().sort(function(a,b){
        return Math.abs(a-speed) - Math.abs(b-speed);
      });
      for(var i=0;i<order.length;i++){
        if(opt.tolerance && Math.abs(order[i]-speed) > opt.tolerance) break;
        var subset = perBand[order[i]];
        if(subset && subset.length) return subset;
      }
      return patterns;
    }

    /** The teaching chunk for a given base id, at the slowest band. */
    function byBase(id, speed){
      var want = speed || bands[0];
      var best = null;
      for(var i=0;i<chunks.length;i++){
        var c = chunks[i];
        if(str(c.base) !== id) continue;
        if(!best || Math.abs(c.speed - want) < Math.abs(best.speed - want)) best = c;
      }
      return best ? byId[best.id] : null;
    }

    return {
      patterns: patterns,
      bands: bands,
      tolerance: tolerance,
      poolFor: poolFor,
      byBase: byBase,
      byId: function(id){return byId[id] || null;},
      // Sparse, staggered rewards on a declared clear ground runway.
      connectRice:function(from,to){
        var c=data.connector;if(!c||to<=from)return;
        var count=Math.max(1,Math.ceil((to-from)/c.spacing));
        for(var i=1;i<=count;i++)api.rice(from+(to-from)*i/count,c.heights?c.heights[(i+Math.floor(from/210))%c.heights.length]:c.y,c.kind);
      },
      count: chunks.length
    };
  }

  global.DSChunks = { create: create };
})(window);
