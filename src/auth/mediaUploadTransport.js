import {AuthOperationError} from './loginTransport.js';

export function createMediaUploadTransport({endpoint,publishableKey,fetcher=fetch,timeoutMs=30000}){
    const url=new URL(endpoint);
    if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))||
        !Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw new Error('Invalid upload endpoint configuration');
    return async({profileId,kind,file},{accessToken,signal}={})=>{
        if(typeof accessToken!=='string'||!accessToken||accessToken.length>8192||typeof profileId!=='string'||!profileId||
            typeof kind!=='string'||!kind||!file||typeof file.arrayBuffer!=='function')throw new AuthOperationError('invalid_request');
        const bytes=await file.arrayBuffer();if(bytes.byteLength<1||bytes.byteLength>8*1024*1024)throw new AuthOperationError('invalid_request');
        const abort=new AbortController(),cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();const timer=setTimeout(cancel,timeoutMs);
        try{const response=await fetcher(url.href,{method:'POST',signal:abort.signal,redirect:'error',cache:'no-store',credentials:'omit',headers:{
            Authorization:`Bearer ${accessToken}`,'Content-Type':file.type,'x-profile-id':profileId,'x-upload-kind':kind,...(publishableKey?{apikey:publishableKey}:{})},body:bytes});
            if(!response.ok){const codes={400:'invalid_request',401:'invalid_login',403:'forbidden',409:'upload_conflict',413:'invalid_request',429:'try_later'};
                throw new AuthOperationError(codes[response.status]||'temporarily_unavailable');}
            const result=await response.json();if(result?.protocol!==1||result.status!=='uploaded'||typeof result.url!=='string'||!result.url.startsWith('https://'))
                throw new AuthOperationError('temporarily_unavailable');return result.url;
        }catch(error){if(error instanceof AuthOperationError)throw error;throw new AuthOperationError(abort.signal.aborted?'cancelled':'temporarily_unavailable');}
        finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    };
}
