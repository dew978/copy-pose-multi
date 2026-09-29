import {requestCameraStream,attachCameraVideo} from './camera-utils.mjs';
import {assignPlayers,CONNECTIONS} from './game-core.mjs';
import {createPoseModel} from './model-loader.mjs';
export class OnlineCamera{
  constructor(video,preview,onFrame,onStatus){this.video=video;this.preview=preview;this.onFrame=onFrame;this.onStatus=onStatus;this.epoch=0;this.active=false;this.output=document.createElement('canvas');this.output.width=480;this.output.height=360;}
  async start(aspect,deviceId=''){
    this.stop();const epoch=this.epoch;this.onStatus('카메라 연결 중…');
    const current=()=>epoch===this.epoch;
    try{
      this.stream=await requestCameraStream(navigator.mediaDevices,{aspect,deviceId,isCurrent:current});
      await attachCameraVideo(this.video,this.stream);if(!current())return;
      this.active=true;this.output.height=Math.round(480*this.video.videoHeight/this.video.videoWidth);this.preview.width=480;this.preview.height=this.output.height;
      this.shareStream=this.output.captureStream(12);this.draw();this.onStatus('자세 인식 준비 중…');
      this.stream.getVideoTracks()[0].addEventListener('ended',()=>{if(current()){this.stop();this.onStatus('카메라 연결이 끊겼습니다. 다시 켜 주세요.');}});
      try{
        const worker=new Worker(new URL('./online-worker.js',import.meta.url));this.worker=worker;
        await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('timeout')),25000);worker.onerror=()=>{clearTimeout(timeout);reject(new Error('worker'));};worker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timeout);resolve();}else if(data.type==='error'){clearTimeout(timeout);reject(new Error(data.message));}};worker.postMessage({type:'init'});});
        if(!current())return;
        worker.onmessage=({data})=>{if(!current())return;this.busy=false;if(data.type==='poses'){this.accept(data.landmarks,data.timestamp);}else if(data.type==='frame-error'){this.errors=(this.errors||0)+1;if(this.errors>5){this.stop();this.onStatus('인식이 중단되었습니다. 카메라를 다시 켜 주세요.');}}};
      }catch{
        if(!current())return;this.worker?.terminate();this.worker=null;
        const model=await createPoseModel(this.onStatus);if(!current()){model.close();return;}this.model=model;
      }
      this.onStatus('머리부터 발끝까지 보여 주세요');this.timer=setInterval(()=>this.detect(),90);return this.shareStream;
    }catch(error){if(current())this.stop();throw error;}
  }
  accept(landmarks,timestamp){
    if(performance.now()-timestamp>800)return;
    this.errors=0;const p=assignPlayers(landmarks,this.video.videoWidth,this.video.videoHeight,1)[0];
    this.raw=p?.raw||null;this.lastPose=performance.now();
    this.onFrame({raw:this.raw,width:this.video.videoWidth,height:this.video.videoHeight,visible:!document.hidden,time:Date.now()-(performance.now()-timestamp)});
  }
  async detect(){
    if(this.busy&&performance.now()-this.busySince>5000){this.stop();this.onStatus('자세 인식이 응답하지 않습니다. 카메라를 다시 켜 주세요.');return;}
    if(!this.active||this.busy||document.hidden||this.video.readyState<2||this.lastTime===this.video.currentTime)return;
    this.busy=true;this.busySince=performance.now();this.lastTime=this.video.currentTime;const timestamp=performance.now(),epoch=this.epoch;
    try{if(this.worker){const bitmap=await createImageBitmap(this.video,{resizeWidth:640,resizeHeight:Math.round(640*this.video.videoHeight/this.video.videoWidth)});if(epoch!==this.epoch||!this.worker){bitmap.close();return;}this.worker.postMessage({type:'frame',bitmap,timestamp,cycle:epoch,roundToken:0},[bitmap]);}
      else{const result=this.model.detectForVideo(this.video,timestamp);this.busy=false;this.accept(result.landmarks,timestamp);}
    }catch{this.busy=false;}
  }
  draw(){
    if(!this.active)return;
    const {width:w,height:h}=this.output,c=this.output.getContext('2d');c.drawImage(this.video,0,0,w,h);
    const p=this.preview.getContext('2d');p.save();p.translate(w,0);p.scale(-1,1);p.drawImage(this.video,0,0,w,h);p.restore();
    if(this.raw&&performance.now()-this.lastPose<800){p.strokeStyle='#d9ff58';p.lineWidth=3;p.lineCap='round';for(const[a,b]of CONNECTIONS){const A=this.raw[a],B=this.raw[b];if(!A||!B||A.visibility<.5||B.visibility<.5)continue;p.beginPath();p.moveTo((1-A.x)*w,A.y*h);p.lineTo((1-B.x)*w,B.y*h);p.stroke();}}
    this.drawTimer=setTimeout(()=>this.draw(),80);
  }
  stop(){this.epoch++;this.active=false;clearInterval(this.timer);clearTimeout(this.drawTimer);this.worker?.terminate();this.worker=null;this.model?.close();this.model=null;this.stream?.getTracks().forEach(t=>t.stop());this.shareStream?.getTracks().forEach(t=>t.stop());this.stream=null;this.shareStream=null;this.video.srcObject=null;this.raw=null;this.busy=false;this.lastTime=-1;this.errors=0;this.preview.getContext('2d').clearRect(0,0,this.preview.width,this.preview.height);}
}
