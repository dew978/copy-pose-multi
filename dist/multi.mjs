import {DIFFICULTIES} from './game-core.mjs?v=4';
import {posesFor,renderPose,bodyLabel,cameraHint} from './pose-mode.mjs?v=4';
import {MAX_PLAYERS,transportProfile,validJPEG,MAX_GALLERY_CHARS,sendPreview} from './transport-profile.mjs?v=4';
import {PreviewEncoder} from './preview-frames.mjs?v=4';
import {RoomGame} from './room-core.mjs?v=4';
import {HostSession,PROTOCOL,roomPeerId,validCode,randomCode,send} from './room-session.mjs?v=5';
import {OnlineCamera} from './online-camera.mjs?v=4';
import {Gallery} from './gallery.mjs?v=4';

const $=id=>document.getElementById(id),show=(id,visible)=>$(id).classList.toggle('hidden',!visible);
const phaseNames={lobby:'모집 중',waiting:'인식 대기',prepare:'곧 시작',playing:'포즈 맞추기',settling:'점수 계산',result:'라운드 결과',finished:'최종 결과'};
let role=null,peer=null,connection=null,host=null,state=null,code='',memberId=null,token='',clockOffset=0,bestRtt=Infinity,epoch=0,lastHostSeen=0,mediaCall=null,mediaTimer=null,composite=null,lastBroadcast=0,lastPing=0,poseIndex=-1,connecting=false,cameraStarting=false,transportMode=null,lastThumbnail=0,lastGallery=0,receivedGallery=0,lastGallerySequence=0;
const calls=new Map(),rosterNodes=new Map(),gallery=new Gallery($('gallery'));
const thumbnailEncoder=new PreviewEncoder(),galleryEncoder=new PreviewEncoder();
const camera=new OnlineCamera($('local-video'),$('self-preview'),frame=>{
  if(role!=='player'||!connection?.open)return;
  send(connection,{type:'frame',frame:{...frame,time:frame.time+clockOffset,token:state?.token,raw:frame.raw?.map(p=>p?{x:p.x,y:p.y,visibility:p.visibility??0}:null)||null}});
},message=>{$('self-status').textContent=message;if(!camera.active&&!cameraStarting){show('camera-start',true);show('camera-stop',false);send(connection,{type:'camera-off'});}});

