import {marketplaceRead} from "@/server/http/skill-repository-handlers";
export const runtime="nodejs";
export function GET(r:Request){return marketplaceRead(r);}
