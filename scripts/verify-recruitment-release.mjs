import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const local=readFileSync('dist/index.html');
for(const origin of ['https://app.schoolchurchimpact.org','https://sci-center-6f265.web.app']) {
    const response=await fetch(origin,{cache:'no-store'});
    const html=await response.text();
    const asset=html.match(/src="([^"]*assets[^" ]+\.js)"/)?.[1];
    console.log(JSON.stringify({origin,status:response.status,redirected:response.redirected,asset,indexMatchesLocal:sha(html)===sha(local)}));
    if(!response.ok || !asset)throw new Error('Public release unavailable');
    const bundle=await(await fetch(new URL(asset,origin))).text();
    console.log(JSON.stringify({origin,heartCode:bundle.includes('모집 시작 알림 신청'),interestApi:bundle.includes('program_recruitment_interests'),deferredAuth:bundle.includes('/functions/v1/account-auth')}));
    const sw=await fetch(`${origin}/firebase-messaging-sw.js`);
    console.log(JSON.stringify({origin,serviceWorkerStatus:sw.status,serviceWorkerType:sw.headers.get('content-type')}));
}