function notice(message=''){$('notice').textContent=message;show('notice',!!message);}
function choiceValue(id){return $(id).querySelector('button[aria-pressed="true"]').dataset.value;}
for(const id of ['body-mode','rounds']){const buttons=[...$(id).querySelectorAll('button[data-value]')];for(const button of buttons)button.onclick=()=>{for(const option of buttons)option.setAttribute('aria-pressed',String(option===button));};}
function busy(value){connecting=value;$('create-room').disabled=value;$('join-room').disabled=value;}
function storageGet(key){try{return sessionStorage.getItem(key);}catch{return null;}}
function storageSet(key,value){try{sessionStorage.setItem(key,value);}catch{}}
function makePeer(id){
  if(!globalThis.Peer)throw new Error('연결 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
  // PeerJS includes its public STUN/TURN defaults for networks that need relay.
  return new Peer(id,{debug:0,secure:true});
}
function openPeer(p){return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{p.destroy();reject(new Error('방 연결 시간이 초과되었습니다. 네트워크를 확인해 주세요.'));},15000);
  const fail=error=>{clearTimeout(timeout);p.destroy();reject(new Error(error.type==='unavailable-id'?'방 코드가 겹쳤습니다. 방 만들기를 다시 눌러 주세요.':'연결 서버에 접속하지 못했습니다. 네트워크를 확인해 주세요.'));};
  p.once('open',()=>{clearTimeout(timeout);p.off('error',fail);resolve();});p.once('error',fail);
});}
function enterRoom(nextRole,nextCode){role=nextRole;code=nextCode;show('entry',false);show('room',true);$('room-code').textContent=code;$('role-label').textContent=role==='host'?'HOST':'PLAYER';show('host-controls',role==='host');show('player-controls',role==='player');show('gallery',role==='host');show('gallery-video',role==='player');show('gallery-preview',false);show('gallery-placeholder',role==='player');notice();const url=new URL(location.href);url.searchParams.set('room',code);history.replaceState(null,'',url);}
function closeMedia(id){const call=calls.get(id);calls.delete(id);call?.close();gallery.removeVideo(id);}
function removeParticipantMedia(id){closeMedia(id);gallery.removeThumbnail(id);}
function leaveRoom(message=''){
  epoch++;role=null;cameraStarting=false;clearTimeout(mediaTimer);send(connection,{type:'bye'});camera.stop();mediaCall?.close();mediaCall=null;
  host?.close();host=null;for(const id of calls.keys())closeMedia(id);gallery.close();composite?.getTracks().forEach(t=>t.stop());composite=null;connection?.close();connection=null;peer?.destroy();peer=null;state=null;memberId=null;poseIndex=-1;transportMode=null;receivedGallery=0;lastGallerySequence++;$('gallery-preview').removeAttribute('src');clockOffset=0;bestRtt=Infinity;
  $('gallery-video').srcObject=null;show('room',false);show('entry',true);show('camera-start',true);show('camera-stop',false);$('camera-start').disabled=false;show('play-gallery',false);$('role-label').textContent='1–30 PLAYERS';busy(false);notice(message);
  for(const node of rosterNodes.values())node.root.remove();rosterNodes.clear();
}
function handlePeerErrors(p,currentEpoch){
  p.on('error',error=>{console.warn('Copy Pose connection:',error.type);if(currentEpoch!==epoch)return;if(error.type==='peer-unavailable')notice('방을 찾을 수 없습니다. 코드를 확인하고 호스트가 이 페이지를 열어 두었는지 확인해 주세요.');else notice('연결 상태가 불안정합니다. 계속되지 않으면 다시 입장해 주세요.');});
  p.on('disconnected',()=>{if(currentEpoch!==epoch)return;notice('연결 서버와 다시 연결하고 있습니다…');try{p.reconnect();}catch{}});
  p.on('open',()=>{if(currentEpoch===epoch)notice();});
}
async function createRoom(){
  if(connecting)return;busy(true);notice('방을 만들고 있습니다…');const currentEpoch=++epoch;
  try{
    const nextCode=randomCode(),p=makePeer(roomPeerId(nextCode));peer=p;await openPeer(p);if(currentEpoch!==epoch){p.destroy();return;}
    const game=new RoomGame();game.reset({rounds:Number(choiceValue('rounds')),difficulty:$('difficulty').value,bodyMode:choiceValue('body-mode')});
    host=new HostSession({game,onChange:()=>{if(role==='host')updateState(game.snapshot(Date.now()));},onDisconnect:removeParticipantMedia,onCameraOff:removeParticipantMedia,onThumbnail:(id,jpeg,time)=>gallery.setThumbnail(id,jpeg,time),mediaReady:id=>{if(transportProfile(game.members.size).mode==='preview')return gallery.thumbnailReady(id);const video=gallery.videos.get(id);return !!video&&video.readyState>=2;}});
    enterRoom('host',nextCode);updateState(game.snapshot(Date.now()));gallery.draw(state,game.members);composite=$('gallery').captureStream(12);
    p.on('connection',c=>{console.info('Copy Pose: host received data channel');c.on('open',()=>console.info('Copy Pose: host data channel open'));host?.attach(c);});
    p.on('call',call=>{
      const id=host?.acceptCall(call);if(!id||!composite||transportMode==='preview'){call.close();return;}closeMedia(id);calls.set(id,call);
      call.on('stream',stream=>{if(calls.get(id)===call)gallery.setVideo(id,stream);});
      const clear=()=>{if(calls.get(id)===call){calls.delete(id);gallery.removeVideo(id);host?.game.receive(id,null,Date.now());}};
      call.on('close',clear);call.on('error',clear);call.answer(composite);
    });
    handlePeerErrors(p,currentEpoch);busy(false);
  }catch(error){if(currentEpoch===epoch)leaveRoom(error.message);}
}
async function joinRoom(event){
  event.preventDefault();if(connecting)return;const nextCode=$('room-input').value.trim().toUpperCase(),name=$('name-input').value.trim();
  if(!validCode(nextCode)){notice('숫자 8자리 방 코드를 확인해 주세요.');return;}if(!name){$('name-input').focus();return;}
  busy(true);notice('방에 연결하고 있습니다…');const currentEpoch=++epoch;
  token=storageGet(`copy-pose-multi:${nextCode}`)||crypto.randomUUID();storageSet(`copy-pose-multi:${nextCode}`,token);storageSet('copy-pose-multi:name',name);
  try{
    const p=makePeer();peer=p;await openPeer(p);if(currentEpoch!==epoch){p.destroy();return;}
    const c=p.connect(roomPeerId(nextCode),{reliable:true,serialization:'json'});connection=c;
    const welcome=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('방에 연결하지 못했습니다. 호스트의 방 코드와 네트워크를 확인해 주세요.')),40000);
      c.on('open',()=>{console.info('Copy Pose: player data channel open');send(c,{type:'hello',version:PROTOCOL,name,token});});
      c.on('data',data=>{
        if(currentEpoch!==epoch||!data||typeof data!=='object')return;
        lastHostSeen=Date.now();
        if(data.type==='welcome'){clearTimeout(timeout);resolve(data);}
        else if(data.type==='reject'){clearTimeout(timeout);reject(new Error(data.message));if(role==='player')leaveRoom(data.message);}
        else if(data.type==='closed'){clearTimeout(timeout);reject(new Error('호스트가 방을 종료했습니다.'));if(role==='player')leaveRoom('호스트가 방을 종료했습니다.');}
        else if(data.type==='state'&&role==='player')updateState(data.state);
        else if(data.type==='gallery'&&role==='player'&&transportMode==='preview'&&validJPEG(data.jpeg,MAX_GALLERY_CHARS)){const sequence=++lastGallerySequence,image=new Image();image.onload=()=>{if(currentEpoch!==epoch||sequence!==lastGallerySequence||transportMode!=='preview')return;if(image.naturalWidth>1280||image.naturalHeight>720)return;$('gallery-preview').src=data.jpeg;receivedGallery=Date.now();show('gallery-placeholder',false);};image.src=data.jpeg;}
        else if(data.type==='pong'&&Number.isFinite(data.t0)&&Number.isFinite(data.hostTime)){const rtt=Date.now()-data.t0;if(rtt>=0&&rtt<bestRtt){bestRtt=rtt;clockOffset=data.hostTime-(data.t0+Date.now())/2;}}
      });
      c.on('close',()=>{clearTimeout(timeout);reject(new Error('방과의 연결이 끊겼습니다.'));if(currentEpoch===epoch&&role==='player')leaveRoom('호스트와 연결이 끊겼습니다. 같은 이름으로 다시 입장하면 진행 중인 경기에 복귀할 수 있습니다.');});
      c.on('error',()=>{clearTimeout(timeout);reject(new Error('방 연결 중 오류가 발생했습니다.'));});
    });
    if(currentEpoch!==epoch){p.destroy();return;}memberId=welcome.memberId;clockOffset=welcome.state.time-Date.now();lastHostSeen=Date.now();enterRoom('player',nextCode);updateState(welcome.state);send(c,{type:'ping',t0:Date.now()});handlePeerErrors(p,currentEpoch);busy(false);
  }catch(error){if(currentEpoch===epoch)leaveRoom(error.message);}
}
function updateState(next){
  if(!next||!Array.isArray(next.members)||next.members.length>MAX_PLAYERS||!['full','upper'].includes(next.bodyMode)||!posesFor(next.bodyMode)[next.poseIndex])return;
  state=next;camera.bodyMode=state.bodyMode;applyTransport();$('mode-label').textContent=bodyLabel(state.bodyMode);$('room').classList.toggle('many-players',state.members.length>8);
  $('phase-label').textContent=phaseNames[state.phase]||'';$('round-label').textContent=state.suddenDeath?'TIE BREAK':`Round ${state.round} / ${state.totalRounds}`;$('member-count').textContent=`${state.members.length} / ${MAX_PLAYERS}`;
  if(poseIndex!==`${state.bodyMode}:${state.poseIndex}`){poseIndex=`${state.bodyMode}:${state.poseIndex}`;const pose=posesFor(state.bodyMode)[state.poseIndex];$('pose-picture').innerHTML=renderPose(pose);$('pose-picture').setAttribute('aria-label',`${DIFFICULTIES[pose.difficulty]} 난이도: ${pose.name}`);$('pose-name').textContent=pose.name;$('difficulty-label').textContent=DIFFICULTIES[pose.difficulty];}
  const winner=state.members.find(p=>p.id===state.winner),average=state.ranking.find(p=>p.id===state.winner)?.average;
  $('game-status').textContent=winner?`${winner.name} VICTORY · 평균 ${average?.toFixed(1)}%`:state.notice;
  show('arm-game',state.phase==='lobby');$('arm-game').disabled=!state.members.some(p=>p.connected);show('reset-game',state.phase!=='lobby');$('reset-game').textContent=state.phase==='finished'?'다시 플레이 · 참가자 모집':'모집 화면으로 돌아가기';
  $('host-note').textContent=state.phase==='lobby'?`참가자를 확정하면 전원 ${bodyLabel(state.bodyMode)} 인식 후 자동 시작합니다.`:state.phase==='finished'?'새 경기에서 라운드와 포즈는 동일하게 유지됩니다.':'호스트는 이 탭을 화면에 열어 두세요.';
  if(role==='player'){
    const self=state.members.find(p=>p.id===memberId);
    if(camera.active&&!cameraStarting)$('self-status').textContent=self?.ready?`${bodyLabel(state.bodyMode)} 인식 완료 ✓`:cameraHint(state.bodyMode);
    const locked=['prepare','playing','settling'].includes(state.phase);$('camera-aspect').disabled=locked||cameraStarting;$('camera-device').disabled=locked||cameraStarting;
  }
  const visibleIds=new Set();const sorted=state.phase==='finished'?[...state.members].sort((a,b)=>a.id===state.winner?-1:b.id===state.winner?1:(state.ranking.find(p=>p.id===b.id)?.average??0)-(state.ranking.find(p=>p.id===a.id)?.average??0)):state.members;
  for(const p of sorted){
    visibleIds.add(p.id);let node=rosterNodes.get(p.id);
    if(!node){const root=document.createElement('article');root.className='person';const dot=document.createElement('span');dot.className='dot';const details=document.createElement('div');details.className='details';const name=document.createElement('div');name.className='name';const status=document.createElement('div');status.className='status';details.append(name,status);const score=document.createElement('span');score.className='score';const remove=document.createElement('button');remove.textContent='내보내기';remove.onclick=()=>host?.remove(p.id);root.append(dot,details,score,remove);node={root,name,status,score,remove};rosterNodes.set(p.id,node);$('roster').append(root);}
    node.root.classList.toggle('ready',p.ready);node.root.classList.toggle('winner',p.id===state.winner);node.name.textContent=p.name+(p.id===memberId?' (나)':'');node.status.textContent=!p.connected?'다시 접속 대기':state.phase==='finished'?(p.id===state.winner?'VICTORY':'경기 완료'):state.suddenDeath&&!state.contenders.includes(p.id)?'결승 관전':p.ready?`${bodyLabel(state.bodyMode)} 인식 완료`:`카메라 · ${bodyLabel(state.bodyMode)} 대기`;
    const rank=state.ranking.find(r=>r.id===p.id),score=['result','finished'].includes(state.phase)?rank?.average:p.score;node.score.textContent=Number.isFinite(score)?`${score.toFixed(1)}%`:'—';node.remove.hidden=role!=='host'||state.phase!=='lobby';
    if(state.phase==='finished')$('roster').append(node.root);
  }
  for(const[id,node]of rosterNodes)if(!visibleIds.has(id)){node.root.remove();rosterNodes.delete(id);}
  updateTimer();
}
function updateTimer(){
  if(!state)return;const now=Date.now()+clockOffset,active=state.phase==='playing',prepare=state.phase==='prepare';let value='5.0';if(active)value=Math.max(0,(state.end-now)/1000).toFixed(1);else if(prepare)value=String(Math.max(1,Math.ceil((state.end-now)/1000)));else if(['settling','result','finished'].includes(state.phase))value='0.0';
  $('timer').firstChild.textContent=value+' ';show('big-count',active||prepare);$('big-count').textContent=prepare?value:value;
}
async function cameraDevices(){
  try{const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'),select=$('camera-device'),current=camera.stream?.getVideoTracks()[0].getSettings().deviceId;select.replaceChildren();devices.forEach((d,i)=>{const option=document.createElement('option');option.value=d.deviceId;option.textContent=d.label||`카메라 ${i+1}`;select.append(option);});if(current)select.value=current;show('camera-device',devices.length>1);}catch{}
}
function applyTransport(){
  const next=transportProfile(state.members.length).mode;if(next===transportMode)return;transportMode=next;lastThumbnail=0;lastGallery=0;receivedGallery=0;lastGallerySequence++;
  if(role==='host'&&next==='preview'){for(const id of calls.keys())closeMedia(id);}
  if(role==='player'){
    const call=mediaCall;mediaCall=null;call?.close();clearTimeout(mediaTimer);$('gallery-video').srcObject=null;$('gallery-preview').removeAttribute('src');
    show('gallery-video',next==='video');show('gallery-preview',next==='preview');show('gallery-placeholder',true);show('play-gallery',false);
    $('gallery-placeholder').textContent=next==='preview'?'전체 미리보기를 연결하고 있습니다…':'카메라를 켜면 전체 화면이 연결됩니다.';
    if(camera.active&&!cameraStarting&&next==='video')startMediaShare();
  }
  $('preview-note').textContent=next==='preview'?'30인 지원 · 전체 미리보기 초당 1회 · 자세 채점은 계속 진행':'실시간 전체 화면';
}
function startMediaShare(){
  if(role!=='player'||!camera.shareStream||transportMode!=='video')return;
  const old=mediaCall;mediaCall=null;old?.close();clearTimeout(mediaTimer);
  const call=peer.call(roomPeerId(code),camera.shareStream,{metadata:{memberId,token}});mediaCall=call;
  call.on('stream',async incoming=>{if(mediaCall!==call)return;clearTimeout(mediaTimer);$('gallery-video').srcObject=incoming;show('gallery-placeholder',false);try{await $('gallery-video').play();show('play-gallery',false);}catch{show('play-gallery',true);}});
  const disconnected=()=>{if(mediaCall!==call)return;mediaCall=null;clearTimeout(mediaTimer);send(connection,{type:'camera-off'});show('gallery-placeholder',true);notice('영상 연결이 끊겼습니다. 카메라 다시 연결을 눌러 주세요.');show('camera-start',true);$('camera-start').textContent='카메라 다시 연결';};
  call.on('close',disconnected);call.on('error',disconnected);
  mediaTimer=setTimeout(()=>{if(mediaCall===call){notice('영상 연결이 지연되고 있습니다. 다른 네트워크에서 다시 연결해 주세요.');show('camera-start',true);$('camera-start').textContent='카메라 다시 연결';}},35000);
}
async function startCamera(){
  if(role!=='player'||cameraStarting)return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){notice('카메라를 사용하려면 HTTPS 주소를 Chrome 또는 Safari에서 열어 주세요.');return;}
  const currentEpoch=epoch;cameraStarting=true;$('camera-start').disabled=true;notice();
  const old=mediaCall;mediaCall=null;old?.close();clearTimeout(mediaTimer);send(connection,{type:'camera-off'});camera.bodyMode=state.bodyMode;
  try{
    await camera.start($('camera-aspect').value,$('camera-device').value);if(currentEpoch!==epoch||!camera.active)return;
    if(transportMode==='video')startMediaShare();lastThumbnail=0;
    show('camera-start',false);show('camera-stop',true);await cameraDevices();
  }catch(error){
    if(currentEpoch===epoch){camera.stop();const messages={NotAllowedError:'카메라 권한을 허용한 뒤 다시 눌러 주세요.',NotFoundError:'연결된 카메라가 없습니다.',NotReadableError:'다른 앱이 카메라를 사용 중인지 확인해 주세요.'};notice(messages[error.name]||'카메라 또는 자세 인식을 시작하지 못했습니다. 네트워크를 확인하고 다시 눌러 주세요.');show('camera-start',true);show('camera-stop',false);}
  }finally{if(currentEpoch===epoch){cameraStarting=false;$('camera-start').disabled=false;}}
}
function stopCamera(){clearTimeout(mediaTimer);send(connection,{type:'camera-off'});const call=mediaCall;mediaCall=null;call?.close();camera.stop();if(transportMode==='video'){$('gallery-video').srcObject=null;show('gallery-placeholder',true);}show('camera-start',true);show('camera-stop',false);$('self-status').textContent='카메라 OFF';$('camera-start').textContent='카메라 켜고 참여';}

