import {operatorRetention} from '@/server/http/retention-handlers';
export const runtime='nodejs';
export const GET=(request:Request)=>operatorRetention(request);
export const POST=(request:Request)=>operatorRetention(request);
