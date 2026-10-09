import type { Scalar, PackageCatalog } from "./package-types";
import { packageText } from "./package-types";
import type { DisplayUnit, ScalarSource, DisplayStatus } from "./display-types";
export const UINT64_MAX = 18446744073709551615n;
const labelOrder = new Intl.Collator("en", { sensitivity: "variant" });
export function compareDisplayLabels(left:string,right:string):number{return labelOrder.compare(left,right);}
export function containsControl(value:string):boolean{return Array.from(value).some(c=>{const code=c.charCodeAt(0);return code<32||code>=127&&code<=159;});}
const decimal = /^-?(0|[1-9][0-9]*)(\.[0-9]{1,9})?$/;
export function unitOf(source: ScalarSource): DisplayUnit {
  return source.unit ?? (source.kind === "percent" ? "percent" : source.kind === "duration" ? "seconds" : "number");
}
export function numericValue(value: Scalar | undefined, source: ScalarSource): string | null {
  let result: string;
  if (source.kind === "text") {
    if (typeof value !== "string" || !source.encoding || value.length > 32 || !decimal.test(value)) return null;
    if (source.encoding === "uint64" && (!/^(0|[1-9][0-9]*)$/.test(value) || BigInt(value) > UINT64_MAX)) return null;
    result=value;
  } else {
    if (!["number","percent","duration"].includes(source.kind) || typeof value !== "number" || !Number.isFinite(value)) return null;
    if (unitOf(source) === "bytes" && (!Number.isSafeInteger(value) || value < 0)) return null;
    result=String(value);
  }
  const number=Number(result),unit=unitOf(source);
  if (!Number.isFinite(number) || (unit === "percent" && (number<0 || number>100)) ||
    (["bytes","bytes_per_second","seconds","milliseconds"].includes(unit) && number<0) || (unit==="count" && !Number.isInteger(number))) return null;
  return result;
}
export function sampleStatus(value: unknown): DisplayStatus {
  return ["healthy","warning","critical","unknown","informational"].includes(String(value)) ? value as DisplayStatus : "unknown";
}
export function enumLabel(value: string, source: ScalarSource, catalog: PackageCatalog): string {
  const key=source.enum && Object.hasOwn(source.enum,value) ? source.enum[value] : undefined;
  return key ? packageText(catalog,{key,params:{}}) : value;
}
