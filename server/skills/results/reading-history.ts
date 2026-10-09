import {sql} from "kysely";
import {authorize,completeAuthorization} from "../../access/session";
import {fail,isPgError} from "../../errors";
import {uuid} from "../../validation";
import {safeIdentity} from "../../notifications/snapshot";
import {packageRead,type PackageDb} from "../catalog/package-commands";
import {packageText,type PackageCatalog,type PackageReason} from "../../../lib/skills/package-types";
import type {CollectionReading,ReadingHistory} from "../../../lib/skills/reading-types";
import {readingCursor,type ReadingRequest} from "./reading-request";
import messages from "../../../messages/en.json";
// Matches captureMetrics, including failed/delayed collection receipt time.
export const readingTime=sql<Date>`CASE WHEN o.outcome='observed' THEN LEAST(o.finished_at,o.received_at) ELSE o.received_at END`;
export function collectionNote(status:string,outcome:string,reason:PackageReason|null,entry:PackageCatalog[string]|null) {
  if(status==="healthy")return null;
  const text=outcome==="observed"&&reason&&entry?packageText({[reason.key]:entry},reason):
    (messages.packageSkills.errors as Record<string,string>)[outcome]??messages.packageSkills.unknown;
  const clean=safeIdentity(text,100000),chars=[...clean];return chars.slice(0,240).join("")+(chars.length>240?"…":"");
}
export async function readCollectionHistory(db:PackageDb,cookie:string,rawHost:string,rawInstallation:string,request:ReadingRequest,clock:()=>Date):Promise<ReadingHistory> {
  const host=uuid(rawHost),installation=uuid(rawInstallation),cursor=request.cursor;
  if(cursor&&(cursor.host!==host||cursor.installation!==installation))fail("invalid_request",400);
  try{return await packageRead(db,async trx=>{
    await sql`SET LOCAL statement_timeout='2s'`.execute(trx);
    const actor=await authorize(trx,cookie,clock),asOf=cursor?new Date(cursor.as_of):request.asOf??actor.at;
    if(request.to>actor.at||asOf>actor.at)fail("invalid_request",400);
    if(!await trx.selectFrom("hosts").select("id").where("id","=",host).executeTakeFirst()||
      !await trx.selectFrom("skill_installations").select("id").where("id","=",installation).executeTakeFirst())fail("not_found",404);
    const cutoff=new Date(+actor.at-90*86400000),from=new Date(Math.min(+request.to,Math.max(+request.from,+cutoff))),to=request.to;
    const candidates=sql`SELECT o.id,${readingTime} AS at FROM tinywarden.skill_observations o
      WHERE o.host_id=${host}::uuid AND o.installation_id=${installation}::uuid AND o.received_at>=${cutoff}::timestamptz
      AND o.received_at<=${asOf}::timestamptz AND ${readingTime}>=${from}::timestamptz AND ${readingTime}<${to}::timestamptz
      ORDER BY ${readingTime} DESC,o.id DESC LIMIT 150001`;
    const total=Number((await sql<{count:string}>`SELECT count(*)::text AS count FROM (${candidates}) f`.execute(trx)).rows[0]!.count);
    if(total>150000)fail("range_too_large",400);
    let pageNumber=Math.min(request.page??1,Math.max(1,Math.ceil(total/10))),jumpedTo:string|null=null;
    if(request.jump&&total){
      const target=(await sql<{id:string;at:Date}>`SELECT f.id,f.at FROM (${candidates}) f
        ORDER BY abs(extract(epoch FROM f.at-${request.jump}::timestamptz)),f.at DESC,f.id DESC LIMIT 1`.execute(trx)).rows[0]!;
      const rank=Number((await sql<{count:string}>`SELECT count(*)::text AS count FROM (${candidates}) f
        WHERE (f.at,f.id)>(${target.at}::timestamptz,${target.id}::uuid)`.execute(trx)).rows[0]!.count);
      pageNumber=Math.floor(rank/10)+1;jumpedTo=target.id;
    }
    if(cursor){
      const rank=Number((await sql<{count:string}>`SELECT count(*)::text AS count FROM (${candidates}) f
        WHERE (f.at,f.id)>=(${new Date(cursor.at)}::timestamptz,${cursor.id}::uuid)`.execute(trx)).rows[0]!.count);
      pageNumber=Math.floor(rank/10)+1;
    }
    const page=(await sql<{id:string;at:Date;finished_at:Date;received_at:Date;outcome:string;status:CollectionReading["status"]|null;
      reason:PackageReason|null;entry:PackageCatalog[string]|null;current:boolean;version:string}>`
      SELECT o.id,f.at,o.finished_at,o.received_at,o.outcome,o.current,
        CASE WHEN o.outcome='observed' THEN o.assessments->0->>'status' ELSE NULL END AS status,
        o.assessments->0->'reason' AS reason,
        p.metadata->'catalog'->(o.assessments->0->'reason'->>'key') AS entry,
        p.metadata->'manifest'->>'version' AS version
      FROM (${candidates}) f JOIN tinywarden.skill_observations o ON o.id=f.id
      JOIN tinywarden.skill_packages p ON p.content_sha256=o.content_sha256
      WHERE ${cursor?sql`(f.at,f.id)<(${new Date(cursor.at)}::timestamptz,${cursor.id}::uuid)`:sql`true`}
      ORDER BY f.at DESC,f.id DESC LIMIT 11 OFFSET ${cursor?0:(pageNumber-1)*10}`.execute(trx)).rows;
    const readings=page.slice(0,10).map(row=>({id:row.id,at:row.at.toISOString(),finished_at:row.finished_at.toISOString(),received_at:row.received_at.toISOString(),
      outcome:row.outcome,status:row.status??"unknown",note:collectionNote(row.status??"unknown",row.outcome,row.reason,row.entry),current:row.current,version:row.version}));
    const last=readings.at(-1);
    const result:ReadingHistory={format:1,host,installation,as_of:asOf.toISOString(),requested:{from:request.from.toISOString(),to:to.toISOString()},
      applied:{from:from.toISOString(),to:to.toISOString()},retained_cutoff:cutoff.toISOString(),total,page_size:10,page:pageNumber,jumped_to:jumpedTo,
      next_cursor:page.length>10&&last?readingCursor({format:1,host,installation,from:request.from.toISOString(),to:to.toISOString(),as_of:asOf.toISOString(),at:last.at,id:last.id}):null,readings};
    if(Buffer.byteLength(JSON.stringify(result))>32*1024)fail("range_too_large",400);
    await completeAuthorization(trx,actor,clock());return result;
  });}catch(error){if(isPgError(error,"57014"))fail("range_too_large",400);throw error;}
}
