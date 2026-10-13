import type {ColumnType} from "kysely";
import type {Catalogue,CatalogueEntry} from "../../lib/skills/repositories";
import type {PackageMetadata} from "../../lib/skills/package-types";
type Instant=ColumnType<Date,Date|string,Date|string>;
export interface SkillRepository {id:string;github_id:string;owner_id:string;name:string;enabled:boolean;removed:boolean;revision:string;catalogue_revision:string;catalogue:Catalogue|null;commit_sha:string|null;catalogue_sha256:string|null;checked_at:Instant|null;verified_at:Instant|null;error:string|null;retry_at:Instant|null}
export interface Origin {repository_id:string;github_id:string;owner_id:string;name:string;commit_sha:string;catalogue_sha256:string;release_id:string;asset_id:string;archive_sha256:string;archive_size:number;verified_at:string}
export interface SkillOrigin {id:string;content_sha256:string;origin:Origin}
export interface SkillSource {installation_id:string;kind:"repository"|"upload"|"local";repository_id:string|null;origin_id:string|null;revision:string}
export interface SkillPreparation {id:string;operator_id:string;auth_version:string;request_id:string;repository_id:string;repository_revision:string;catalogue_revision:string;entry:CatalogueEntry;installation_id:string|null;expected_digest:string|null;expected_enablement:string|null;expected_settings:string|null;expected_source:string|null;metadata:PackageMetadata|null;origin:Origin|null;compatible:boolean|null;state:"preparing"|"ready"|"committed"|"cancelled"|"failed";created_at:Instant;expires_at:Instant}
export interface SkillRepositoryTables {skill_repositories:SkillRepository;skill_package_origins:SkillOrigin;skill_installation_sources:SkillSource;skill_repository_preparations:SkillPreparation;skill_repository_mutations:{operator_id:string;request_id:string;fingerprint:Buffer;action:string;result:unknown;completed_at:Instant}}
