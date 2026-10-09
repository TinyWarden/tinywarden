import type { FactKind } from "./package-types";
export type DisplayUnit = "number" | "count" | "percent" | "bytes" | "seconds" | "milliseconds" | "celsius" | "bytes_per_second" | "per_second";
export type DisplayStatus = "healthy" | "warning" | "critical" | "unknown" | "informational";
export interface ScalarSource {
  kind: FactKind; unit?: DisplayUnit; encoding?: "decimal" | "uint64";
  missing?: ""; precision?: number; enum?: Record<string,string>; semantic?: "status"; muted_values?: string[];
}
export interface TableSource { kind: "table"; columns: Record<string,ScalarSource> }
export type DisplaySource = ScalarSource | TableSource;
export interface Binding { fact: string; column?: string }
export type NumericReference = Binding | { value: number } | { setting: string };
export interface Threshold { at: NumericReference; severity: "warning" | "critical" }
export interface MeterOptions {
  min: NumericReference; max: NumericReference; thresholds?: Threshold[]; status?: "assessment" | Binding;
}
interface WidgetBase { id: string; title_key: string; help_key?: string }
interface HistoryWidget { metric: string; default_window?: "1h" | "24h" | "7d" | "30d" | "90d" }
export type DisplayWidget = WidgetBase & (
  | { type: "facts"; facts: string[] }
  | { type: "table"; source: string; columns: {key:string;label_key?:string;meter?:MeterOptions}[] }
  | ({type:"meter"|"gauge";value:Binding} & MeterOptions)
  | ({type:"line_chart"|"sparkline"} & HistoryWidget)
  | ({type:"bar_chart";mode:"history"} & HistoryWidget)
  | {type:"bar_chart";mode:"snapshot";source:string;label:string;value:string}
  | {type:"donut";parts:{label_key:string;value:Binding}[];source?:never;label?:never;value?:never}
  | {type:"donut";source:string;label:string;value:string;parts?:never}
);
export interface DisplayMetric {
  title_key:string;value:Binding;series_key?:string;series_label?:string;max_series?:number;
}
export type DisplayRole = "current" | "graph" | "details";
interface DisplayBase { sources:Record<string,DisplaySource>;metrics?:Record<string,DisplayMetric> }
export type SkillDisplay = DisplayBase & (
  | {format:1;sections:{id:string;title_key:string;collapsed?:boolean;disclosure?:"open"|"closed";widgets:DisplayWidget[]}[]}
  | {format:2;sections:{id:string;role:DisplayRole;title_key:string;widgets:DisplayWidget[]}[]}
);
