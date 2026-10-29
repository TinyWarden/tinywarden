import {agentActionLogs} from '@/server/http/action-log-handlers';
export const runtime='nodejs';
export function POST(request:Request){return agentActionLogs(request);}
