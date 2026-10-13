import {repositoryRefresh} from "@/server/http/skill-repository-handlers";
export const runtime="nodejs";
export async function POST(r:Request,{params}:{params:Promise<{id:string}>}){return repositoryRefresh(r,(await params).id);}
