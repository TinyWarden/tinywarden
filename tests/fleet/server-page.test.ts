import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createElement,type ComponentProps,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ServerClient} from '../../app/fleet/[id]/_components/server-client';
import type {PackageResults} from '../../components/skills/package-model';

const reads=vi.hoisted(()=>({paths:[] as string[],skills:[] as Record<string,unknown>[],failed:false,
  poll:null as null|((value:unknown)=>number)}));
const at='2026-10-25T21:00:00.000Z',id='00000000-0000-4000-8000-000000000001';
const initial={schema_version:1,as_of:at,host:{host_id:id,label:'Example server',lifecycle:'active',
  contact_state:'current',last_contact_at:at,stale_at:null,os_id:'debian',os_version:'13',architecture:'amd64',
  reported_hostname:'example',agent_version:'0.0.23',heartbeat_interval_seconds:60}} as unknown as ComponentProps<typeof ServerClient>['initial'];
vi.mock('@/components/operator/session-provider',()=>({useOperatorSession:()=>({role:'user'})}));
vi.mock('@/components/operator/agent-maintenance',()=>({AgentSettingsButton:()=>null}));
vi.mock('@/components/operator/shell',()=>({OperatorShell:({children}:{children:ReactNode})=>children,ReadNotice:()=>null}));
vi.mock('../../app/fleet/[id]/_components/package-card',()=>({PackageCard:({skill,outdated,controlsOutdated}:{skill:PackageResults['skills'][number];outdated:boolean;controlsOutdated:boolean})=>
  createElement('section',{id:skill.key,'data-package-card':true,'data-outdated':outdated,'data-controls-outdated':controlsOutdated},skill.name)}));
vi.mock('@/components/operator/use-operator-read',()=>({useOperatorRead:(path:string,_validate:unknown,poll:unknown)=>{
  reads.paths.push(path);
  if(path===`/api/v1/operator/hosts/${id}`)return {value:initial,failed:false,expired:false,receivedAt:0,requestDuration:0};
  if(path===`/api/v2/operator/hosts/${id}/skills?include_readings=false`){
    reads.poll=poll as typeof reads.poll;
    return {value:{schema_version:1,host_id:id,as_of:at,skills:reads.skills,readings:[],catalogs:[]},
      failed:reads.failed,expired:false,receivedAt:0,requestDuration:0,reload:async()=>true};
  }
  throw new Error(`Unexpected server-page read: ${path}`);
}}));
const names=['Disk space','Trim status','Updates','Reboot status','Services'];
const keys=['disk-local','fstrim-status','package-updates','reboot-required','services'];
function skill(key:string,name:string,state='healthy'){return {key,name,state,installation_id:key,valid_until:null,manual_run:{latest:null}};}
function render(){return renderToStaticMarkup(createElement(ServerClient,{initial}));}

describe('server page package composition',()=>{
 beforeEach(()=>{reads.paths=[];reads.failed=false;reads.poll=null;reads.skills=keys.map((key,i)=>skill(`tinywarden/${key}`,names[i]!));});
 it('renders exactly the five canonical packages and uses them for summary and navigation',()=>{
  reads.skills[1]!.state='warning';reads.skills[2]!.state='disabled';reads.skills[3]!.state='unknown';reads.skills[4]!.state='not_configured';
  const html=render();
  expect(html.match(/data-package-card="true"/g)).toHaveLength(5);
  expect(html).toContain('5 skills · 1 healthy · 2 need attention · 1 disabled');
  for(const key of keys){expect(html).toContain(`id="tinywarden/${key}"`);expect(html).not.toContain(`id="${key}"`);expect(html).toContain(`href="#tinywarden/${key}"`);}
  expect(reads.paths).toEqual([`/api/v1/operator/hosts/${id}`,`/api/v2/operator/hosts/${id}/skills?include_readings=false`]);
 });
 it('includes an unfamiliar canonical package without a registry or fallback',()=>{
  reads.skills.push(skill('example/database-replication','Database replication'));
  const html=render();expect(html.match(/data-package-card="true"/g)).toHaveLength(6);
  expect(html).toContain('6 skills · 6 healthy');expect(html).toContain('id="example/database-replication"');
 });
 it('renders an empty installation list without manufacturing built-in checks',()=>{
  reads.skills=[];const html=render();expect(html).not.toContain('data-package-card');
  expect(html).toContain('0 skills · 0 healthy · 0 need attention · 0 disabled');expect(html).toContain('No skills are installed.');
 });
 it('preserves expired evidence and failed-control handling without changing disabled skills',()=>{
  reads.skills=[skill('example/current','Current'),{...skill('example/expired','Expired'),valid_until:'2026-10-25T20:59:59.000Z'},skill('example/off','Off','disabled')];
  const html=render();expect(html).toContain('3 skills · 1 healthy · 1 need attention · 1 disabled');
  expect(html).toContain('id="example/expired" data-package-card="true" data-outdated="true"');
  reads.failed=true;expect(render()).toContain('3 skills · 0 healthy · 2 need attention · 1 disabled');
 });
 it('retains faster polling while a manual collection is queued or running',()=>{
  render();expect(reads.poll!({skills:reads.skills})).toBe(30000);
  for(const phase of ['queued','running'])expect(reads.poll!({skills:[{manual_run:{latest:{phase}}}]})).toBe(2000);
 });
});
