import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fail} from '../../errors';
import {MAX_SKILL_ZIP} from '../catalog/package-upload';
let transfers=0;

function transfer(data:Buffer,headers:HeadersInit){
  let position=0,closed=false,timer:NodeJS.Timeout;
  const close=()=>{if(!closed){closed=true;clearTimeout(timer);transfers--;}};
  const body=new ReadableStream<Uint8Array>({
    start(controller){timer=setTimeout(()=>{controller.error(new Error("transfer_timeout"));close();},15000);},
    pull(controller){if(closed)return;if(position===data.length){controller.close();close();return;}
      const end=Math.min(position+65536,data.length);controller.enqueue(data.subarray(position,end));position=end;},
    cancel(){close();},
  });
  return new Response(body,{headers});
}

export async function readPackageArchive(digest:string,archive:{sha256:string;size:number},store:string){
 if(!/^[0-9a-f]{64}$/.test(digest)||!/^[0-9a-f]{64}$/.test(archive.sha256)||!Number.isSafeInteger(archive.size)||archive.size<1||archive.size>MAX_SKILL_ZIP)fail('temporarily_unavailable',503);
 const file=await open(path.join(store,'.archives',`${digest}.zip`),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const stat=await file.stat();
  if(!stat.isFile()||stat.nlink!==1||stat.size!==archive.size||stat.size>MAX_SKILL_ZIP)fail('temporarily_unavailable',503);
  const data=await file.readFile();
  if(data.length!==archive.size||createHash('sha256').update(data).digest('hex')!==archive.sha256)fail('temporarily_unavailable',503);
  return {data,headers:{'Content-Type':'application/zip','Content-Length':String(data.length),
   'X-TinyWarden-Archive-SHA256':archive.sha256,'X-TinyWarden-Content-SHA256':digest,
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}};
 }finally{await file.close();}
}
export async function packageTransfer(resolve:()=>Promise<{data:Buffer;headers:HeadersInit}>){
 if(transfers>=4)fail('temporarily_unavailable',503);
 transfers++;let returned=false;
 try{const value=await resolve(),response=transfer(value.data,value.headers);returned=true;return response;}
 finally{if(!returned)transfers--;}
}
