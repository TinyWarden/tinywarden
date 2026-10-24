import {operatorMaintenancePlan} from '@/server/http/maintenance-handlers';
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string;plan:string}>}){const {id,plan}=await context.params;return operatorMaintenancePlan(request,id,plan);}
