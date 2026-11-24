import { describe,it,expect } from 'vitest';
import { validateBurnInput,BURN_MAX_BYTES } from './burn-limits';
describe('browser burn budget',()=>{
  it('accepts a short bounded video',()=>expect(()=>validateBurnInput(BURN_MAX_BYTES,300,1920,1080)).not.toThrow());
  it('rejects unsafe or unknown inputs',()=>{
    for(const args of [[BURN_MAX_BYTES+1,60,1920,1080],[1,301,1920,1080],[1,60,3840,2160],[1,NaN,1920,1080],[1,60,0,1080],[1,60,1280,720,17*1024*1024]] as [number,number,number,number,number?][])
      expect(()=>validateBurnInput(...args)).toThrow();
  });
});
