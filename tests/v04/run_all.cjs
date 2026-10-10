#!/usr/bin/env node
'use strict';
// Reproducible local execution, never infers real-browser or human-playtest passes.
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const commands=[['node',['--test','tests/v04/engine_core.test.cjs','tests/v04/skill_effects.test.cjs']],['node',['tests/v04/independent_parameters.cjs']],['node',['tests/v04/independent_runtime.cjs']],['node',['tests/v04/ui_bp_contract.cjs']],['node',['tests/v04/ui_project_migration.cjs']],['node',['tests/v04/ui_target_branches.cjs']],['node',['tests/v04/ui_roster_coverage.cjs']],['node',['tests/v04/ui_dreamless_bounds.cjs']],['node',['tests/v04/ui_enemy_action_labels.cjs']],['node',['tests/v04/ui_projectile_queue.cjs']],['node',['tests/v04/independent_dom.cjs']],['node',['tests/v04/independent_victory_replay.cjs']],['python',['tests/v04/asset_audit.py']]];
const result={version:'v3.0.0-test.4',timestamp:new Date().toISOString(),environment:{node:process.version,platform:process.platform},scope:'Executable engine / DOM / asset verification. Not rendered-browser or playtest certification.',hashes:{},commands:[]};
for(const f of ['engine.js','skill-effects.js','parameters.json','parameters.js','app.js','storage.js','assets.js','index.html','style.css'])result.hashes[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
for(const [bin,args] of commands){process.stderr.write(`Running ${bin} ${args.join(' ')}\n`);const start=Date.now(),r=spawnSync(bin,args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});result.commands.push({command:[bin,...args].join(' '),exitCode:r.status,elapsedMs:Date.now()-start,stdout:r.stdout,stderr:r.stderr,error:r.error?.message});}
result.passed=result.commands.every(r=>r.exitCode===0);process.stdout.write(JSON.stringify(result,null,2)+'\n');process.exitCode=result.passed?0:1;
