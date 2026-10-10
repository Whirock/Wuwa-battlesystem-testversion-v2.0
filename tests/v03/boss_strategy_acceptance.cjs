'use strict';
// Multiple actual-engine squads and seeds. No patched combat formula or scripted HP.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../..'),E=require('../../engine.js'),P=require('../../parameters.json');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const hashes={engine:hash('engine.js'),parameters:hash('parameters.json')},roster=Object.keys(P.characters),teams=[];
for(let i=0;i<roster.length;i++)for(let j=i+1;j<roster.length;j++)teams.push(roster.filter((_,k)=>k!==i&&k!==j));
const rows=[];
function run(team,policy,difficulty,seed,mode='spectro',group='standard_strategy'){
 const b=new E(P,{team,encounter:'boss',difficulty,seed,stochastic:true,auto_concerto:true,policy,modes:{rover:mode}});b.start();let steps=0;
 while(!b.result&&b.round<=30&&steps++<1500){const r=b.autoAction();assert(r.ok,r.reason);}
 E.restore(P,b.snapshot());const s=b.summary();rows.push({group,team,policy,difficulty,seed,mode,outcome:s.outcome,rounds:s.rounds,survivors:s.survivors,hpFraction:s.ally_hp_fraction,firstBreak:s.first_break_round,breaks:s.counts.breaks||0,enemyEffectiveWindows:s.enemy_effective_actions,dangerReleases:s.counts.charge_releases||0,healAP:s.counts.healing_ap||0,AP:s.counts.ap_spent||0,partAP:(s.skills.disrupt_part||0)*2,partsDestroyed:s.counts.parts_destroyed||0,guardAP:s.skills.guard||0,jointDamage:s.counts.joint_damage||0,finalResources:s.final_resources});
}
for(let i=0;i<teams.length;i++)for(let n=1;n<=20;n++)for(const policy of ['basic_only','tactical','mechanism','defensive','break_focus'])run(teams[i],policy,'standard',n*913+i+97);
for(let i=0;i<teams.length;i++)for(let n=1;n<=20;n++)run(teams[i],'basic_only','easy',n*977+i+100003,'spectro','easy_learning');
for(let i=0;i<teams.length;i++)if(teams[i].includes('rover'))for(let n=1;n<=10;n++)for(const mode of ['havoc','aero','electro'])for(const policy of ['basic_only','mechanism','defensive'])run(teams[i],policy,'standard',n*2017+i+301001,mode,'rover_alternate_modes');
function wilson(w,n){const z=1.96,p=w/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [c-h,c+h].map(x=>Math.round(x*10000)/100);}
const groups={};for(const row of rows){const key=row.group+' / '+row.policy;const a=groups[key]||(groups[key]={n:0,win:0,loss:0,inconclusive:0,rounds:0,partAP:0,guardAP:0,healAP:0,dangerReleases:0,enemyEffectiveWindows:0,breaks:0});a.n++;a[row.outcome]++;for(const k of ['rounds','partAP','guardAP','healAP','dangerReleases','enemyEffectiveWindows','breaks'])a[k]+=row[k];}
for(const a of Object.values(groups)){a.winRatePercent=Math.round(a.win/a.n*10000)/100;a.descriptiveWilson95Percent=wilson(a.win,a.n);for(const k of ['rounds','partAP','guardAP','healAP','dangerReleases','enemyEffectiveWindows','breaks'])a['mean_'+k]=Math.round(a[k]/a.n*100)/100;}
assert.equal(hash('engine.js'),hashes.engine);assert.equal(hash('parameters.json'),hashes.parameters);
const baseline=groups['standard_strategy / basic_only'],part=groups['standard_strategy / mechanism'],guard=groups['standard_strategy / defensive'];
assert(baseline.win/baseline.n<.5,'majority of blind basic-only standard runs must fail');assert(part.win/part.n>.8&&guard.win/guard.n>.8,'multiple paid response strategies must remain viable');
const report={date:new Date().toISOString(),hashes,version:P.schema_version,scope:'actual shipped engine;15 four-person squads×20 seeded runs×5 policies,300 easy basic runs,and900 alternate-Rover mode runs. No HP/resonance overrides. 30-round limit. Policies use actual public dangerous tells; basic_only ignores defense/heal/parts but is given legal outro assistance.',statistical_limit:'Wilson intervals describe these seeded scenario samples only. Reused team structures and simulation seeds are not independent human players; this is not a population win-rate or final balance guarantee.',acceptance:{blind_standard_majority_fail:true,part_and_guard_routes_viable:true,unique_required_character:false,default_recovery_immunity:false},battles:rows.length,groups,rows};
fs.writeFileSync(path.join(__dirname,'boss_strategy_results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({battles:rows.length,hashes,groups},null,2));
