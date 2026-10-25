import type {PackageCatalog,ValueSchema} from './package-types';

export type ActionClass='unprivileged'|'host_admin';
export type ActionPrerequisite={id:string;package:string}&(
 {kind:'executable';path:string}|{kind:'python_module';module:string});
export type ActionFact={key:string;label_key:string;kind:'text'|'number'|'boolean'|'bytes'|'sha256'};
export type ActionTable={id:string;label_key:string;source:string;columns:ActionFact[]};
export type SkillActionDescriptor={
 id:string;version:number;name_key:string;description_key:string;execution_class:ActionClass;
 requires_approval:boolean;requires_monitoring:boolean;prepare_effect:'none'|'changed';entrypoint:string;
 prerequisites:ActionPrerequisite[];schemas:Record<'input'|'plan'|'result'|'recovery',string>;
 review:{facts:ActionFact[];tables:ActionTable[]};result_facts:ActionFact[];recovery_facts:ActionFact[];
};
export type AdmittedSkillAction={descriptor:SkillActionDescriptor;
 schemas:Record<'input'|'plan'|'result'|'recovery',ValueSchema>;descriptor_sha256:string};
export type ActionSnapshot=AdmittedSkillAction&{catalog:PackageCatalog;skill_id:string;
 package_version:string;compatibility:{os:string[];architectures:string[]}};
export type ActionOrigin={github_id:string;owner_id:string};
export type ActionBinding={installation_id:string;skill_id:string;content_sha256:string;
 action_id:string;action_version:number;descriptor_sha256:string;permission_revision:string;
 settings_revision:string;settings_sha256:string;input_sha256:string;origin:ActionOrigin};
export type ActionProbe={grant_id:string;installation_id:string;content_sha256:string;
 descriptor_sha256:string;id:string;version:number;revision:string;origin:ActionOrigin;
 execution_class:ActionClass;prerequisites:ActionPrerequisite[]};
export type ActionReadinessRow=Omit<ActionProbe,'version'|'origin'|'execution_class'|'prerequisites'>&{
 ready:boolean;reason:string|null;missing:string[]};
export type ActionOriginPermission=ActionOrigin&{classes:ActionClass[]};
