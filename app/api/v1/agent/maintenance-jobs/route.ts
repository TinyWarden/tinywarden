import {agentMaintenanceJobs} from '@/server/http/maintenance-handlers';
export const runtime='nodejs';
export function POST(request:Request){return agentMaintenanceJobs(request);}
