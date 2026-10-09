import {operatorCollectionHistory} from "@/server/http/reading-handler";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{host:string;id:string}>}) {
  const {host,id}=await params;return operatorCollectionHistory(request,host,id);
}
