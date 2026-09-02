import {LoginError,isProfileId} from './loginSecurity.mjs';

const encoder=new TextEncoder(),hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const base64url=bytes=>{let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');};
const equal=(left,right)=>{if(left.length!==right.length)return false;let diff=0;for(let i=0;i<left.length;i++)diff|=left.charCodeAt(i)^right.charCodeAt(i);return diff===0;};

export async function createLegacyCredentialBridge(secret){
    if(typeof secret!=='string'||secret.length<32||secret.length>512)throw new Error('Legacy bridge secret required');
    const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    return Object.freeze({
        async verify(password,digest){
            if(typeof password!=='string'||!password||password.length>128||typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))return false;
            const actual=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(password))));return equal(actual,digest);
        },
        async providerPassword(profileId,digest){
            if(!isProfileId(profileId)||typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))throw new LoginError('invalid_login',401);
            const signature=await crypto.subtle.sign('HMAC',key,encoder.encode(JSON.stringify(['legacy-provider-v1',profileId,digest])));
            return 'L1_'+base64url(new Uint8Array(signature));
        }
    });
}
