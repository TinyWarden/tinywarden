"use client";
import {useState} from "react";
import {useOperatorRead} from "./use-operator-read";
import type {GroupChoices} from "@/server/fleet/groups";
import type {Wire} from "./format";
type View=Wire<GroupChoices>&{schema_version:1};
function valid(v:unknown):v is View{const r=v as View;return !!r&&r.schema_version===1&&Array.isArray(r.groups)&&Array.isArray(r.selected)&&[...r.groups,...r.selected].every(g=>typeof g.id==='string'&&typeof g.name==='string'&&typeof g.description==='string'&&typeof g.revision==='string'&&Number.isSafeInteger(g.count)&&g.count>=0)&&(r.next_cursor===null||typeof r.next_cursor==='string');}
/** Bounded server search and paging; selected labels remain visible outside the page. */
export function useFleetGroups(query:string,selected:string[]=[],enabled=true){
 const scope=query,[navigation,setNavigation]=useState<{scope:string;cursors:(string|null)[]}>({scope,cursors:[null]}),cursors=navigation.scope===scope?navigation.cursors:[null],cursor=cursors.at(-1);
 const q=new URLSearchParams({q:query});if(cursor)q.set('cursor',cursor);for(const id of selected)q.append('selected',id);
 const read=useOperatorRead('/api/v1/operator/fleet-groups?'+q,valid,30000,enabled);
 return {...read,previous:cursors.length>1,next:!!read.value?.next_cursor,back:()=>setNavigation({scope,cursors:cursors.slice(0,-1)}),forward:()=>{if(read.value?.next_cursor)setNavigation({scope,cursors:[...cursors,read.value.next_cursor]});}};
}
