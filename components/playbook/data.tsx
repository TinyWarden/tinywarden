import type {ReactNode} from "react";
import type {CSSProperties} from "react";
import {messages} from "@/i18n/messages";
import {namedValue} from "./format";
import {WidgetState} from "./controls";
export function FactGrid({facts}:{facts:{key:string;label:string;value:ReactNode;missing?:boolean;mono?:boolean;muted?:boolean}[]}) {
  return <dl className="tw-facts">{facts.map(f=><div key={f.key} className={`tw-fact${f.mono?" tw-fact--mono":""}${f.missing||f.muted?" tw-fact--empty":""}`}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>;
}
export function DataTable({columns,rows,truncated=false,className="",rowIds,currentRow}:{columns:{key:string;label:string;className?:string}[];rows:Record<string,ReactNode>[];truncated?:boolean;className?:string;rowIds?:string[];currentRow?:string|null}) {
  return <><div className="tw-data-scroll"><table className={`tw-table ${className}`}><thead><tr>{columns.map(c=><th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
    <tbody>{rows.length?rows.map((row,i)=><tr key={rowIds?.[i]??i} aria-current={currentRow&&rowIds?.[i]===currentRow?"true":undefined}>{columns.map(c=><td key={c.key} className={c.className} data-col={c.label}>{row[c.key]}</td>)}</tr>):<tr className="tw-table__state"><td className="tw-table__empty" colSpan={columns.length}><WidgetState state="empty"/></td></tr>}</tbody></table></div>
    {truncated?<p className="tw-t-secondary">{messages.packageSkills.truncated}</p>:null}</>;
}
export function BarChart({rows,format}:{rows:{label:string;value:number;formatted?:string}[];format:(n:number)=>string}) {
  if (!rows.length)return <WidgetState state="empty"/>;
  if (rows.length>32 || rows.some(r=>!Number.isFinite(r.value)))return <WidgetState/>;
  const min=Math.min(0,...rows.map(r=>r.value)),max=Math.max(0,...rows.map(r=>r.value)),span=max-min||1;
  return <ul className="tw-bars">{rows.map((r,i)=><li key={i} className="tw-bar"><span className="tw-bar__label" title={r.label}>{r.label}</span>
    <span className="tw-bar__track" role="img" aria-label={namedValue(r.label,r.formatted??format(r.value))}><span className="tw-bar__fill" style={{left:`${(Math.min(0,r.value)-min)/span*100}%`,"--v":`${Math.abs(r.value)/span*100}%`} as CSSProperties}/></span>
    <span className="tw-bar__value">{r.formatted??format(r.value)}</span></li>)}</ul>;
}

export function DetailsGrid({facts}:{facts:{key:string;label:string;value:ReactNode;muted?:boolean;full?:boolean}[]}){
  return <dl className="tw-details">{facts.map(f=><div key={f.key} style={f.full?{gridColumn:"1 / -1"}:undefined}><dt>{f.label}</dt><dd className={f.muted?"tw-t-secondary":undefined}>{f.value}</dd></div>)}</dl>;
}
