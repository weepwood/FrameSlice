/** Fixed-size grayscale score: variance of Laplacian, 64-bit dHash and 16-bin histogram. */
export function measureFrame(rgba,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<9||height<8||rgba.length!==width*height*4)throw Error('invalid frame sample')
 const gray=new Float32Array(width*height),hist=new Float64Array(16)
 for(let i=0;i<gray.length;i++){const v=.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2];gray[i]=v;hist[Math.min(15,Math.floor(v/16))]++}
 let sum=0,sq=0,n=0
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){let i=y*width+x,v=4*gray[i]-gray[i-1]-gray[i+1]-gray[i-width]-gray[i+width];sum+=v;sq+=v*v;n++}
 let hash=''
 for(let y=0;y<8;y++)for(let x=0;x<8;x++){const row=Math.floor(y*(height-1)/7)*width;hash+=gray[row+Math.floor(x*(width-1)/8)]>gray[row+Math.floor((x+1)*(width-1)/8)]?'1':'0'}
 return {sharpness:Math.max(0,sq/n-(sum/n)**2),hash,histogram:Array.from(hist,v=>v/gray.length)}
}
export function hashDistance(a,b){if(a.length!==64||b.length!==64)throw Error('invalid hash');let n=0;for(let i=0;i<64;i++)if(a[i]!==b[i])n++;return n}
export function sceneDistance(a,b){if(a.length!==16||b.length!==16)throw Error('invalid histogram');return a.reduce((n,v,i)=>n+Math.abs(v-b[i]),0)/2}
