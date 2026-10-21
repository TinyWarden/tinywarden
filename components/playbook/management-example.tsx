"use client";
import {useState} from "react";
import {messages} from "@/i18n/messages";
import {DataTable} from "./data";
import {ActionMenu} from "./action-menu";
import {CursorPagination} from "./pagination";
import {PlaybookButton,RowStatus} from "./controls";
export function ManagementExample(){const [selected,setSelected]=useState(false),t=messages.fleetManagement;return <section className="tw-card"><DataTable className="tw-table--stack tw-table--selection tw-table--edge-align tw-table--wrap-headings" columns={[{key:'select',label:t.selectPage,utility:true,heading:<input type="checkbox" aria-label={t.selectPage} checked={selected} onChange={e=>setSelected(e.target.checked)}/>},{key:'server',label:t.server},{key:'state',label:t.status},{key:'details',label:t.details},{key:'actions',label:t.actions}]} rows={[{select:<input type="checkbox" aria-label={t.selectServer.replace('{name}',messages.resources.demoName)} checked={selected} onChange={e=>setSelected(e.target.checked)}/>,server:messages.resources.demoName,state:<RowStatus status="off" value={t.paused}/>,details:<PlaybookButton type="button" variant="secondary" className="tw-btn--sm">{t.details}</PlaybookButton>,actions:<ActionMenu compact label={t.manage} items={[{label:t.edit,action:()=>{}},{label:t.pause,disabled:true,hint:t.upgradeRequired,action:()=>{}},{label:t.remove,danger:true,action:()=>{}}]}/>}]}/><CursorPagination page={1} total={1} count={1} loading={false} hasNext={false} onNext={()=>{}} onPrevious={()=>{}} itemLabel={t.serverCount}/></section>;}
