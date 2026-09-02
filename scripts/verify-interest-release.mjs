import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
for(const origin of ['https://app.schoolchurchimpact.org','https://sci-center-6f265.web.app']) {
    const response=await fetch(origin,{cache:'no-store'});
    assert.equal(response.status,200);
    const html=await response.text();
    assert.equal(sha(html),sha(readFileSync('dist/index.html')));
    const asset=html.match(/src="([^"]*assets[^" ]+\.js)"/)?.[1];
    assert.ok(asset);
    const bundleResponse=await fetch(new URL(asset,origin));
    assert.equal(bundleResponse.status,200);
    const bundle=Buffer.from(await bundleResponse.arrayBuffer());
    assert.equal(sha(bundle),sha(readFileSync('dist'+asset)));
    const source=bundle.toString();
    for(const marker of ['관심 프로그램으로 등록됐어요!','RECRUITMENT_SAVED','admin_program_interest_counts'])assert.ok(source.includes(marker));
    assert.ok(!source.includes('/functions/v1/account-auth'));
    console.log(JSON.stringify({origin,asset,exactVerifiedBundle:true,interestConfirmation:true,adminCounts:true}));
}
// Missing credentials cannot execute the worker or send any notification.
const probe=await fetch('https://erecqalsxoxrufggvmcc.supabase.co/functions/v1/send-recruitment-alerts',{method:'POST'});
assert.equal(probe.status,401);
console.log('Worker rejects unauthenticated requests; no test notification sent.');
