import {agentMaintenancePackage} from '@/server/http/maintenance-handlers';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 return agentMaintenancePackage(request,(await params).id);
}
