import { agentMonitoringControl } from '@/server/http/fleet-control';
export const runtime='nodejs';
export const POST=(request:Request)=>agentMonitoringControl(request);
