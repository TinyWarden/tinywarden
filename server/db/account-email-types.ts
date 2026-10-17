import type {ColumnType} from "kysely";
type Time=ColumnType<Date,Date,Date>;type Revision=ColumnType<string,string|number,string|number>;
export type EmailPurpose='verify'|'reset';
export interface AccountEmailTables {
 account_email_tokens:{id:string;operator_id:string;purpose:EmailPurpose;secret_digest:Buffer;auth_version:Revision;email_revision:Revision;email:string;issued_at:Time;expires_at:Time};
 account_email_jobs:{id:string;purpose:EmailPurpose|'reset_notice';login:string;operator_id:string|null;auth_version:Revision|null;email_revision:Revision|null;email:string|null;state:'queued'|'claimed'|'done';outcome:'sent'|'skipped'|'failed'|'uncertain'|'abandoned'|null;created_at:Time;claimed_at:Time|null;finished_at:Time|null};
 account_email_throttle:{key:Buffer;started_at:Time;count:number};
}
