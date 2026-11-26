import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewConfig} from '../scripts/auth-preview-config.mjs';

test('preview configuration requires an isolated database, trusted host and short expiry',()=>{
 const input={databaseId:'00000000-0000-4000-8000-000000000001',origin:'https://nagara-auth-staging.sintaro-katuta.workers.dev',expiresAt:'1100',now:1000000};
 const result=previewConfig(input);assert.equal(result.name,'nagara-auth-staging');assert.equal(result.d1_databases[0].database_id,input.databaseId);assert.equal(result.vars.PREVIEW_ONLY,'true');assert.equal(result.vars.PASSKEY_ADD_ENABLED,'true');assert.equal(result.vars.ADMIN_BOOTSTRAP_ENABLED,'true');assert.equal(result.vars.ADMIN_RECOVERY_ENABLED,'true');assert.equal(result.r2_buckets,undefined);assert.equal(result.assets.run_worker_first,true);
 for(const override of [{databaseId:'27cb398e-0c26-4740-804d-f6bd49f75764'},{databaseId:'invalid'},{origin:'https://nagara-broadcast.sintaro-katuta.com'},{origin:'https://attacker.workers.dev'},{expiresAt:'1000'},{expiresAt:'999999'}])assert.throws(()=>previewConfig({...input,...override}));
});
