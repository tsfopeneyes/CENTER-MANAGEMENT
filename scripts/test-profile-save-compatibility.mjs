import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';

// Execute the actual modal, hook and userApi without contacting Auth/DB/Storage.
// React is a small hook/element harness: this checks handlers, not browser layout.
let states=[],cursor=0;
const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},
    useCallback:fn=>fn,createElement:(type,props,...children)=>({type,props:{...props,children}})};
const calls=[],alerts=[],cache=new Map();
let failUpload=false,failDb=false,failCache=false,closed=false;
const supabase={storage:{from(bucket){return {async upload(path,file,options){calls.push({kind:'upload',bucket,path,file,options});return {error:failUpload?new Error('upload failed'):null};},getPublicUrl(path){return {data:{publicUrl:'https://example.invalid/'+path}};}};}},
    from(table){return {update(values){return {async eq(column,id){calls.push({kind:'db',table,column,id,values:{...values}});return {error:failDb?new Error('db failed'):null};}};}}}};
const mocks={react,'../supabaseClient':{supabase},'../../../utils/hashUtils':{hashPassword:async value=>{calls.push({kind:'hash',value});return 'test-hash';}},
    '../utils/imageUtils':{compressImage:async file=>{calls.push({kind:'compress',file});return {name:'compressed.jpg'};}},
    '../utils/analyticsUtils':{isConsecutiveWorkingDay:()=>false},'../utils/userActivityUtils':{trackUserWebActivity:()=>{}},
    'framer-motion':{motion:new Proxy({},{get:(_,key)=>key}),AnimatePresence:'animate'},
    'lucide-react':Object.fromEntries(['X','User','Image','ZoomIn','RotateCw','Bell','BookOpen'].map(key=>[key,key])),
    'react-easy-crop':{default:'cropper'},'../../../utils/imageUtils':{default:async()=>null},
    '../../../hooks/useModalClose':{default:()=>{}},'../../../firebase':{promptAndEnableNotification:async()=>({success:true}),removeFirebaseToken:async()=>true}};
for(const value of Object.values(mocks))if(Object.hasOwn(value,'default'))value.__esModule=true;
const storage={getItem:key=>cache.get(key)??null,setItem(key,value){if(failCache)throw new Error('storage unavailable');cache.set(key,value);}};
async function load(file){
    const result=await build({entryPoints:[file],bundle:true,write:false,format:'cjs',platform:'node',
        define:{'import.meta.env.VITE_ACCOUNT_AUTH_ENABLED':'false'},plugins:[{name:'isolated-dependencies',setup(b){
        b.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'test-mock'}:undefined);
        b.onLoad({filter:/.*/,namespace:'test-mock'},args=>({contents:`const value=globalThis.mocks[${JSON.stringify(args.path)}];export default value.default ?? value;`+Object.keys(mocks[args.path]).filter(key=>!['default','__esModule'].includes(key)).map(key=>`export const ${key}=value.${key};`).join(''),loader:'js'}));
    }}]});
    const module={exports:{}};
    vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,mocks,localStorage:storage,
        console:{error(){},warn(){}},alert:value=>alerts.push(value),URL,Date},{filename:file});
    return module.exports;
}
const {useProfile}=await load('src/hooks/useProfile.js');
const {default:Modal}=await load('src/components/student/modals/ProfileSettingsModal.jsx');
const base={id:'fixture-user',school:'기존고등학교',church:'기존교회',bio:'소개',role:'staff',profile_image_url:'old-image',preferences:{terms:true,is_school_church:false}};
const fresh=()=>{states=[];cursor=0;calls.length=0;alerts.length=0;cache.clear();failUpload=false;failDb=false;failCache=false;closed=false;};
const hook=(user=base)=>{cursor=0;return useProfile(user);};
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
function modal(props){cursor=0;return nodes(Modal({user:base,setShowProfileSettings:value=>{closed=!value;},...props}));}
const input=(tree,placeholder)=>tree.find(n=>n.props?.placeholder===placeholder);
const saveButton=tree=>tree.find(n=>n.type==='button'&&n.props.children?.includes('저장'));

