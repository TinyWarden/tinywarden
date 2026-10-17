import {createDb} from '../server/db/client';
import {parseDatabaseUrl,parseOrigin} from '../server/config';
import {accountMailSettings} from '../server/account-email/config';
import {accountSmtpSender,runAccountEmails} from '../server/account-email/worker';
import messages from '../messages/en.json';
async function main(){
 const [flag,expected,extra]=process.argv.slice(2);if(flag!=='--expected-database'||!expected||extra||! /^[a-zA-Z0-9_]+$/.test(expected))throw new Error('usage');
 const url=parseDatabaseUrl(process.env.DATABASE_URL,'tinywarden');if(new URL(url).pathname!==`/${expected}`)throw new Error('wrong_database');
 const settings=accountMailSettings(process.env);if(!settings){console.log(JSON.stringify({outcome:'disabled'}));return;}
 const origin=parseOrigin(process.env.PUBLIC_ORIGIN),db=createDb(url);try{console.log(JSON.stringify(await runAccountEmails(db,expected,origin,accountSmtpSender(settings,origin))));}finally{await db.destroy();}
}
main().catch(()=>{console.error(messages.accountEmail.workerFailed);process.exitCode=1;});
