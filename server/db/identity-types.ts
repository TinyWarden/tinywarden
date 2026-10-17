import type {ColumnType,Generated} from "kysely";
type Time=ColumnType<Date,Date,Date>;type Revision=ColumnType<string,string|number,string|number>;
// auto_create is legacy storage only; OIDC admission always provisions a User.
export interface OidcProvider {id:string;singleton:Generated<boolean>;label:string;issuer:string;client_id:string;enabled:boolean;auto_create:boolean;groups_claim:string;revision:Revision}
export interface IdentityTables {
 oidc_providers:OidcProvider;
 operator_external_identities:{id:string;operator_id:string;provider_id:string;protocol:'oidc';issuer:string;subject:string;created_at:Time};
 oidc_group_mappings:{provider_id:string;external_group:string;group_id:string};
 access_external_memberships:{provider_id:string;operator_id:string;group_id:string;valid_until:Time};
 access_effective_group_members:{operator_id:string;group_id:string};
 oidc_transactions:{id:string;provider_id:string;provider_revision:Revision;state_digest:Buffer;browser_digest:Buffer;nonce:string;pkce_verifier:string;intent:'login'|'link';operator_id:string|null;session_id:string|null;auth_version:Revision|null;issued_at:Time;expires_at:Time};
}
