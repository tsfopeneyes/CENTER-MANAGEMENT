import {LoginError} from './loginSecurity.mjs';

export function createMemberAdminHandler({members,allowedOrigins=[]}){
    const origins=new Set(allowedOrigins);
    return async request=>{
        const origin=request.headers.get('Origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Origin'};
        const out=(status,body)=>new Response(JSON.stringify(body),{status,headers});
        if(origin&&!origins.has(origin))return out(403,{error:'request_not_allowed'});if(origin)headers['Access-Control-Allow-Origin']=origin;
        if(request.method==='OPTIONS'){headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='content-type, apikey, authorization';return new Response(null,{status:204,headers});}
        if(request.method!=='POST')return out(405,{error:'method_not_allowed'});
        const bearer=request.headers.get('Authorization');if(!/^Bearer [^\s]{1,8192}$/.test(bearer||''))return out(401,{error:'invalid_login'});
        let input;try{const text=await request.text();if(text.length>2048)throw Error();input=JSON.parse(text);}catch{return out(400,{error:'invalid_request'});}
        if(input?.protocol!==1||!['set-admin','list-merge-reviews','merge'].includes(input.action))return out(400,{error:'invalid_request'});
        const allowed=input.action==='set-admin'?['protocol','action','profileId','admin']:
            input.action==='merge'?['protocol','action','requestId','sourceProfileId','targetProfileId']:['protocol','action'];
        if(Object.keys(input).some(key=>!allowed.includes(key)))return out(400,{error:'invalid_request'});
        try{const accessToken=bearer.slice(7);const result=input.action==='set-admin'
            ?await members.setRole({accessToken,profileId:input.profileId,admin:input.admin})
            :input.action==='merge'?await members.merge({accessToken,requestId:input.requestId,
                sourceProfileId:input.sourceProfileId,targetProfileId:input.targetProfileId})
                :await members.listReviews({accessToken});return out(200,result);}
        catch(error){if(error instanceof LoginError)return out(error.status,{error:error.code});return out(503,{error:'temporarily_unavailable'});}
    };
}
