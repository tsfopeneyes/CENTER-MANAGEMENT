import {LoginError,isProfileId} from './loginSecurity.mjs';

const kinds=Object.freeze({
    profile:{bucket:'avatars',prefix:'profiles',admin:false},chat:{bucket:'avatars',prefix:'chat',admin:false},
    guestbook:{bucket:'notice-images',prefix:'guest',admin:false},mission:{bucket:'notice-images',prefix:'mission',admin:false},
    notice:{bucket:'notice-images',prefix:'admin/notices',admin:true},store:{bucket:'notice-images',prefix:'admin/store',admin:true},
    badge:{bucket:'notice-images',prefix:'admin/badges',admin:true},rental:{bucket:'avatars',prefix:'admin/rentals',admin:true}
});
const extensions=new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['image/gif','gif']]);

export function createMediaUploadService({authorize,limits,keyFor,gateway,readiness=async()=>false}){
    if(![authorize,limits?.consumeLimit,keyFor,gateway,readiness].every(value=>typeof value==='function'))throw new Error('Media upload dependencies required');
    return async({accessToken,profileId,kind,contentType,bytes},{clientKey,signal}={})=>{
        const rule=kinds[kind],extension=extensions.get(contentType);
        if(!rule||!extension||!isProfileId(profileId)||!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>8*1024*1024||
            typeof clientKey!=='string'||!clientKey||clientKey.length>200)throw new LoginError('invalid_request',400);
        if(!await readiness())throw new LoginError('temporarily_unavailable',503);
        if(!await limits.consumeLimit(await keyFor('upload-client',clientKey),30)||
            !await limits.consumeLimit(await keyFor('upload-profile',profileId),30))throw new LoginError('try_later',429);
        const principal=await authorize({accessToken,action:rule.admin?'media.upload-admin':'media.upload-self',targetProfileId:profileId});
        if(principal?.actorProfileId!==profileId)throw new LoginError('forbidden',403);
        if(signal?.aborted)throw new LoginError('temporarily_unavailable',503);
        const path=`${rule.prefix}/${profileId}/${crypto.randomUUID()}.${extension}`;
        const publicUrl=await gateway({bucket:rule.bucket,path,contentType,bytes},{signal});
        return {protocol:1,status:'uploaded',url:publicUrl};
    };
}
