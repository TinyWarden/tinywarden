import {repositoryList,repositoryAdd} from "@/server/http/skill-repository-handlers";
export const runtime="nodejs";
export function GET(r:Request){return repositoryList(r);}
export function POST(r:Request){return repositoryAdd(r);}
