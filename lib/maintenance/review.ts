/** Normalized review data: future providers supply facts/changes, not Fleet layouts. */
export type ReviewFact={key:string;kind:'bytes'|'count';value:number};
export type ReviewColumn={key:'subject'|'context'|'before'|'after'|'state';label:string};
export type ReviewRow={subject:string;context:string;before?:string;after?:string;state?:string};
export type ReviewTable={id:string;label:string;columns:ReviewColumn[];count:number};
export type PlanReviewSummary={facts:ReviewFact[];tables:Pick<ReviewTable,'id'|'count'>[];coverage:number;warnings:number;not_configured:number};
