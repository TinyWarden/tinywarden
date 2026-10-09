import {locale,messages} from "@/i18n/messages";
import {unitOf,numericValue,enumLabel,sampleStatus} from "@/lib/skills/display-values";
import type { ScalarSource, DisplayUnit } from "@/lib/skills/display-types";
import type {Scalar,PackageCatalog} from "@/lib/skills/package-types";
const t=messages.display;
export function numberText(value: string | number, unit: DisplayUnit="number", precision=1): string {
  if (unit === "bytes" && /^(0|[1-9][0-9]*)$/.test(String(value))) {
    const raw=BigInt(value),units=t.byteUnits;let divisor=1n,index=0;
    while (raw>=divisor*1024n && index<units.length-1){divisor*=1024n;index++;}
    const factor=10n**BigInt(precision),rounded=(raw*factor+divisor/2n)/divisor;
    const whole=rounded/factor,fraction=String(rounded%factor).padStart(precision,"0");
    return `${new Intl.NumberFormat(locale).format(whole)}${precision && index ? "."+fraction : ""} ${units[index]}`;
  }
  const formatted=new Intl.NumberFormat(locale,{maximumFractionDigits:precision}).format(Number(value));
  if(unit==="number" || unit==="count")return formatted;
  const suffix=t.units[unit];return suffix ? `${formatted}${unit==="percent" ? "" : " "}${suffix}` : formatted;
}
export function valueText(value: Scalar | undefined, source: ScalarSource, catalog: PackageCatalog): string | null {
  if (value===undefined || typeof value !== (source.kind==="text"?"string":source.kind==="boolean"?"boolean":"number")) return null;
  if (source.kind==="boolean")return value ? messages.packageSkills.yes : messages.packageSkills.no;
  if (source.kind==="time")return typeof value==="number" && value>=0 && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(value) : null;
  if (source.kind==="text" && !source.encoding){
    if(source.semantic){const status=sampleStatus(value);return status==="unknown"&&value!=="unknown"?null:t.states[status];}
    return enumLabel(String(value),source,catalog);
  }
  const numeric=numericValue(value,source);return numeric===null ? null : numberText(numeric,unitOf(source),source.precision??(unitOf(source)==="count"?0:1));
}

export function namedValue(label:string,value:string|number):string {return messages.display.namedValue.replace("{label}",label).replace("{value}",String(value));}

export function sampleTime(value:string,full=false){return new Intl.DateTimeFormat(locale,{timeZone:messages.dashboard.timezone,...(full?{month:"short",day:"numeric"} as const:{}),hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZoneName:"short"}).format(new Date(value));}
export function cadenceLabel(seconds:number){const divisor=seconds%3600===0?3600:seconds%60===0?60:1;return new Intl.NumberFormat(locale,{style:"unit",unit:divisor===3600?"hour":divisor===60?"minute":"second",unitDisplay:"short"}).format(seconds/divisor);}
