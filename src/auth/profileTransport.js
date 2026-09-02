import {AuthOperationError} from './loginTransport.js';

export function createProfileTransport({endpoint,publishableKey,fetcher=fetch,timeoutMs=10000}){
    const url=new URL(endpoint);
    if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))||
        !Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw new Error('Invalid profile endpoint configuration');
    return async(input,{accessToken,signal}={})=>{
        if(typeof accessToken!=='string'||!accessToken||accessToken.length>8192)throw new AuthOperationError('invalid_login');
        const abort=new AbortController(),cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
        const timer=setTimeout(cancel,timeoutMs);
        try{
            const response=await fetcher(url.href,{method:'POST',signal:abort.signal,redirect:'error',cache:'no-store',credentials:'omit',headers:{
                'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`,...(publishableKey?{apikey:publishableKey}:{})},body:JSON.stringify(input)});
            if(!response.ok){const codes={400:'invalid_request',401:'invalid_login',403:'forbidden',409:'account_changed'};throw new AuthOperationError(codes[response.status]||'temporarily_unavailable');}
            const result=await response.json();
            if(result?.protocol!==1||!['ok','saved'].includes(result.status))throw new AuthOperationError('temporarily_unavailable');
            return result;
        }catch(error){if(error instanceof AuthOperationError)throw error;throw new AuthOperationError(abort.signal.aborted?'cancelled':'temporarily_unavailable');}
        finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    };
}
