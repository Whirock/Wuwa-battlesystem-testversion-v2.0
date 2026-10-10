'use strict';
module.exports=function(C){const {assert,Engine,P,test,construct}=C;
 function snap(){const e=construct(['amy','lynae'],{encounter:'elite_humanoid'});e.start();return e.snapshot();}
 const mutate={
 'top-level method override':s=>s.state.act='corrupt',
 'top-level prototype payload':s=>Object.defineProperty(s.state,'__proto__',{enumerable:true,value:{polluted:true}}),
 'unit method override':s=>s.state.allies[0].damage='corrupt',
 'unit immutable resist changed':s=>s.state.enemies[0].resist.fusion=-.5,
 'unit unknown mode':s=>s.state.allies[0].mode='nonexistent',
 'unit impossible R2 owner':s=>{s.state.allies[1].r2Pending=true;s.state.allies[1].energyLocked=true;},
 'unit nonfinite HP encoded null':s=>s.state.allies[0].hp=null,
 'duplicate action queue ID':s=>s.state.queue.push(s.state.queue[0]),
 'unknown current ID':s=>s.state._currentId='enemy:unregistered',
 'missing eligible normal slot':s=>s.state.queue.splice(0,1),
 'fake victory with living enemies':s=>{s.state.result={outcome:'win'};s.state.queue=[];s.state._currentId=null;},
 'unknown status owner':s=>s.state.allies[0].status.guard={owner:'ally:unknown',slotBound:true},
 'expired generic status':s=>s.state.allies[0].status.stun={owner:s.state.enemies[0].id,expires:0},
 'unknown role status':s=>s.state.allies[0].status.evil={roleEffect:true,id:'evil',ownerId:s.state.allies[0].id},
 'role status unknown owner':s=>s.state.allies[0].status.lynae_chase={roleEffect:true,id:'lynae_chase',key:'lynae_chase',name:'追色',ownerId:'unknown',sourceId:'unknown',expires:2,token:1,order:1,appliedRound:1},
 'invalid global fields container':s=>s.state.fields={unexpected:true},
 };
 for(const [name,fn]of Object.entries(mutate))test('snapshot rejects '+name,()=>{const s=snap();fn(s);assert.throws(()=>Engine.restore(P,JSON.parse(JSON.stringify(s))));});
};
