"use client";
import {useOperatorRead} from "@/components/operator/use-operator-read";
import {ResourceSelector} from "@/components/playbook/resource-selector";
import {PlaybookButton} from "@/components/playbook/controls";
import {PlaybookIcon} from "@/components/playbook/skill";
import {messages} from "@/i18n/messages";
import {packageText,type PackageMetadata} from "@/lib/skills/package-types";
import type {Wire} from "@/components/operator/format";
import type {readResources} from "@/server/skills/resources/inventory";
type Choices=Wire<Awaited<ReturnType<typeof readResources>>>;
function validChoices(v:unknown):v is Choices{
 const r=v as Choices;return !!r&&r.schema_version===1&&typeof r.as_of==='string'&&typeof r.fresh==='boolean'&&typeof r.complete==='boolean'&&Array.isArray(r.items)&&r.items.length<=576&&r.items.every(i=>typeof i.key==='string'&&typeof i.label==='string'&&typeof i.description==='string'&&typeof i.selectable==='boolean')&&!!r.metadata?.catalog;
}
export function ResourceEditor({host,id,collection,metadata,selected,change,disabled,max}:{host:string;id:string;collection:string;metadata:PackageMetadata;selected:string[];change:(selected:string[],snapshot:string|null)=>void;disabled:boolean;max:number}){
 const read=useOperatorRead(`/api/v2/operator/hosts/${host}/skills/${id}/resources/${collection}?selector=true`,validChoices,15000);
 const spec=metadata.manifest.resource_collections![collection]!,data=read.value,label=packageText(metadata.catalog,{key:spec.label_key,params:{}});
 const rows=(data?.items??[]).map(r=>({...r,state:r.state?packageText(metadata.catalog,r.state):messages.resources.checking,selectionReason:r.selection_reason?packageText(metadata.catalog,r.selection_reason):undefined}));
 return <ResourceSelector label={label} help={packageText(metadata.catalog,{key:spec.help_key,params:{}})} rows={rows} selected={selected} onChange={keys=>change(keys,data?.snapshot_id??null)} disabled={disabled} max={max} loading={read.busy} available={!!data?.snapshot_id} fresh={!!data?.fresh&&!read.failed} complete={!!data?.complete} error={read.failed?messages.resources.loadError:undefined}
  action={read.failed?<PlaybookButton variant="secondary" type="button" className="tw-btn--sm" onClick={()=>void read.reload()}><PlaybookIcon name="refresh"/>{messages.resources.retry}</PlaybookButton>:undefined}/>;
}
