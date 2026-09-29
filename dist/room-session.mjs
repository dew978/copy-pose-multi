import {RoomGame,MAX_PLAYERS} from './room-core.mjs?v=10';
import {validJPEG,transportProfile,sendPreview,compactState} from './transport-profile.mjs?v=4';
export const PROTOCOL=2;
export const roomPeerId=code=>`copy-pose-multi-${code}`;
export const validCode=code=>/^[0-9]{8}$/.test(code);
export function randomCode(){
  let code='';const bytes=new Uint8Array(16);
  while(code.length<8){crypto.getRandomValues(bytes);for(const n of bytes){if(n<250)code+=String(n%10);if(code.length===8)break;}}
  return code;
}
export function send(connection,message){if(connection?.open&&(!connection.dataChannel||connection.dataChannel.bufferedAmount<131072))try{connection.send(message);return true;}catch{}return false;}

// The host owns roster, scoring and timing. A reconnect token never appears in
// public snapshots. Media calls must belong to an accepted data connection.
export class HostSession{
  constructor({game=new RoomGame(),now=()=>Date.now(),id=()=>crypto.randomUUID(),onChange=()=>{},onDisconnect=()=>{},mediaReady=()=>true,onThumbnail=()=>{},onCameraOff=()=>{}}={}){this.game=game;this.now=now;this.id=id;this.onChange=onChange;this.onDisconnect=onDisconnect;this.mediaReady=mediaReady;this.onThumbnail=onThumbnail;this.onCameraOff=onCameraOff;this.connections=new Map();this.tokens=new Map();this.pending=new Set();this.closed=false;}
  attach(connection){
    if(this.closed||this.pending.size>=MAX_PLAYERS+8){connection.close();return;}
    const entry={connection,id:null,lastMessage:this.now(),lastFrame:0,lastThumbnail:-Infinity};this.pending.add(entry);
    connection.on('open',()=>{entry.lastMessage=this.now();});
    connection.on('data',data=>{
      if(this.closed||entry.rejected||!data||typeof data!=='object'||Array.isArray(data))return;
      const now=this.now();entry.lastMessage=now;
      if(!entry.id){
        if(data.type!=='hello')return;
        if(data.version!==PROTOCOL||typeof data.token!=='string'||!/^[a-zA-Z0-9-]{32,64}$/.test(data.token)){this.reject(entry,'버전이 다릅니다. 페이지를 새로고침해 주세요.');return;}
        let id=this.tokens.get(data.token);
        if(id&&this.connections.has(id)){this.reject(entry,'이미 접속한 참가자입니다. 이전 탭을 닫아 주세요.');return;}
        if(id&&!this.game.members.has(id))id=null;
        if(!id)id=this.id();
        try{this.game.join(id,data.name,now);}catch(error){this.reject(entry,error.message);return;}
        entry.id=id;entry.token=data.token;this.pending.delete(entry);this.tokens.set(data.token,id);this.connections.set(id,entry);
        send(connection,{type:'welcome',memberId:id,state:compactState(this.game.snapshot(now))});this.onChange();return;
      }
      if(this.connections.get(entry.id)!==entry)return;
      if(data.type==='ping')send(connection,{type:'pong',t0:data.t0,hostTime:now});
      else if(data.type==='frame'&&now-entry.lastFrame>=50){entry.lastFrame=now;this.game.receive(entry.id,this.mediaReady(entry.id)?data.frame:null,now);}
      else if(data.type==='thumbnail'&&transportProfile(this.game.members.size).mode==='preview'&&now-entry.lastThumbnail>=750&&validJPEG(data.jpeg)){entry.lastThumbnail=now;this.onThumbnail(entry.id,data.jpeg,now);}
      else if(data.type==='camera-off'){this.game.receive(entry.id,null,now);this.onCameraOff(entry.id);}
      else if(data.type==='bye'){this.detach(entry);connection.close();}
    });
    connection.on('close',()=>this.detach(entry));connection.on('error',()=>{this.detach(entry);connection.close();});
  }
  reject(entry,message){entry.rejected=true;send(entry.connection,{type:'reject',message});this.pending.delete(entry);setTimeout(()=>entry.connection.close(),200);}
  detach(entry){this.pending.delete(entry);if(entry.id&&this.connections.get(entry.id)===entry){this.connections.delete(entry.id);this.game.leave(entry.id);if(!this.game.members.has(entry.id))this.tokens.delete(entry.token);this.onDisconnect(entry.id);this.onChange();}}
  acceptCall(call){const entry=[...this.connections.values()].find(e=>e.connection.peer===call.peer);return entry&&call.metadata?.memberId===entry.id&&call.metadata?.token===entry.token?entry.id:null;}
  remove(id){const entry=this.connections.get(id);this.game.remove(id);if(entry){send(entry.connection,{type:'reject',message:'호스트가 참가자 목록에서 내보냈습니다.'});this.connections.delete(id);this.tokens.delete(entry.token);this.onDisconnect(id);setTimeout(()=>entry.connection.close(),200);}this.onChange();}
  broadcast(){const message={type:'state',state:compactState(this.game.snapshot(this.now()))};for(const{connection}of this.connections.values())send(connection,message);}
  broadcastPreview(jpeg){for(const{connection}of this.connections.values())sendPreview(connection,{type:'gallery',jpeg});}
  tick(){const now=this.now();for(const e of [...this.pending])if(now-e.lastMessage>(e.connection.open?8000:35000)){this.pending.delete(e);e.connection.close();}for(const e of [...this.connections.values()])if(now-e.lastMessage>12000){this.detach(e);e.connection.close();}this.game.tick(now);}
  close(){this.closed=true;for(const e of [...this.connections.values(),...this.pending]){send(e.connection,{type:'closed'});e.connection.close();}this.pending.clear();this.connections.clear();this.tokens.clear();}
}
