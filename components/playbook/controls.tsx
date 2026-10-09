import type {ButtonHTMLAttributes,ReactNode,Ref} from "react";
import {messages} from "@/i18n/messages";
import type {DisplayStatus} from "@/lib/skills/display-types";
export function PlaybookButton({variant="primary",className="",...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:"primary"|"secondary"|"danger";ref?:Ref<HTMLButtonElement>}) {
  return <button {...props} className={`tw-btn ${variant==="primary"?"":`tw-btn--${variant}`} ${className}`} />;
}
export function StatePill({status}:{status:DisplayStatus|"stale"|"disabled"}) {
  return <span className={`tw-pill tw-pill--${status==="disabled"?"off":status}`}>{status==="healthy"?<span aria-hidden="true">{messages.display.checkMark} </span>:null}{status==="disabled"||status==="stale"?messages.dashboard.states[status]:messages.display.states[status]}</span>;
}
export function WidgetState({state="missing",children}:{state?:"missing"|"empty"|"loading"|"error"|"stale";children?:ReactNode}) {
  return <div className="tw-chart__empty" role={state==="loading"?"status":undefined}>
    <b>{messages.display.states[state]}</b><span>{children??messages.display.stateHelp[state]}</span>
  </div>;
}
