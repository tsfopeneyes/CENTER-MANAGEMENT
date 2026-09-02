import assert from 'node:assert/strict';
import {resolveAccountAuthRoute} from '../supabase/functions/_shared/accountAuthService.mjs';

for(const [path,base,expected] of [
    ['/login','','login'],['/session','','session'],['/credentials','','credentials'],
    ['/health','','health'],
    ['/account-auth/health','/account-auth','health'],
    ['/account-auth/login','/account-auth','login'],
    ['/functions/v1/account-auth/login','/functions/v1/account-auth','login'],
    ['/functions/v1/account-auth/session','/functions/v1/account-auth','session'],
    ['/functions/v1/account-auth/credentials','/functions/v1/account-auth','credentials'],
    ['/functions/v1/account-auth/profile','/functions/v1/account-auth','profile'],
    ['/functions/v1/account-auth/register','/functions/v1/account-auth','register'],
    ['/functions/v1/account-auth/uploads','/functions/v1/account-auth','uploads'],
    ['/functions/v1/account-auth/members','/functions/v1/account-auth','members'],
    ['/functions/v1/account-auth/health','/functions/v1/account-auth','health'],
    ['/functions/v1/other/login','/functions/v1/account-auth',null],['/login/extra','',null]
])assert.equal(resolveAccountAuthRoute(path,base),expected);
for(const base of ['account-auth','/bad/','/bad?x','/bad#x'])assert.throws(()=>resolveAccountAuthRoute('/login',base));
console.log('PASS account-auth routing: exact local and deployed base paths, no suffix or sibling-route confusion');
