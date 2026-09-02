import {AuthOperationError} from './loginTransport.js';

export function createRegistrationTransport({endpoint,publishableKey,fetcher=fetch,timeoutMs=20000}){
    const url=new URL(endpoint);
    if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))||
        !Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw new Error('Invalid registration endpoint configuration');
    return async(input,{signal}={})=>{
        const abort=new AbortController(),cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();const timer=setTimeout(cancel,timeoutMs);
        try{
            const response=await fetcher(url.href,{method:'POST',signal:abort.signal,redirect:'error',cache:'no-store',credentials:'omit',
                headers:{'Content-Type':'application/json',...(publishableKey?{apikey:publishableKey}:{})},body:JSON.stringify(input)});
            if(!response.ok){const codes={400:'invalid_request',409:'registration_pending',429:'try_later'};let serverCode;
                try{serverCode=(await response.json())?.error;}catch{/* status fallback */}
                const allowed=new Set(['invalid_request','invalid_registration','terms_changed','password_policy','registration_review_required','registration_pending','try_later']);
                throw new AuthOperationError(allowed.has(serverCode)?serverCode:(codes[response.status]||'temporarily_unavailable'));}
            const result=await response.json();if(result?.protocol!==1||result.status!=='registered')throw new AuthOperationError('temporarily_unavailable');return result;
        }catch(error){if(error instanceof AuthOperationError)throw error;throw new AuthOperationError(abort.signal.aborted?'cancelled':'temporarily_unavailable');}
        finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    };
}
