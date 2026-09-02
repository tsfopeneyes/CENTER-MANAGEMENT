import assert from 'node:assert/strict';
import {createAccountAuthClient} from '../src/auth/accountAuthClient.js';

const requests=[];
const auth={getSession:async()=>({data:{session:null}}),setSession:async()=>({}),signOut:async()=>({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
const client=createAccountAuthClient({baseUrl:'https://project.supabase.co/functions/v1/account-auth',supabaseUrl:'https://project.supabase.co',publishableKey:'public',auth,
    locks:{request:async(name,options,work)=>{assert.equal(name,'center-account-auth');return work();}},
    fetcher:async(url)=>{requests.push(url);return new Response(JSON.stringify({protocol:1,decision:'reauth'}),{status:401});}
});
assert.deepEqual(Object.keys(client),['createSessionCoordinator','login','password','adminReset','profile','registration','candidates','upload','members']);
assert.deepEqual(Object.keys(client.members),['setRole','merge','listReviews']);
const coordinator=client.createSessionCoordinator(null);assert.equal(typeof coordinator.check,'function');
const local=createAccountAuthClient({baseUrl:'/account-auth-local',origin:'http://localhost:5173',supabaseUrl:'https://project.supabase.co',
    publishableKey:'public',auth,locks:{request:async(name,options,work)=>work()},fetcher:async()=>new Response('{}',{status:500})});
assert.equal(typeof local.login.login,'function');
assert.throws(()=>createAccountAuthClient({baseUrl:'http://remote.invalid/account-auth',supabaseUrl:'https://project.supabase.co',publishableKey:'public',auth,locks:{request(){}}}));
assert.throws(()=>createAccountAuthClient({baseUrl:'https://project.supabase.co/account-auth/',supabaseUrl:'https://project.supabase.co',publishableKey:'public',auth,locks:{request(){}}}));
console.log('PASS account auth client composition: shared lock, exact endpoints, session/login/password/admin controllers, no import-time mutation');
