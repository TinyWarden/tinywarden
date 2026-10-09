import {operatorMetricHistory} from "@/server/http/metric-handler";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{host:string;id:string;metric:string}>}){
  const {host,id,metric}=await context.params;return operatorMetricHistory(request,host,id,metric);
}
