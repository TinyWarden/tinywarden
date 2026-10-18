import type {PackageFact,PackageReason} from "./package-types";
export const resourceFeature="skill_resources.python313.v1";
export const resourceLimits={inventory:262144,observation:131072,state:65536,context:524288,timeline:524288,selected:64,discovered:512} as const;
export interface ResourceCollection {selection_field:string;label_key:string;help_key:string;max_discovered:number;max_selected:number}
export interface ResourceItem {key:string;label:string;description:string;selectable:boolean;selection_reason:PackageReason|null;state:PackageReason}
export interface ResourceInventory {collection:string;complete:boolean;reason:PackageReason|null;items:ResourceItem[]}
export interface ResourceSubject {collection:string;key:string;status:"healthy"|"warning"|"critical"|"unknown";reason:PackageReason;facts:PackageFact[]}
export interface ResourceAssessment {from:number;subjects:ResourceSubject[];facts:PackageFact[]}
export interface ResourceEnvelope {observation:unknown;resources:ResourceInventory[]}
