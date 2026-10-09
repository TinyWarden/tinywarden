import {fail} from "../../errors";
import {uuid} from "../../validation";
export interface ReadingCursor {format:1;host:string;installation:string;from:string;to:string;as_of:string;at:string;id:string}
export interface ReadingRequest {from:Date;to:Date;cursor?:ReadingCursor;page?:number;asOf?:Date;jump?:Date}
export function readingDate(value:unknown):Date {
  if(typeof value!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value))fail("invalid_request",400);
  const date=new Date(value);if(!Number.isFinite(+date)||date.toISOString()!==value)fail("invalid_request",400);return date;
}
export function readingRequest(url:string):ReadingRequest {
  const query=new URL(url).searchParams;
  if(query.toString().length>1400||[...query.keys()].some(k=>!["from","to","cursor","page","as_of","jump_at"].includes(k)||query.getAll(k).length!==1))fail("invalid_request",400);
  const from=readingDate(query.get("from")),to=readingDate(query.get("to"));
  if(from>=to||+to-+from>90*86400000)fail("invalid_request",400);
  const page=query.get("page"),anchor=query.get("as_of"),jump=query.get("jump_at"),raw=query.get("cursor");
  if(raw!==null&&(page!==null||anchor!==null||jump!==null))fail("invalid_request",400);
  if(page!==null&&!/^(?:[1-9]\d{0,3}|1[0-4]\d{3}|15000)$/.test(page))fail("invalid_request",400);
  const asOf=anchor===null?undefined:readingDate(anchor),target=jump===null?undefined:readingDate(jump);
  if(target&&(target<from||target>=to))fail("invalid_request",400);
  if(raw===null)return {from,to,...(page!==null?{page:Number(page)}:{}),...(asOf?{asOf}:{}),...(target?{jump:target}:{})};
  if(!/^[A-Za-z0-9_-]{1,1024}$/.test(raw))fail("invalid_request",400);
  let cursor:ReadingCursor;
  try{
    const bytes=Buffer.from(raw,"base64url");if(bytes.toString("base64url")!==raw)throw new Error();
    cursor=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
    if(!cursor||typeof cursor!=="object"||Object.keys(cursor).sort().join(",")!=="as_of,at,format,from,host,id,installation,to"||cursor.format!==1)throw new Error();
    uuid(cursor.host);uuid(cursor.installation);uuid(cursor.id);
    readingDate(cursor.as_of);readingDate(cursor.at);
    if(cursor.from!==from.toISOString()||cursor.to!==to.toISOString()||readingDate(cursor.at)<from||readingDate(cursor.at)>=to)throw new Error();
    if(Buffer.from(JSON.stringify(cursor)).toString("base64url")!==raw)throw new Error();
  }catch{fail("invalid_request",400);}
  return {from,to,cursor};
}
export const readingCursor=(cursor:ReadingCursor)=>Buffer.from(JSON.stringify(cursor)).toString("base64url");
