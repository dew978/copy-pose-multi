import test from 'node:test';
import assert from 'node:assert/strict';
import {UPPER_POSES,UPPER_REQUIRED,posesFor,visibleFor,maskLandmarks,selectPose,scoreUpperPose,renderPose} from '../dist/pose-mode.mjs';
import {RoomGame} from '../dist/room-core.mjs';
import {screenLandmarks} from '../dist/game-core.mjs';
function raw(pose){return pose.points.map(p=>p?{x:1-(p.x*90+320)/640,y:(p.y*90+260)/480,visibility:1}:null);}
function frame(g,t,index=g.poseIndex){return{raw:raw(g.poses[index]),width:640,height:480,visible:true,time:t,token:g.token};}

test('40 distinct seated poses, 10 per difficulty, all score exactly 100 against themselves',()=>{
  assert.equal(UPPER_POSES.length,40);assert.equal(new Set(UPPER_POSES.map(p=>p.id)).size,40);assert.equal(new Set(UPPER_POSES.map(p=>JSON.stringify(p.points))).size,40);
  for(const d of ['easy','medium','hard','expert'])assert.equal(UPPER_POSES.filter(p=>p.difficulty===d).length,10);
  for(const p of UPPER_POSES){assert.equal(scoreUpperPose(p.points,p),100,p.id);assert.equal(visibleFor(raw(p),'upper'),true,p.id);assert.equal(visibleFor(raw(p),'full'),false);assert.match(renderPose(p),/<svg/);assert.equal(p.points.filter(Boolean).length,7);}
});
test('upper score ignores hips and legs completely, even when the full body is present',()=>{
  const p=UPPER_POSES[3],points=structuredClone(p.points),baseline=scoreUpperPose(points,p);
  for(const i of [23,24,25,26,27,28,29,30,31,32])points[i]={x:1000+i,y:-500,visibility:0};
  assert.equal(scoreUpperPose(points,p),baseline);points[27].visibility=1;points[25].y=9;assert.equal(scoreUpperPose(points,p),baseline);assert.equal(maskLandmarks(points,'upper').filter(Boolean).length,7);
});
test('scale, translation and camera aspect correction preserve upper scoring',()=>{
  for(const p of UPPER_POSES){const moved=p.points.map(x=>x?{...x,x:x.x*125+320,y:x.y*125+260}:null);assert.equal(scoreUpperPose(moved,p),100);assert.equal(scoreUpperPose(screenLandmarks(raw(p),640,480),p),100);}
});
test('asymmetric gestures and joint angles meaningfully change upper scores',()=>{
  assert.ok(scoreUpperPose(UPPER_POSES[10].points,UPPER_POSES[11])<80);assert.ok(scoreUpperPose(UPPER_POSES[0].points,UPPER_POSES[4])<80);
  const p=structuredClone(UPPER_POSES[0].points);p[15].visibility=.1;assert.equal(scoreUpperPose(p,UPPER_POSES[0]),null);p[15]=null;assert.equal(scoreUpperPose(p,UPPER_POSES[0]),null);
});
test('seated tracking never depends on hips; missing wrist prevents readiness',()=>{
  const r=raw(UPPER_POSES[0]);assert.equal(r[23],null);assert.equal(selectPose([r],'upper'),r);assert.equal(visibleFor(r,'upper'),true);r[15].x=1.01;assert.equal(visibleFor(r,'upper'),false);r[15].x=.2;r[16].visibility=.1;assert.equal(visibleFor(r,'upper'),false);
});
test('upper mode random pools use only selected difficulty and persist on replay',()=>{
  for(const difficulty of ['all','easy','medium','hard','expert']){const g=new RoomGame();g.reset({bodyMode:'upper',difficulty,rounds:5});g.join('p','P',0);g.arm(0);assert.equal(g.poseOrder.length,difficulty==='all'?40:10);assert.equal(new Set(g.poseOrder.slice(0,5)).size,5);assert.ok(g.poseOrder.every(i=>difficulty==='all'||g.poses[i].difficulty===difficulty));assert.equal(g.snapshot(0).bodyMode,'upper');g.reset();assert.equal(g.bodyMode,'upper');assert.equal(g.difficulty,difficulty);}
});
test('30 seated players start automatically and complete all five rounds with one winner',()=>{
  const g=new RoomGame({random:()=>.6});g.reset({bodyMode:'upper',rounds:5});for(let i=0;i<30;i++)g.join(String(i),`P${i}`,0);g.arm(0);let now=1000;
  for(let round=0;round<5;round++){
    for(let t=now;t<=now+3000;t+=100){for(const id of g.contenders)g.receive(id,frame(g,t),t);g.tick(t);}assert.equal(g.phase,'playing');const start=g.start;
    for(let t=start+100;t<start+5000;t+=100){for(const id of g.contenders)g.receive(id,frame(g,t,id==='0'?g.poseIndex:(g.poseIndex+1)%40),t);g.tick(t);}
    g.tick(start+5000);g.tick(start+6000);now=start+11000;if(round<4){assert.equal(g.phase,'result');g.tick(now);assert.equal(g.phase,'waiting');}
  }
  assert.equal(g.phase,'finished');assert.equal(g.winner,'0');assert.equal(g.ranking()[0].average,100);assert.equal(g.rounds.length,5);assert.equal(g.roster.length,30);
});
test('host removes lower-body values before validation and scoring in upper mode',()=>{
  const g=new RoomGame();g.reset({bodyMode:'upper'});g.join('p','P',0);g.arm(0);const f=frame(g,100);f.raw[27]={x:Infinity,y:NaN,visibility:-100};assert.equal(g.receive('p',f,100),true);assert.equal(g.ready('p',100),true);assert.equal(g.members.get('p').frame.raw[27],null);assert.equal(g.members.get('p').score,100);
});
test('full mode still requires knees and ankles; mode switch clears prior ready state',()=>{
  const g=new RoomGame();g.reset({bodyMode:'upper'});g.join('p','P',0);g.arm(0);g.receive('p',frame(g,100),100);assert.equal(g.ready('p',100),true);g.reset({bodyMode:'full'});assert.equal(g.ready('p',100),false);assert.equal(g.poses,posesFor('full'));const f={...frame(g,200),raw:raw(UPPER_POSES[0])};g.receive('p',f,200);assert.equal(g.ready('p',200),false);
});
