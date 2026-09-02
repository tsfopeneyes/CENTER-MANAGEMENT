import {AuthOperationError} from './loginTransport.js';

// No fallback to the legacy public reset function. A failed or unavailable
// protected endpoint leaves the current screen/session intact.
export function createCredentialTransport({endpoint,publishableKey,fetcher=fetch,timeoutMs=10000}){
    const url=new URL(endpoint);
    if(url.username||url.password||url.search||url.hash||
        (url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))||
        !Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw new Error('Invalid credential endpoint configuration');
    return async(input,{signal,accessToken}={})=>{
        if(accessToken!==undefined&&(typeof accessToken!=='string'||!accessToken||accessToken.length>8192))throw new AuthOperationError('invalid_request');
        const abort=new AbortController(),cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});
        if(signal?.aborted)cancel();const timer=setTimeout(cancel,timeoutMs);
        try{
            const response=await fetcher(url.href,{method:'POST',signal:abort.signal,redirect:'error',cache:'no-store',credentials:'omit',
                headers:{'Content-Type':'application/json',...(publishableKey?{apikey:publishableKey}:{}),
                    ...(accessToken?{Authorization:`Bearer ${accessToken}`}:{})},body:JSON.stringify(input)});
            if(!response.ok){
                const codes={400:'invalid_request',401:'invalid_login',403:'forbidden',409:'account_changed',429:'try_later'};
                let serverCode;try{serverCode=(await response.json())?.error;}catch{/* stable status fallback */}
                const allowed=new Set(['invalid_request','invalid_login','forbidden','try_later','password_policy','account_changed']);
                throw new AuthOperationError(allowed.has(serverCode)?serverCode:(codes[response.status]||'temporarily_unavailable'));
            }
            const result=await response.json();
            const token=value=>typeof value==='string'&&value.length>0&&value.length<=8192;
            const replacement=result?.status==='session_replaced'&&token(result.session?.access_token)&&
                token(result.session?.refresh_token)&&Number.isFinite(result.session?.expires_at);
            const confirmation=result?.status==='reset_confirmed'&&typeof result.confirmationId==='string'&&
                /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(result.confirmationId)&&Number.isFinite(result.validUntil);
            if(!result||result.protocol!==1||(!['password_change_required','login_required'].includes(result.status)&&!replacement&&!confirmation))
                throw new AuthOperationError('temporarily_unavailable');
            return result;
        }catch(error){
            if(error instanceof AuthOperationError)throw error;
            throw new AuthOperationError(abort.signal.aborted?'cancelled':'temporarily_unavailable');
        }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    };
}
