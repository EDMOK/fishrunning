/* Summarise certificates only after every emitted chunk has an engine pass. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),cert=require('./lib/chunk-engine-certificates.cjs');
const box={window:{}};vm.runInNewContext(fs.readFileSync('src/chunks-data.js','utf8'),box);
const data=box.window.DSChunksData,cache=cert.load(),rows=[],catalog={};
for(const c of data.chunks){
 const key=cert.key(c,data.strings),r=cache.entries[key];assert.ok(r&&r.passed,'unchecked/failed emitted chunk '+c.id);
 c.engineChecked=true;rows.push({...r,id:c.id,key});
 if(c.handcrafted){const id=data.strings[c.base];const entry=catalog[id]??={name:c.name,intent:c.intent,actions:c.actions,skills:c.skills,bands:{}};entry.bands[c.speed]=(entry.bands[c.speed]||0)+1;}
}
assert.equal(Object.keys(catalog).length,24,'all handwritten themes must have an engine-validated instance');
const chunkSource=fs.readFileSync('src/chunks-data.js','utf8');fs.writeFileSync('src/chunks-data.js',chunkSource.slice(0,chunkSource.indexOf('window.DSChunksData = '))+'window.DSChunksData = '+JSON.stringify(data)+';\n');
const report={engine:cache.engine,tested:rows.length,failures:[],errors:[],method:'Real game physics at 120Hz, keyboard input trace in practice, default abilities; no cleared obstacles, invulnerability or health edits. Rendering skipped only by test interception.',results:rows};
fs.writeFileSync('docs/chunk-playthrough-verification.json',JSON.stringify(report,null,2));
fs.writeFileSync('docs/handcrafted-chunks.json',JSON.stringify({recipes:24,chunks:data.chunks.filter(c=>c.handcrafted).length,rows:catalog},null,2));
const library=JSON.parse(fs.readFileSync('docs/chunk-library.json','utf8'));library.engineChecked=rows.length;library.bytes=fs.statSync('src/chunks-data.js').size;library.emittedRecipes=new Set(data.chunks.map(c=>c.base)).size;library.handcrafted={recipes:24,chunks:data.chunks.filter(c=>c.handcrafted).length};fs.writeFileSync('docs/chunk-library.json',JSON.stringify(library,null,2));
console.log(JSON.stringify({chunks:rows.length,handcrafted:library.handcrafted,failures:0},null,2));
