import {sql} from 'kysely';
export type ActionPresentation={name:string;description:string;requires_approval:boolean;
 facts:{key:string;label:string;kind:string}[];reason:string|null};
export function actionPresentationProjection(){return sql<ActionPresentation|null>`CASE WHEN j.action_snapshot IS NULL THEN NULL ELSE jsonb_build_object(
 'name',j.action_snapshot->'catalog'->(j.action_snapshot->'descriptor'->>'name_key')->>'text',
 'description',j.action_snapshot->'catalog'->(j.action_snapshot->'descriptor'->>'description_key')->>'text',
 'requires_approval',j.action_snapshot->'descriptor'->'requires_approval',
 'facts',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',f->>'key','kind',f->>'kind','label',j.action_snapshot->'catalog'->(f->>'label_key')->>'text')),'[]'::jsonb)
  FROM jsonb_array_elements(j.action_snapshot->'descriptor'->'result_facts') f),
 'reason',NULL) END`;}

import {legacyReviewSummaryProjection} from "./legacy/review";
/** All JSON paths are admitted data operands; no package contributes SQL or callbacks. */
export function reviewSummaryProjection(){return sql`CASE WHEN p.id IS NULL THEN NULL WHEN j.action_snapshot IS NULL THEN ${legacyReviewSummaryProjection()} ELSE
 jsonb_build_object('facts',(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'key',f->>'key','kind',f->>'kind','label',j.action_snapshot->'catalog'->(f->>'label_key')->>'text',
  'value',p.provider_plan->(f->>'key'))),'[]'::jsonb)
  FROM jsonb_array_elements(j.action_snapshot->'descriptor'->'review'->'facts') f),
 'tables',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t->>'id','label',j.action_snapshot->'catalog'->(t->>'label_key')->>'text','count',
  jsonb_array_length(p.provider_plan->(t->>'source')))),'[]'::jsonb)
  FROM jsonb_array_elements(j.action_snapshot->'descriptor'->'review'->'tables') t),
 'coverage',jsonb_array_length(p.verification->'members'),'not_configured',jsonb_array_length(p.verification->'not_configured'),
 'warnings',jsonb_array_length(jsonb_path_query_array(p.verification,'$.members[*] ? (@.severity == "warning")'))) END`;}
