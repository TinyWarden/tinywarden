import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,symlinkSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('phase verification refuses a shared dependency symlink before running npm',()=>{
 const root=mkdtempSync(join(tmpdir(),'tw-verify-shared-'));
 try{
  mkdirSync(join(root,'scripts'));mkdirSync(join(root,'shared'));
  copyFileSync(new URL('./verify.sh',import.meta.url),join(root,'scripts/verify.sh'));
  writeFileSync(join(root,'shared/keep'),'untouched');symlinkSync(join(root,'shared'),join(root,'node_modules'));
  const run=spawnSync('bash',[join(root,'scripts/verify.sh'),'--phase-end'],{encoding:'utf8'});
  assert.equal(run.status,1);assert.match(run.stderr,/Refusing to reinstall shared dependencies/);
  assert.equal(readFileSync(join(root,'shared/keep'),'utf8'),'untouched');
 }finally{rmSync(root,{recursive:true,force:true});}
});
