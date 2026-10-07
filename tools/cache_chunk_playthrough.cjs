/* Import actual engine results before a rebuild changes the candidate library. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),cert=require('./lib/chunk-engine-certificates.cjs');
const report=JSON.parse(fs.readFileSync('docs/chunk-playthrough-verification.json','utf8'));
const box={window:{}};vm.runInNewContext(fs.readFileSync('src/chunks-data.js','utf8'),box);
const data=box.window.DSChunksData,chunks=data.chunks,cache=cert.load();
if(report.engine)assert.equal(report.engine,cache.engine,'engine changed after replay');
else {assert.ok(process.argv.includes('--bootstrap-current'),'replay report needs its engine hash');assert.equal(report.tested,chunks.length,'bootstrap must cover the complete unchanged library');}
for(const row of report.results){
 const c=chunks.find(c=>c.id===row.id);assert.ok(c,'unknown replay candidate '+row.id);
 const failed=!row.finished||row.hit||row.failed||row.lives<3||row.missingLandmarks?.length;
 if(row.key)assert.equal(row.key,cert.key(c,data.strings),'chunk changed after replay '+row.id);
 cache.entries[cert.key(c,data.strings)]={passed:!failed,id:row.id,frames:row.frames,hit:row.hit,failed:row.failed,lives:row.lives,missingLandmarks:row.missingLandmarks||[],collected:row.collected};
}
cert.save(cache);console.log(JSON.stringify({imported:report.results.length,passed:report.results.filter(r=>!r.hit&&!r.failed&&r.lives>=3&&r.finished&&!r.missingLandmarks?.length).length}));