$('create-room').onclick=createRoom;$('join-form').onsubmit=joinRoom;$('camera-start').onclick=startCamera;$('camera-stop').onclick=stopCamera;
$('camera-aspect').onchange=()=>{if(camera.active)startCamera();};$('camera-device').onchange=()=>{if(camera.active)startCamera();};
$('arm-game').onclick=()=>{if(host?.game.arm(Date.now())){host.broadcast();updateState(host.game.snapshot(Date.now()));}};
$('reset-game').onclick=()=>{if(!host)return;host.game.reset();for(const p of host.game.members.values())if(!p.connected)host.game.remove(p.id);host.broadcast();updateState(host.game.snapshot(Date.now()));};
$('leave-room').onclick=()=>leaveRoom();$('copy-link').onclick=async()=>{const url=new URL(location.href);url.search='';url.searchParams.set('v','6');url.searchParams.set('room',code);try{await navigator.clipboard.writeText(url.href);$('copy-link').textContent='복사 완료 ✓';setTimeout(()=>{$('copy-link').textContent='초대 링크 복사';},2000);}catch{notice(`초대 주소: ${url.href}`);}};
$('help-button').onclick=()=>$('help').showModal();$('close-help').onclick=()=>$('help').close();$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notice('이 브라우저에서는 전체 화면을 지원하지 않습니다.');}};
$('play-gallery').onclick=async()=>{try{await $('gallery-video').play();show('play-gallery',false);}catch{notice('영상 재생을 시작하지 못했습니다. 카메라를 다시 연결해 주세요.');}};
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){send(connection,{type:'camera-off'});if(host&&['prepare','playing','settling'].includes(host.game.phase)){host.game.retry('호스트가 돌아오면 같은 라운드로 재도전합니다');host.broadcast();}}
});
window.addEventListener('pagehide',()=>leaveRoom());
setInterval(()=>{
  const now=Date.now();
  if(role==='host'&&host){if(!document.hidden)host.tick();if(now-lastBroadcast>=transportProfile(host.game.members.size).stateInterval){lastBroadcast=now;host.broadcast();updateState(host.game.snapshot(now));}gallery.draw(host.game.snapshot(now),host.game.members,now);if(transportMode==='preview'&&!document.hidden&&now-lastGallery>=1000){lastGallery=now;const jpeg=galleryEncoder.gallery($('gallery'));if(jpeg)host.broadcastPreview(jpeg);}}
  else if(role==='player'){if(now-lastHostSeen>16000){leaveRoom('호스트 응답이 없습니다. 호스트가 방을 열고 있는지 확인한 후 다시 입장해 주세요.');return;}if(now-lastPing>2000){lastPing=now;send(connection,{type:'ping',t0:now});}if(transportMode==='preview'&&camera.active&&!cameraStarting&&!document.hidden&&now-lastThumbnail>=1000){lastThumbnail=now;const jpeg=thumbnailEncoder.encode(camera.output,240,180);if(jpeg)sendPreview(connection,{type:'thumbnail',jpeg});}if(transportMode==='preview'&&receivedGallery&&now-receivedGallery>5000){show('gallery-placeholder',true);$('gallery-placeholder').textContent='전체 미리보기 연결을 기다리고 있습니다…';}updateTimer();}
},80);

const queryCode=new URL(location.href).searchParams.get('room')?.toUpperCase();if(queryCode&&validCode(queryCode)){$('room-input').value=queryCode;setTimeout(()=>$('name-input').focus(),100);}$('name-input').value=storageGet('copy-pose-multi:name')||'';
