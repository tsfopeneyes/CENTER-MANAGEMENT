export class AuthOperationError extends Error {
    constructor(code) { super(code);this.code=code; }
}

// Explicit endpoint only; no legacy RPC/hash fallback or automatic POST retry.
export function createLoginTransport({endpoint,publishableKey,fetcher=fetch,timeoutMs=30000}) {
    const url=new URL(endpoint);
    if(url.username || url.password || url.search || url.hash ||
        (url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))) ||
        !Number.isFinite(timeoutMs) || timeoutMs<1 || timeoutMs>30000)throw new Error('Invalid login endpoint configuration');
    return async(input,{signal}={})=>{
        const abort=new AbortController();
        const cancel=()=>abort.abort();
        signal?.addEventListener('abort',cancel,{once:true});
        if(signal?.aborted)cancel();
        const timer=setTimeout(cancel,timeoutMs);
        const started=performance.now();
        try {
            if(abort.signal.aborted)throw new AuthOperationError('cancelled');
            const response=await fetcher(url.href,{method:'POST',signal:abort.signal,redirect:'error',cache:'no-store',credentials:'omit',
                headers:{'Content-Type':'application/json',...(publishableKey?{apikey:publishableKey}:{})},body:JSON.stringify(input)});
            if(!response.ok) {
                console.info('[account-auth-timing]',JSON.stringify({stage:'login-http-error',duration:Math.round(performance.now()-started),status:response.status,server:response.headers.get('Server-Timing')||''}));
                const codes={400:'invalid_request',401:'invalid_login',403:'confirmation_required',409:'account_changed',429:'try_later'};
                let serverCode;try{serverCode=(await response.json())?.error;}catch{}
                const allowed=new Set(['invalid_login','try_later','password_change_required','account_changed','name_not_found','selection_required']);
                throw new AuthOperationError(allowed.has(serverCode)?serverCode:(codes[response.status]||'temporarily_unavailable'));
            }
            // Do not surface raw server bodies/errors that could contain secrets.
            const result=await response.json();
            if(abort.signal.aborted)throw new AuthOperationError('cancelled');
            console.info('[account-auth-timing]',JSON.stringify({stage:'login-http',duration:Math.round(performance.now()-started),server:response.headers.get('Server-Timing')||''}));
            return result;
        } catch(error) {
            if(!(error instanceof AuthOperationError))console.info('[account-auth-timing]',JSON.stringify({stage:'login-network-error',duration:Math.round(performance.now()-started)}));
            if(error instanceof AuthOperationError)throw error;
            throw new AuthOperationError(abort.signal.aborted?'cancelled':'temporarily_unavailable');
        } finally {
            clearTimeout(timer);signal?.removeEventListener('abort',cancel);
        }
    };
}
