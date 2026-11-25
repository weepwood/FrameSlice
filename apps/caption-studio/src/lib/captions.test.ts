import {describe,it,expect} from 'vitest';
import {parseSubtitles,splitText,fmt,parseTime,shiftCues,splitCue,mergeNext,toSRT,toVTT,chunksToCues} from './captions';
const simple=[{id:'a',start:1,end:3,text:'你好，世界。'},{id:'b',start:4,end:6,text:'下一句。'}];
describe('字幕工具',()=>{
  it('支持中英时间戳',()=>{expect(fmt(3602.125)).toBe('01:00:02,125');expect(parseTime('01:00:02,125')).toBe(3602.125);expect(parseTime('12:63.900')).toBeNaN()});
  it('解析 SRT 和 VTT',()=>{expect(parseSubtitles(toSRT(simple))).toHaveLength(2);expect(parseSubtitles(toVTT(simple))).toHaveLength(2)});
  it('中文无空格也分段，保留所有字符',()=>{const text='今天我们来到一个全新的地方，探索浏览器里面的字幕编辑功能，并观察每一段文字的时间。';expect(splitText(text,12).join('')).toBe(text)});
  it('对没有有效时间的块进行过滤',()=>{expect(parseSubtitles('1\n00:00:03,000 --> 00:00:02,000\n坏字幕')).toHaveLength(0)});
  it('十万条字幕整体偏移避免参数展开且拒绝非有限偏移',()=>{const list=Array.from({length:100000},(_,i)=>({id:String(i),start:i+1,end:i+2,text:'x'}));const next=shiftCues(list,-2);expect(next[0].start).toBe(0);expect(next.at(-1)?.end).toBe(100000);expect(shiftCues(list,Infinity)).toBe(list)});
  it('平移不应压缩字幕时长',()=>{const s=shiftCues(simple,-2);expect(s[0].start).toBe(0);expect(s[0].end-s[0].start).toBe(2)});
  it('中文可拆分、合并',()=>{const list=splitCue(simple,'a');expect(list).toHaveLength(3);expect(mergeNext(list,'a')).toHaveLength(2)});
  it('在播放位置拆分且拒绝边界与无效时间',()=>{const list=splitCue(simple,'a',1.5);expect(list[0].end).toBe(1.5);expect(list[1].start).toBe(1.5);expect(list[1].end).toBe(3);expect(list.slice(0,2).map(c=>c.text).join('')).toBe(simple[0].text);for(const t of [0,1,1.01,3,NaN])expect(splitCue(simple,'a',t)).toBe(simple)});
  it('chunk 截断媒体边界',()=>{const chunks=[{text:'测试语言识别功能',timestamp:[1,10] as [number,number]}];const list=chunksToCues(chunks,4,5);expect(list.at(-1)?.end).toBe(5)});
});
