"use client";
import {ResourceTable} from "@/components/playbook/resource-selector";
import {StatePill,EmptyState} from "@/components/playbook/controls";
import {Pagination} from "@/components/playbook/pagination";
import {useState} from "react";
import {packageText} from "@/lib/skills/package-types";
import type {PackageResults} from "./package-model";
import {messages} from "@/i18n/messages";
export function ResourceResults({skill,outdated=false}:{skill:PackageResults['skills'][number];outdated?:boolean}){
 const [page,setPage]=useState(1),selected=Object.entries(skill.metadata.manifest.resource_collections??{}).flatMap(([collection,spec])=>{
  const value=skill.overrides[spec.selection_field]??skill.defaults[spec.selection_field];
  return Array.isArray(value)?value.map(key=>({collection,key,label:Object.keys(skill.metadata.manifest.resource_collections??{}).length>1?packageText(skill.metadata.catalog,{key:spec.label_key,params:{}})+messages.dashboard.separator+key:key})):[];
 });
 if(!selected.length)return <EmptyState title={messages.resources.none}>{messages.resources.noneHelp}</EmptyState>;
 const current=Math.min(page,Math.ceil(selected.length/10)),rows=selected.slice((current-1)*10,current*10).map(target=>{
  const subject=outdated?undefined:skill.assessment?.subjects?.find(s=>s.key===target.key&&s.collection===target.collection);
  return {key:target.collection+':'+target.key,identity:target.key,label:target.label,description:subject?packageText(skill.metadata.catalog,subject.reason):messages.resources.checking,state:<StatePill status={subject?.status??'unknown'}/>,selectable:false};
 });
 return <div className="tw-resources"><ResourceTable rows={rows}/><div className="tw-resources__pager"><Pagination page={current} total={selected.length} count={rows.length} loading={false} onPage={setPage} itemLabel={messages.resources.range}/></div></div>;
}
