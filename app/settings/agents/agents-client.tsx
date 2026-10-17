"use client";
import {useState} from "react";
import {messages} from "@/i18n/messages";
import {ReadNotice} from "@/components/operator/shell";
import {useOperatorRead} from "@/components/operator/use-operator-read";
import {SettingsShell} from "../settings-shell";
import {FactGrid} from "@/components/playbook/data";
import {PolicyChoice} from "@/components/operator/agent-maintenance";
import {time} from "@/components/operator/format";
const t=messages.agentUpdates;
type Read={schema_version:1;as_of:string;automatic:boolean;revision:string;catalog_at:string|null;catalog_error:string|null;newest_version:string|null};
function valid(v:unknown):v is Read{const r=v as Read;return !!r&&r.schema_version===1&&typeof r.automatic==="boolean"&&typeof r.revision==="string"&&(r.catalog_at===null||typeof r.catalog_at==="string"&&Number.isFinite(Date.parse(r.catalog_at)))&&(r.catalog_error===null||typeof r.catalog_error==="string");}
export function AgentsClient(){
  const [dirty,setDirty]=useState(false);
  const read=useOperatorRead("/api/v1/operator/agent-updates",valid,60000),v=read.value;
  return <SettingsShell active="agents" dirty={dirty}><ReadNotice expired={read.expired} failed={read.failed} loaded={!!v}/>
    <section className="tw-card" aria-labelledby="agents-title"><header className="tw-card__head"><div className="tw-card__titles"><h2 id="agents-title" className="tw-t-section">{t.title}</h2><p className="tw-t-secondary">{t.help}</p></div></header>
      {v&&!read.expired?<PolicyChoice key={v.revision} value={v.automatic?"on":"off"} revision={v.revision} url="/api/v1/operator/agent-updates" reload={read.reload} disabled={read.failed} onDirty={setDirty}>
      <FactGrid band="top" facts={[{key:"release",label:t.newest,value:v.newest_version??t.noRelease,mono:true},{key:"checked",label:t.catalog,value:time(v.catalog_at,true)}]}/>{v.catalog_error?<div className="tw-card__row"><p className="tw-t-secondary" role="status">{t.catalogFailed}</p></div>:null}
      </PolicyChoice>:<div className="tw-card__body"><p role="status">{read.failed?messages.fleet.unavailable:messages.dashboard.loading}</p></div>}
    </section>
  </SettingsShell>;
}
