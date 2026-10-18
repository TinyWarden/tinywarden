import {operatorResources} from "@/server/http/resource-handlers";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{host:string;id:string;collection:string}>}){const {host,id,collection}=await params;return operatorResources(request,host,id,collection);}
