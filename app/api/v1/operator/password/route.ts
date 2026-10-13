import {operatorPassword} from "@/server/http/access-handlers";
export const runtime="nodejs";
export function POST(r:Request){return operatorPassword(r);}
