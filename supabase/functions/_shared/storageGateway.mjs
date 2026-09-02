import {LoginError} from './loginSecurity.mjs';

export function createStorageGateway({supabaseUrl,serviceRoleKey,fetcher=fetch}){
    const base=new URL(supabaseUrl);
    if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||typeof serviceRoleKey!=='string'||serviceRoleKey.length<20)
        throw new Error('Trusted storage gateway configuration required');
    return async({bucket,path,contentType,bytes},{signal}={})=>{
        const encoded=[bucket,...path.split('/')].map(encodeURIComponent).join('/');
        let response;try{response=await fetcher(new URL('/storage/v1/object/'+encoded,base).href,{method:'POST',signal,
            redirect:'error',cache:'no-store',credentials:'omit',headers:{apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`,
                'Content-Type':contentType,'x-upsert':'false'},body:bytes});}catch{throw new LoginError('temporarily_unavailable',503);}
        if(!response.ok)throw new LoginError(response.status===409?'upload_conflict':'temporarily_unavailable',response.status===409?409:503);
        return new URL('/storage/v1/object/public/'+encoded,base).href;
    };
}
