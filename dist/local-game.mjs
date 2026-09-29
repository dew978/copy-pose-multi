import {RoomGame} from './room-core.mjs?v=4';
import {maskLandmarks,requiredFor,visibleFor} from './pose-mode.mjs?v=4';

// Player numbers follow the mirrored camera's fixed screen halves.
// Upper-body play never depends on the visibility or position of hips/legs.
export function assignLocalPlayers(poses,playerCount,bodyMode){
  const slots=Array(playerCount).fill(null),required=requiredFor(bodyMode);
  for(const raw of poses||[]){
    if(!Array.isArray(raw)||raw.length!==33)continue;
    const centerJoints=bodyMode==='upper'?[11,12]:[23,24];
    if(!centerJoints.every(i=>raw[i]&&Number.isFinite(raw[i].x)&&(raw[i].visibility??0)>=.5))continue;
    const cx=1-(raw[centerJoints[0]].x+raw[centerJoints[1]].x)/2;
    if(playerCount===2&&Math.abs(cx-.5)<.04)continue;
    const slot=playerCount===1?0:cx<.5?0:1;
    const quality=Number(visibleFor(raw,bodyMode))*100+required.reduce((sum,i)=>sum+(raw[i]?.visibility||0),0);
    if(!slots[slot]||quality>slots[slot].quality)slots[slot]={raw:maskLandmarks(raw,bodyMode),quality};
  }
  return slots.map(p=>p?.raw||null);
}

export class LocalGame{
  constructor({playerCount=1,rounds=5,bodyMode='full',difficulty='all',random=Math.random,now=Date.now()}={}){
    if(![1,2].includes(playerCount))throw new RangeError('Local play supports one or two players');
    this.playerCount=playerCount;this.game=new RoomGame({random});
    this.game.reset({rounds,bodyMode,difficulty});
    for(let i=1;i<=playerCount;i++)this.game.join(`local-${i}`,`PLAYER ${i}`,now);
    this.game.arm(now);
  }
  receive(frame,now=Date.now()){
    if(!frame?.visible){this.pause();return;}
    const slots=assignLocalPlayers(frame.poses,this.playerCount,this.game.bodyMode);
    for(let i=0;i<this.playerCount;i++)this.game.receive(`local-${i+1}`,slots[i]?{...frame,poses:undefined,raw:slots[i],token:this.game.token}:null,now);
  }
  pause(){
    for(const id of this.game.members.keys())this.game.receive(id,null,Date.now());
    if(['prepare','playing','settling'].includes(this.game.phase))this.game.retry('카메라 인식이 돌아오면 같은 포즈로 다시 시작합니다');
  }
  restart(now=Date.now()){
    this.game.reset();
    for(const p of this.game.members.values())p.lastCapture=-Infinity;
    this.game.arm(now);
  }
}
