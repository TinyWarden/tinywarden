import {operatorRevokeRecovery} from '@/server/http/maintenance-recovery-handlers';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 return operatorRevokeRecovery(request,(await params).id);
}
