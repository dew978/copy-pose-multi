import {Gallery,containRect} from './gallery.mjs?v=10';
import {connectionsFor,bodyLabel} from './pose-mode.mjs?v=10';
const colors=['#70e4e8','#ffae8e'];
const text=(c,value,x,y,size,color,align='left')=>{c.font=`800 ${size}px system-ui,sans-serif`;c.fillStyle=color;c.textAlign=align;c.fillText(value,x,y);};
function outlinedText(c,value,x,y,size,color,align='center'){
  c.save();c.font=`900 ${size}px system-ui,sans-serif`;c.textAlign=align;c.textBaseline='middle';c.lineJoin='round';c.lineWidth=6;c.strokeStyle='#050705';c.strokeText(value,x,y);c.fillStyle=color;c.fillText(value,x,y);c.restore();
}
export class LocalStage extends Gallery{
  recognitionNotices=new Map();
  recognitionOpacity(id,visible,now){
    const target=visible?1:0;
    let notice=this.recognitionNotices.get(id);
    if(!notice){notice={from:target,to:target,start:now};this.recognitionNotices.set(id,notice);}
    const progress=Math.max(0,Math.min(1,(now-notice.start)/(notice.to===0?450:180)));
    const opacity=notice.from+(notice.to-notice.from)*progress*progress*(3-2*progress);
    if(notice.to!==target)this.recognitionNotices.set(id,{from:opacity,to:target,start:now});
    return this.motion?opacity:target;
  }
  start(game,video){
    this.stop();this.active=true;this.lastDraw=-Infinity;
    const loop=t=>{if(!this.active)return;if(t-this.lastDraw>=30){this.lastDraw=t;this.drawLocal(game.snapshot(Date.now()),game.members,video,Date.now());}this.animation=requestAnimationFrame(loop);};
    this.animation=requestAnimationFrame(loop);
  }
  stop(){this.active=false;cancelAnimationFrame(this.animation);this.recognitionNotices.clear();}
  drawLocal(state,members,video,now){
    const c=this.ctx,W=this.canvas.width,H=this.canvas.height,count=state.members.length;
    c.fillStyle='#11190e';c.fillRect(0,0,W,H);
    const live=video.readyState>=2&&!!video.srcObject&&video.videoWidth>0;
    const box=live?containRect(video.videoWidth,video.videoHeight,{x:0,y:0,w:W,h:H}):{x:0,y:0,w:W,h:H};
    if(live){c.save();c.translate(box.x+box.w,box.y);c.scale(-1,1);c.drawImage(video,0,0,box.w,box.h);c.restore();}
    const project=p=>({x:box.x+(1-p.x)*box.w,y:box.y+p.y*box.h});
    if(count===2){const mid=box.x+box.w/2;c.save();c.lineWidth=12;c.strokeStyle='#10150eda';c.beginPath();c.moveTo(mid,box.y);c.lineTo(mid,box.y+box.h);c.stroke();c.lineWidth=5;c.strokeStyle='#d9ff58';c.setLineDash([20,12]);c.stroke();c.restore();}
    for(let i=0;i<count;i++){
      const p=state.members[i],frame=members.get(p.id)?.frame,color=colors[i],cell={x:i*W/count,y:0,w:W/count,h:H};
      if(live&&frame&&now-frame.time<800){
        c.save();c.strokeStyle=color;c.lineWidth=4;c.lineCap='round';
        for(const[a,b]of connectionsFor(state.bodyMode)){const A=frame.raw[a],B=frame.raw[b];if(!A||!B||A.visibility<.5||B.visibility<.5)continue;const pa=project(A),pb=project(B);c.beginPath();c.moveTo(pa.x,pa.y);c.lineTo(pb.x,pb.y);c.stroke();}
        c.restore();
      }
      c.fillStyle='#10150ede';c.fillRect(cell.x+18,18,185,45);text(c,p.name,cell.x+32,49,22,color);
      const score=state.phase==='finished'?state.ranking.find(r=>r.id===p.id)?.average:state.intermission?state.lastResult?.scores[p.id]:p.score;
      outlinedText(c,Number.isFinite(score)?`${score.toFixed(1)}%`:'— %',cell.x+230,42,32,color,'left');
      const opacity=this.recognitionOpacity(p.id,!p.ready&&!['result','settling','finished'].includes(state.phase),now);
      if(opacity>.001){c.save();c.globalAlpha=opacity;outlinedText(c,`${bodyLabel(state.bodyMode)} 인식 대기`,cell.x+cell.w/2,H/2,40,'#fff');c.restore();}
      if(state.winner===p.id){
        c.save();c.beginPath();c.rect(cell.x,0,cell.w,H);c.clip();
        if(live&&frame&&now-frame.time<800){const points=frame.raw.filter(x=>x&&x.visibility>=.5).map(project);if(points.length){const minX=Math.min(...points.map(x=>x.x)),maxX=Math.max(...points.map(x=>x.x)),minY=Math.min(...points.map(x=>x.y)),maxY=Math.max(...points.map(x=>x.y));c.shadowColor='#d9ff58';c.shadowBlur=35;c.strokeStyle='#eaff96';c.lineWidth=6;c.beginPath();c.ellipse((minX+maxX)/2,(minY+maxY)/2,Math.max(40,(maxX-minX)/2+25),Math.max(55,(maxY-minY)/2+25),0,0,Math.PI*2);c.stroke();c.shadowBlur=0;}}
        if(this.motion)this.fireworks(cell,now);
        c.fillStyle='#16200de8';c.fillRect(cell.x+cell.w*.12,H*.2,cell.w*.76,75);text(c,'VICTORY',cell.x+cell.w/2,H*.2+55,44,'#d9ff58','center');c.restore();
      }
    }
  }
}
