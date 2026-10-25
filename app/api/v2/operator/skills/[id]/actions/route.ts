import {operatorSkillActionGrants} from '@/server/http/skill-action-handlers';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return operatorSkillActionGrants(request,(await params).id);}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return operatorSkillActionGrants(request,(await params).id);}
