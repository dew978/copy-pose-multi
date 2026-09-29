import {POSES,CONNECTIONS,DIFFICULTIES} from './game-core.mjs';
const colors=['#70e4e8','#ffae8e','#d5b2ff','#ffc964','#91eb9d','#a8c2ff','#ff98c0','#f5ec8c'];
export function galleryLayout(count,width=1280,height=720){
  const cells=Math.max(2,Math.min(9,count+1)),cols=cells<=4?2:3,rows=Math.ceil(cells/cols),gap=6,w=(width-gap*(cols-1))/cols,h=(height-gap*(rows-1))/rows;
  return Array.from({length:cells},(_,i)=>({x:(i%cols)*(w+gap),y:Math.floor(i/cols)*(h+gap),w,h}));
}
export function containRect(sw,sh,box){const scale=Math.min(box.w/sw,box.h/sh);return{x:box.x+(box.w-sw*scale)/2,y:box.y+(box.h-sh*scale)/2,w:sw*scale,h:sh*scale};}
function text(c,value,x,y,size=20,color='#f1f6e9',align='left'){c.font=`700 ${size}px system-ui,sans-serif`;c.fillStyle=color;c.textAlign=align;c.fillText(String(value),x,y);}
function skeleton(c,points,project,color,width=4){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';for(const[a,b]of CONNECTIONS){if(!points[a]||!points[b]||(points[a].visibility??1)<.5||(points[b].visibility??1)<.5)continue;const A=project(points[a]),B=project(points[b]);c.beginPath();c.moveTo(A.x,A.y);c.lineTo(B.x,B.y);c.stroke();}}
function drawPose(c,pose,box){
  const points=pose.points.filter(Boolean),minX=Math.min(...points.map(p=>p.x))-.2,maxX=Math.max(...points.map(p=>p.x))+.2,minY=Math.min(...points.map(p=>p.y))-.2,maxY=Math.max(...points.map(p=>p.y))+.2;
  const scale=Math.min(box.w/(maxX-minX),box.h/(maxY-minY)),cx=box.x+box.w/2,cy=box.y+box.h/2,project=p=>({x:cx+(p.x-(minX+maxX)/2)*scale,y:cy+(p.y-(minY+maxY)/2)*scale});
  skeleton(c,pose.points,project,'#263716',Math.max(4,box.h*.027));const head=project(pose.points[0]);c.beginPath();c.arc(head.x,head.y,Math.max(5,scale*.13),0,Math.PI*2);c.fillStyle='#263716';c.fill();
}
export class Gallery{
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.videos=new Map();this.motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;}
  setVideo(id,stream){this.removeVideo(id);const video=document.createElement('video');video.muted=true;video.autoplay=true;video.playsInline=true;video.srcObject=stream;video.play().catch(()=>{});this.videos.set(id,video);return video;}
  removeVideo(id){const video=this.videos.get(id);if(video){video.pause();video.srcObject=null;}this.videos.delete(id);}
  draw(state,frames=new Map(),now=Date.now()){
    const c=this.ctx,W=this.canvas.width,H=this.canvas.height;c.fillStyle='#0d110b';c.fillRect(0,0,W,H);
    const members=state.members,boxes=galleryLayout(members.length,W,H),pose=POSES[state.poseIndex];
    // Pose occupies the center at 8 players, the last cell for smaller rooms.
    const poseCell=members.length===8?4:Math.min(members.length,boxes.length-1);let playerIndex=0;
    boxes.forEach((b,i)=>{
      c.save();c.beginPath();c.rect(b.x,b.y,b.w,b.h);c.clip();
      if(i===poseCell){
        c.fillStyle='#d9ff58';c.fillRect(b.x,b.y,b.w,b.h);text(c,'COPY THIS POSE',b.x+18,b.y+30,14,'#3e531f');text(c,DIFFICULTIES[pose.difficulty],b.x+b.w-18,b.y+30,13,'#3e531f','right');
        drawPose(c,pose,{x:b.x+40,y:b.y+45,w:b.w-80,h:b.h-110});text(c,pose.name,b.x+b.w/2,b.y+b.h-36,20,'#243515','center');
        const caption=state.phase==='playing'?`${Math.max(0,(state.end-now)/1000).toFixed(1)} SEC`:state.phase==='prepare'?`READY ${Math.max(1,Math.ceil((state.end-now)/1000))}`:state.phase==='finished'?'COMPLETE':`Round ${state.round} / ${state.totalRounds}`;
        text(c,caption,b.x+b.w/2,b.y+b.h-13,14,'#3e531f','center');
      }else{
        const member=members[playerIndex++];c.fillStyle='#1b2417';c.fillRect(b.x,b.y,b.w,b.h);
        if(!member){text(c,'참가자를 기다립니다',b.x+b.w/2,b.y+b.h/2,18,'#9eae94','center');c.restore();return;}
        const color=colors[(playerIndex-1)%colors.length],video=this.videos.get(member.id),live=video?.readyState>=2&&video.videoWidth>0&&member.connected;
        let videoBox=b;
        if(live){videoBox=containRect(video.videoWidth,video.videoHeight,b);c.save();c.translate(videoBox.x+videoBox.w,videoBox.y);c.scale(-1,1);c.drawImage(video,0,0,videoBox.w,videoBox.h);c.restore();}
        else{text(c,member.name,b.x+b.w/2,b.y+b.h/2,26,color,'center');text(c,member.connected?'카메라 대기':'연결 끊김',b.x+b.w/2,b.y+b.h/2+30,14,'#9eae94','center');}
        const frame=frames.get(member.id)?.frame,project=p=>({x:videoBox.x+(1-p.x)*videoBox.w,y:videoBox.y+p.y*videoBox.h});
        if(live&&frame&&now-frame.time<1400)skeleton(c,frame.raw,project,color,3);
        c.fillStyle='#10150edc';c.fillRect(b.x,b.y+b.h-42,b.w,42);text(c,member.name,b.x+14,b.y+b.h-15,16,color);
        const rank=state.ranking.find(p=>p.id===member.id),score=['result','finished'].includes(state.phase)?rank?.average:member.score;
        text(c,score==null?(member.ready?'READY':'전신 대기'):`${score.toFixed(1)}%`,b.x+b.w-14,b.y+b.h-15,18,member.ready?'#d9ff58':'#d5dfca','right');
        if(state.suddenDeath&&!state.contenders.includes(member.id)&&state.phase!=='finished'){c.fillStyle='#1119';c.fillRect(b.x,b.y,b.w,b.h-42);text(c,'결승 관전',b.x+b.w/2,b.y+30,15,'#fff','center');}
        if(member.id===state.winner){
          c.strokeStyle='#d9ff58';c.lineWidth=8;c.strokeRect(b.x+4,b.y+4,b.w-8,b.h-8);
          if(live&&frame&&now-frame.time<1400){const pts=frame.raw.filter(p=>p&&p.visibility>.5).map(project);if(pts.length){const loX=Math.min(...pts.map(p=>p.x)),hiX=Math.max(...pts.map(p=>p.x)),loY=Math.min(...pts.map(p=>p.y)),hiY=Math.max(...pts.map(p=>p.y));c.save();c.shadowColor='#d9ff58';c.shadowBlur=25;c.strokeStyle='#e8ff95';c.lineWidth=5;c.beginPath();c.ellipse((loX+hiX)/2,(loY+hiY)/2,Math.max(25,(hiX-loX)/2+18),Math.max(40,(hiY-loY)/2+15),0,0,Math.PI*2);c.stroke();c.restore();}}
          if(this.motion)this.fireworks(b,now);
          c.fillStyle='#1b2816e8';c.fillRect(b.x+b.w*.12,b.y+15,b.w*.76,45);text(c,'VICTORY',b.x+b.w/2,b.y+48,28,'#d9ff58','center');
        }
      }c.restore();
    });
  }
  fireworks(b,now){const c=this.ctx,t=(now%2500)/2500;for(let burst=0;burst<3;burst++){const u=(t+burst/3)%1,cx=b.x+b.w*(.2+burst*.3),cy=b.y+b.h*(.25+(burst%2)*.25);for(let j=0;j<22;j++){const a=j*Math.PI*2/22,r=u*Math.min(b.w,b.h)*.43;c.fillStyle=colors[(j+burst)%colors.length];c.globalAlpha=1-u;c.beginPath();c.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r+u*u*45,2.5,0,Math.PI*2);c.fill();}}c.globalAlpha=1;}
  close(){for(const id of this.videos.keys())this.removeVideo(id);}
}
