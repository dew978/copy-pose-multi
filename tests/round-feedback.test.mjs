import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomGame} from '../dist/room-core.mjs';
import {roundFeedback} from '../dist/round-feedback.mjs';
import {compactState} from '../dist/transport-profile.mjs';

function room(rounds=3){const g=new RoomGame({random:()=>.4});g.reset({rounds});g.join('a','PLAYER 1',0);g.join('b','PLAYER 2',0);g.arm(0);return g;}
function finish(g,scores,now){g.phase='settling';g.windows=new Map(Object.entries(scores).map(([id,best])=>[id,{best}]));g.finish(now);return g.snapshot(now);}
function ready(g,now){for(const id of g.contenders)g.receive(id,{raw:g.poses[g.poseIndex].points.map(p=>p?{x:1-(p.x*100+320)/640,y:(p.y*100+260)/480,visibility:1}:null),width:640,height:480,visible:true,time:now,token:g.token},now);}

test('each round announces its winner, independently of the cumulative champion',()=>{
  const g=room();let s=finish(g,{a:100,b:20},10000);
  assert.equal(roundFeedback(s,10000).title,'PLAYER 1 승리!');
  s=finish(g,{a:70,b:80},20000);assert.deepEqual(s.lastResult.winners,['b']);assert.equal(s.ranking[0].id,'a');
  assert.equal(roundFeedback(s,20000).title,'PLAYER 2 승리!');assert.equal(roundFeedback(s,20000).detail,'80.0%');
  s=finish(g,{a:70,b:80},30000);assert.equal(s.winner,'a');assert.equal(s.phase,'finished');assert.equal(roundFeedback(s,30000).label,'Round 3');assert.match(roundFeedback(s,30000).summary,/PLAYER 2 승리/);assert.equal(roundFeedback(s,30000).overlay,false);
});
test('next-round countdown includes the result interval and readiness, with no second countdown reset',()=>{
  const g=room(),s=finish(g,{a:100,b:80},10000);
  assert.equal(roundFeedback(s,10000).countdown,8);assert.equal(roundFeedback(s,14000).countdown,4);
  g.tick(15000);assert.equal(g.phase,'waiting');assert.equal(roundFeedback(g.snapshot(15000),15000).countdown,null);
  ready(g,15000);g.tick(15000);assert.equal(g.phase,'prepare');assert.equal(roundFeedback(g.snapshot(15000),15000).countdown,3);
  for(let t=15100;t<=18000;t+=100){ready(g,t);g.tick(t);}
  assert.equal(g.phase,'playing');assert.equal(roundFeedback(g.snapshot(18000),18000).overlay,false);
});
test('lost readiness pauses the intermission display and returning restarts a complete three seconds',()=>{
  const g=room();finish(g,{a:100,b:80},10000);g.tick(15000);ready(g,15000);g.tick(15000);
  g.receive('b',null,15500);g.tick(15500);let f=roundFeedback(g.snapshot(15500),15500);assert.equal(f.waiting,true);assert.equal(f.countdown,null);assert.equal(f.overlay,true);
  ready(g,16000);g.tick(16000);f=roundFeedback(g.snapshot(16000),16000);assert.equal(f.countdown,3);assert.equal(f.waiting,false);
});
test('tied rounds and solo practice do not invent a sole round winner',()=>{
  const g=room(1),s=finish(g,{a:90,b:90},10000);assert.deepEqual(s.lastResult.winners,['a','b']);assert.equal(s.suddenDeath,true);assert.equal(roundFeedback(s,10000).title,'무승부!');
  const extra=finish(g,{a:70,b:80},20000);assert.equal(roundFeedback(extra,20000).label,'추가 라운드 1');assert.equal(extra.winner,'b');
  const solo=new RoomGame();solo.reset({rounds:1});solo.join('a','혼자 연습',0);solo.arm(0);assert.equal(roundFeedback(finish(solo,{a:85.2},10000),10000).title,'라운드 완료!');
});
test('remote compact snapshots carry the last result and host countdown deadline',()=>{
  const g=room(),s=finish(g,{a:100,b:80},10000),remote=compactState(s);
  assert.equal(remote.rounds,undefined);assert.deepEqual(roundFeedback(remote,11200),roundFeedback(s,11200));assert.equal(remote.nextAt,15000);
});
test('host can change body mode in the same lobby or initial wait, but cannot alter an active match',()=>{
  const g=room();assert.equal(g.setBodyMode('upper',100),true);assert.equal(g.phase,'waiting');assert.equal(g.bodyMode,'upper');assert.equal(g.totalRounds,3);assert.deepEqual([...g.members.keys()],['a','b']);assert.ok(g.poseOrder.every(i=>g.poses[i].bodyMode==='upper'));
  assert.equal(g.members.get('a').ready,false);assert.equal(g.members.get('a').frame,null);
  ready(g,1000);g.tick(1000);assert.equal(g.phase,'prepare');assert.equal(g.setBodyMode('full',1000),false);assert.equal(g.bodyMode,'upper');
  finish(g,{a:90,b:80},10000);assert.equal(g.setBodyMode('full',10000),false);g.tick(15000);assert.equal(g.setBodyMode('full',15000),false);
  g.reset();assert.equal(g.setBodyMode('full',16000),true);assert.equal(g.phase,'lobby');assert.equal(g.lastResult,null);assert.equal(g.bodyMode,'full');assert.equal(g.members.size,2);
});
