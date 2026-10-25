import type {ValueSchema} from './package-types';
/** Bounded JSON with duplicate rejection and exact top-level value slices. */
export function inspectActionJSON(raw:string,limit:number,schema?:ValueSchema){
 if(new TextEncoder().encode(raw).length>limit)throw new Error('action_json_invalid');
 let at=0;
 const token=/[ \t\r\n]*(true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|"(?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9A-Fa-f]{4}))*"|[{}]|\[|\]|[:,])/y;
 function next(){token.lastIndex=at;const match=token.exec(raw);if(!match)throw new Error('action_json_invalid');at=token.lastIndex;return match[1]!;}
 const fields:Record<string,string>=Object.create(null);
 function value(first:string,depth:number,rule?:ValueSchema):unknown{
  if(depth>16)throw new Error('action_json_invalid');
  if(first==='{'||first==='['){
   const object=first==='{',close=object?'}':']',items:unknown[]=[],record:Record<string,unknown>=Object.create(null);
   let item=next();if(item===close)return object?record:items;
   while(true){
    if(object){
     if(!item.startsWith('"'))throw new Error('action_json_invalid');const key=JSON.parse(item) as string;
     if(Object.hasOwn(record,key)||next()!==':')throw new Error('action_json_invalid');
     const start=at;record[key]=value(next(),depth+1,rule?.properties?.[key]);
     if(depth===0)fields[key]=raw.slice(start,at).trim();
    }else items.push(value(item,depth+1,rule?.items));
    item=next();if(item===close)return object?record:items;
    if(item!==',')throw new Error('action_json_invalid');item=next();
   }
  }
  if(!/^(?:"|true$|false$|null$|-?\d)/.test(first))throw new Error('action_json_invalid');
  const parsed:unknown=JSON.parse(first);
  if(rule?.type==='integer'&&typeof parsed==='number'&&!/^-?(0|[1-9][0-9]*)$/.test(first))throw new Error('action_json_invalid');
  if(typeof parsed==='number'&&!Number.isFinite(parsed))throw new Error('action_json_invalid');
  return parsed;
 }
 const parsed=value(next(),0,schema);if(raw.slice(at).replace(/[ \t\r\n]/g,'')!=='')throw new Error('action_json_invalid');return {value:parsed,fields};
}
export function parseActionJSON(raw:string,limit:number,schema?:ValueSchema){return inspectActionJSON(raw,limit,schema).value;}
