/* A replay certificate is tied to both exact chunk contents and engine source.
 * It cannot be reused after geometry, input traces or collision code change. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function engineHash(){return digest(['src/game.js','src/chunks.js','src/obstacle-specials.js','src/experience.js','src/coast.js','src/chunk-director.js','src/run-segments.js','assets/manifest.json','index.html'].map(p=>fs.readFileSync(path.join(ROOT,p),'utf8')).join('\n'));}
function key(c,strings){const name=k=>strings?strings[k]:k;return digest(JSON.stringify([c.speed,c.o.map(([k,x,o])=>[name(k),x,o]),c.p,c.g,c.r.map(([x,y,k])=>[x,y,name(k)]),c.proof,c.proofX,c.len,c.skills,c.landmarks]));}
function load(){try{const d=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/chunk-engine-certificates.json'),'utf8'));return d.engine===engineHash()?d:{engine:engineHash(),entries:{}};}catch{return {engine:engineHash(),entries:{}};}}
function save(data){fs.writeFileSync(path.join(ROOT,'docs/chunk-engine-certificates.json'),JSON.stringify(data));}
module.exports={key,load,save,engineHash};
