import {randomUUID} from 'node:crypto';
import type {lifecycleFixture} from '../p4a.fixture';
import metadataFixture from '../fixtures/action-package-v3-metadata.json';
import signed from '../fixtures/remote-update-releases.json';
import type {PackageMetadata} from '../../lib/skills/package-types';
import type {PlatformObservation} from '../../lib/agent-updates';
import {verifyRelease} from '../../server/agent-updates/release';
import {jsonValue} from '../../server/db/json';
import {setActionGrant} from '../../server/maintenance/action-grants';
import {agentMaintenance} from '../../server/maintenance/agent';
export type AwaitedLifecycle=Awaited<ReturnType<typeof lifecycleFixture>>;

/** Already-admitted SDK fixture for DB authority tests; not extension acceptance. */
export async function actionFixture(f:AwaitedLifecycle,admitted:PackageMetadata=metadataFixture as PackageMetadata){
 const metadata=structuredClone(admitted),installation=randomUUID(),originId=randomUUID();
 const repository=await f.db.selectFrom('skill_repositories').selectAll().executeTakeFirstOrThrow();
 const operator=await f.db.selectFrom('operators').select('id').executeTakeFirstOrThrow();
 await f.db.insertInto('skill_packages').values({content_sha256:metadata.content_sha256,skill_id:metadata.manifest.id,version:metadata.manifest.version,
  metadata,unpacked_bytes:metadata.size,official:false,imported_at:f.clock()}).execute();
 await f.db.insertInto('skill_installations').values({id:installation,skill_id:metadata.manifest.id,subject_key:metadata.manifest.id,
  content_sha256:metadata.content_sha256,enabled:true,enablement_version:'1',settings_revision:'1',defaults:metadata.manifest.defaults,
  grants:jsonValue(metadata.manifest.capabilities),created_at:f.clock(),updated_at:f.clock()}).execute();
 const origin={repository_id:repository.id,github_id:repository.github_id,owner_id:repository.owner_id,name:repository.name,
  commit_sha:'b'.repeat(40),catalogue_sha256:'c'.repeat(64),release_id:'123',asset_id:'456',archive_sha256:metadata.archive!.sha256,archive_size:metadata.archive!.size,verified_at:f.clock().toISOString()};
 await f.db.insertInto('skill_package_origins').values({id:originId,content_sha256:metadata.content_sha256,origin}).execute();
 await f.db.insertInto('skill_installation_sources').values({installation_id:installation,kind:'repository',repository_id:repository.id,origin_id:originId,revision:'1'}).execute();
 await f.db.insertInto('skill_settings_revisions').values({installation_id:installation,revision:'1',content_sha256:metadata.content_sha256,settings:metadata.manifest.defaults,operator_id:operator.id,created_at:f.clock()}).execute();
 const release=signed.releases[0]!,manifest=verifyRelease(Buffer.from(release.manifest),release.signature);
 await f.db.updateTable('hosts').set({os_id:'debian',os_version:'13',architecture:'amd64'}).where('id','=',f.hostId).execute();
 await f.db.insertInto('agent_release_catalog').values({version:release.version,manifest:release.manifest,signature:release.signature,metadata:manifest,verified_at:f.clock()}).execute();
 await f.db.updateTable('agent_release_catalog_state').set({checked_at:f.clock(),verified_at:f.clock(),error:null}).execute();
 const observation:PlatformObservation={version:manifest.version,installed_version:manifest.version,managed:true,remote_updates:true,local_automatic:false,
  binary_sha256:manifest.binary_sha256,runtime_sha256:manifest.runtime_sha256,descriptor_sha256:manifest.descriptor_sha256,updater:{outcome:'idle'},
  maintenance:{capability:'skill_actions.v1',worker_ready:true,actions:[]}};
 await f.db.insertInto('agent_platform_reports').values({agent_id:f.agentId,generation:1,sequence:1,observed_at:f.clock(),received_at:f.clock(),observation}).execute();
 return {metadata,installation,origin,descriptor:metadata.actions![0]!};
}
export async function readyActionFixture(f:AwaitedLifecycle,source:Awaited<ReturnType<typeof actionFixture>>){
 const approved=await setActionGrant(f.db,f.session,source.installation,{request_id:randomUUID(),content_sha256:source.metadata.content_sha256,
  action_id:source.descriptor.descriptor.id,descriptor_sha256:source.descriptor.descriptor_sha256,expected_revision:'0',enabled:true},f.clock) as {grant_id:string;revision:string};
 const idle={schema_version:2,host_id:f.hostId,agent_id:f.agentId,generation:1,job_id:null,sequence:0,kind:'poll',data:{probe_cursor:null,worker_ready:true,origins:[],readiness:[]}};
 const probe=(await agentMaintenance(f.db,f.agentCredential,idle,f.clock)).probes![0]!;
 const ready={...idle,data:{...idle.data,origins:[{...probe.origin,classes:[probe.execution_class]}],readiness:[{
  grant_id:probe.grant_id,installation_id:probe.installation_id,content_sha256:probe.content_sha256,descriptor_sha256:probe.descriptor_sha256,id:probe.id,revision:probe.revision,ready:true,reason:null,missing:[]}]}};
 await agentMaintenance(f.db,f.agentCredential,ready,f.clock);
 return {approved,probe,ready,input:{request_id:randomUUID(),grant_id:approved.grant_id,content_sha256:probe.content_sha256,
  descriptor_sha256:probe.descriptor_sha256,permission_revision:approved.revision,input_json:'{"complete":true}',targets:[{id:f.hostId,revision:'1'}]}};
}
