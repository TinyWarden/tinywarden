import type {PackageAssessment} from "./package-types";
export type HistoryWindow = "24h" | "7d" | "30d" | "90d";
export const historyWindows:Record<HistoryWindow,number>={"24h":86400000,"7d":7*86400000,"30d":30*86400000,"90d":90*86400000};
export interface CollectionReading {
  id:string;at:string;finished_at:string;received_at:string;outcome:string;
  status:PackageAssessment["status"];note:string|null;current:boolean;version:string;
}
export interface ReadingHistory {
  format:1;host:string;installation:string;as_of:string;
  requested:{from:string;to:string};applied:{from:string;to:string};retained_cutoff:string;
  total:number;page_size:10;next_cursor:string|null;readings:CollectionReading[];
  page:number;jumped_to:string|null;
}