// Current single-submit form: all changed fields and image reach the same call.
fresh();let submission;
const props={updateProfile:async(...args)=>{submission=args;return {success:true};}};
let tree=modal(props);
input(tree,'학교 이름을 입력하세요 (예: 00고등학교)').props.onChange({target:{value:'새여고'}});
input(tree,'교회 이름을 입력하세요 (예: 00교회)').props.onChange({target:{value:''}});
input(tree,'커피챗 신청 시 학생들에게 노출될 나만의 소개글을 적어주세요.').props.onChange({target:{value:'긴 소개\n'+'x'.repeat(3000)}});
input(tree,'변경할 비밀번호를 입력하세요').props.onChange({target:{value:'123456'}});
input(tree,'비밀번호를 다시 입력하세요').props.onChange({target:{value:'123456'}});
tree.find(n=>n.type==='button'&&n.props.children?.some(x=>typeof x==='string'&&x.trim()==='네')).props.onClick();
tree=modal(props);await saveButton(tree).props.onClick();
assert.equal(submission[0].password,'test-hash');assert.equal(submission[0].school,'새여고');
assert.equal(submission[0].church,'');assert.equal(submission[0].preferences.terms,true);assert.equal(submission[0].preferences.is_school_church,true);
assert.equal(closed,true);assert.equal(calls.filter(c=>c.kind==='hash').length,1);
for(const [password,confirm] of [['12345','12345'],['123456','different']]){
    fresh();submission=null;tree=modal(props);
    input(tree,'변경할 비밀번호를 입력하세요').props.onChange({target:{value:password}});
    input(tree,'비밀번호를 다시 입력하세요').props.onChange({target:{value:confirm}});
    await saveButton(modal(props)).props.onClick();assert.equal(submission,null);assert.equal(closed,false);
}
fresh();await saveButton(modal({updateProfile:async()=>({success:false,error:'test failure'})})).props.onClick();
assert.equal(closed,false);assert.match(alerts[0],/저장 실패/);

// Actual hook + actual userApi: combined writes, photo-only/text-only and failures.
for(const photo of [null,{name:'source.png'}]){
    fresh();cache.set('admin_user',JSON.stringify({...base,adminOnly:'keep'}));
    const result=await hook().updateProfile({school:' 새여고 ',password:'test-hash',preferences:{...base.preferences,is_school_church:true}},photo);
    assert.equal(result.success,true);const writes=calls.filter(c=>c.kind==='db');assert.equal(writes.length,1);
    assert.equal(writes[0].values.school,'새여자고등학교');assert.equal(writes[0].values.password,'test-hash');
    assert.equal(writes[0].id,base.id);assert.equal(writes[0].values.preferences.terms,true);
    assert.equal(result.user.profile_image_url,photo?calls.find(c=>c.kind==='upload')&&'https://example.invalid/'+calls.find(c=>c.kind==='upload').path:'old-image');
    assert.equal(JSON.parse(cache.get('admin_user')).adminOnly,'keep');assert.equal(hook().loading,false);
}
fresh();const photoOnly=await hook().updateProfile({}, {name:'source.jpg'});assert.equal(photoOnly.success,true);
assert.deepEqual(Object.keys(calls.find(c=>c.kind==='db').values),['profile_image_url']);
fresh();cache.set('admin_user',JSON.stringify({id:'other',role:'admin'}));await hook().updateProfile({church:'new'});
assert.equal(JSON.parse(cache.get('admin_user')).id,'other');
for(const failure of ['upload','db']){
    fresh();failUpload=failure==='upload';failDb=failure==='db';
    const result=await hook().updateProfile({church:'failed'}, {name:'source.jpg'});
    assert.equal(result.success,false);assert.equal(cache.has('user'),false);assert.equal(hook().user.church,base.church);assert.equal(hook().loading,false);
    if(failUpload)assert.equal(calls.some(c=>c.kind==='db'),false);
}
fresh();assert.equal((await hook(null).updateProfile({church:'new'})).success,false);assert.equal(calls.length,0);
fresh();failCache=true;const cached=await hook().updateProfile({church:'saved'});
assert.equal(cached.success,true,'A committed server save must not be reported as failed because browser cache is unavailable');
assert.equal(hook().user.church,'saved');assert.equal(calls.filter(c=>c.kind==='db').length,1);
console.log('PASS actual profile modal/hook/API: existing fields, six-character permanent validation, photo/text/combined save, cache isolation and failure outcomes (external services mocked)');
