const endpoint=process.env.ACCOUNT_AUTH_HEALTH_URL||
    (process.env.VITE_ACCOUNT_AUTH_BASE_URL?process.env.VITE_ACCOUNT_AUTH_BASE_URL.replace(/\/$/,'')+'/health':null);
if(typeof endpoint!=='string'||!endpoint)throw Error('ACCOUNT_AUTH_HEALTH_URL is required');
const url=new URL(endpoint);
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/health'))
    throw Error('A secure account-auth health URL is required');
const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),8000);
try{
    const response=await fetch(url,{method:'GET',redirect:'error',cache:'no-store',signal:abort.signal});
    let body;try{body=await response.json();}catch{throw Error('Account auth returned an invalid health response');}
    if(!response.ok||body?.protocol!==1||body?.service!=='account-auth'||body?.ready!==true)
        throw Error('Account auth is not ready; keep the existing client active');
    console.log('PASS account-auth readiness: server and database foundations are ready for a separately approved client activation');
}finally{clearTimeout(timer);}
