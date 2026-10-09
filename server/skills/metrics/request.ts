import {fail} from "../../errors";
import {containsControl} from "../../../lib/skills/display-values";
export interface MetricRequest {from:Date;to:Date;buckets:number;digest?:string|undefined;series:string[];view?:"adaptive"}
export function metricRequest(url:string):MetricRequest{
  const q=new URL(url).searchParams;
  if([...q.keys()].some(k=>!["from","to","buckets","digest","series","view"].includes(k))||["from","to","buckets","digest","view"].some(k=>q.getAll(k).length>1))fail("invalid_request",400);
  function instant(name:string){const raw=q.get(name);if(!raw||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw))fail("invalid_request",400);
    const date=new Date(raw);if(!Number.isFinite(date.getTime())||date.toISOString()!==raw)fail("invalid_request",400);return date;}
  const from=instant("from"),to=instant("to"),raw=q.get("buckets")??"240",digest=q.get("digest")??undefined,series=q.getAll("series");
  if(!/^[1-9]\d{0,2}$/.test(raw)||Number(raw)>480||to<=from||to.getTime()-from.getTime()>90*86400000||
    digest!==undefined&&!/^[0-9a-f]{64}$/.test(digest)||series.length>8||new Set(series).size!==series.length||series.some(s=>!s||Buffer.byteLength(s)>128||containsControl(s)))fail("invalid_request",400);
  const view=q.get("view");if(view!==null&&view!=="adaptive")fail("invalid_request",400);
  return {from,to,buckets:Number(raw),digest,series,...(view?{view: "adaptive" as const}:{})};
}
