import {marketplacePreparation} from "@/server/http/skill-repository-handlers";
export const runtime="nodejs";
export async function GET(r:Request,{params}:{params:Promise<{id:string}>}){return marketplacePreparation(r,(await params).id);}
