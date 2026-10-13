import {rm,chmod,readdir,lstat} from "node:fs/promises";
import path from "node:path";
import type {Db} from "./commands";
import {packageStore} from "../runtime/storage";
/** A grace period covers bounded in-flight sandbox work; preview stores are UUID-owned. */
export async function pruneRepositoryPreviews(db:Db,at:Date,store=packageStore){
  const ids=await db.selectFrom("skill_repository_preparations").select("id").where("expires_at","<",new Date(at.getTime()-120000)).orderBy("expires_at").limit(20).execute();
  for(const {id} of ids){await removePreview(path.join(store,".previews",id));await db.deleteFrom("skill_repository_preparations").where("id","=",id).execute();}
  return ids.length;
}
export async function removePreview(directory:string){
  const stat=await lstat(directory).catch(()=>null);if(!stat)return;
  if(stat.isDirectory()&&!stat.isSymbolicLink()){
    await chmod(directory,0o700);for(const item of await readdir(directory,{withFileTypes:true}))if(item.isDirectory())await removePreview(path.join(directory,item.name));
  }
  await rm(directory,{recursive:true,force:true});
}
