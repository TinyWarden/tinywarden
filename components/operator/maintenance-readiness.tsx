"use client";
import {useId} from 'react';
import {messages} from '@/i18n/messages';
import {DataTable} from '@/components/playbook/data';
import {RowStatus} from '@/components/playbook/controls';
import type {ActionReadinessDetails,ActionReadinessState} from '@/lib/maintenance/readiness';

const t=messages.maintenanceReadiness;
const tone=(state:ActionReadinessState)=>state==='ready'?'healthy':state==='missing_prerequisites'?'warning':
 ['busy','monitoring_paused','inactive','platform_unsupported','unsupported_agent','retired_policy'].includes(state)?'off':'unknown';
export function MaintenanceReadiness({value,unavailable=false,stale=false}:{value:ActionReadinessDetails;unavailable?:boolean;stale?:boolean}){
 const id=useId(),actions=value.actions.map(a=>unavailable?{...a,state:'unknown' as const,missing_packages:[]}:stale?{...a,state:'stale' as const,missing_packages:[]}:a);
 const packages=[...new Set(actions.flatMap(a=>a.missing_packages))];
 return <section className="tw-field" aria-labelledby={id}>
  <h3 className="tw-t-head" id={id}>{t.title}</h3>
  <DataTable className="tw-table--edge-align tw-table--wrap-headings tw-table--stack tw-table--labelled" columns={[{key:'action',label:t.action},{key:'state',label:messages.maintenanceActions.status}]} rows={actions.map(a=>({
   action:<strong>{a.name??(messages.maintenanceActions.actions as Record<string,string>)[a.id]??a.id}</strong>,
   state:<div><RowStatus status={tone(a.state)} value={t.states[a.state]}/><p className="tw-t-secondary">{t.notes[a.state]}</p></div>
  }))}/>
  {packages.length?<p>{t.installPackages}<code>{packages.join(' ')}</code></p>:null}
 </section>;
}
