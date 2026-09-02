import {LoginError} from './loginSecurity.mjs';

const fields=['name','gender','school','church','birth','phone','user_group','password','confirmPassword',
    'guardianName','guardianPhone','guardianRelation','isSchoolChurch'];
const fail=()=>{throw new LoginError('invalid_registration',400);};
const object=(value,keys)=>{
    if(!value || typeof value!=='object' || Array.isArray(value) ||
        ![Object.prototype,null].includes(Object.getPrototypeOf(value)) ||
        Object.keys(value).some(key=>!keys.includes(key)))fail();
};
const text=(value,max,required=false)=>{
    if(typeof value!=='string' || value.length>max || /[\u0000-\u001f\u007f]/.test(value))fail();
    const result=value.trim();
    if(required && !result)fail();
    return result;
};
const phone=(value)=>{
    const digits=text(value,24,true).replace(/-/g,'');
    if(!/^\d{11}$/.test(digits))fail();
    return digits.slice(0,3)+'-'+digits.slice(3,7)+'-'+digits.slice(7);
};
// Same transformation as the existing form's normalizeSchoolName. Kept local
// so the server does not import client utilities containing legacy role logic.
export const normalizeProfileSchool=(value)=>{
    if(/(?:고등학교|중학교|초등학교)$/.test(value))return value;
    for(const [suffix,expanded] of [['외고','외국어고등학교'],['여고','여자고등학교'],['고','고등학교'],
        ['여중','여자중학교'],['중','중학교'],['초','초등학교']]) {
        if(value.endsWith(suffix))return value.slice(0,-suffix.length)+expanded;
    }
    return value;
};

// Pure server boundary for the CURRENT form, not identity verification and not
// enrollment approval. Never pass this result as verifyEnrollment.allowed=true.
// No DB writes, Auth requests, OTP, extra questions, or new approval workflow.
export function createRegistrationFormValidator({termsVersion,now=Date.now}) {
    if(typeof termsVersion!=='string' || !termsVersion || termsVersion.length>80)throw new Error('Current terms version required');
    return (submission={})=>{
        object(submission,['formData','agreements','termsVersion','guestUserId']);
        const {formData,agreements,termsVersion:submittedVersion,guestUserId=null}=submission;
        if(guestUserId!==null&&(typeof guestUserId!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(guestUserId)))fail();
        object(formData,fields);object(agreements,['art1','art2','art3','art4']);
        if(submittedVersion!==termsVersion)throw new LoginError('terms_changed',409);
        if(!['art1','art2','art3','art4'].every(key=>agreements[key]===true))fail();
        if(!['M','F'].includes(formData.gender) || !['청소년','졸업생'].includes(formData.user_group) ||
            typeof formData.isSchoolChurch!=='boolean')fail();
        // Permanent passwords follow the provider-supported minimum. The
        // administrator's four-digit reset value is a separate one-use flow.
        if(typeof formData.password!=='string' || formData.password.length<6 || formData.password.length>128 ||
            formData.password!==formData.confirmPassword)fail();
        const birth=text(formData.birth,6,true);
        if(!/^\d{6}$/.test(birth))fail();
        const timestamp=now();
        if(!Number.isFinite(timestamp))throw new Error('Invalid server clock');
        // Center operates in Korea; UTC server timezone must not shift birthdays.
        const today=new Date(timestamp+9*3600000);
        const year=today.getUTCFullYear(),month=today.getUTCMonth()+1,day=today.getUTCDate();
        const yy=Number(birth.slice(0,2)),mm=Number(birth.slice(2,4)),dd=Number(birth.slice(4));
        const fullYear=yy<=year%100 ? 2000+yy : 1900+yy;
        const date=new Date(Date.UTC(fullYear,mm-1,dd));
        if(date.getUTCFullYear()!==fullYear || date.getUTCMonth()+1!==mm || date.getUTCDate()!==dd ||
            fullYear>year || (fullYear===year && (mm>month || (mm===month && dd>day))))fail();
        const age=year-fullYear-((month<mm || (month===mm && day<dd))?1:0);
        const under14=age<14;
        const formattedPhone=phone(formData.phone);
        // Check bounded input even for hidden stale guardian fields; do not persist
        // those fields for members aged 14+ (same as the existing hook).
        const guardianName=text(formData.guardianName,80,under14);
        const guardianRelation=text(formData.guardianRelation,80,under14);
        text(formData.guardianPhone,24,under14);
        const profile=Object.freeze({
            name:text(formData.name,80,true),gender:formData.gender,
            school:normalizeProfileSchool(text(formData.school,200,true)),church:text(formData.church,200),
            birth,phone:formattedPhone,phone_back4:formattedPhone.slice(-4),user_group:formData.user_group,
            role:'user',status:under14?'pending':'approved',
            guardian_name:under14?guardianName:null,guardian_phone:under14?phone(formData.guardianPhone):null,
            guardian_relation:under14?guardianRelation:null,
            preferences:Object.freeze({terms_agreed:true,terms_version:termsVersion,is_school_church:formData.isSchoolChurch})
        });
        // Credentials intentionally absent. Caller passes the password to Auth
        // separately; canonicalDetails is private PII and is only for keyed digest.
        return Object.freeze({profile,under14,guestUserId,canonicalDetails:JSON.stringify({profile,guestUserId})});
    };
}
