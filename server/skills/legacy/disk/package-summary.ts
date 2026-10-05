import type { PackageAssessment } from "../../../../lib/skills/package-types";
/** Compatibility display of package-produced facts; never re-evaluates a skill. */
export function packageDiskSummary(assessment:PackageAssessment|null){
  const fact=assessment?.facts.find((f)=>f.key==="worst_mount");
  const row=fact?.kind==="table"?fact.rows[0]:undefined;
  const coverage=assessment?.facts.find((f)=>f.key==="coverage");
  const incomplete=coverage?.kind==="text"&&coverage.value!=="complete";
  if(!row||typeof row.mount_id!=="number"||typeof row.path!=="string"||typeof row.total!=="string"||typeof row.available!=="string"||
    !/^\d{1,20}$/.test(row.total)||!/^\d{1,20}$/.test(row.available)||BigInt(row.total)===0n||BigInt(row.available)>BigInt(row.total)||
    typeof row.classification!=="string"||!["healthy","warning","critical"].includes(row.classification)||typeof row.shared!=="boolean")return {worst:null,incomplete};
  return {worst:{mount_id:row.mount_id,path:row.path,total_bytes:row.total,available_bytes:row.available,
    classification:row.classification,shared_capacity:row.shared},incomplete};
}
