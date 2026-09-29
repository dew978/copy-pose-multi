// Shared by the host, remote participants and one-camera play.
export function roundFeedback(state,now){
  const result=state?.lastResult;
  if(!result)return null;
  const names=result.winners.map(id=>state.members.find(p=>p.id===id)?.name||'플레이어');
  const solo=state.members.length===1,tied=names.length>1;
  const label=result.tieBreak?`추가 라운드 ${result.number}`:`Round ${result.number}`;
  const title=solo?'라운드 완료!':tied?(state.members.length===2?'무승부!':'공동 1위!'):`${names[0]} 승리!`;
  const detail=`${solo||tied?names.join(' · ')+' · ':''}${result.topScore.toFixed(1)}%`;
  const overlay=!!state.intermission&&['result','waiting','prepare'].includes(state.phase);
  // The existing five-second result interval is followed by three seconds of
  // continuous readiness. Count both, so the display matches the scoring start.
  const countdown=state.phase==='result'?Math.max(0,Math.ceil((state.nextAt+3000-now)/1000)):state.phase==='prepare'?Math.max(0,Math.ceil((state.end-now)/1000)):null;
  return{label,title,detail,overlay,countdown,waiting:state.phase==='waiting',summary:`${label} · ${title} ${detail}`};
}
