import {AuthOperationError} from './loginTransport.js';

// Produces the same profile object consumed by the current dashboard while all
// credential checks and profile reads stay behind the protected account API.
// This adapter is intentionally not mounted until the operational preflight
// enables the new server and database roles together.
export function createAccountLoginAdapter({client,auth}){
    if(!client?.candidates||!client?.login?.login)
        throw new Error('Complete account login dependencies required');
    return Object.freeze({
        async candidates(name,options){
            const started=performance.now();
            const rows=await client.candidates(name,options);
            console.info('[account-auth-timing]',JSON.stringify({stage:'candidates',duration:Math.round(performance.now()-started)}));
            return rows.map(item=>({id:item.profileId,name:item.name,school:item.school,user_group:item.userGroup}));
        },
        async login({profileId,name,password},options){
            const identity=await client.login.login(profileId?{profileId,password}:{name,password},options);
            if(identity.profile?.id!==identity.profileId)throw new AuthOperationError('account_changed');
            return identity.profile;
        }
    });
}
