import {readdirSync} from 'node:fs';
import {expect,it} from 'vitest';
import {currentMigrations} from '../server/db/ledger';

it('keeps the maintenance ledger synchronized with every shipped migration',()=>{
  const migrations=readdirSync(new URL('../server/db/migrations/',import.meta.url))
    .filter(name=>name.endsWith('.ts')).map(name=>name.slice(0,-3)).sort();
  expect([...currentMigrations]).toEqual(migrations);
});
