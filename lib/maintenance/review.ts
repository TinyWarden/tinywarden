/** Normalized review data: future providers supply facts/changes, not Fleet layouts. */
export type ReviewFact={key:string;kind:'bytes'|'count'|'text'|'number'|'boolean'|'sha256';label?:string;value:number|string|boolean|null};
export type ReviewColumn={key:string;label:string;kind?:'text'|'number'|'boolean'|'bytes'|'sha256'};
export type ReviewRow=Record<string,unknown>;
export type ReviewTable={id:string;label:string;columns:ReviewColumn[];count:number};
export type PlanReviewSummary={facts:ReviewFact[];tables:(Pick<ReviewTable,'id'|'count'>&{label?:string})[];coverage:number;warnings:number;not_configured:number};
