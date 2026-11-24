export function buildQueue(visible,all,selected){
 const source=visible.some(e=>e.id===selected)?visible:all;
 return [...new Set(source.map(e=>e.id))];
}
export function nextIds(queue,current){
 const index=queue.indexOf(current);
 return index<0?[]:queue.slice(index+1);
}
export function previousId(queue,current){
 const index=queue.indexOf(current);
 return index>0?queue[index-1]:null;
}
export function resumePosition(saved,duration){
 if(!Number.isFinite(duration)||duration<=0)return null;
 const position=Number(saved||0);
 return Number.isFinite(position)&&position>0&&position<duration-2?position:0;
}
