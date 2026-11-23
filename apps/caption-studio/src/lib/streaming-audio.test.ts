import {describe,expect,it} from 'vitest';
import {HOP,MonoResampler,PeakCollector,RATE,WindowCollector,keepWindowChunk} from './streaming-audio';
describe('流式音轨 / PCM framing',()=>{
 it('65 秒只生成分段窗口，并保留末尾',()=>{
  const collector=new WindowCollector(),starts:number[]=[];
  for(let i=0;i<65;i++){
   const done=collector.push(new Float32Array(RATE));
   starts.push(...done.map(c=>c.start));
  }
  expect(starts).toEqual([0,28]);
  const tail=collector.finish();
  expect(tail?.start).toBe(56);
  expect(tail?.audio.length).toBe(RATE*9);
 });
 it('完整 30 秒结束后不会重复尾部',()=>{
  const c=new WindowCollector();
  expect(c.push(new Float32Array(RATE*30))).toHaveLength(1);
  expect(c.finish()).toBeNull();
  expect(HOP).toBe(RATE*28);
 });
 it('音轨晚于画面开始时保留开头静音',()=>{
  const r=new MonoResampler().convert(1,48000,[new Float32Array(48000).fill(.5)]);
  expect(r.length).toBe(RATE*2);
  expect(r[0]).toBe(0);
  expect(r[RATE+1]).toBeCloseTo(.5);
 });
 it('立体声合成为单声道',()=>{
  const r=new MonoResampler().convert(0,RATE,[new Float32Array(16).fill(1),new Float32Array(16).fill(-1)]);
  expect(Array.from(r).every(x=>x===0)).toBe(true);
 });
 it('波形缓存大小不随视频时长增长',()=>{
  const p=new PeakCollector(20);p.add(new Float32Array(RATE*20).fill(.8));
  expect(p.values()).toHaveLength(2200);
  expect(Math.max(...p.values())).toBeCloseTo(.8);
 });
 it('相邻 2 秒重叠不重复识别',()=>{
  expect(keepWindowChunk(27,28,0,false)).toBe(true);
  expect(keepWindowChunk(29,30,0,false)).toBe(false);
  expect(keepWindowChunk(29,30,28,true)).toBe(true);
  expect(keepWindowChunk(27,28,28,true)).toBe(false);
 });
});
