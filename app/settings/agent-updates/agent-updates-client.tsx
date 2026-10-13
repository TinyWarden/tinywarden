"use client";
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
export function AgentUpdatesClient(){
  const read=useOperatorRead("/api/v1/operator/agent-updates",valid,60000),v=read.value;
  return <SettingsShell active="updates"><ReadNotice expired={read.expired} failed={read.failed} loaded={!!v}/>
    <section className="tw-card" aria-labelledby="agent-updates-title"><header className="tw-card__head"><div className="tw-card__titles"><h2 id="agent-updates-title" className="tw-t-card">{t.title}</h2><p>{t.help}</p></div></header>
      {v&&!read.expired?<><div className="tw-card__body tw-settings-policy"><PolicyChoice key={v.revision} value={v.automatic?"on":"off"} revision={v.revision} url="/api/v1/operator/agent-updates" reload={read.reload} disabled={read.failed}/></div>
      <div className="tw-settings-release"><FactGrid facts={[{key:"release",label:t.newest,value:v.newest_version??t.noRelease,mono:true},{key:"checked",label:t.catalog,value:time(v.catalog_at,true),mono:true}]}/>{v.catalog_error?<p className="tw-t-secondary" role="status">{t.catalogFailed}</p>:null}</div></>:<div className="tw-card__body"><p role="status">{read.failed?messages.fleet.unavailable:messages.dashboard.loading}</p></div>}
    </section>
  </SettingsShell>;
}
