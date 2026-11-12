/* Keep recognized speech anchors when captions are corrected or reorganized. */
((root,factory)=>{
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.KlartextCaptionTiming=api;
})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const key=text=>String(text).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  function timedWords(phrase){
    // Match Python str.split() and the editor geometry tokenizer exactly.
    const tokens=String(phrase.text||'').split(/[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/u).filter(Boolean);
    if(!tokens.length)return [];
    const start=Number(phrase.start),end=Number(phrase.end),sources=phrase.words||[],anchors=new Map();
    if(tokens.length===sources.length)tokens.forEach((_,index)=>anchors.set(index,index));
    else if(sources.length){
      const old=sources.map(word=>key(word.text??word.word??'')),next=tokens.map(key);
      const table=Array.from({length:old.length+1},()=>Array(next.length+1).fill(0));
      for(let i=old.length-1;i>=0;i--)for(let j=next.length-1;j>=0;j--)
        table[i][j]=old[i]===next[j]?1+table[i+1][j+1]:Math.max(table[i+1][j],table[i][j+1]);
      let i=0,j=0;
      while(i<old.length&&j<next.length){
        if(old[i]===next[j]){anchors.set(j,i);i++;j++;}
        else if(table[i+1][j]>=table[i][j+1])i++;else j++;
      }
    }
    const result=Array(tokens.length).fill(null);let previous=start;
    for(const [index,sourceIndex] of anchors){
      const source=sources[sourceIndex];let left=Number(source.start),right=Number(source.end);
      if(source.start==null||source.end==null||!Number.isFinite(left)||!Number.isFinite(right)||right<left)continue;
      left=Math.max(previous,start,Math.min(end,left));right=Math.max(left,Math.min(end,right));
      result[index]={...source,text:tokens[index],start:left,end:right};previous=left;
    }
    let index=0;
    while(index<tokens.length){
      if(result[index]){index++;continue;}
      const first=index;while(index<tokens.length&&!result[index])index++;
      const right=index<tokens.length?result[index].start:end,left=Math.min(first?result[first-1].end:start,right);
      const step=(right-left)/(index-first);
      for(let offset=0;offset<index-first;offset++)result[first+offset]={text:tokens[first+offset],start:left+offset*step,end:left+(offset+1)*step};
    }
    return result;
  }
  return {timedWords};
});
