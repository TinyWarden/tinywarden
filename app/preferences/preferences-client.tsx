"use client";
import {messages} from "@/i18n/messages";
import {OperatorShell,ReadNotice} from "@/components/operator/shell";
import {useOperatorRead} from "@/components/operator/use-operator-read";
import {PolicyChoice} from "@/components/operator/agent-maintenance";
import {time} from "@/components/operator/format";
const t=messages.agentUpdates;
type Read={schema_version:1;as_of:string;automatic:boolean;revision:string;catalog_at:string|null;catalog_error:string|null;newest_version:string|null};
function valid(v:unknown):v is Read{const r=v as Read;return !!r&&r.schema_version===1&&typeof r.automatic==="boolean"&&typeof r.revision==="string"&&(r.catalog_at===null||typeof r.catalog_at==="string"&&Number.isFinite(Date.parse(r.catalog_at)))&&(r.catalog_error===null||typeof r.catalog_error==="string");}
export function PreferencesClient(){
  const read=useOperatorRead("/api/v1/operator/agent-updates",valid,60000),v=read.value;
  return <OperatorShell active="preferences"><main id="main" tabIndex={-1} className="tw-ui tw-main"><header className="tw-pagehead"><div className="tw-pagehead__text"><h1 className="tw-t-page">{t.settings}</h1></div></header><ReadNotice expired={read.expired} failed={read.failed} loaded={!!v}/>
    {v&&!read.expired?<section className="tw-card"><header className="tw-card__head"><div className="tw-card__titles"><h2 className="tw-t-card">{t.title}</h2><p>{t.help}</p></div></header><div className="tw-card__body"><PolicyChoice key={v.revision} value={v.automatic?"on":"off"} revision={v.revision} url="/api/v1/operator/agent-updates" reload={read.reload} disabled={read.failed}/><p>{t.catalog}{messages.dashboard.separator}{time(v.catalog_at,true)}</p><p>{t.newest}{messages.dashboard.separator}{v.newest_version??t.noRelease}</p>{v.catalog_error?<p role="status">{t.catalogFailed}</p>:null}</div></section>:!read.failed?<p>{messages.dashboard.loading}</p>:null}
  </main></OperatorShell>;
}
