import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalGame,assignLocalPlayers} from '../dist/local-game.mjs';
import {posesFor} from '../dist/pose-mode.mjs';
import {OnlineCamera} from '../dist/online-camera.mjs';

const raw=(pose,cx=640)=>pose.points.map(p=>p?{x:1-(p.x*85+cx)/1280,y:(p.y*85+350)/720,visibility:1}:null);
const frame=(local,t,poses)=>({poses:poses||Array.from({length:local.playerCount},(_,i)=>raw(local.game.poses[local.game.poseIndex],local.playerCount===1?640:i?960:320)),width:1280,height:720,visible:true,time:t});

test('one shared camera assigns fixed mirrored sides regardless of detection order',()=>{
  for(const bodyMode of ['full','upper']){
    const pose=posesFor(bodyMode)[0],left=raw(pose,320),right=raw(pose,960);
    assert.deepEqual(assignLocalPlayers([right,left],2,bodyMode),[left,right]);
    assert.equal(assignLocalPlayers([left],2,bodyMode)[1],null);
    assert.equal(assignLocalPlayers([right],2,bodyMode)[0],null);
    assert.deepEqual(assignLocalPlayers([raw(pose,640)],2,bodyMode),[null,null]);
    assert.ok(assignLocalPlayers([raw(pose,640)],1,bodyMode)[0]);
    assert.ok(assignLocalPlayers([right],1,bodyMode)[0]);
  }
});
test('two people on the same side cannot satisfy a two-player start',()=>{
  const local=new LocalGame({playerCount:2,now:0});
  local.receive(frame(local,100,[raw(local.game.poses[local.game.poseIndex],280),raw(local.game.poses[local.game.poseIndex],390)]),100);local.game.tick(100);
  assert.equal(local.game.phase,'waiting');assert.equal(local.game.ready('local-2',100),false);
});
test('upper-body local assignments ignore hips and legs even if detected',()=>{
  const pose=raw(posesFor('upper')[0],320);pose[23]={x:0,y:NaN,visibility:1};pose[24]={x:0,y:Infinity,visibility:1};pose[27]={x:.9,y:.1,visibility:1};
  const slots=assignLocalPlayers([pose],2,'upper');assert.ok(slots[0]);assert.equal(slots[1],null);assert.equal(slots[0][23],null);assert.equal(slots[0][27],null);
});
test('missing second player cancels preparation and returning requires all three seconds again',()=>{
  const local=new LocalGame({playerCount:2,bodyMode:'upper',now:0});
  local.receive(frame(local,100),100);local.game.tick(100);assert.equal(local.game.phase,'prepare');
  local.receive(frame(local,1000,[raw(local.game.poses[local.game.poseIndex],320)]),1000);local.game.tick(1000);assert.equal(local.game.phase,'waiting');
  for(let t=2000;t<5000;t+=100){local.receive(frame(local,t),t);local.game.tick(t);assert.equal(local.game.phase,'prepare');}
  local.receive(frame(local,5000),5000);local.game.tick(5000);assert.equal(local.game.phase,'playing');
});
for(const bodyMode of ['full','upper'])for(const playerCount of [1,2])for(const rounds of [1,3,5])test(`${bodyMode}, ${playerCount} local players, ${rounds} rounds complete without a network session`,()=>{
  const local=new LocalGame({playerCount,bodyMode,rounds,random:()=>.6,now:0}),g=local.game;let now=1000;
  for(let round=0;round<rounds;round++){
    for(let t=now;t<=now+3000;t+=100){local.receive(frame(local,t),t);g.tick(t);}assert.equal(g.phase,'playing');const start=g.start;
    for(let t=start+100;t<start+5000;t+=100){const poses=[raw(g.poses[g.poseIndex],playerCount===1?640:320)];if(playerCount===2)poses.push(raw(g.poses[(g.poseIndex+1)%40],960));local.receive(frame(local,t,poses),t);g.tick(t);}
    g.tick(start+5000);g.tick(start+6000);now=start+11000;
    if(round<rounds-1){assert.equal(g.phase,'result');g.tick(now);assert.equal(g.phase,'waiting');}
  }
  assert.equal(g.phase,'finished');assert.equal(g.winner,'local-1');assert.equal(g.rounds.length,rounds);assert.equal(g.ranking()[0].average,100);g.tick(now+10000);assert.equal(g.phase,'finished');
});
test('pausing the local camera clears readiness; replay retains options and waits for new data',()=>{
  const local=new LocalGame({playerCount:2,bodyMode:'upper',difficulty:'expert',rounds:3,now:0}),g=local.game;
  local.receive(frame(local,100),100);g.tick(100);local.pause();assert.equal(g.phase,'waiting');assert.equal(g.ready('local-1',100),false);assert.equal(g.ready('local-2',100),false);
  local.restart(200);assert.equal(g.totalRounds,3);assert.equal(g.bodyMode,'upper');assert.equal(g.difficulty,'expert');assert.equal(g.phase,'waiting');assert.equal(g.poseOrder.length,10);assert.equal(g.rounds.length,0);assert.equal(g.members.size,2);
  local.receive({...frame(local,300),visible:false},300);g.tick(300);assert.equal(g.phase,'waiting');
});
test('camera dispatches both detections locally while retaining single-player network callback',()=>{
  const poses=[raw(posesFor('upper')[0],320),raw(posesFor('upper')[0],960)],all=[],single=[];
  const camera={bodyMode:'upper',video:{videoWidth:1280,videoHeight:720},onPoses:f=>all.push(f),onFrame:f=>single.push(f)};
  const old=globalThis.document;globalThis.document={hidden:false};
  try{OnlineCamera.prototype.accept.call(camera,poses,performance.now());}finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
  assert.equal(all.length,1);assert.equal(all[0].poses.length,2);assert.equal(single.length,1);assert.equal(single[0].raw.filter(Boolean).length,7);
});
