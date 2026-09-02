import assert from 'node:assert/strict';
import {createMediaUploadTransport} from '../src/auth/mediaUploadTransport.js';
const profileId=crypto.randomUUID(),file=new Blob([new Uint8Array([1,2,3])],{type:'image/jpeg'});let request;
const upload=createMediaUploadTransport({endpoint:'https://fixture.invalid/uploads',publishableKey:'public',fetcher:async(url,options)=>{
    request={url,options};return Response.json({protocol:1,status:'uploaded',url:'https://fixture.invalid/storage/image.jpg'});}});
assert.equal(await upload({profileId,kind:'profile',file},{accessToken:'token'}),'https://fixture.invalid/storage/image.jpg');
assert.equal(request.options.credentials,'omit');assert.equal(request.options.headers['x-profile-id'],profileId);assert.equal(request.options.headers['x-upload-kind'],'profile');
assert.equal(request.options.headers.Authorization,'Bearer token');assert.equal(request.options.body.byteLength,3);
console.log('PASS media upload transport: bearer-only bounded binary upload, no cookie/retry/path control');
