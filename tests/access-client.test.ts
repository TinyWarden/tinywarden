import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {consumeAuthority,resetAuthority,accessChangedEvent} from "../components/operator/authority";
import {readOperatorPages} from "../components/operator/package-pages";
const id='00000000-0000-4000-8000-000000000001',authority=(revision:string,account_id=id)=>({access:{account_id,revision}});
beforeEach(()=>{resetAuthority();vi.stubGlobal('window',{location:{origin:'https://example.test'}});vi.stubGlobal('document',new EventTarget());});
afterEach(()=>{resetAuthority();vi.unstubAllGlobals();});
it('rejects old responses, clears different accounts and announces a changed scope',()=>{
 const changed=vi.fn(),lost=vi.fn();document.addEventListener(accessChangedEvent,changed);document.addEventListener('tinywarden:permission-lost',lost);
 consumeAuthority(authority('3'));consumeAuthority(authority('4'));expect(changed).toHaveBeenCalledTimes(1);
 expect(()=>consumeAuthority(authority('3'))).toThrow('obsolete_access');expect(()=>consumeAuthority(authority('4','00000000-0000-4000-8000-000000000002'))).toThrow('account_changed');expect(lost).toHaveBeenCalledTimes(1);
 expect(()=>consumeAuthority({})).toThrow('missing_access_authority');
});
it('never assembles a paginated reading across a permission revision',async()=>{
 let page=0;vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({...authority(page?'2':'1'),skills:[{id:String(page)}],next_page:page++?null:1}))));
 await expect(readOperatorPages('/api/v2/operator/skills',new AbortController().signal,()=>{})).rejects.toThrow('obsolete_access');
});
