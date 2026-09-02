import {createRegistrationFormValidator} from './registrationForm.mjs';
import {createRegistrationStore} from './registrationStore.mjs';
import {createRegistrationService} from './registrationService.mjs';
import {createMembershipFinalizer} from './membershipFinalizer.mjs';

// Preserves the current form: no OTP, approval screen or extra question is
// introduced. The server validates every existing field and rejects adoption
// or merging of an existing profile.
export function createRegistrationBundle({registrationPool,membershipPool,limits,keyFor,adminAuth,gateway,verifyToken,
    readiness,passwordPolicy,termsVersion,loginDomain,lifetimeMs=3600000,now=Date.now}){
    const validateForm=createRegistrationFormValidator({termsVersion,now});
    const verifyEnrollment=async({enrollmentId,details})=>{
        const validated=validateForm(details);
        return {allowed:true,enrollmentId,identity:'phone:'+validated.profile.phone.replace(/\D/g,''),
            canonicalDetails:validated.canonicalDetails,validUntil:now()+60000};
    };
    const finalizeMembership=createMembershipFinalizer({pool:membershipPool,keyFor,validateForm,verifyToken,readiness,now});
    return createRegistrationService({store:createRegistrationStore(registrationPool),limits,keyFor,adminAuth,gateway,verifyToken,
        verifyEnrollment,readiness,passwordPolicy,loginDomain,lifetimeMs,finalizeMembership,now});
}
