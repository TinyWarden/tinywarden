import {parseCredential} from "../validation";
export function setupCode(origin:string,token:string){
  const url=new URL(origin);if(url.protocol!=="https:"||url.origin!==origin||url.username||url.password||origin.length>1024)throw new Error("invalid_origin");
  parseCredential("enrollment",token);
  return "tw_setup_v1."+Buffer.from(JSON.stringify({origin,token}),"utf8").toString("base64url");
}
