import {operatorRetentionPreview} from '@/server/http/retention-handlers';
export const runtime='nodejs';
export const POST=(request:Request)=>operatorRetentionPreview(request);
