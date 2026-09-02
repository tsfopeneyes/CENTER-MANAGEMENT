import {AuthOperationError} from './loginTransport.js';

export function createMemberAdminTransport({endpoint,publishableKey,auth,fetcher=fetch}){
    const url=new URL(endpoint);if(url.username||url.password||url.search||url.hash||
        (url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))
        throw new Error('Invalid member administration endpoint');
    const request=async input=>{
        const current=await auth.getSession(),token=current?.data?.session?.access_token;
        if(current?.error||!token)throw new AuthOperationError('invalid_login');
        try{const response=await fetcher(url.href,{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
            headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(publishableKey?{apikey:publishableKey}:{})},
            body:JSON.stringify({protocol:1,...input})});
            if(!response.ok)throw new AuthOperationError(({400:'invalid_request',401:'invalid_login',403:'forbidden',409:'account_changed'})[response.status]||'temporarily_unavailable');
            const result=await response.json();if(result?.protocol!==1||!['saved','merged','ok'].includes(result.status))throw new AuthOperationError('temporarily_unavailable');return result;
        }catch(error){if(error instanceof AuthOperationError)throw error;throw new AuthOperationError('temporarily_unavailable');}
    };
    return Object.freeze({
        setRole:({profileId,admin})=>request({action:'set-admin',profileId,admin}),
        merge:({requestId,sourceProfileId,targetProfileId})=>request({action:'merge',requestId,sourceProfileId,targetProfileId}),
        listReviews:()=>request({action:'list-merge-reviews'})
    });
}
