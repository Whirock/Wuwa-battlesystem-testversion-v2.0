#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),P=require(path.join(root,'parameters.json')),O=require('./independent_oracle.cjs');
const checks=[],failed=[];const test=(name,fn)=>{try{fn();checks.push(name);}catch(e){failed.push({name,error:e.message});}};
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-8,`${a} != ${b}`);
for(const p of O.profiles){
 test(`cards:${p.key}`,()=>{const a=P.characters[p.key];assert.ok(a);assert.equal(Object.keys(a.skills).length,p.skills.length);for(const s of p.skills){const key=s.id||s.skill_id,r=a.skills[key];assert.ok(r,`${p.key}:${key}`);assert.deepEqual(r.numeric_audit,s.numeric_audit);if(s.conditional_variants)assert.deepEqual(r.conditional_variants.map(v=>({name:v.name,numeric_audit:v.numeric_audit})),s.conditional_variants);}});
}
for(const p of O.growth.profiles){const k=p[0]==='aemeath'?'amy':p[0],v=p.slice(3);test(`growth:${k}:90 levels`,()=>{
 for(let L=1;L<=90;L++){const a=P.characters[k].growth_by_level[L],t=(L-1)/89,g=.7*t+.3*t*t;assert.ok(a,`missing level ${L}`);
 for(const [stat,i,z]of [['hp',0,g],['sp',2,t],['atk',4,g],['def',6,g],['spd',8,t]])assert.equal(a[stat],Math.floor(v[i]+(v[i+1]-v[i])*z+.5),`${k} L${L} ${stat}`);
 near(a.cr,Math.round((v[10]+(v[11]-v[10])*t)*10)/1000);near(a.er,(Math.round((v[12]+(v[13]-v[12])*t)*10)/10+(k==='mornye'?10:0))/100);near(a.cdmg,1.5);
 }near(P.characters[k].energy_cap,v[14]);
 });}
test('nine roster configurations / 61 skills',()=>{assert.equal(Object.keys(P.characters).length,9);assert.equal(Object.values(P.characters).reduce((n,a)=>n+Object.keys(a.skills).length,0),61);});
test('boss/elite Q final frozen capacities',()=>{for(const e of Object.values(P.enemies)){if(e.rank==='elite')near(e.q_capacity,72);if(e.rank==='common')near(e.q_capacity,0);}near(P.enemies.crownless.q_capacity,112);near(P.enemies.dreamless.q_capacity,156);near(P.enemies.dreamless.reflection_q,54.6);near(P.enemies.dreamless.charge_interrupt_fraction,.5);});
test('five prisms, independent own-element immunity, no electro prism',()=>{const ps=Object.entries(P.enemies).filter(([k,e])=>k.includes('prism'));assert.equal(ps.length,5);assert.ok(!ps.some(([k,e])=>e.element==='electro'));for(const [k,e]of ps)assert.ok(e.immune_elements.includes(e.element),k);});
test('enemies retain fixed reference level rather than ally growth',()=>{assert.equal(P.enemies.crownless.level,25);assert.equal(P.enemies.dreamless.level,40);});
test('final integrated controls: high-pressure boss charge immunity',()=>{assert.equal(P.enemies.crownless.charge_control,'immune');assert.equal(P.enemies.dreamless.charge_control,'immune');});
const out={runAt:new Date().toISOString(),command:'node tests/v04/independent_parameters.cjs',scope:'Independent static parameter audit only; not an executable combat pass',sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'parameters.json'))).digest('hex'),passed:checks.length,failed,checks};
console.log(JSON.stringify(out,null,2));process.exitCode=failed.length?1:0;
