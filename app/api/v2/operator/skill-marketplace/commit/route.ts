import {marketplaceCommit} from "@/server/http/skill-repository-handlers";
export const runtime="nodejs";
export function POST(r:Request){return marketplaceCommit(r);}
