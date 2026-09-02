import {AuthOperationError} from './loginTransport.js';

export function createLoginCandidateTransport({endpoint,publishableKey,fetcher=fetch,timeoutMs=8000}){
    const url=new URL(endpoint);
    if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))||
        !Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw new Error('Invalid candidate endpoint configuration');
    return async(name,{signal}={})=>{
        if(typeof name!=='string'||!name.trim()||name.length>80)throw new AuthOperationError('invalid_request');
        const abort=new AbortController(),cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();const timer=setTimeout(cancel,timeoutMs);
        try{const response=await fetcher(url.href,{method:'POST',signal:abort.signal,redirect:'error',cache:'no-store',credentials:'omit',
            headers:{'Content-Type':'application/json',...(publishableKey?{apikey:publishableKey}:{})},body:JSON.stringify({protocol:1,name})});
            if(!response.ok)throw new AuthOperationError(response.status===429?'try_later':response.status===400?'invalid_request':'temporarily_unavailable');
            const result=await response.json();if(result?.protocol!==1||result.status!=='ok'||!Array.isArray(result.candidates)||result.candidates.length>20)
                throw new AuthOperationError('temporarily_unavailable');
            const valid=result.candidates.every(item=>item&&typeof item==='object'&&typeof item.profileId==='string'&&
                /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item.profileId)&&typeof item.name==='string'&&item.name.length<=80&&
                (item.school===null||typeof item.school==='string')&&(item.userGroup===null||typeof item.userGroup==='string'));
            if(!valid)throw new AuthOperationError('temporarily_unavailable');return result.candidates;
        }catch(error){if(error instanceof AuthOperationError)throw error;throw new AuthOperationError(abort.signal.aborted?'cancelled':'temporarily_unavailable');}
        finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    };
}
