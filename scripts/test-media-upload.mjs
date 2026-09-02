import assert from 'node:assert/strict';
import {createMediaUploadService} from '../supabase/functions/_shared/mediaUploadService.mjs';
import {createMediaUploadHandler} from '../supabase/functions/_shared/mediaUploadHandler.mjs';
import {createStorageGateway} from '../supabase/functions/_shared/storageGateway.mjs';

const profileId=crypto.randomUUID(),calls=[];let allowed=true;
const service=createMediaUploadService({readiness:async()=>true,keyFor:async(k,v)=>k+':'+v,
    limits:{consumeLimit:async()=>true},authorize:async input=>{calls.push(input);if(!allowed)throw Object.assign(Error(),{code:'forbidden',status:403});return {actorProfileId:profileId};},
    gateway:async input=>{calls.push(input);return `https://fixture.supabase.co/storage/v1/object/public/${input.bucket}/${input.path}`;}});
const bytes=new Uint8Array([1,2,3]);
let result=await service({accessToken:'token',profileId,kind:'profile',contentType:'image/jpeg',bytes},{clientKey:'127.0.0.1'});
assert.equal(result.status,'uploaded');assert.equal(calls[0].action,'media.upload-self');assert.match(calls[1].path,new RegExp(`^profiles/${profileId}/[0-9a-f-]+\\.jpg$`));
calls.length=0;await service({accessToken:'token',profileId,kind:'notice',contentType:'image/png',bytes},{clientKey:'127.0.0.1'});
assert.equal(calls[0].action,'media.upload-admin');assert.match(calls[1].path,/^admin\/notices\//);
await assert.rejects(()=>service({accessToken:'token',profileId,kind:'profile',contentType:'image/svg+xml',bytes},{clientKey:'x'}),e=>e.code==='invalid_request');

const handler=createMediaUploadHandler({upload:service,resolveClientKey:async()=> '127.0.0.1',allowedOrigins:['https://app.example']});
result=await handler(new Request('https://auth.example/uploads',{method:'POST',headers:{Origin:'https://app.example',Authorization:'Bearer token',
    'Content-Type':'image/webp','x-profile-id':profileId,'x-upload-kind':'chat'},body:bytes}));assert.equal(result.status,200);
const tooLarge=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(8*1024*1024+1));controller.close();}});
result=await handler(new Request('https://auth.example/uploads',{method:'POST',duplex:'half',headers:{Origin:'https://app.example',Authorization:'Bearer token',
    'Content-Type':'image/webp','x-profile-id':profileId,'x-upload-kind':'chat'},body:tooLarge}));assert.equal(result.status,413);

let request;const gateway=createStorageGateway({supabaseUrl:'https://fixture.supabase.co',serviceRoleKey:'s'.repeat(32),fetcher:async(url,options)=>{request={url,options};return new Response('{}',{status:200});}});
const url=await gateway({bucket:'avatars',path:`profiles/${profileId}/a b.jpg`,contentType:'image/jpeg',bytes});
assert.ok(request.url.endsWith(`/avatars/profiles/${profileId}/a%20b.jpg`));assert.equal(request.options.credentials,'omit');assert.ok(!request.url.includes('ssss'));
assert.ok(url.endsWith(`/public/avatars/profiles/${profileId}/a%20b.jpg`));
console.log('PASS media upload: verified self/admin actions, server paths, bounded image types/body and secret-only storage gateway');
