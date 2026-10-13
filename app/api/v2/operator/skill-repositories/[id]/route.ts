import {repositoryChange} from "@/server/http/skill-repository-handlers";
export const runtime="nodejs";
export async function POST(r:Request,{params}:{params:Promise<{id:string}>}){return repositoryChange(r,(await params).id);}
