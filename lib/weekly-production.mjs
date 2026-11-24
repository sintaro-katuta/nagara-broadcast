import {programForDate} from './weekly-programs.mjs';
import {validateScript} from './aivis.mjs';

export function japaneseDate(now=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function afterRelease(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 return Number(parts.find(p=>p.type==='hour').value)>=7;
}
export function beforeProduction(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
 return Number(parts.find(p=>p.type==='hour').value)<6;
}
export function makeScript(date, draft){
 const programme=programForDate(date);
 if(!draft||typeof draft.topic!=='string'||draft.topic.trim().length<2||draft.topic.length>100)throw new Error('テーマが不正です。');
 if(typeof draft.description!=='string'||draft.description.trim().length<4||draft.description.length>200)throw new Error('紹介文が不正です。');
 if(!Array.isArray(draft.turns)||draft.turns.length<8||draft.turns.length>60)throw new Error('台詞は8〜60個で指定してください。');
 const tagged=draft.turns.map((turn,index)=>turn.musicAfter===true?index:-1).filter(index=>index>=0);
 if(draft.turns.some(turn=>turn.musicAfter!==undefined&&typeof turn.musicAfter!=='boolean'))throw new Error('musicAfter は真偽値で指定してください。');
 if(draft.turns.some(turn=>turn.musicAfter!==undefined)&&(tagged.length!==1||tagged[0]<1||tagged[0]>=draft.turns.length-1))throw new Error('短い曲の位置を途中に1か所指定してください。');
 const total=draft.turns.reduce((n,t)=>n+(typeof t.text==='string'?t.text.length:0),0);
 if(total<500||total>3500)throw new Error('台詞の合計は500〜3500文字にしてください。');
 const voices=Object.fromEntries(programme.cast.map(c=>[c.id,{name:c.voice,styleName:c.style}]));
 const spokenText=text=>{
  if(typeof text!=='string')return text;
  for(const person of programme.cast){
   const full=person.name.replace(/\s+/g,''),reading=person.reading.replace(/\s+/g,'');
   text=text.replaceAll(person.name,person.reading).replaceAll(full,reading);
   const given=person.name.split(/\s+/).at(-1),givenReading=person.reading.split(/\s+/).at(-1);
   for(const ending of ['さん','くん','ちゃん','です'])text=text.replaceAll(given+ending,givenReading+ending);
  }
  return text;
 };
 const credit=programme.credit?`\n${programme.credit}`:'';
 const description=draft.description.trim().slice(0,200-credit.length).trimEnd()+credit;
 const script={title:draft.topic.trim(),channel:programme.channel,description,voices,turns:draft.turns.map(t=>({speaker:t.speaker,text:spokenText(t.text),pauseMs:200,...(t.musicAfter?{musicAfter:true}:{})}))};
 validateScript(script);
 return script;
}
