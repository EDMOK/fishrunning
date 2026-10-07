/* Re-author rewards on the existing curated geometry without re-rolling it. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {ribbon}=require('./lib/chunk-solver.cjs');
const box={window:{}};vm.runInNewContext(fs.readFileSync('src/chunks-data.js','utf8'),box);
const data=box.window.DSChunksData,S=data.strings,manifest=JSON.parse(fs.readFileSync('assets/manifest.json','utf8'));
const before=data.chunks.reduce((n,c)=>n+c.r.length,0);
for(const c of data.chunks){
 const exact={requiredPlatforms:(c.landmarks||[]).map(i=>c.p[i][0]),allowDash:c.skills.includes('dash'),requireDash:c.skills.includes('dash'),allowBounce:c.skills.includes('bounce'),requireBounce:c.skills.includes('bounce'),obstacles:c.o.map(([k,x,opts])=>({kind:S[k],x,opts,...manifest.obstacle[S[k]]})),platforms:c.p.map(([x,y,w,opts])=>({x,y,w,opts})),gaps:c.g.map(([x,w])=>({x,w}))};
 const route=ribbon(exact,c.speed,c.proof);assert.equal(route.end,c.len,'reward-only pass must preserve chunk boundaries');
 c.r=route.points.map((p,i)=>[Math.round(p.x*10)/10,Math.round(p.y*10)/10,S.indexOf(i>0&&i%24===0?'bigrice':'rice')]);
 c.ribbon={source:'scatter-clusters',minSeparation:82,maxEmptySpan:430,deviation:74};c.engineChecked=false;
}
data.connector={spacing:150,heights:[454,558,492],kind:'rice'};
fs.writeFileSync('src/chunks-data.js','/* GENERATED from curated geometry and tools/lib/chunk-solver.cjs reward scatter.\n * Rebuild full geometry: tools/build_chunks.cjs. Re-author rewards: tools/update_chunk_rewards.cjs. */\nwindow.DSChunksData = '+JSON.stringify(data)+';\n');
const library=JSON.parse(fs.readFileSync('docs/chunk-library.json','utf8'));library.engineChecked=0;library.rewardLayout={originalLineRice:library.rewardLayout?.originalLineRice??before,source:'scatter-clusters',beforeRice:before,rice:data.chunks.reduce((n,c)=>n+c.r.length,0)};fs.writeFileSync('docs/chunk-library.json',JSON.stringify(library,null,2));
console.log(JSON.stringify({chunks:data.chunks.length,...library.rewardLayout,riskLines:data.chunks.reduce((n,c)=>n+c.k.length,0)}));
