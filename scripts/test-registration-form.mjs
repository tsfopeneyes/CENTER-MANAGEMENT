import assert from 'node:assert/strict';
import {createRegistrationFormValidator} from '../supabase/functions/_shared/registrationForm.mjs';
import {normalizeSchoolName} from '../src/utils/userUtils.js';
import {TERMS_VERSION} from '../src/constants/appConstants.js';

const validate=createRegistrationFormValidator({termsVersion:TERMS_VERSION,now:()=>Date.parse('2026-08-30T15:00:00Z')});
const input={termsVersion:TERMS_VERSION,agreements:{art1:true,art2:true,art3:true,art4:true},formData:{
    name:'가상회원',gender:'F',school:'가상여고',church:'',birth:'120831',phone:'010-1234-5678',user_group:'청소년',
    password:'123456',confirmPassword:'123456',guardianName:'',guardianPhone:'',guardianRelation:'',isSchoolChurch:true}};
const result=validate(input);
assert.equal(result.under14,false);assert.equal(result.profile.status,'approved');
assert.equal(result.profile.role,'user');assert.equal(result.profile.school,'가상여자고등학교');
assert.equal(result.profile.guardian_name,null);
assert.equal('password' in result.profile,false);assert.equal('confirmPassword' in result.profile,false);
assert.equal('id' in result.profile,false);assert.equal('auth_user_id' in result.profile,false);
assert.ok(Object.isFrozen(result.profile.preferences));
const change=(fields)=>({...input,formData:{...input.formData,...fields}});
const invalid=(value)=>assert.throws(()=>validate(value),e=>e.code==='invalid_registration');
invalid(change({birth:'120901'})); // Day before 14th birthday still needs existing guardian fields.
const younger=validate(change({birth:'120901',guardianName:'가상보호자',guardianPhone:'01099998888',guardianRelation:'모'}));
assert.equal(younger.profile.status,'pending');assert.equal(younger.profile.guardian_phone,'010-9999-8888');
assert.equal(younger.under14,true);
const older=validate(change({user_group:'졸업생',birth:'991231',guardianName:'stale',guardianPhone:'',guardianRelation:'stale'}));
assert.equal(older.profile.user_group,'졸업생');assert.equal(older.profile.guardian_relation,null);
for(const birth of ['000000','260229','130229','261231','1231','abcdef'])invalid(change({birth}));
assert.equal(validate(change({birth:'000229'})).under14,false);
for(const field of [{role:'admin'},{status:'approved'},{id:'injected'},{auth_user_id:'injected'},
    {preferences:{role:'admin'}},{memo:'injected'},{user_group:'관리자'},{gender:'other'},
    {isSchoolChurch:'true'},{password:'abc',confirmPassword:'abc'},{confirmPassword:'different'},
    {name:''},{name:'a\u0000b'},{school:''},{phone:'abc12345678'}])invalid(change(field));
invalid({...input,agreements:{...input.agreements,art4:false}});
invalid({...input,agreements:{...input.agreements,art1:'true'}});
assert.throws(()=>validate({...input,termsVersion:'old'}),e=>e.code==='terms_changed');
// Internal validation does not silently change a password or infer identity from a name.
assert.equal(validate(change({password:' a b c ',confirmPassword:' a b c '})).profile.name,'가상회원');
assert.equal(validate(change({name:'admin'})).profile.role,'user');
for(const school of ['가상외고','가상여고','가상고','가상여중','가상중','가상초','가상고등학교',' 대학교 ']){
    assert.equal(validate(change({school})).profile.school,normalizeSchoolName(school));
}
const beforeBirthday=createRegistrationFormValidator({termsVersion:TERMS_VERSION,now:()=>Date.parse('2026-08-30T14:59:59Z')});
assert.throws(()=>beforeBirthday(input),e=>e.code==='invalid_registration');
console.log('PASS current signup form: six-character permanent password, existing guardian rule, Korea birthday boundary, terms, fixed role, no credentials in profile');
