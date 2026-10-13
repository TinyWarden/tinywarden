import {operatorAccess} from "@/server/http/access-handlers";
export const runtime="nodejs";
export function GET(r:Request){return operatorAccess(r,"users");}
export function POST(r:Request){return operatorAccess(r,"users");}
