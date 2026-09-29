import {DIFFICULTIES,ScoreWindow,screenLandmarks} from './game-core.mjs?v=4';
import {posesFor,visibleFor,scoreFor,maskLandmarks,bodyLabel} from './pose-mode.mjs?v=4';
import {MAX_PLAYERS} from './transport-profile.mjs?v=4';
export {MAX_PLAYERS};
export const READY_TTL=1200;
export function cleanName(value){return String(value||'플레이어').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,16)||'플레이어';}
export function validFrame(frame){
  return frame&&Array.isArray(frame.raw)&&frame.raw.length===33&&Number.isFinite(frame.width)&&Number.isFinite(frame.height)&&frame.width>=100&&frame.height>=100&&frame.width<=4096&&frame.height<=4096&&frame.raw.every(p=>p===null||(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-1&&p.x<=2&&p.y>=-1&&p.y<=2&&Number.isFinite(p.visibility)&&p.visibility>=0&&p.visibility<=1));
}
export class RoomGame{
  constructor({random=Math.random}={}){this.random=random;this.members=new Map();this.token=0;this.reset();}
  reset({rounds=this.totalRounds||5,difficulty=this.difficulty||'all',bodyMode=this.bodyMode||'full'}={}){
    if(!['full','upper'].includes(bodyMode)||![1,3,5].includes(rounds)||!['all',...Object.keys(DIFFICULTIES)].includes(difficulty))throw new RangeError('Invalid settings');
    this.bodyMode=bodyMode;this.poses=posesFor(bodyMode);this.totalRounds=rounds;this.difficulty=difficulty;this.phase='lobby';this.roster=[];this.contenders=[];this.rounds=[];this.extra=[];this.winner=null;this.end=0;this.start=0;this.nextAt=0;this.notice='참가자를 모아 주세요';this.token++;this.suddenDeath=false;this.poseOrder=[];this.poseIndex=0;this.windows=new Map();for(const p of this.members.values()){p.score=null;p.ready=false;p.frame=null;}
  }
  join(id,name,now){
    if(this.members.has(id)){const p=this.members.get(id);p.connected=true;p.lastSeen=now;p.ready=false;p.lastCapture=-Infinity;return p;}
    if(this.phase!=='lobby')throw new Error('경기 중입니다. 호스트가 모집 화면으로 돌아온 후 입장해 주세요.');
    if(this.members.size>=MAX_PLAYERS)throw new Error(`참가 인원 ${MAX_PLAYERS}명이 모두 찼습니다.`);
    const p={id,name:cleanName(name),connected:true,ready:false,lastSeen:now,lastCapture:-Infinity,frame:null,score:null};this.members.set(id,p);return p;
  }
  leave(id){const p=this.members.get(id);if(p){p.connected=false;p.ready=false;p.frame=null;}if(this.phase==='lobby')this.members.delete(id);}
  remove(id){if(this.phase!=='lobby')throw new Error('모집 중에만 내보낼 수 있습니다.');this.members.delete(id);}
  arm(now){
    if(this.phase!=='lobby')return false;const ids=[...this.members.values()].filter(p=>p.connected).map(p=>p.id);if(ids.length<1||ids.length>MAX_PLAYERS)return false;
    this.roster=ids;this.contenders=[...ids];this.poseOrder=this.poses.map((p,i)=>i).filter(i=>this.difficulty==='all'||this.poses[i].difficulty===this.difficulty);
    for(let i=this.poseOrder.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.poseOrder[i],this.poseOrder[j]]=[this.poseOrder[j],this.poseOrder[i]];}
    this.poseIndex=this.poseOrder[0];this.phase='waiting';this.notice=`전원의 ${bodyLabel(this.bodyMode)} 인식을 기다립니다`;this.nextAt=now;this.token++;return true;
  }
  ready(id,now){const p=this.members.get(id);return !!p&&p.connected&&p.ready&&now-p.lastSeen<READY_TTL;}
  receive(id,frame,now){
    const p=this.members.get(id);if(!p||!p.connected)return false;
    if(this.bodyMode==='upper'&&Array.isArray(frame?.raw))frame={...frame,raw:maskLandmarks(frame.raw,'upper')};
    if(!validFrame(frame)){p.ready=false;p.frame=null;p.score=null;this.windows.get(id)?.add(null,now);return false;}
    const t=frame.time;
    if(!Number.isFinite(t)||t>now+150||now-t>1200||t<=p.lastCapture)return false;
    p.lastCapture=t;p.lastSeen=now;p.frame={...frame,raw:maskLandmarks(frame.raw,this.bodyMode)};p.ready=frame.visible===true&&visibleFor(frame.raw,this.bodyMode);
    p.score=p.ready?scoreFor(screenLandmarks(p.frame.raw,frame.width,frame.height),this.poses[this.poseIndex],this.bodyMode):null;
    if(['playing','settling'].includes(this.phase)&&frame.token===this.token&&this.contenders.includes(id)&&t>=this.start&&t<this.end&&now<=this.end+1000)this.windows.get(id)?.add(p.score,t);
    return true;
  }
  ranking(){return this.roster.map(id=>{const scores=this.rounds.map(r=>r.scores[id]).filter(Number.isFinite);return{id,name:this.members.get(id)?.name||'플레이어',average:scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10:null,last:this.rounds.at(-1)?.scores[id]??null};}).sort((a,b)=>(b.average??-1)-(a.average??-1));}
  tick(now){
    const before=this.phase;
    if(['prepare','playing','settling'].includes(this.phase)&&this.contenders.some(id=>!this.members.get(id)?.connected)){this.retry('연결이 끊겼습니다. 다시 접속하면 재도전합니다');return true;}
    if(this.phase==='waiting'&&now>=this.nextAt&&this.contenders.every(id=>this.ready(id,now))){this.phase='prepare';this.end=now+3000;this.notice=`${bodyLabel(this.bodyMode)} 인식 완료`;this.token++;this.windows=new Map(this.contenders.map(id=>[id,new ScoreWindow()]));}
    else if(this.phase==='prepare'){
      if(!this.contenders.every(id=>this.ready(id,now)))this.retry(`${bodyLabel(this.bodyMode)}가 다시 보이면 3초부터 시작합니다`);
      else if(now>=this.end){this.phase='playing';this.start=this.end;this.end=this.start+5000;this.notice='5초 안에 자세를 맞춰 주세요';}
    }else if(this.phase==='playing'&&now>=this.end){this.phase='settling';this.notice='점수를 모으고 있습니다';}
    else if(this.phase==='settling'&&now>=this.end+1000){this.finish(now);}
    else if(this.phase==='result'&&now>=this.nextAt){this.phase='waiting';this.notice=`${this.suddenDeath?'동점자 결승':'다음 라운드'} · ${bodyLabel(this.bodyMode)} 인식 대기`;this.token++;}
    return this.phase!==before;
  }
  retry(message){this.phase='waiting';this.notice=message;this.end=0;this.nextAt=0;this.token++;this.windows.clear();}
  finish(now){
    const scores=Object.fromEntries(this.contenders.map(id=>[id,this.windows.get(id)?.best??null]));
    if(Object.values(scores).some(s=>s===null)){this.retry('인식이 부족한 참가자가 있어 같은 포즈로 재도전합니다');return;}
    const result={pose:this.poses[this.poseIndex].id,scores};
    if(this.suddenDeath)this.extra.push(result);else this.rounds.push(result);
    if(!this.suddenDeath&&this.rounds.length<this.totalRounds){this.phase='result';this.nextAt=now+5000;this.notice='라운드 결과';this.poseIndex=this.poseOrder[this.rounds.length];return;}
    const values=this.suddenDeath?this.contenders.map(id=>({id,average:scores[id]})):this.ranking();
    const top=Math.max(...values.map(p=>p.average));const tied=values.filter(p=>p.average===top).map(p=>p.id);
    if(tied.length===1){this.winner=tied[0];this.phase='finished';this.notice='VICTORY';return;}
    this.suddenDeath=true;this.contenders=tied;this.phase='result';this.nextAt=now+5000;this.notice='공동 1위 · 동점자 추가 대결';this.poseIndex=this.poseOrder[(this.totalRounds+this.extra.length)%this.poseOrder.length];
  }
  snapshot(now){return{bodyMode:this.bodyMode,phase:this.phase,token:this.token,poseIndex:this.poseIndex,round:Math.min(this.rounds.length+(this.phase==='result'?0:1),this.totalRounds),totalRounds:this.totalRounds,difficulty:this.difficulty,start:this.start,end:this.end,notice:this.notice,suddenDeath:this.suddenDeath,contenders:this.contenders,winner:this.winner,ranking:this.ranking(),rounds:this.rounds,extra:this.extra,members:[...this.members.values()].map(p=>({id:p.id,name:p.name,connected:p.connected,ready:this.ready(p.id,now),score:this.windows.get(p.id)?.best??p.score})),time:now};}
}
