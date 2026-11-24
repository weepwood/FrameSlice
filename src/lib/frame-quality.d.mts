export interface FrameQuality {sharpness:number;hash:string;histogram:number[]}
export function measureFrame(rgba:Uint8ClampedArray,width:number,height:number):FrameQuality
export function hashDistance(a:string,b:string):number
export function sceneDistance(a:number[],b:number[]):number
