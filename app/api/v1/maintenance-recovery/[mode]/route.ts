import {maintenanceRecoveryReceipt} from '@/server/http/maintenance-recovery-handlers';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{mode:string}>}){
 return maintenanceRecoveryReceipt(request,(await params).mode);
}
