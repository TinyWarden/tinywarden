import {operatorMaintenance} from '@/server/http/maintenance-handlers';
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return operatorMaintenance(request,(await context.params).id);}
