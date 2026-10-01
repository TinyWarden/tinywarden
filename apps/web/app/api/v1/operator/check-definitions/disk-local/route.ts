import { operatorDiskDefinition, operatorUpdateDiskDefinition } from "../../../../../../server/http/handlers";

export async function GET(request: Request): Promise<Response> { return operatorDiskDefinition(request); }
export async function POST(request: Request): Promise<Response> { return operatorUpdateDiskDefinition(request); }
