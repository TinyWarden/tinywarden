import type {DisplayUnit} from "./display-types";
export interface MetricBucket {
  start:string;end:string;count:number;min:string|null;max:string|null;last:string|null;last_at:string|null;
  incomplete:boolean;has_gap:boolean;connect_from_previous:boolean;reasons:string[];
}
export interface MetricHistory {
  format:1;host:string;installation:string;digest:string;metric:string;title:string;unit:DisplayUnit;
  versions:{digest:string;version:string}[];
  requested:{from:string;to:string};applied:{from:string;to:string};as_of:string;retained_cutoff:string;
  first_available:string|null;selection_required:boolean;directory:{key:string;label:string}[];
  series:{key:string;label:string;buckets:MetricBucket[]}[];
}

export type MetricGapReason="retention"|"before_first_retained"|"evidence"|"coverage"|"context"|"extraction"|"unavailable";
export interface MetricGap {from:string;to:string;reason:MetricGapReason;coarse:boolean}
export interface MetricPoint {at:string;value:string|null;valid_until:string;incomplete:boolean;connect_from_previous:boolean;reasons:MetricGapReason[]}
export interface AdaptiveSeries {
  key:string;label:string;first_available:string|null;
  summary:{readings:number;last:string|null;last_at:string|null};gaps:MetricGap[];
  points?:MetricPoint[];buckets?:(MetricBucket&{frame_count:number})[];
}
export interface AdaptiveHistory extends Omit<MetricHistory,"format"|"series"> {
  format:2;representation:"samples"|"buckets";series:AdaptiveSeries[];
}
