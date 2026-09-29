import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {HostSession,PROTOCOL} from '../dist/room-session.mjs';
import {transportProfile,validJPEG,sendPreview,compactState} from '../dist/transport-profile.mjs';
import {RoomGame} from '../dist/room-core.mjs';
import {galleryLayout} from '../dist/gallery.mjs';
import {PreviewEncoder} from '../dist/preview-frames.mjs';
const jpeg='data:image/jpeg;base64,'+'A'.repeat(100);
class Channel extends EventEmitter{constructor(){super();this.open=true;this.sent=[];this.dataChannel={bufferedAmount:0};}send(m){this.sent.push(m);}close(){this.open=false;this.emit('close');}}
test('preview transport switches at 9 and returns to video at 8',()=>{for(let n=1;n<=30;n++)assert.equal(transportProfile(n).mode,n<=8?'video':'preview');assert.equal(transportProfile(30).galleryInterval,1000);});
test('30 participant grid includes all 30 with no overlap; target lives in sidebar',()=>{const boxes=galleryLayout(30);assert.equal(boxes.length,30);assert.equal(new Set(boxes.map(b=>b.y)).size,5);assert.equal(new Set(boxes.map(b=>b.x)).size,6);for(let i=0;i<30;i++)for(let j=i+1;j<30;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);}});
test('invalid and oversized images are rejected; scoring queues take priority over previews',()=>{assert.equal(validJPEG(jpeg),true);for(const bad of ['https://example.com/track.jpg','data:image/svg+xml,<svg/>','data:image/jpeg;base64,'+'A'.repeat(18000)])assert.equal(validJPEG(bad),false);const c=new Channel();c.dataChannel.bufferedAmount=17000;assert.equal(sendPreview(c,{type:'gallery',jpeg}),false);assert.equal(c.sent.length,0);c.dataChannel.bufferedAmount=0;assert.equal(sendPreview(c,{type:'gallery',jpeg}),true);});
test('30 clients receive compact state and gallery; only authenticated throttled thumbnails are accepted',()=>{
  let now=1000,nextId=0;const images=[],s=new HostSession({now:()=>now,id:()=>String(nextId++),onThumbnail:(...args)=>images.push(args)}),clients=[];
  for(let i=0;i<30;i++){const c=new Channel();s.attach(c);c.emit('data',{type:'hello',version:PROTOCOL,name:`P${i}`,token:String(i).padStart(36,'a')});clients.push(c);}
  const outsider=new Channel();s.attach(outsider);outsider.emit('data',{type:'thumbnail',jpeg});assert.equal(images.length,0);
  clients[0].emit('data',{type:'thumbnail',jpeg});clients[0].emit('data',{type:'thumbnail',jpeg});assert.equal(images.length,1);now+=1000;clients[0].emit('data',{type:'thumbnail',jpeg});assert.equal(images.length,2);
  s.broadcast();s.broadcastPreview(jpeg);for(const c of clients){assert.equal(c.sent.at(-1).type,'gallery');const state=c.sent.at(-2).state;assert.equal(state.members.length,30);assert.equal('rounds' in state,false);assert.equal('extra' in state,false);}s.close();
});
test('state payload keeps ranking and body mode without repeated round history',()=>{const g=new RoomGame();g.reset({bodyMode:'upper'});const state=compactState(g.snapshot(0));assert.equal(state.bodyMode,'upper');assert.deepEqual(state.ranking,[]);assert.equal('rounds' in state,false);});
test('preview images retain landscape and portrait camera geometry without embedded letterboxing',()=>{
  const draws=[],encoder=Object.create(PreviewEncoder.prototype);encoder.canvas={getContext:()=>({drawImage:(...args)=>draws.push(args)}),toDataURL:()=>jpeg};
  for(const [width,height,w,h] of [[1920,1080,240,135],[1080,1920,101,180],[640,480,240,180]]){
    const source={width,height};assert.equal(encoder.encode(source,240,180),jpeg);assert.equal(encoder.canvas.width,w);assert.equal(encoder.canvas.height,h);assert.deepEqual(draws.at(-1),[source,0,0,w,h]);
  }
  encoder.gallery({width:1280,height:720});assert.equal(encoder.canvas.width,960);assert.equal(encoder.canvas.height,540);
});
test('encoder lowers JPEG quality before dropping images over the byte budget',()=>{
  const encoder=Object.create(PreviewEncoder.prototype),qualities=[];encoder.canvas={getContext:()=>({drawImage(){}}),toDataURL:(_,q)=>{qualities.push(q);return q>.22?'A'.repeat(18001):jpeg;}};
  assert.equal(encoder.encode({width:640,height:480},240,180),jpeg);assert.deepEqual(qualities,[.55,.36,.22]);encoder.canvas.toDataURL=()=> 'A'.repeat(48001);assert.equal(encoder.gallery({width:1280,height:720}),null);
});
