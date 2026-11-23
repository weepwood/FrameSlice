import {useCallback,useRef,useState} from 'react';
/** Debounces updates within the same logical edit, avoiding one undo step per keystroke. */
export function useHistory<T>(initial:T){
  const [state,setState]=useState<{past:T[];present:T;future:T[]}>({past:[],present:initial,future:[]});
  const last=useRef<{key:string;time:number}|null>(null);
  const set=useCallback((next:T|((prev:T)=>T),group='')=>{
    const now=Date.now();
    const grouped=Boolean(group&&last.current?.key===group&&now-last.current.time<900);
    last.current=group?{key:group,time:now}:null;
    setState(s=>{
      const value=typeof next==='function'?(next as (p:T)=>T)(s.present):next;
      if(Object.is(value,s.present))return s;
      return {past:(grouped?s.past:[...s.past,s.present]).slice(-100),present:value,future:[]};
    });
  },[]);
  const reset=useCallback((value:T)=>{last.current=null;setState({past:[],present:value,future:[]})},[]);
  const undo=useCallback(()=>{last.current=null;setState(s=>s.past.length?{past:s.past.slice(0,-1),present:s.past[s.past.length-1],future:[s.present,...s.future]}:s)},[]);
  const redo=useCallback(()=>{last.current=null;setState(s=>s.future.length?{past:[...s.past,s.present].slice(-100),present:s.future[0],future:s.future.slice(1)}:s)},[]);
  return {value:state.present,set,reset,undo,redo,canUndo:state.past.length>0,canRedo:state.future.length>0};
}
