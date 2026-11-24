// Trial assignments agreed in conversation; pronunciations are used in generated speech.
export const weeklyPrograms = [
 {weekday:0,title:'気持ちのひとしお',channel:'life',focus:'一週間の出来事と気持ちを、無理に前向きにまとめず振り返る',cast:[{id:'nagi',name:'汐見 凪',reading:'しおみ なぎ',voice:'みちのくあいり',style:'標準'},{id:'yusuke',name:'橘 悠介',reading:'たちばな ゆうすけ',voice:'すきやき馬太郎',style:'ノーマル'}]},
 {weekday:1,title:'何でもマンデー',channel:'life',focus:'ニュースや天気を伝え、内容に応じてくすっと笑えるコメントを交える朝の情報番組',cast:[{id:'ayumu',name:'長谷川 歩',reading:'はせがわ あゆむ',voice:'阿井田 茂',style:'ノーマル'},{id:'tsumugi',name:'真鍋 紬',reading:'まなべ つむぐ',voice:'まい',style:'ノーマル'}]},
 {weekday:2,title:'熱血にぃやん',channel:'life',focus:'仕事や生活の挑戦に、情熱と気合いで立ち向かう。自分の失敗や奮闘を交え、やるぞという力強さで聴き手を鼓舞する',direction:'熱血な兄貴として、一人称は俺。冒頭から勢いよく話し、短く歯切れのよい言葉、呼びかけ、力強い決意を織り交ぜる。失敗を笑い飛ばして立ち上がり、気合いと工夫を持ってもう一度挑む姿を具体的に語る。語尾は「行こうぜ」「やってやろう」「まだまだこれからだ」などを自然に使い、締めは熱を込めた一声で送り出す。穏やかな共感や慰めだけで終わらせず、全編を元気に引っ張る。怒鳴り続けず、相手を責めたり、無理や我慢を強制したりはしない。毎回同じ決まり文句に頼らない。',cast:[{id:'daichi',name:'新田 大地',reading:'にった だいち',voice:'銀芽(ぎんが)',style:'通常'}],credit:'音声：AI声優-銀芽'},
 {weekday:3,title:'ミュージック・アワー',channel:'life',focus:'音楽の思い出、聴き方、音や曲にまつわる発見を話す',cast:[{id:'ritsu',name:'音羽 律',reading:'おとは りつ',voice:'fumifumi',style:'ノーマル'},{id:'tomoshibi',name:'朝比奈 灯',reading:'あさひな ともしび',voice:'コハク',style:'ノーマル'}]},
 {weekday:4,title:'テック・モック',channel:'tech',focus:'技術や道具の仕組みを身近な具体例から考える',cast:[{id:'rihito',name:'久世 理人',reading:'くぜ りひと',voice:'にせ',style:'ノーマル'},{id:'mio',name:'相原 澪',reading:'あいはら みお',voice:'花音',style:'ノーマル'}]},
 {weekday:5,title:'ゴールデンショウタイム',channel:'life',focus:'買い物、節約、給料、サブスク、貯金など、お金と暮らしを考える',cast:[{id:'chihiro',name:'三崎 千尋',reading:'みさき ちひろ',voice:'金苗(かなえ)',style:'ノーマル'},{id:'gaku',name:'小野寺 岳',reading:'おのでら がく',voice:'澤原 玄二郎',style:'ノーマル'}],credit:'音声：AI声優-金苗'},
 {weekday:6,title:'せっかくなんでゆっくりしていきまへんか',channel:'life',focus:'おじさんの体験談や生活の小話から脱線を楽しむ',cast:[{id:'genichi',name:'大槻 源一',reading:'おおつき げんいち',voice:'ろてじん（長老ボイス）',style:'ノーマル'}]}
];

export function programForDate(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('日付は YYYY-MM-DD で指定してください。');
 const parsed=new Date(`${date}T00:00:00Z`);
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new Error('実在する日付を指定してください。');
 return weeklyPrograms[parsed.getUTCDay()];
}
