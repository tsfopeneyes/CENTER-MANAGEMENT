// Revokes only the newly issued token that failed client-side adoption. It does
// not call the shared SDK signOut and therefore cannot destroy the user's
// previously active session.
export function createSessionDiscardTransport({supabaseUrl,publishableKey,fetcher=fetch,timeoutMs=5000}){
    const origin=new URL(supabaseUrl);
    if(origin.username||origin.password||origin.search||origin.hash||
        (origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))||
        typeof publishableKey!=='string'||!publishableKey||!Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>10000)
        throw new Error('Invalid session discard configuration');
    const endpoint=new URL('/auth/v1/logout?scope=local',origin);
    return async accessToken=>{
        if(typeof accessToken!=='string'||!accessToken||accessToken.length>8192)return;
        const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeoutMs);
        try{await fetcher(endpoint.href,{method:'POST',signal:abort.signal,redirect:'error',cache:'no-store',credentials:'omit',
            headers:{apikey:publishableKey,Authorization:`Bearer ${accessToken}`}});}catch{/* assurance/live checks still deny it */}
        finally{clearTimeout(timer);}
    };
}
