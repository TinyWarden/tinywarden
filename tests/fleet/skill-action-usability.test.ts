import {actionVerificationSupported} from '../../server/skills/catalog/sdk3-compatibility';
import type {PackageMetadata} from '../../lib/skills/package-types';
import {expect,it} from 'vitest';
import metadata from '../fixtures/action-package-v3-metadata.json';
import {canStartImmediately,actionStartBody} from '../../app/fleet/_components/skill-action-start';
import {fleetMenuActions} from '../../app/fleet/_components/actions';
import type {ActionSnapshot} from '../../lib/skills/action-types';
import type {ActionGrantRead} from '../../components/skills/action-model';
import type {ServerRow} from '../../app/fleet/_components/model';
import {reviewedApproval,type MaintenanceItem,type ReviewedPlan} from '../../app/fleet/_components/maintenance-model';

const snapshot=()=>({...structuredClone(metadata.actions[0]!),catalog:metadata.catalog,
 skill_id:metadata.manifest.id,package_version:metadata.manifest.version,compatibility:metadata.manifest.compatibility}) as ActionSnapshot;
it('starts parameterless preparation immediately while preserving apply approval',()=>{
 const s=snapshot();s.schemas.input={type:'object',properties:{},required:[],additionalProperties:false};
 s.descriptor.requires_approval=false;expect(canStartImmediately(s)).toBe(true);
 s.descriptor.requires_approval=true;expect(canStartImmediately(s)).toBe(true);
 s.descriptor.requires_approval=false;s.schemas.input.properties={optional:{type:'boolean'}};
 expect(canStartImmediately(s)).toBe(false);
});
it('approves only the current reviewed plan on the exact operation, server and job',()=>{
 const now='2026-10-28T10:00:00Z',expires='2026-10-28T10:05:00Z';
 const item={host_id:'host',job_id:'job',plan_id:'plan',digest:'hash',phase:'awaiting_approval',review:{},plan_expires_at:expires,attention:false,cancel_requested:false} as MaintenanceItem;
 const plan={host_id:'host',job_id:'job',id:'plan',digest:'hash',operation_id:'operation',expires_at:expires} as ReviewedPlan;
 expect(reviewedApproval(item,plan,'operation',now)).toBe(true);
 expect(reviewedApproval(item,null,'operation',now)).toBe(false);
 for(const key of ['host_id','job_id','id','digest','operation_id'] as const)expect(reviewedApproval(item,{...plan,[key]:'other'},'operation',now)).toBe(false);
 expect(reviewedApproval(item,plan,'operation',expires)).toBe(false);
 expect(reviewedApproval(item,{...plan,expires_at:now},'operation',now)).toBe(false);
 for(const patch of [{phase:'approved'},{attention:true},{cancel_requested:true},{digest:'changed'},{plan_id:'new-plan'}])expect(reviewedApproval({...item,...patch} as MaintenanceItem,plan,'operation',now)).toBe(false);
});
it('builds the command solely from supplied row identities, retaining the exact retry key',()=>{
 const s=snapshot(),choice={grant_id:'grant',revision:'3',snapshot:s} as ActionGrantRead['actions'][number];
 const source={content_sha256:'package'} as ActionGrantRead;
 const row={host_id:'row-server',revision:'7',maintenance_jobs:{job:null,actions:[{id:'grant',available:true,reason:null}]}} as ServerRow;
 const selected={...row,host_id:'different-selected-server'};
 const body=actionStartBody('same-request','grant',source,choice,[row],{});
 expect(body.targets).toEqual([{id:row.host_id,revision:'7'}]);
 expect(body.targets.some(t=>t.id===selected.host_id)).toBe(false);
 expect(actionStartBody('same-request','grant',source,choice,[row],{})).toEqual(body);
 row.maintenance_jobs!.actions[0]!.available=false;
 expect(actionStartBody('same-request','grant',source,choice,[row],{}).targets).toEqual([]);
});
it('always exposes running and attention work from the individual menu without offering conflicting execution',()=>{
 const row={host_id:'row',lifecycle:'active',control_supported:true,maintenance_jobs:{job:{operation_id:'saved',id:'job',phase:'applying',attention:false,apply_attempt:'attempt',recovery_pending:false},actions:[]}} as unknown as ServerRow;
 expect(fleetMenuActions([row]).map(i=>i.action)).toContain('view-progress');
 expect(fleetMenuActions([row]).map(i=>i.action)).not.toContain('skill-actions');
 row.maintenance_jobs!.job!.attention=true;row.maintenance_jobs!.job!.phase='failed';
 expect(fleetMenuActions([row])[0]!.action).toBe('view-progress');
 expect(fleetMenuActions([row])[0]!.label).toBe('Verify and unlock');
 expect(fleetMenuActions([row])[0]!.hint).toContain('read-only check');
 expect(fleetMenuActions([row,{...row,host_id:'other'}]).map(i=>i.action)).not.toContain('view-progress');
});

it('preserves older descriptors and requires the extended runtime for an explicit verification policy',()=>{
 const m=structuredClone(metadata) as PackageMetadata;
 expect(actionVerificationSupported(m,undefined)).toBe(true);
 m.actions![0]!.descriptor.verification='local';
 for(const version of [undefined,'0.0.23','garbage'])expect(actionVerificationSupported(m,version)).toBe(false);
 for(const version of ['0.0.24','0.0.25'])expect(actionVerificationSupported(m,version)).toBe(true);
 m.actions![0]!.descriptor.verification='host_health';
 expect(actionVerificationSupported(m,'0.0.23')).toBe(false);
});
