import {operatorMaintenance} from '@/server/http/maintenance-handlers';
export const runtime='nodejs';
export function POST(request:Request){return operatorMaintenance(request);}
