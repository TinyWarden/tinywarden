import {createHash} from "node:crypto";
import {describe,it,expect} from "vitest";
import {GithubClient} from "../../../server/skills/repositories/github";
import {catalogue,repositoryUrl,type CatalogueEntry} from "../../../lib/skills/repositories";
const entry:CatalogueEntry={id:"acme/monitor",version:"1.0.0",name:"Monitor",description:"Reads a metric.",content_sha256:"a".repeat(64),archive:{tag:"monitor-v1.0.0",asset:"monitor.zip",size:4,sha256:createHash("sha256").update("data").digest("hex")}};
function json(v:unknown){return new Response(JSON.stringify(v),{status:200});}
describe("repository trust and bounded transport",()=>{
  it("accepts only a complete supported URL and closed catalogue",()=>{
    expect(repositoryUrl("https://github.com/Acme/skills.git/")).toBe("Acme/skills");
    for(const u of ["http://github.com/Acme/skills","https://github.com.evil.test/Acme/skills","https://user@github.com/Acme/skills","https://github.com/Acme/skills/tree/main","https://github.com/Acme/skills?ref=evil","https://github.com/Acme%2fother/skills"])
      expect(()=>repositoryUrl(u)).toThrow();
    expect(catalogue({format:1,skills:[entry]}).skills).toHaveLength(1);
    for(const v of [{format:1,skills:[entry,entry]},{format:1,skills:[{...entry,html:"evil"}]},{format:1,skills:[{...entry,archive:{...entry.archive,asset:"../x.zip"}}]}])expect(()=>catalogue(v)).toThrow();
  });
  it("pins both repository and owner, including redirected metadata",async()=>{
    const client=new GithubClient(async()=>json({id:123,owner:{id:99},full_name:"Other/skills",default_branch:"main",private:false}));
    await expect(client.catalogue("Acme/skills",{id:"123",ownerId:"42"})).rejects.toMatchObject({code:"repository_identity_changed"});
    const spoof=new GithubClient(async()=>new Response(null,{status:302,headers:{location:"https://evil.test/repos/Acme/skills"}}));
    await expect(spoof.resolve("Acme/skills")).rejects.toMatchObject({code:"repository_invalid"});
  });
  it("reads only a regular exact Git blob and rejects symlinks",async()=>{
    const raw=Buffer.from(JSON.stringify({format:1,skills:[entry]})),sha=createHash("sha1").update(`blob ${raw.length}\0`).update(raw).digest("hex");
    let mode="100644";
    const client=new GithubClient(async url=>{
      const p=new URL(String(url)).pathname;
      if(p.endsWith("/commits/main"))return json({sha:"a".repeat(40),commit:{tree:{sha:"b".repeat(40)}}});
      if(p.includes("/git/trees/"))return json({truncated:false,tree:[{path:"SKILLS.json",mode,type:"blob",sha}]});
      if(p.includes("/git/blobs/"))return json({encoding:"base64",size:raw.length,content:raw.toString("base64")});
      return json({id:123,owner:{id:42},full_name:"Acme/skills",default_branch:"main",private:false});
    });
    expect((await client.catalogue("Acme/skills",{id:"123",ownerId:"42"})).catalogue.skills[0]).toEqual(entry);
    mode="120000";await expect(client.catalogue("Acme/skills",{id:"123",ownerId:"42"})).rejects.toMatchObject({code:"catalogue_invalid"});
  });
  it("requires a same-repo release asset, verifies bytes and blocks foreign redirects",async()=>{
    let bad=false,draft=false;const seen:string[]=[];
    const client=new GithubClient(async url=>{
      const p=new URL(String(url)).pathname;seen.push(p);
      if(p.includes("/releases/tags/"))return json({id:10,draft,prerelease:false,tag_name:entry.archive.tag,assets:[{id:11,name:entry.archive.asset,state:"uploaded",size:4,browser_download_url:"https://evil.test/x"}]});
      if(p.endsWith("/releases/assets/11"))return bad?new Response(null,{status:302,headers:{location:"https://evil.test/x"}}):new Response("data");
      return json({id:123,owner:{id:42},full_name:"Acme/skills",default_branch:"main",private:false});
    });
    expect((await client.archive("Acme/skills",{id:"123",ownerId:"42"},entry)).bytes.toString()).toBe("data");expect(seen).toContain("/repos/Acme/skills/releases/assets/11");
    await expect(client.archive("Acme/skills",{id:"123",ownerId:"42"},{...entry,archive:{...entry.archive,sha256:"f".repeat(64)}})).rejects.toMatchObject({code:"archive_mismatch"});
    bad=true;await expect(client.archive("Acme/skills",{id:"123",ownerId:"42"},entry)).rejects.toMatchObject({code:"repository_invalid"});
    draft=true;await expect(client.archive("Acme/skills",{id:"123",ownerId:"42"},entry)).rejects.toMatchObject({code:"release_invalid"});
  });
  it("bounds decoded data and surfaces rate-limit retry time",async()=>{
    const big=new GithubClient(async()=>new Response("x".repeat(2*1024*1024+1)));
    await expect(big.resolve("Acme/skills")).rejects.toMatchObject({code:"repository_too_large"});
    const limit=new GithubClient(async()=>new Response(null,{status:429,headers:{"retry-after":"60"}}));
    await expect(limit.resolve("Acme/skills")).rejects.toMatchObject({code:"repository_rate_limited",retryAt:expect.any(Date)});
  });
});
