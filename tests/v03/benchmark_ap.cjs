'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const crypto=require('node:crypto');const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../../',p))).digest('hex');const hashes={engine:hash('engine.js'),parameters:hash('parameters.json')};
const E=require('../../engine.js'),P=require('../../parameters.json');
const roster=Object.keys(P.characters),teams=roster.map(k=>[k]);
for(let i=0;i<roster.length;i++)for(let j=i+1;j<roster.length;j++)teams.push([roster[i],roster[j]]);
for(let i=0;i<roster.length&&teams.length<30;i++)for(let j=i+1;j<roster.length&&teams.length<30;j++)teams.push(roster.filter((_,k)=>k!==i&&k!==j));
const rows=[];let restoreChecks=0;
function run(options,label,keepLog=false){const b=new E(P,options);b.start();let steps=0;while(!b.result&&b.round<=30&&steps<1800){
 const before=b.snapshot();const r=b.autoAction();assert(r.ok,r.reason);b.validate();steps++;
 if(steps%5===0||b.result){const saved=E.restore(P,b.snapshot());assert.deepEqual(saved.snapshot(),b.snapshot());restoreChecks++;}
 // No observer function is permitted to mutate state.
 const beforeRead=b.snapshot();b.availableActions();b.availableConcertos();b.queuePreview();for(const enemy of b.enemies)b.enemyIntent(enemy);assert.deepEqual(b.snapshot(),beforeRead);
 assert.notDeepEqual(b.snapshot(),before,'successful action must progress');
}const result={label,options,steps,...b.summary(),observation:'30 rounds; reaching limit is inconclusive, never forced loss'};rows.push(result);if(keepLog)fs.writeFileSync(path.join(__dirname,label+'_log.json'),JSON.stringify({options,summary:result,log:b.log},null,2)+'\n');}
for(const team of teams)for(const encounter of Object.keys(P.encounters))for(const difficulty of Object.keys(P.difficulties))run({team,encounter,difficulty,auto_concerto:true,stochastic:true,seed:261010},'matrix');
const focusTeams=[['amy','lynae','mornye','chisa'],['amy','lynae','denia','chisa'],['rover','lynae','mornye','chisa']];
for(const team of focusTeams)for(const policy of ['basic_only','tactical','break_focus','no_healing'])run({team,encounter:'boss',difficulty:'standard',auto_concerto:true,policy,seed:261010},'boss_'+team.join('_')+'_'+policy,true);
for(const mode of P.characters.rover.mode_options)run({team:['rover','lynae','mornye','chisa'],modes:{rover:mode},encounter:'boss',difficulty:'challenge',auto_concerto:true,seed:261010},'rover_'+mode+'_challenge',true);
const counts={};for(const row of rows)counts[row.outcome]=(counts[row.outcome]||0)+1;
assert.equal(hash('engine.js'),hashes.engine,'engine changed during benchmark');assert.equal(hash('parameters.json'),hashes.parameters,'parameters changed during benchmark');
const report={hashes,date:new Date().toISOString(),engineVersion:P.schema_version,scope:'actual shipped JavaScript engine,30 chosen teams ×6 encounters ×3 difficulty=540; plus12 strategy comparisons+4 Rover mode challenge runs. Tactical policies are heuristics, not optimal play; no browser/human fun/Windows claim.',battles:rows.length,restoreChecks,outcomes:counts,rows};
fs.writeFileSync(path.join(__dirname,'benchmark_ap_results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({battles:rows.length,restoreChecks,outcomes:counts}));
for(const row of rows.filter(r=>r.label!=='matrix'))console.log(JSON.stringify({label:row.label,rounds:row.rounds,outcome:row.outcome,breaks:row.counts.breaks||0,firstBreak:row.first_break_round,enemyActions:row.enemy_effective_actions,danger:row.counts.charge_releases||0,healAP:row.counts.healing_ap||0,joint:row.counts.joint_damage||0,hp:row.ally_hp_fraction}));
