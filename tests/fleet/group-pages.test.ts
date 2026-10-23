import {afterEach,describe,expect,it,vi} from "vitest";
import {cursorReader} from "@/components/operator/cursor-pages";
import {resetAuthority} from "@/components/operator/authority";
type View={access:{account_id:string;revision:string};groups:{id:string}[];next_cursor:string|null};
const valid=(v:unknown):v is View=>!!v&&typeof v==='object'&&'groups' in v&&Array.isArray(v.groups)&&'next_cursor' in v&&(v.next_cursor===null||typeof v.next_cursor==='string');
const read=cursorReader<View>('groups',valid),access={account_id:'synthetic-admin',revision:'1'};
const response=(ids:string[],next_cursor:string|null=null,authority=access)=>Response.json({access:authority,groups:ids.map(id=>({id})),next_cursor});
afterEach(()=>{vi.unstubAllGlobals();resetAuthority();});
describe('complete Fleet group list',()=>{
 it('loads groups beyond the first50 without changing the scoped query',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response(Array.from({length:50},(_,n)=>String(n)),'next-page')).mockResolvedValueOnce(response(['50']));
  vi.stubGlobal('fetch',fetch);
  const value=await read('/api/v1/operator/fleet-groups?q=',new AbortController().signal,vi.fn());
  expect(value.groups).toHaveLength(51);expect(value.groups.at(-1)?.id).toBe('50');
  expect(fetch.mock.calls[1]?.[0]).toBe('/api/v1/operator/fleet-groups?q=&cursor=next-page');
  expect(fetch.mock.calls.every(c=>c[1].credentials==='same-origin'&&c[1].cache==='no-store')).toBe(true);
 });
 it('rejects partial lists after a failed page or duplicate row',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response(['a'],'next')).mockResolvedValueOnce(Response.json({error:{code:'unavailable'}},{status:503}));vi.stubGlobal('fetch',fetch);
  await expect(read('/groups',new AbortController().signal,vi.fn())).rejects.toThrow('operator_read_unavailable');
  fetch.mockResolvedValueOnce(response(['a'],'next')).mockResolvedValueOnce(response(['a']));
  await expect(read('/groups',new AbortController().signal,vi.fn())).rejects.toThrow('operator_read_invalid');
 });
 it('rejects repeated cursors rather than cycling forever',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(['a'],'same')).mockResolvedValueOnce(response(['b'],'same')));
  await expect(read('/groups',new AbortController().signal,vi.fn())).rejects.toThrow('operator_read_invalid');
 });
 it('never combines data across authorization revisions or accounts',async()=>{
  vi.stubGlobal('document',new EventTarget());
  const fetch=vi.fn().mockResolvedValueOnce(response(['a'],'next')).mockResolvedValueOnce(response(['b'],null,{...access,revision:'2'}));vi.stubGlobal('fetch',fetch);
  await expect(read('/groups',new AbortController().signal,vi.fn())).rejects.toThrow('obsolete_access');
  resetAuthority();fetch.mockResolvedValueOnce(response(['a'],'next')).mockResolvedValueOnce(response(['b'],null,{...access,account_id:'other'}));
  await expect(read('/groups',new AbortController().signal,vi.fn())).rejects.toThrow('account_changed');
 });
 it('propagates revoked access and cancellation without returning earlier rows',async()=>{
  const unauthorized=vi.fn(),fetch=vi.fn().mockResolvedValueOnce(response(['a'],'next')).mockResolvedValueOnce(new Response(null,{status:401}));vi.stubGlobal('fetch',fetch);
  await expect(read('/groups',new AbortController().signal,unauthorized)).rejects.toThrow('permission_lost');expect(unauthorized).toHaveBeenCalledOnce();
  fetch.mockResolvedValueOnce(response(['a'],'next')).mockRejectedValueOnce(new DOMException('Aborted','AbortError'));
  await expect(read('/groups',new AbortController().signal,vi.fn())).rejects.toThrow('Aborted');
 });
});
