const encoder=new TextEncoder();
const b64url=bytes=>{
    let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
};
const decode=value=>{
    if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid digest');
    const padded=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);
    const binary=atob(padded),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
};
const equal=(a,b)=>{
    let difference=a.length^b.length,max=Math.max(a.length,b.length);
    for(let i=0;i<max;i++)difference|=(a[i%a.length]??0)^(b[i%b.length]??0);
    return difference===0;
};

// Four digits have only 10,000 possibilities. A unique salt and slow KDF do
// not prevent offline enumeration by themselves, so the pepper must be a
// separate server secret and must never be stored beside the digest.
export function createTemporaryCredentialHasher({pepper,iterations=310000,randomBytes}={}){
    if(!(pepper instanceof Uint8Array)||pepper.byteLength<32||pepper.byteLength>128||
        !Number.isSafeInteger(iterations)||iterations<210000||iterations>1000000)
        throw new Error('Strong temporary credential pepper and KDF cost required');
    const random=randomBytes||((size)=>{const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return bytes;});
    const pepperCopy=pepper.slice();
    const derive=async(value,salt,cost)=>{
        if(typeof value!=='string'||!/^[0-9]{4}$/.test(value))throw new Error('Invalid temporary credential');
        const hmacKey=await crypto.subtle.importKey('raw',pepperCopy,{name:'HMAC',hash:'SHA-256'},false,['sign']);
        const keyed=new Uint8Array(await crypto.subtle.sign('HMAC',hmacKey,encoder.encode(value)));
        const source=await crypto.subtle.importKey('raw',keyed,'PBKDF2',false,['deriveBits']);
        return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:cost},source,256));
    };
    return {
        async hash(value){
            const salt=random(16);if(!(salt instanceof Uint8Array)||salt.byteLength!==16)throw new Error('Secure salt required');
            const digest=await derive(value,salt,iterations);
            return `v1.pbkdf2-sha256.${iterations}.${b64url(salt)}.${b64url(digest)}`;
        },
        async verify(value,encoded){
            try{
                const [version,algorithm,costText,saltText,digestText,...extra]=String(encoded).split('.');
                const cost=Number(costText),salt=decode(saltText),expected=decode(digestText);
                if(version!=='v1'||algorithm!=='pbkdf2-sha256'||extra.length||!Number.isSafeInteger(cost)||
                    cost<210000||cost>1000000||salt.byteLength!==16||expected.byteLength!==32)return false;
                return equal(await derive(value,salt,cost),expected);
            }catch{return false;}
        }
    };
}
