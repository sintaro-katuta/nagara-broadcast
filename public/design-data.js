import {programDescriptions} from './design-descriptions.js';

const artwork={monday:'monday-program-distinct.png',tuesday:'tuesday-program-individual.png',wednesday:'wednesday-program-record-centered.png',thursday:'thursday-program-distinct.png',friday:'friday-program-distinct.png',saturday:'saturday-program-distinct.png',sunday:'sunday-program-distinct.png'};
const people={
 '長谷川 歩':['monday-presenters.png','left'],'真鍋 紬':['monday-presenters.png','right'],
 '新田 大地':['daichi-voice-match.png','center'],
 '音羽 律':['wednesday-presenters.png','left'],'朝比奈 灯':['wednesday-presenters.png','right'],
 '久世 理人':['thursday-presenters.png','left'],'相原 澪':['thursday-presenters.png','right'],
 '三崎 千尋':['friday-presenters.png','left'],'小野寺 岳':['friday-presenters.png','right'],
 '大槻 源一':['saturday-presenter.png','center'],
 '汐見 凪':['sunday-presenters.png','left'],'橘 悠介':['sunday-presenters.png','right']
};
export const programArt=day=>artwork[day]?`/design-assets/${artwork[day]}`:null;
export const personArt=name=>people[name]?{src:`/design-assets/${people[name][0]}`,position:people[name][1]}:null;
export {programDescriptions};
