import type {Transaction} from "kysely";
import type {Database} from "../../db/types";
import type {PackageMetadata,PackageAssessment} from "../../../lib/skills/package-types";
import {jsonValue} from "../../db/json";
import {extractMetrics} from "./extract";
export async function captureMetrics(trx:Transaction<Database>,input:{
  id:string;host:string;installation:string;digest:string;finished_at:string;received_at:Date;
  current:boolean;outcome:string;assessments:PackageAssessment[];metadata:PackageMetadata;
}){
  if(!input.current||!Object.keys(input.metadata.display?.metrics??{}).length)return;
  const {flags,samples}=extractMetrics(input.metadata,input.assessments[0]??null,input.outcome);
  const control=await trx.selectFrom("history_control").select("epoch").where("singleton","=",true).executeTakeFirst();
  const sampled=input.outcome==="observed"?new Date(Math.min(new Date(input.finished_at).getTime(),input.received_at.getTime())):input.received_at;
  await trx.insertInto("skill_metric_frames").values({observation_id:input.id,host_id:input.host,installation_id:input.installation,
    content_sha256:input.digest,sampled_at:sampled,recovery_epoch:control?.epoch??null,format:1,flags:jsonValue(flags)}).execute();
  if(samples.length)await trx.insertInto("skill_metric_samples").values(samples.map(s=>({...s,observation_id:input.id}))).execute();
}
