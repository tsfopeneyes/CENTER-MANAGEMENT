import {AuthOperationError} from './loginTransport.js';

const secret=()=>{const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');};

// Keeps an uncertain request identity in memory for an explicit user retry.
// Passwords and registration secrets are never written to browser storage.
export function createRegistrationController({register}){
    if(typeof register!=='function')throw new Error('Registration transport required');let pending=null;
    return {
        async submit({password,details},{signal}={}){
            if(typeof password!=='string'||password.length<6||password.length>128||!details||typeof details!=='object'||Array.isArray(details))
                throw new AuthOperationError('invalid_request');
            const fingerprint=JSON.stringify(details);
            if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,enrollmentId:crypto.randomUUID(),requestSecret:secret()};
            const result=await register({protocol:1,enrollmentId:pending.enrollmentId,requestSecret:pending.requestSecret,password,details},{signal});
            if(result?.protocol!==1||result.status!=='registered')throw new AuthOperationError('temporarily_unavailable');pending=null;return {status:'registered'};
        },
        clear(){pending=null;}
    };
}
