import {marketplaceCancel} from "@/server/http/skill-repository-handlers";
export const runtime="nodejs";
export function POST(r:Request){return marketplaceCancel(r);}
