import type {ButtonHTMLAttributes,ReactNode,Ref} from "react";
import {messages} from "@/i18n/messages";
import type {DisplayStatus} from "@/lib/skills/display-types";
export function PlaybookButton({variant="primary",className="",...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:"primary"|"secondary"|"danger";ref?:Ref<HTMLButtonElement>}) {
  return <button {...props} className={`tw-btn ${variant==="primary"?"":`tw-btn--${variant}`} ${className}`} />;
}
export function StatePill({status}:{status:DisplayStatus|"stale"|"disabled"|"not_configured"}) {
  return <span className={`tw-pill tw-pill--${status==="disabled"||status==="not_configured"?"off":status}`}>{status==="healthy"?<span aria-hidden="true">{messages.display.checkMark} </span>:null}{status==="disabled"||status==="stale"||status==="not_configured"?messages.dashboard.states[status]:messages.display.states[status]}</span>;
}
const rowStatusValues=["healthy","warning","critical","unknown","informational","stale","disabled","not_configured","not_applicable","offline","gap","off","unsupported","running"] as const;
type RowStatusValue=typeof rowStatusValues[number];
export function toRowStatus(value:unknown):RowStatusValue{
  return rowStatusValues.find(status=>status===value)??"unknown";
}
export function RowStatus({status,value}:{status:RowStatusValue;value?:string}){
  const variant=status==="disabled"||status==="not_configured"||status==="not_applicable"?"off":status==="offline"?"critical":status;
  const label=status==="disabled"||status==="not_configured"||status==="stale"||status==="offline"||status==="not_applicable"?messages.dashboard.states[status]
    :status==="gap"?messages.display.gap:status==="off"?messages.skills.offLabel
    :status==="unsupported"||status==="running"?messages.display.rowStates[status]:messages.display.states[status];
  const dot=status==="unknown"||status==="stale"||status==="gap"?"unknown":status==="healthy"||status==="warning"?status:"off";
  return <span className={`tw-rowstate tw-rowstate--${variant}${value===undefined?"":" tw-rowstate--value"}`} title={value===undefined?undefined:label}>
    {variant==="critical"?<span className="tw-rowstate__cue" aria-hidden="true">{messages.dashboard.symbols.critical}</span>
      :status==="running"?<span className="tw-spinner" aria-hidden="true"/>:<span className={`tw-dot tw-dot--${dot}`} aria-hidden="true"/>}{value??label}
  </span>;
}
export function WidgetState({state="missing",children}:{state?:"missing"|"empty"|"loading"|"error"|"stale";children?:ReactNode}) {
  return <div className="tw-chart__empty" role={state==="loading"?"status":undefined}>
    <b>{messages.display.states[state]}</b><span>{children??messages.display.stateHelp[state]}</span>
  </div>;
}
export function EmptyState({title,children}:{title:string;children?:ReactNode}){
  return <div className="tw-empty" role="status"><h3 className="tw-empty__title">{title}</h3>{children?<p className="tw-empty__text">{children}</p>:null}</div>;
}
export function ContextValue({value,context}:{value:string;context:string}){
  return <span className="tw-context-value"><strong>{value}</strong><code className="tw-cmd tw-cmd--boxed">{context}</code></span>;
}
