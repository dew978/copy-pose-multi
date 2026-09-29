import {POSES as FULL_POSES,REQUIRED,CONNECTIONS,scorePose} from './game-core.mjs?v=4';
export const BODY_MODES={full:'전신',upper:'상체'};
export const UPPER_REQUIRED=[0,11,12,13,14,15,16];
export const UPPER_CONNECTIONS=[[11,12],[11,13],[13,15],[12,14],[14,16]];
const rad=a=>a*Math.PI/180;
// All definitions are seated-compatible: head, shoulders, elbows and wrists.
// Absolute arm directions make asymmetric poses match the mirrored screen.
function upper(id,name,difficulty,left,right,lean=0){
  const points=Array.from({length:33},()=>null),angle=rad(lean);
  function point(i,x,y){points[i]={x:x*Math.cos(angle)-y*Math.sin(angle),y:x*Math.sin(angle)+y*Math.cos(angle),visibility:1};}
  point(0,0,-.79);point(11,-.36,-.25);point(12,.36,-.25);
  for(const[shoulder,elbow,wrist,directions]of [[-.36,13,15,left],[.36,14,16,right]]){
    const ex=shoulder+Math.cos(rad(directions[0]))*.64,ey=-.25+Math.sin(rad(directions[0]))*.64;
    point(elbow,ex,ey);point(wrist,ex+Math.cos(rad(directions[1]))*.62,ey+Math.sin(rad(directions[1]))*.62);
  }
  return{id:`upper-${id}`,name,difficulty,bodyMode:'upper',points};
}
export const UPPER_POSES=[
  upper('wings','양팔 비행기','easy',[180,180],[0,0]),
  upper('v','브이 날개','easy',[225,225],[315,315]),
  upper('cheer','두 팔 만세','easy',[270,270],[270,270]),
  upper('goal','골인 팔','easy',[180,270],[0,270]),
  upper('robot','로봇 팔','easy',[180,90],[0,90]),
  upper('low-wings','낮은 날개','easy',[135,135],[45,45]),
  upper('cactus','선인장','easy',[210,270],[330,270]),
  upper('shrug','으쓱 어깨','easy',[135,225],[45,315]),
  upper('guard','복싱 준비','easy',[115,235],[65,305]),
  upper('rest','팔 나란히','easy',[90,90],[90,90]),
  upper('lightning','번개 팔','medium',[270,270],[0,0]),
  upper('reverse-lightning','반대 번개','medium',[180,180],[270,270]),
  upper('disco','디스코 팔','medium',[225,225],[45,45]),
  upper('reverse-disco','반대 디스코','medium',[135,135],[315,315]),
  upper('wave','한 손 인사','medium',[180,270],[90,90]),
  upper('reverse-wave','반대 손 인사','medium',[90,90],[0,270]),
  upper('zigzag','위아래 로봇','medium',[180,270],[0,90]),
  upper('reverse-zigzag','반대 로봇','medium',[180,90],[0,270]),
  upper('half-goal','반쪽 골인','medium',[180,270],[0,0]),
  upper('half-wing','반쪽 비행기','medium',[180,180],[0,90]),
  upper('archer','앉은 궁수','hard',[180,180],[30,225]),
  upper('reverse-archer','반대 궁수','hard',[150,315],[0,0]),
  upper('diamond','머리 위 다이아','hard',[225,315],[315,225]),
  upper('low-diamond','낮은 다이아','hard',[135,45],[45,135]),
  upper('tilt-goal','기울어진 골인','hard',[180,270],[0,270],18),
  upper('tilt-wing','기울어진 비행기','hard',[180,180],[0,0],-18),
  upper('high-low','높게 낮게','hard',[255,345],[15,105]),
  upper('reverse-high-low','낮게 높게','hard',[165,75],[285,195]),
  upper('fold-one','한쪽 접기','hard',[205,300],[315,315]),
  upper('fold-two','반대쪽 접기','hard',[225,225],[335,240]),
  upper('tilt-archer','사선 궁수','expert',[180,180],[25,235],-24),
  upper('reverse-tilt-archer','반대 사선 궁수','expert',[155,305],[0,0],24),
  upper('twisted-z','비틀린 Z','expert',[205,300],[25,115],20),
  upper('reverse-z','반대 Z','expert',[155,65],[335,240],-20),
  upper('high-fold','높은 팔 접기','expert',[240,335],[320,215],-15),
  upper('reverse-high-fold','반대 높은 접기','expert',[220,325],[300,205],15),
  upper('offset-diamond','비대칭 다이아','expert',[215,320],[300,210],22),
  upper('low-high-fold','엇갈린 팔','expert',[145,35],[285,195],-22),
  upper('reverse-low-high','반대 엇갈린 팔','expert',[255,345],[35,145],22),
  upper('double-angle','이중 꺾기','expert',[195,290],[15,125],-25),
];
export const posesFor=mode=>mode==='upper'?UPPER_POSES:FULL_POSES;
export const requiredFor=mode=>mode==='upper'?UPPER_REQUIRED:[0,...REQUIRED];
export const connectionsFor=mode=>mode==='upper'?UPPER_CONNECTIONS:CONNECTIONS;
export const bodyLabel=mode=>BODY_MODES[mode]||BODY_MODES.full;
export const cameraHint=mode=>mode==='upper'?'머리와 양팔 · 손목까지 보여 주세요':'머리부터 발끝까지 보여 주세요';
export function maskLandmarks(raw,mode){return raw?.map((p,i)=>mode==='upper'&&!UPPER_REQUIRED.includes(i)?null:p)||null;}
export function visibleFor(raw,mode){
  if(!raw)return false;
  return requiredFor(mode).every(i=>{const p=raw[i];return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??0)>=.5&&p.x>.005&&p.x<.995&&p.y>.005&&p.y<.995;});
}
export function selectPose(poses,mode){return poses.map(raw=>({raw,ready:visibleFor(raw,mode),confidence:requiredFor(mode).reduce((sum,i)=>sum+(raw[i]?.visibility||0),0)})).sort((a,b)=>Number(b.ready)-Number(a.ready)||b.confidence-a.confidence)[0]?.raw||null;}
const clamp=n=>Math.min(1,Math.max(-1,n));
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const angle=(a,b)=>Math.acos(clamp((a.x*b.x+a.y*b.y)/(Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y)||1e-10)));
const joint=(p,a,b,c)=>angle(sub(p[a],p[b]),sub(p[c],p[b]));
export function scoreUpperPose(points,target){
  if(!points||!UPPER_REQUIRED.every(i=>points[i]&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y)&&(points[i].visibility??1)>=.5))return null;
  const t=target.points||target;
  const edges=[[11,13],[13,15],[12,14],[14,16]];
  let directions=0;for(const[a,b]of edges)directions+=Math.max(0,1-angle(sub(points[b],points[a]),sub(t[b],t[a]))/(Math.PI/2))**1.3;
  const elbows=([ [11,13,15],[12,14,16] ]).reduce((s,[a,b,c])=>s+Math.max(0,1-Math.abs(joint(points,a,b,c)-joint(t,a,b,c))/(Math.PI*.6)),0)/2;
  const mid=p=>({x:(p[11].x+p[12].x)/2,y:(p[11].y+p[12].y)/2});
  const shoulders=Math.max(0,1-angle(sub(points[12],points[11]),sub(t[12],t[11]))/(Math.PI/2));
  const head=Math.max(0,1-angle(sub(points[0],mid(points)),sub(t[0],mid(t)))/(Math.PI/2));
  return Math.round((directions/4*.72+elbows*.2+shoulders*.05+head*.03)*1000)/10;
}
export const scoreFor=(points,target,mode)=>mode==='upper'?scoreUpperPose(points,target):scorePose(points,target);
export function renderPose(pose){
  const points=pose.points.filter(Boolean),xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs)-.18,maxX=Math.max(...xs)+.18,minY=Math.min(...ys)-.18,maxY=Math.max(...ys)+.18;
  const project=p=>({x:(p.x-minX)*100,y:(p.y-minY)*100});
  const lines=connectionsFor(pose.bodyMode).map(([a,b])=>{const A=project(pose.points[a]),B=project(pose.points[b]);return `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;}).join('');const h=project(pose.points[0]);
  const neck=pose.bodyMode==='upper'?'':`<line x1="${(project(pose.points[11]).x+project(pose.points[12]).x)/2}" y1="${project(pose.points[11]).y}" x2="${h.x}" y2="${h.y+13}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(maxX-minX)*100} ${(maxY-minY)*100}" aria-hidden="true"><g fill="none" stroke="#263716" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round">${lines}${neck}</g><circle cx="${h.x}" cy="${h.y}" r="13" fill="#263716"/>${requiredFor(pose.bodyMode).filter(i=>i!==0).map(i=>{const p=project(pose.points[i]);return `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="#ecffb0"/>`;}).join('')}</svg>`;
}
