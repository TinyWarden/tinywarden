import {operatorMaintenanceApproval} from '@/server/http/maintenance-handlers';
export const runtime='nodejs';
export function POST(request:Request){return operatorMaintenanceApproval(request);}
