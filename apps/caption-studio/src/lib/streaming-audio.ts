/** 30s windows / 2s overlap, bounded memory for browser Whisper. */
export const RATE=16000, WINDOW=RATE*30, HOP=RATE*28;
export type AudioWindow={start:number;end:number;audio:Float32Array;last:boolean};
export class WindowCollector {
  private buffer=new Float32Array(WINDOW);
  private used=0;
  private newFrames=0;
  private startFrame=0;
  push(samples:Float32Array):AudioWindow[]{
    const out:AudioWindow[]=[];let i=0;
    while(i<samples.length){
      const n=Math.min(WINDOW-this.used,samples.length-i);
      this.buffer.set(samples.subarray(i,i+n),this.used);
      this.used+=n;this.newFrames+=n;i+=n;
      if(this.used===WINDOW){
        out.push({start:this.startFrame/RATE,end:(this.startFrame+WINDOW)/RATE,audio:this.buffer.slice(),last:false});
        this.buffer.copyWithin(0,HOP,WINDOW);
        this.used=WINDOW-HOP;this.newFrames=0;this.startFrame+=HOP;
      }
    }
    return out;
  }
  finish():AudioWindow|null {
    if(!this.newFrames||!this.used)return null;
    return {start:this.startFrame/RATE,end:(this.startFrame+this.used)/RATE,audio:this.buffer.slice(0,this.used),last:true};
  }
}
/** Media-timestamp-based streaming mono 16k conversion. No full-file PCM retained. */
export class MonoResampler {
  private frame=0;
  private rate=0;
  private previous=0;
  convert(timestamp:number,rate:number,channels:Float32Array[]):Float32Array{
    if(!channels.length||!channels[0]?.length)return new Float32Array();
    if(!Number.isFinite(rate)||rate<8000||rate>384000)throw Error('无效的音频采样率');
    if(this.rate&&this.rate!==rate)throw Error('音轨采样率发生变化，暂不支持');
    this.rate=rate;
    const length=channels[0].length,start=Math.round(timestamp*rate),end=start+length;
    const target=Math.max(this.frame,Math.ceil(end*RATE/rate));
    if(target-this.frame>RATE*120)throw Error('音轨时间戳间隔过大');
    const result=new Float32Array(target-this.frame);
    const mono=(index:number)=>{
      if(index<0)return this.previous;
      const idx=Math.min(index,length-1);let sum=0;
      for(const c of channels)sum+=c[idx]||0;
      return sum/channels.length;
    };
    for(let i=0;i<result.length;i++){
      const pos=(this.frame+i)*rate/RATE-start;
      if(pos< -1)continue;
      const index=Math.floor(pos),fraction=pos-index;
      result[i]=mono(index)*(1-fraction)+mono(index+1)*fraction;
    }
    this.frame=target;
    let sum=0;for(const c of channels)sum+=c[length-1]||0;
    this.previous=sum/channels.length;
    return result;
  }
}
/** Fixed waveform budget, suitable for multi-hour files. */
export class PeakCollector {
  private peaks=new Float32Array(2200);
  private frames=0;
  constructor(private duration:number){}
  add(pcm:Float32Array):void{
    const total=Number.isFinite(this.duration)&&this.duration>0?this.duration:1100;
    for(let i=0;i<pcm.length;i++){
      const index=Math.min(2199,Math.floor((this.frames+i)/RATE/total*2200));
      if(index>=0)this.peaks[index]=Math.max(this.peaks[index],Math.min(1,Math.abs(pcm[i])));
    }
    this.frames+=pcm.length;
  }
  values():number[]{return Array.from(this.peaks)}
}
export function keepWindowChunk(start:number,end:number,windowStart:number,last:boolean):boolean{
  const center=(start+end)/2;
  return center>=windowStart+(windowStart>0?1:0)-.001&&(last||center<windowStart+29-.001);
}
