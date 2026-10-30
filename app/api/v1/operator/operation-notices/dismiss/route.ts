import {operatorDismissOperationNotice} from '@/server/http/operation-notice-handlers';
export const runtime='nodejs';
export function POST(request:Request){return operatorDismissOperationNotice(request);}
