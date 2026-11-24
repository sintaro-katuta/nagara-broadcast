import {programs,episodeProgram,episodeTitle} from '/programs.js';
import {buildQueue,nextIds,previousId} from '/player-model.js';
import {programArt,personArt,programDescriptions} from '/design-data.js';
import {makeAccountUI} from '/account-ui.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback;}catch{return fallback;}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
const paths={
 play:'<path d="m9 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>',
 pause:'<path d="M8 5v14M16 5v14" stroke-width="4"/>',
 bookmark:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
 bookmarkFill:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" fill="currentColor"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 upload:'<path d="M12 4v11m-4-7 4-4 4 4M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 shuffle:'<path d="M3 6h2c5 0 6 12 12 12h4m-4-4 4 4-4 4M3 18h2c2 0 3-2 4-4m3-4c2-3 3-4 5-4h4m-4-4 4 4-4 4"/>',
 previous:'<path d="M5 5v14M19 5 8 12l11 7V5Z" fill="currentColor"/>',
 repeat:'<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
 captions:'<path d="M4 6h16M4 11h16M4 16h12M4 21h12"/>',
 device:'<rect x="8" y="3" width="13" height="18" rx="2"/><circle cx="14.5" cy="14" r="3"/><path d="M3 7v10m12-10h.01"/>',
 expand:'<path d="M15 3h6v6m0-6-7 7M9 21H3v-6m0 6 7-7"/>',
 next:'<path d="m6 5 10 7-10 7V5Z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>',
 rewind:'<path d="M5 9a8 8 0 1 1-1 7M5 4v5h5"/>',
 forward:'<path d="M19 9a8 8 0 1 0 1 7M19 4v5h-5"/>',
 volume:'<path d="m11 4-6 5H2v6h3l6 5V4Zm5 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 headphones:'<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 13H3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h3v-7H4Zm16 0h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-3v-7h2Z"/>',
 queue:'<path d="M4 6h16M4 11h12M4 16h8m5-2 5 4-5 4v-8Z"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>'
};
const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.play}</svg>`;
const art=(id)=>{
 const shapes={
 tech:'<circle cx="64" cy="64" r="46"/><ellipse cx="64" cy="64" rx="22" ry="46" transform="rotate(-40 64 64)"/><ellipse cx="64" cy="64" rx="22" ry="46" transform="rotate(40 64 64)"/><circle cx="64" cy="64" r="7" fill="currentColor"/>',
 life:'<path d="M64 108V22M64 67C22 70 12 43 22 17c31 0 45 16 42 50Zm0 17c42 3 52-24 42-50-31 0-45 16-42 50Z"/><path d="M29 28 58 59m41-14L70 77"/>',
 comedy:'<circle cx="64" cy="64" r="45"/><path d="M39 72c5 22 45 22 50 0M40 43v9m47-9v9" stroke-width="5"/><circle cx="107" cy="19" r="8" fill="currentColor" stroke="none"/>',
 news:'<circle cx="64" cy="64" r="45"/><ellipse cx="64" cy="64" rx="22" ry="45"/><path d="M20 64h88M27 40h74M27 88h74"/>'
 };
 return `<svg class="art-symbol" viewBox="0 0 128 128" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[id]||shapes.tech}</svg>`;
};
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
const appearance=['light','dark','system'];
const preference=read('yr:appearance','system');
$('theme-select').value=appearance.includes(preference)?preference:'light';
const systemTheme=matchMedia('(prefers-color-scheme: dark)');
function applyTheme(){const value=$('theme-select').value;const dark=value==='dark'||value==='system'&&systemTheme.matches;document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]').content=dark?'#1d1917':'#faf5ed';document.querySelectorAll('[data-theme-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeChoice===value)));}
$('theme-select').onchange=()=>{write('yr:appearance',$('theme-select').value);applyTheme();};document.querySelectorAll('[data-theme-choice]').forEach(button=>button.onclick=()=>{$('theme-select').value=button.dataset.themeChoice;$('theme-select').dispatchEvent(new Event('change'));});systemTheme.addEventListener('change',applyTheme);applyTheme();
let saved=read('yr:saved',[]),history=read('yr:history',[]),positions=read('yr:positions',{});
if(!Array.isArray(saved))saved=[];if(!Array.isArray(history))history=[];if(!positions||typeof positions!=='object')positions={};
let episodes=[],channels=[],view='home',filter='all',programFilter=null,query='',current=null,queue=[],featured=null,selectedFile=null;
let switching=false,lastPositionWrite=0,toastTimer,automaticTitle='',recentRenderKey='',listRenderKey='',queueRenderKey='';
const audio=$('audio');audio.volume=.8;
const channel=id=>channels.find(c=>c.id===id);
const english={tech:'TECH',life:'LIFE',comedy:'OFFBEAT',news:'WORLD'};
const episodeArt=e=>{const p=episodeProgram(e);return p?`<img src="${programArt(p.image)}" alt="" loading="lazy">`:art(e.channel);};
const relativeDate=value=>{const elapsed=Date.now()-new Date(value).getTime();if(!Number.isFinite(elapsed)||elapsed<0)return '';const minutes=Math.floor(elapsed/60000);if(minutes<1)return 'たった今';if(minutes<60)return `${minutes}分前`;const hours=Math.floor(minutes/60);if(hours<24)return `${hours}時間前`;const days=Math.floor(hours/24);if(days<7)return `${days}日前`;return new Date(value).toLocaleDateString('ja-JP');};
const time=s=>{if(!Number.isFinite(Number(s)))return '0:00';s=Math.max(0,Math.floor(Number(s)));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
const publishedDate=value=>new Date(value).toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Tokyo'});
const bytes=n=>n>=1e9?`${(n/1e9).toFixed(2)} GB`:n>=1e6?`${(n/1e6).toFixed(1)} MB`:`${(n/1000).toFixed(0)} KB`;
const castMarkup=(cast)=>cast.split('・').map(name=>{const p=personArt(name.trim());return `<span class="cast-person">${p?`<img src="${p.src}" class="${p.position}" alt="">`:''}<span>${esc(name.trim())}</span></span>`}).join('');
const publicPreview=document.documentElement.classList.contains('cloud-public');if(publicPreview){saved=[];history=[];positions={};}
let sessionGeneration=0,lastCloudPosition=0;const positionWrites=new Map(),favoriteWrites=new Set();
const account=makeAccountUI({onSession(data){sessionGeneration++;saved=Array.isArray(data?.favorites)?data.favorites:[];const rows=Array.isArray(data?.history)?data.history:[];history=rows.map(row=>row.episode_id);positions=Object.fromEntries(rows.map(row=>[row.episode_id,row.position_seconds]));render();},onNotice:message=>toast(message)});
function syncPosition(id,seconds){
 if(!publicPreview||!account.isSignedIn())return;
 const generation=sessionGeneration,previous=positionWrites.get(id)||Promise.resolve();
 const next=previous.catch(()=>{}).then(()=>{if(generation!==sessionGeneration||!account.isSignedIn())return;return account.setPosition(id,seconds);}).catch(()=>toast('再生履歴を同期できませんでした。'));
 positionWrites.set(id,next);next.finally(()=>{if(positionWrites.get(id)===next)positionWrites.delete(id);});
}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3400);}
$('date-label').textContent=new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'long'}).format(new Date());
async function load(){
 const r=await fetch('/api/episodes');if(!r.ok)throw new Error('エピソードを読み込めませんでした。');
 const data=await r.json();episodes=data.episodes;channels=data.channels;
 const ordered=[...episodes].sort((a,b)=>new Date(b.date)-new Date(a.date));
 featured=ordered.find(e=>!e.demo)||ordered[0]||null;
 $('channel-cards').innerHTML=[1,2,3,4,5,6,0].map((index,day)=>{const p=programs[index];return `<button class="channel-tile program-tile" data-program="${index}" data-day="${p.image}" aria-label="${esc(p.name)}のエピソードを見る"><span class="program-day">${['月','火','水','木','金','土','日'][day]}曜日</span><span class="program-art"><img src="${programArt(p.image)}" alt="" loading="lazy"></span></button>`;}).join('');
 $('filters').innerHTML=`<button class="filter-tab" data-filter="all">すべて</button>`+channels.map(c=>`<button class="filter-tab" data-filter="${c.id}">${esc(c.name)}</button>`).join('');
 $('upload-channel').innerHTML=channels.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
 $('actual-storage').textContent=bytes(data.storageBytes);$('rail-storage').textContent=bytes(data.storageBytes);
 $('storage-detail').textContent=`${episodes.length}本の音声を保存しています`;
 document.querySelector('.feature-card').hidden=!featured;$('main').classList.toggle('has-feature',!!featured);$('hero-play').disabled=!featured;$('feature-save').disabled=!featured;$('start-listening').disabled=!featured;
 if(featured){const c=channel(featured.channel);const program=episodeProgram(featured);$('feature-title').textContent=program?program.name:episodeTitle(featured);$('feature-cast').innerHTML=program?castMarkup(program.cast):'';$('feature-category').textContent=program?program.name+'　・　'+program.cast:c.name;const cover=document.querySelector('.feature-art');cover.classList.toggle('has-program-art',!!program);let coverImage=cover.querySelector('.feature-program-image');if(program){if(!coverImage){coverImage=document.createElement('img');coverImage.className='feature-program-image';coverImage.alt='';cover.prepend(coverImage);}coverImage.src=programArt(program.image);}else if(coverImage)coverImage.remove();$('feature-description').textContent=featured.description||c.description;$('feature-meta').textContent=relativeDate(featured.date);$('feature-demo').hidden=!featured.demo;$('feature-art-channel').textContent=c.name;$('feature-art-duration').textContent='▶ '+time(featured.duration);}
 render();calculate();
}
function list(){
 let result=episodes.filter(e=>(filter==='all'||e.channel===filter)&&(programFilter===null||episodeProgram(e)===programs[programFilter]));
 if(view==='saved')result=result.filter(e=>saved.includes(e.id));
 if(view==='history')result=result.filter(e=>history.includes(e.id));
 if(query)result=result.filter(e=>(e.title+' '+e.description+' '+channel(e.channel)?.name).toLowerCase().includes(query.toLowerCase()));
 const sort=$('sort').value;
 if(view==='history')result.sort((a,b)=>history.indexOf(a.id)-history.indexOf(b.id));
 else result.sort((a,b)=>sort==='short'?a.duration-b.duration:sort==='old'?new Date(a.date)-new Date(b.date):new Date(b.date)-new Date(a.date));
 return result;
}
function render(){
 const focused=document.activeElement;
 const listFocus=focused?.closest('#episode-list')&&focused.closest('[data-save],[data-play]');
 const focusKey=listFocus?.hasAttribute('data-save')?'save':'play';
 const focusId=listFocus?.dataset[focusKey];
 const focusIndex=listFocus?[...$('episode-list').querySelectorAll('.episode-row')].indexOf(listFocus.closest('.episode-row')):-1;
 const isHome=view==='home'&&filter==='all'&&programFilter===null&&!query;
 $('home-content').hidden=!isHome&&view!=='programs';document.querySelector('.feature-card').hidden=!featured||view==='programs';document.querySelector('.quick-section').hidden=view==='programs';document.querySelector('.channels-section').hidden=!isHome&&view!=='programs';$('recent-section').hidden=view==='programs'||!history.some(id=>episodes.some(e=>e.id===id));$('browse-layout').hidden=isHome||view==='storage'||view==='programs';$('storage-section').hidden=view!=='storage';$('program-detail').hidden=programFilter===null;if(programFilter!==null){const p=programs[programFilter];$('program-detail-art').src=programArt(p.image);$('program-detail-art').alt=p.name+'の番組画像';$('program-detail-name').textContent=p.name;$('program-detail-description').textContent=programDescriptions[programFilter];$('program-detail-cast').innerHTML=castMarkup(p.cast);}
 $('main').classList.toggle('is-program-detail',programFilter!==null);$('main').classList.toggle('is-home',isHome);$('main').classList.toggle('is-programs',view==='programs');$('main').classList.toggle('is-search',view==='search');
 $('page-title').textContent=view==='storage'?'保存容量':view==='programs'?'番組':view==='search'?'検索':view==='saved'?'あとで聴く':view==='history'?'再生履歴':programFilter!==null?programs[programFilter].name:filter!=='all'?channel(filter)?.name:query?'エピソードを検索':isHome?'いつもの毎日に、\nながら放送。':'エピソードを見つける';
 $('page-description').textContent=view==='storage'?'保存している音声と、今後の容量の目安を確認できます。':view==='programs'?'曜日ごとの番組を選べます。':view==='search'?'エピソードを探す':view==='saved'?'しおりを押して追加したエピソードです。':view==='history'?'前回の続きから聴けます。':programFilter!==null?'出演：'+programs[programFilter].cast:filter!=='all'?channel(filter)?.description:isHome?'まだ知らない話に、耳をすませよう。\n技術から日常まで、気ままに聴けるラジオ。':'気になるエピソードを選んで、聴いてみよう。';
 $('list-title').textContent=view==='search'?'エピソード':view==='saved'?'あとで聴くエピソード':view==='history'?'最近聴いたエピソード':query?`「${query}」の検索結果`:programFilter!==null?'エピソード':filter!=='all'?channel(filter)?.name+'のエピソード':'エピソードを見つける';
 document.querySelectorAll('[data-view]').forEach(el=>{const active=el.dataset.view===view;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
 document.querySelectorAll('[data-filter]').forEach(el=>{const active=el.dataset.filter===filter;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
 $('saved-count').textContent=saved.filter(id=>episodes.some(e=>e.id===id)).length;
 const recent=history.map(id=>episodes.find(e=>e.id===id)).filter(Boolean).slice(0,5);$('recent-section').hidden=!isHome||!recent.length;const recentKey=recent.map(e=>e.id).join('|');if(recentRenderKey!==recentKey){recentRenderKey=recentKey;$('recent-list').innerHTML=recent.map(e=>`<button class="recent-item ${esc(e.channel)}" data-play="${esc(e.id)}"><span class="recent-cover">${episodeArt(e)}</span><span class="recent-copy"><strong>${esc(episodeTitle(e))}</strong><small>${esc(episodeProgram(e)?.name||channel(e.channel)?.name)}</small></span></button>`).join('');}
 const visible=list();$('episode-count').textContent=visible.length+'本';
 $('sort').closest('label').hidden=view==='history';
 $('sort').disabled=view==='history';
 $('sort').title=view==='history'?'最近聴いた順に表示しています':'並び順';
 const listKey=JSON.stringify([visible.map(e=>e.id),saved,current?.id,view,filter,query,programFilter]);if(listRenderKey!==listKey){listRenderKey=listKey;$('episode-list').innerHTML=visible.length?visible.map(e=>{
  const c=channel(e.channel),active=current?.id===e.id;
  if(programFilter!==null)return `<article class="episode-row program-episode-row ${c.id} ${active?'current':''}"><div class="program-episode-copy"><button class="episode-title" data-play="${esc(e.id)}">${esc(episodeTitle(e))}</button><div class="program-episode-date"><time datetime="${esc(e.date)}">${esc(publishedDate(e.date))}</time>${e.demo?' <span class="sample-label">試聴サンプル</span>':''}${e.source?` <a class="source-link" href="${esc(e.source)}" target="_blank" rel="noreferrer">出典 ↗</a>`:''}</div>${e.description?.includes('音声：AI声優-銀芽')?'<p class="voice-credit">音声：AI声優-銀芽</p>':''}</div><span class="program-episode-duration">${time(e.duration)}</span><button class="icon-button program-episode-save ${saved.includes(e.id)?'saved':''}" data-save="${esc(e.id)}" aria-label="${esc(e.title)}を${saved.includes(e.id)?'あとで聴くから外す':'あとで聴くに追加'}" aria-pressed="${saved.includes(e.id)}">${icon(saved.includes(e.id)?'bookmarkFill':'bookmark')}</button><button class="episode-play" data-play="${esc(e.id)}" aria-label="${esc(e.title)}を${active&&!audio.paused?'一時停止':'再生'}">${icon(active&&!audio.paused?'pause':'play')}</button></article>`;
  return `<article class="episode-row ${c.id} ${active?'current':''}"><div class="episode-cover">${episodeArt(e)}</div><div class="episode-body"><div class="episode-meta"><span class="channel-name">${esc(c.name)}</span><span>${new Date(e.date).toLocaleDateString('ja-JP',{month:'2-digit',day:'2-digit'})}</span><span class="episode-duration-inline">${time(e.duration)}</span>${e.demo?'<span class="sample-label">試聴サンプル</span>':''}${e.source?`<a class="source-link" href="${esc(e.source)}" target="_blank" rel="noreferrer">出典 ↗</a>`:''}</div><button class="episode-title" data-play="${e.id}">${esc(episodeTitle(e))}</button>${episodeProgram(e)?`<p class="episode-cast">出演：${esc(episodeProgram(e).cast)}</p>`:''}<p class="episode-description">${esc(e.description?.replace(/\n音声：AI声優-銀芽$/, '')||'')}</p>${e.description?.includes('音声：AI声優-銀芽')?'<p class="voice-credit">音声：AI声優-銀芽</p>':''}</div><div class="episode-actions"><span class="episode-duration">${time(e.duration)}</span><a class="icon-button download-action" href="${e.audio}" download="${esc(e.title)}.mp3" aria-label="${esc(e.title)}をダウンロード">${icon('download')}</a><button class="icon-button ${saved.includes(e.id)?'saved':''}" data-save="${e.id}" aria-label="${esc(e.title)}を${saved.includes(e.id)?'あとで聴くから外す':'あとで聴くに追加'}" aria-pressed="${saved.includes(e.id)}">${icon(saved.includes(e.id)?'bookmarkFill':'bookmark')}</button><button class="episode-play" data-play="${e.id}" aria-label="${esc(e.title)}を${active&&!audio.paused?'一時停止':'再生'}">${icon(active&&!audio.paused?'pause':'play')}</button></div></article>`;
 }).join(''):emptyState();}
 if(current){const row=$('episode-list').querySelector('.episode-row.current');const button=row?.querySelector('.episode-play');if(button){button.innerHTML=icon(audio.paused?'play':'pause');button.setAttribute('aria-label',`${current.title}を${audio.paused?'再生':'一時停止'}`);}}
 if(listFocus){const replacement=$('episode-list').querySelector(`[data-${focusKey}="${CSS.escape(focusId)}"]`)||$('episode-list').querySelectorAll('.episode-row')[Math.max(0,Math.min(focusIndex,visible.length-1))]?.querySelector(`[data-${focusKey}]`)||$('episode-list').querySelector('button');replacement?.focus({preventScroll:true});}
 if(featured){const active=current?.id===featured.id&&!audio.paused;$('hero-play').querySelector('[data-icon]').innerHTML=icon(active?'pause':'play');$('start-listening').querySelector('[data-icon]').innerHTML=icon(active?'pause':'play');$('start-listening-label').textContent=active?'一時停止':'最新のエピソードを聴く';$('feature-action-label').textContent=active?'一時停止':`聴いてみる${featured.duration?`（${Math.floor(featured.duration/60)}分${String(Math.floor(featured.duration%60)).padStart(2,'0')}秒）`:''}`;$('feature-save').innerHTML=icon(saved.includes(featured.id)?'bookmarkFill':'bookmark')+`<span>${saved.includes(featured.id)?'保存済み':'あとで聴く'}</span>`;$('feature-save').setAttribute('aria-pressed',String(saved.includes(featured.id)));$('feature-save').setAttribute('aria-label',`最新エピソードを${saved.includes(featured.id)?'あとで聴くから外す':'あとで聴くに追加'}`);}
 renderQueue();updatePlayer();
}
function emptyState(){
 const filtered=query||filter!=='all'||programFilter!==null;
 const title=filtered?'条件に合うエピソードがありません':view==='saved'?'あとで聴くエピソードはありません':view==='history'?'まだ再生履歴がありません':'エピソードはまだありません';
 const description=programFilter!==null?'この番組のエピソードをお待ちください。':filtered?'検索の言葉やチャンネルを変えてみてください。':view==='saved'?'エピソードのしおりを押すと、ここに追加できます。':view==='history'?'エピソードを再生すると、ここに表示されます。':'MP3ファイルを追加すると、ここから聴けます。';
 const action=filtered?'clear-filters':view==='saved'||view==='history'?'browse':'add-audio';
 const label=filtered?'検索・絞り込みを解除':action==='browse'?'エピソードを探す':'音声を追加';
 return `<div class="empty-state"><b>${title}</b><p>${description}</p><button class="text-action" data-action="${action}">${label} <span aria-hidden="true">→</span></button></div>`;
}
function renderQueue(){
 const ids=current?nextIds(queue,current.id):list().map(e=>e.id);
 const upcoming=ids.map(id=>episodes.find(e=>e.id===id)).filter(Boolean);
 $('queue-description').textContent=current?`このあとの再生予定：${upcoming.length}本`:'選んだエピソードから順番に再生します。';
 const queueKey=upcoming.map(e=>e.id).join('|')+'|'+String(!!current);if(queueRenderKey!==queueKey){queueRenderKey=queueKey;$('queue-list').innerHTML=upcoming.slice(0,3).map(e=>`<button class="queue-item ${e.channel}" data-play="${e.id}" data-from-queue="true" aria-label="再生：${esc(e.title)}"><span class="queue-cover">${episodeArt(e)}</span><span><b>${esc(episodeTitle(e))}</b><small>${esc(channel(e.channel)?.name)} · ${time(e.duration)}</small></span><span class="queue-play">${icon('play')}</span></button>`).join('')||`<p class="queue-empty">${current?'次のエピソードはありません。':'エピソードを選ぶと、ここに表示されます。'}</p>`;
 $('expanded-queue-list').innerHTML=upcoming.map(e=>`<button class="expanded-queue-item ${esc(e.channel)}" data-play="${esc(e.id)}" data-from-queue="true"><span class="queue-cover">${episodeArt(e)}</span><span><b>${esc(episodeTitle(e))}</b><small>${esc(episodeProgram(e)?.name||channel(e.channel)?.name||'')}</small></span></button>`).join('')||'<p class="queue-empty">次のエピソードはありません。</p>';}
}
async function save(id){if(publicPreview){if(!account.isSignedIn()){account.open();return;}if(favoriteWrites.has(id))return;favoriteWrites.add(id);const removing=saved.includes(id),generation=sessionGeneration;try{await account.setFavorite(id,!removing);if(generation!==sessionGeneration)return;saved=removing?saved.filter(x=>x!==id):[...saved,id];render();toast(removing?'あとで聴くから外しました。':'あとで聴くに追加しました。');}catch(error){toast(error.message);}finally{favoriteWrites.delete(id);}return;}const removing=saved.includes(id);saved=removing?saved.filter(x=>x!==id):[...saved,id];write('yr:saved',saved);render();toast(removing?'あとで聴くから外しました。':'あとで聴くに追加しました。');}
function updatePlayer(){
 document.querySelector('.player-bar').classList.toggle('has-current',!!current);
 const ready=!!current&&Number.isFinite(audio.duration)&&audio.duration>0;
 for(const id of ['back15','forward15','seek'])$(id).disabled=!ready;
 $('next').disabled=!current||nextIds(queue,current.id).length===0;$('previous').disabled=!current||!previousId(queue,current.id);$('expand-control').hidden=!current;
 if(!current){$('player-art').innerHTML=art('tech');$('open-player').disabled=true;return;}
 $('open-player').disabled=false;if($('expanded-art').dataset.episodeId!==current.id){$('expanded-art').className='expanded-art '+current.channel;$('expanded-art').innerHTML=episodeArt(current);$('expanded-art').dataset.episodeId=current.id;}$('expanded-title').textContent=episodeTitle(current);$('expanded-channel').textContent=episodeProgram(current)?.name||channel(current.channel)?.name||'';$('expanded-cast').textContent=episodeProgram(current)?.cast||'';$('expanded-play').innerHTML=icon(audio.paused?'play':'pause');$('expanded-play').setAttribute('aria-label',audio.paused?'再生':'一時停止');$('expanded-save').innerHTML=icon(saved.includes(current.id)?'bookmarkFill':'bookmark');$('expanded-save').setAttribute('aria-pressed',String(saved.includes(current.id)));$('expanded-save').setAttribute('aria-label',saved.includes(current.id)?'あとで聴くから外す':'あとで聴くに追加');$('expanded-seek').disabled=!ready;$('expanded-back').disabled=!ready;$('expanded-forward').disabled=!ready;$('expanded-previous').disabled=!previousId(queue,current.id);$('expanded-next').disabled=!current||nextIds(queue,current.id).length===0;$('expanded-total').textContent=time(audio.duration||current.duration);
 const c=channel(current.channel);if($('player-art').dataset.episodeId!==current.id){$('player-art').className='player-cover '+c.id;$('player-art').innerHTML=episodeArt(current);$('player-art').dataset.episodeId=current.id;}
 const program=episodeProgram(current);$('player-title').textContent=program?.name||episodeTitle(current);$('player-channel').textContent=program?.cast||c.name+(current.demo?' · 試聴サンプル':'');$('player-mobile-title').textContent=episodeTitle(current);$('player-mobile-channel').textContent=program?.name||c.name;
 $('player-save').disabled=false;$('toggle-play').disabled=false;
 $('player-save').innerHTML=icon(saved.includes(current.id)?'bookmarkFill':'bookmark');$('player-save').classList.toggle('saved',saved.includes(current.id));$('player-save').setAttribute('aria-pressed',String(saved.includes(current.id)));
 $('player-save').setAttribute('aria-label',`再生中のエピソードを${saved.includes(current.id)?'あとで聴くから外す':'あとで聴くに追加'}`);
 $('toggle-play').innerHTML=icon(audio.paused?'play':'pause');$('toggle-play').setAttribute('aria-label',audio.paused?'再生':'一時停止');
}
let captionsEnabled=false,captionCues=[],captionEpisode=null,captionLoading=false;
function renderCaptions(){
 document.querySelectorAll('[data-action="captions"]').forEach(button=>{button.setAttribute('aria-pressed',String(captionsEnabled));button.setAttribute('aria-label',captionsEnabled?'字幕を非表示':'字幕を表示');});
 $('caption-panel').hidden=!captionsEnabled;
 if(captionsEnabled){const cue=captionCues.find(c=>c.start<=audio.currentTime&&audio.currentTime<c.end);$('caption-text').textContent=captionLoading?'字幕を読み込んでいます…':cue?.text||(captionCues.length?'♪':'このエピソードの字幕はありません。');}
}
async function loadCaptions(){
 const id=current?.id;captionEpisode=id;captionCues=[];captionLoading=!!id;renderCaptions();if(!id)return;
 try{const response=await fetch('/api/episodes/'+encodeURIComponent(id)+'/captions');if(response.ok){const cues=await response.json();if(captionEpisode===id&&Array.isArray(cues))captionCues=cues;}}catch{}finally{if(captionEpisode===id){captionLoading=false;renderCaptions();}}
}
function persistPosition(){if(!switching&&current&&Number.isFinite(audio.currentTime)){positions[current.id]=audio.ended?0:audio.currentTime;if(publicPreview){syncPosition(current.id,positions[current.id]);}else write('yr:positions',positions);}}
async function play(id,build=true){
 const ep=episodes.find(e=>e.id===id);if(!ep)return;
 if(current?.id===id){if(!audio.paused){audio.pause();return;}try{await audio.play();}catch{toast('再生できませんでした。もう一度お試しください。');}return;}
 if(current)persistPosition();switching=true;current=ep;if(captionsEnabled)loadCaptions();
 if(build||!queue.includes(id))queue=buildQueue(list(),episodes,id);
 audio.src=ep.audio;audio.defaultPlaybackRate=Number($('speed').value);audio.load();audio.playbackRate=Number($('speed').value);$('current-time').textContent='0:00';$('total-time').textContent=time(ep.duration);$('seek').value=0;render();
 try{await audio.play();}catch(e){if(e.name!=='AbortError')toast('音声を再生できませんでした。MP3を確認してください。');}
}
function next(){if(!current)return toast('まずエピソードを選んでください。');const id=nextIds(queue,current.id)[0];if(id)play(id,false);else toast('最後のエピソードです。');}
audio.addEventListener('loadedmetadata',()=>{audio.playbackRate=Number($('speed').value);if(current){const p=Number(positions[current.id]||0);if(Number.isFinite(p)&&p>0&&p<audio.duration-2)audio.currentTime=p;}switching=false;$('total-time').textContent=time(audio.duration);updatePlayer();});
audio.addEventListener('play',()=>{if(current&&(!publicPreview||account.isSignedIn())){history=[current.id,...history.filter(id=>id!==current.id)].slice(0,200);if(publicPreview)syncPosition(current.id,audio.currentTime);else write('yr:history',history);}render();});
audio.addEventListener('pause',()=>{persistPosition();render();});
audio.addEventListener('error',()=>{toast('音声を読み込めませんでした。ファイルを確認してください。');updatePlayer();});
audio.addEventListener('timeupdate',()=>{if(captionsEnabled)renderCaptions();$('current-time').textContent=time(audio.currentTime);$('total-time').textContent=time(audio.duration);$('seek').value=audio.duration?audio.currentTime/audio.duration*100:0;$('expanded-seek').value=$('seek').value;$('expanded-current').textContent=time(audio.currentTime);$('expanded-total').textContent=time(audio.duration);if(publicPreview){if(Date.now()-lastCloudPosition>30000){persistPosition();lastCloudPosition=Date.now();}}else if(Date.now()-lastPositionWrite>4000){persistPosition();lastPositionWrite=Date.now();}});
audio.addEventListener('ended',()=>{if(current){positions[current.id]=0;if(publicPreview)syncPosition(current.id,0);else write('yr:positions',positions);}render();if($('auto-next').checked)next();});
window.addEventListener('pagehide',persistPosition);
$('hero-play').onclick=()=>{if(featured)play(featured.id);};$('feature-save').onclick=()=>{if(featured)save(featured.id);};
$('start-listening').onclick=()=>{if(featured)play(featured.id);};
function closeMenu(){document.querySelector('.site-header').classList.remove('menu-open');$('menu-toggle').setAttribute('aria-expanded','false');$('menu-toggle').setAttribute('aria-label','メニューを開く');}
$('menu-toggle').onclick=()=>{const open=document.querySelector('.site-header').classList.toggle('menu-open');$('menu-toggle').setAttribute('aria-expanded',String(open));$('menu-toggle').setAttribute('aria-label',open?'メニューを閉じる':'メニューを開く');};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('menu-toggle').getAttribute('aria-expanded')==='true'){closeMenu();$('menu-toggle').focus();}});
$('queue-toggle').onclick=()=>{const open=$('expanded-queue').hidden;$('expanded-queue').hidden=!open;$('queue-toggle').setAttribute('aria-expanded',String(open));};$('queue-close').onclick=()=>{$('expanded-queue').hidden=true;$('queue-toggle').setAttribute('aria-expanded','false');$('queue-toggle').focus();};
let playerInputMethod='pointer';document.addEventListener('pointerdown',()=>{playerInputMethod='pointer';},true);document.addEventListener('keydown',e=>{if(e.key==='Tab'||e.key==='Enter'||e.key===' '||e.key==='Escape')playerInputMethod='keyboard';},true);
$('open-player').onclick=()=>{if(current){$('expanded-player').showModal();$('expanded-player').focus({preventScroll:true});}};$('close-player').onclick=()=>$('expanded-player').close();$('expanded-player').addEventListener('close',()=>{if(playerInputMethod==='keyboard')$('open-player').focus({preventScroll:true});else if(document.activeElement===$('open-player'))$('open-player').blur();});$('expanded-play').onclick=()=>{if(current)play(current.id);};$('expanded-save').onclick=()=>{if(current)save(current.id);};$('expanded-back').onclick=()=>$('back15').click();$('expanded-forward').onclick=()=>$('forward15').click();$('expanded-previous').onclick=()=>$('previous').click();$('expanded-next').onclick=next;$('expanded-volume').onclick=()=>{const open=$('expanded-settings-menu').hidden;$('expanded-settings-menu').hidden=!open;$('expanded-volume').setAttribute('aria-expanded',String(open));};$('expanded-volume-range').oninput=e=>{$('volume').value=e.target.value;$('volume').dispatchEvent(new Event('input'));};audio.addEventListener('volumechange',()=>{$('expanded-volume-range').value=audio.volume;$('volume').value=audio.volume;});document.addEventListener('click',e=>{if(!e.target.closest('.expanded-settings')){$('expanded-settings-menu').hidden=true;$('expanded-volume').setAttribute('aria-expanded','false');}});$('expanded-seek').oninput=e=>{if(Number.isFinite(audio.duration))audio.currentTime=audio.duration*Number(e.target.value)/100;};$('expanded-speed').onchange=e=>{$('speed').value=e.target.value;$('speed').dispatchEvent(new Event('change'));};
$('player-more').onclick=()=>{const open=$('player-extra').hidden;$('player-extra').hidden=!open;$('player-more').setAttribute('aria-expanded',String(open));$('player-more').setAttribute('aria-label',open?'再生設定を閉じる':'再生設定を開く');};$('mobile-back15').onclick=()=>$('back15').click();$('mobile-forward15').onclick=()=>$('forward15').click();$('mobile-speed').onchange=e=>{$('speed').value=e.target.value;$('speed').dispatchEvent(new Event('change'));};
$('expand-control').onclick=()=>$('open-player').click();$('previous').onclick=()=>{if(!current)return;const id=previousId(queue,current.id);if(id)play(id,false);};$('toggle-play').onclick=()=>{if(current)play(current.id);};$('player-save').onclick=()=>{if(current)save(current.id);};
$('back15').onclick=()=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.max(0,audio.currentTime-15);};$('forward15').onclick=()=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+15);};$('next').onclick=next;
$('seek').oninput=e=>{if(Number.isFinite(audio.duration))audio.currentTime=audio.duration*Number(e.target.value)/100;};$('speed').onchange=e=>{audio.defaultPlaybackRate=Number(e.target.value);audio.playbackRate=Number(e.target.value);$('mobile-speed').value=e.target.value;$('expanded-speed').value=e.target.value;};$('volume').oninput=e=>{audio.volume=Number(e.target.value);audio.muted=false;};
$('search').oninput=e=>{query=e.target.value.trim();render();};$('sort').onchange=render;
document.addEventListener('click',e=>{const b=e.target.closest('[data-view],[data-channel],[data-program],[data-filter],[data-play],[data-save],[data-action]');if(!b)return;
 if(b.dataset.action){if(b.dataset.action==='captions'){captionsEnabled=!captionsEnabled;if(captionsEnabled){if(!$('expanded-player').open&&current)$('expanded-player').showModal();loadCaptions();}else renderCaptions();return;}if(['shuffle-prep','loop-prep','device-prep'].includes(b.dataset.action)){toast('この機能は準備中です。');return;}if(b.dataset.action==='account'){if(publicPreview)account.open();else toast('ログイン機能は準備中です。');return;}if(b.dataset.action==='letter'){toast('お便り機能は準備中です。');return;}programFilter=null;if(b.dataset.action==='programs'){view='home';filter='all';query='';$('search').value='';render();document.querySelector('.channels-section').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});return;}if(b.dataset.action==='search'){view='home';filter='all';query='';$('search').value='';render();$('episodes-section').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});$('search').focus({preventScroll:true});return;}if(b.dataset.action==='add-audio'){modal.show();return;}if(b.dataset.action==='retry'){load().catch(showLoadError);return;}if(b.dataset.action==='browse')view='home';filter='all';query='';$('search').value='';render();$('search').focus();}
 else if(b.dataset.view){if(publicPreview&&['saved','history'].includes(b.dataset.view)&&!account.isSignedIn()){account.open();return;}programFilter=null;view=b.dataset.view;filter='all';query='';$('search').value='';closeMenu();render();window.scrollTo({top:0,behavior:'instant'});}
 else if(b.dataset.program!==undefined){window.history.pushState({program:Number(b.dataset.program)},'',`#program-${b.dataset.program}`);programFilter=Number(b.dataset.program);filter='all';view='home';query='';$('search').value='';render();window.scrollTo({top:0,behavior:'instant'});}
 else if(b.dataset.channel){programFilter=null;filter=b.dataset.channel;view='home';query='';$('search').value='';render();$('episodes-section').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
 else if(b.dataset.filter){programFilter=null;filter=b.dataset.filter;render();}
 else if(b.dataset.play)play(b.dataset.play,b.dataset.fromQueue!=='true');
 else if(b.dataset.save)save(b.dataset.save);
});
const modalElement=$('upload-dialog');
const modal=new window.Modal(modalElement,{placement:'center',backdrop:'dynamic',closable:true,onShow:()=>{document.querySelector('.skip-link').inert=true;document.querySelector('main').inert=true;document.querySelector('.site-header').inert=true;document.querySelector('.player-bar').inert=true;document.querySelector('.mobile-nav').inert=true;$('close-upload').focus();},onHide:()=>{document.querySelector('.skip-link').inert=false;document.querySelector('main').inert=false;document.querySelector('.site-header').inert=false;document.querySelector('.player-bar').inert=false;document.querySelector('.mobile-nav').inert=false;$('open-upload').focus();}},{id:'radio-upload',override:true});
$('open-upload').onclick=()=>modal.show();$('close-upload').onclick=()=>modal.hide();
modalElement.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const focusable=[...modalElement.querySelectorAll('button,input,select,textarea,a[href]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(document.activeElement.tagName)&&modal.isHidden()&&current){e.preventDefault();play(current.id);}});
function selectFile(f){if(!f||$('upload-submit').disabled)return;selectedFile=f;$('file-label').textContent=f.name+' · '+bytes(f.size);if(!$('upload-title').value||$('upload-title').value===automaticTitle){automaticTitle=f.name.replace(/\.mp3$/i,'');$('upload-title').value=automaticTitle;}$('upload-error').textContent='';}
$('upload-file').onchange=e=>selectFile(e.target.files[0]);
for(const name of ['dragenter','dragover'])$('drop-zone').addEventListener(name,e=>{e.preventDefault();$('drop-zone').classList.add('dragover');});
for(const name of ['dragleave','drop'])$('drop-zone').addEventListener(name,e=>{e.preventDefault();$('drop-zone').classList.remove('dragover');if(name==='drop'&&!$('upload-submit').disabled){const f=e.dataTransfer.files[0];if(f){const dt=new DataTransfer();dt.items.add(f);$('upload-file').files=dt.files;selectFile(f);}}});
async function durationOf(file){return new Promise((resolve,reject)=>{const tmp=new Audio(),url=URL.createObjectURL(file);let duration=0,finished=false;const done=error=>{if(finished)return;finished=true;clearTimeout(timer);tmp.onloadedmetadata=null;tmp.onerror=null;tmp.removeAttribute('src');tmp.load();URL.revokeObjectURL(url);error?reject(error):resolve(duration);};const timer=setTimeout(()=>done(new Error('音声の長さを取得できませんでした。別のMP3をお試しください。')),15000);tmp.onloadedmetadata=()=>{duration=tmp.duration;done(Number.isFinite(duration)?null:new Error('音声の長さを確認できませんでした。'));};tmp.onerror=()=>done(new Error('MP3を読み込めませんでした。'));tmp.src=url;});}
$('upload-form').onsubmit=async e=>{e.preventDefault();if($('upload-submit').disabled)return;$('upload-error').textContent='';const file=selectedFile||$('upload-file').files[0];
 if(!file||!/\.mp3$/i.test(file.name)){$('upload-error').textContent='MP3ファイルを選んでください。';return;}if(file.size>100*1024*1024){$('upload-error').textContent='100 MB以下のMP3を選んでください。';return;}
 const details={title:$('upload-title').value,channel:$('upload-channel').value,description:$('upload-description').value,source:$('upload-source').value};
 const fields=[...$('upload-form').querySelectorAll('input,select,textarea')];fields.forEach(field=>field.disabled=true);
 $('upload-submit').disabled=true;$('upload-submit').textContent='音声を確認・保存しています…';
 try{const duration=await durationOf(file);const params=new URLSearchParams({...details,duration:String(duration)});const r=await fetch('/api/episodes?'+params,{method:'POST',headers:{'Content-Type':'audio/mpeg'},body:file});const result=await r.json();if(!r.ok)throw new Error(result.error);view='home';filter='all';query='';$('search').value='';await load();modal.hide();$('upload-form').reset();selectedFile=null;automaticTitle='';$('file-label').textContent='MP3をドロップ、または選択';toast('音声を追加しました。');}catch(error){$('upload-error').textContent=error instanceof TypeError?'保存できませんでした。接続を確認して、もう一度お試しください。':error.message||'保存できませんでした。もう一度お試しください。';}finally{fields.forEach(field=>field.disabled=false);$('upload-submit').disabled=false;$('upload-submit').textContent='音声を追加する';}
};
function calculate(){const m=Number($('calc-minutes').value),k=Number($('calc-kbps').value),n=Number($('calc-episodes').value),d=Number($('calc-days').value),per=m*60*k*1000/8,total=per*n*d;$('calc-result').innerHTML=`1本 ${bytes(per)} × ${n}本 / 日 × ${d}日<br><strong>${bytes(total)}</strong><br><span>追加する音声に必要な容量の目安です。</span>`;}
document.querySelectorAll('.calculator select').forEach(s=>s.onchange=calculate);
window.addEventListener('popstate',()=>{const m=/^#program-([0-6])$/.exec(location.hash);programFilter=m?Number(m[1]):null;view='home';filter='all';query='';$('search').value='';render();if(m)$('program-detail').scrollIntoView();else document.querySelector('.channels-section').scrollIntoView();});
function showLoadError(){const message='エピソードを読み込めませんでした。';$('episode-list').innerHTML=`<div class="empty-state"><b>${message}</b><button class="text-action" data-action="retry">もう一度読み込む →</button></div>`;toast(message);}
updatePlayer();
load().catch(showLoadError);
if(publicPreview)account.init();
