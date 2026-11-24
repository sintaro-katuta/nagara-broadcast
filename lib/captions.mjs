export function validateCaptions(cues){
 if(!Array.isArray(cues)||cues.length>2000)throw new Error('字幕データが不正です。');
 let end=0;
 for(const cue of cues){if(!cue||!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.start<end||cue.end<=cue.start||typeof cue.text!=='string'||!cue.text.trim()||cue.text.length>1000)throw new Error('字幕データが不正です。');end=cue.end;}
 return cues;
}
export function makeCaptions(parts,{intro=0,splitIndex=parts.length,transition=0}={}){
 let time=intro;
 return validateCaptions(parts.map((part,index)=>{if(index===splitIndex)time+=transition;const start=time;time+=part.duration;return {start,end:Math.max(start+0.001,time-(part.pauseMs||0)/1000),text:part.text};}));
}
