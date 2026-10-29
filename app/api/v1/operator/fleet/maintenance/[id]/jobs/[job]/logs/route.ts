import {operatorActionLogs} from '@/server/http/action-log-handlers';
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string;job:string}>}){
 const {id,job}=await context.params;return operatorActionLogs(request,id,job);
}
