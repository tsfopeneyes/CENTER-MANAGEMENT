// Read-only byte fingerprints for the four explicitly reviewed files.
import {createHash} from 'node:crypto';
const root='https://erecqalsxoxrufggvmcc.supabase.co/storage/v1/object/public/';
const paths=['avatars/rentals/1782808425337_20260630_173028.jpg','avatars/rentals/1782808439659_20260630_173104.jpg',
 'notice-images/0.051213765722119.png','notice-images/0.6327318799376851.png'];
for(const path of paths){
 const response=await fetch(root+path,{cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`File verification failed: HTTP ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());
 console.log(JSON.stringify({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
}
