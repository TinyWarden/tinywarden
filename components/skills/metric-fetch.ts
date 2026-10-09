let active=0;
const waiting:(()=>void)[]=[];
export async function chartFetch(url:string,signal:AbortSignal):Promise<Response>{
  if(signal.aborted)throw new DOMException("Aborted","AbortError");
  if(active>=2){
    if(waiting.length>=32)throw new Error("chart_queue_full");
    await new Promise<void>((resolve,reject)=>{
      const ready=()=>{signal.removeEventListener("abort",aborted);resolve();};
      const aborted=()=>{const index=waiting.indexOf(ready);if(index>=0)waiting.splice(index,1);reject(new DOMException("Aborted","AbortError"));};
      waiting.push(ready);signal.addEventListener("abort",aborted,{once:true});
    });
  }else active++;
  try{if(signal.aborted)throw new DOMException("Aborted","AbortError");const response=await fetch(url,{signal,cache:"no-store",credentials:"same-origin"});
    const text=await response.text();if(text.length>512*1024)throw new Error("range_too_large");
    return new Response(text,{status:response.status,headers:{"content-type":"application/json"}});}
  finally{const next=waiting.shift();if(next)next();else active--;}
}
