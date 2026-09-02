import {isProfileId} from './loginSecurity.mjs';

// Minimal Admin Auth surface. The service key is captured server-side and never
// returned, logged or accepted from a request.
export function createAdminAuthGateway({supabaseUrl,serviceRoleKey,fetcher=fetch,timeoutMs=8000}){
    const url=new URL(supabaseUrl);
    if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||
        (url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))||
        typeof serviceRoleKey!=='string'||serviceRoleKey.length<20||serviceRoleKey.length>8192||
        !Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw new Error('Invalid Admin Auth configuration');
    const requestRaw=async(path,method,body)=>{
        const response=await fetcher(url.origin+path,{method,signal:AbortSignal.timeout(timeoutMs),redirect:'error',cache:'no-store',credentials:'omit',
            headers:{apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`,'Content-Type':'application/json'},
            ...(body===undefined?{}:{body:JSON.stringify(body)})});
        if(!response.ok)return {value:null,error:{status:response.status}};
        return {value:await response.json(),error:null};
    };
    const request=async(path,method,body)=>{const result=await requestRaw(path,method,body);
        return result.error?{data:null,error:result.error}:{data:{user:result.value},error:null};};
    return Object.freeze({
        updateUserById(id,attributes){
            if(!isProfileId(id)||!attributes||typeof attributes!=='object'||Array.isArray(attributes)||
                Object.keys(attributes).length!==1||typeof attributes.password!=='string'||attributes.password.length<6||attributes.password.length>128)
                return Promise.resolve({data:null,error:{status:400}});
            return request('/auth/v1/admin/users/'+encodeURIComponent(id),'PUT',attributes);
        },
        createUser(attributes){
            if(!attributes||typeof attributes!=='object'||Array.isArray(attributes)||typeof attributes.email!=='string'||
                typeof attributes.password!=='string'||attributes.password.length<6||attributes.password.length>128||attributes.email_confirm!==true)
                return Promise.resolve({data:null,error:{status:400}});
            return request('/auth/v1/admin/users','POST',attributes);
        },
        async findUserByEmail(email,registrationOperation){
            if(typeof email!=='string'||email.length>320||typeof registrationOperation!=='string'||!isProfileId(registrationOperation))
                return {data:null,error:{status:400}};
            // GoTrue's supported admin listing API is authoritative. Scan in
            // bounded pages; never query the managed auth schema directly.
            for(let page=1;page<=20;page++){
                const result=await requestRaw(`/auth/v1/admin/users?page=${page}&per_page=100`,'GET');
                if(result.error)return {data:null,error:result.error};
                const users=Array.isArray(result.value?.users)?result.value.users:[];
                const matches=users.filter(user=>user?.email===email&&
                    user?.app_metadata?.registration_operation===registrationOperation&&user?.is_anonymous===false);
                if(matches.length>1)return {data:null,error:{status:409}};
                if(matches.length===1)return {data:{user:matches[0]},error:null};
                if(users.length<100)break;
            }
            return {data:{user:null},error:null};
        }
    });
}
