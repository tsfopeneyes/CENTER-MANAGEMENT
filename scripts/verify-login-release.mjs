import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const origin of ['https://app.schoolchurchimpact.org','https://sci-center-6f265.web.app']) {
 const response=await fetch(origin,{cache:'no-store'});
 assert.equal(response.status,200);
 const html=await response.text();
 assert.equal(sha(html),sha(readFileSync('dist/index.html')));
 const asset=html.match(/src="([^"]*assets[^" ]+\.js)"/)?.[1];
 assert.ok(asset);
 const bundleResponse=await fetch(new URL(asset,origin));
 assert.equal(bundleResponse.status,200);
 const remote=Buffer.from(await bundleResponse.arrayBuffer());
 assert.equal(sha(remote),sha(readFileSync('dist'+asset)));
 assert.ok(remote.toString().includes('인증 서버 연결이 지연되고 있습니다'));
 console.log(JSON.stringify({origin,asset,verifiedLoginBuild:true}));
}
