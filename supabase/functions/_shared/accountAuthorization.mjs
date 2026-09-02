import {assessSessionContinuity} from './sessionContinuity.mjs';
import {LoginError,isProfileId} from './loginSecurity.mjs';

const selfActions=new Set(['profile.read-self','profile.update-self','credentials.change-self','media.upload-self']);
const adminActions=new Set(['members.manage','credentials.reset','settings.manage','ledger.manage','media.upload-admin']);

// SERVER ONLY: action is a constant selected by a route, not an arbitrary body
// field. Snapshot uses a private read-only transaction; verifyToken validates
// native Auth AND live sessions. No frontend name/role/metadata fallback.
export function createAccountAuthorization({snapshot,verifyToken,now=Date.now}) {
    return async({accessToken,action,targetProfileId})=>{
        if(!selfActions.has(action) && !adminActions.has(action))throw new LoginError('forbidden',403);
        if(selfActions.has(action)&&!isProfileId(targetProfileId))throw new LoginError('invalid_request',400);
        if(adminActions.has(action)&&targetProfileId!=null&&!isProfileId(targetProfileId))throw new LoginError('invalid_request',400);
        return snapshot(async(store)=>{
            const session=await assessSessionContinuity(accessToken,{verifyToken,
                loadAccount:store.loadAccount,loadAssurance:store.loadAssurance,now});
            if(session.decision!=='retain')throw new LoginError(session.decision==='reauth'?'invalid_login':'forbidden',session.decision==='reauth'?401:403);
            if(selfActions.has(action)) {
                if(targetProfileId!==session.profileId)throw new LoginError('forbidden',403);
            } else {
                const role=await store.loadRole(session.profileId);
                if(role?.profileId!==session.profileId || role.enabled!==true || role.role!=='admin')throw new LoginError('forbidden',403);
            }
            return Object.freeze({actorProfileId:session.profileId,authUserId:session.authUserId,
                sessionId:session.sessionId,action,targetProfileId});
        });
    };
}

// Allows only fields already editable in ProfileSettingsModal. Contact, role,
// identity links, balances, approval flags and arbitrary preferences require
// dedicated server operations. No spread of request bodies into database rows.
export function validateSelfProfileUpdate(input) {
    if(!input || typeof input!=='object' || Array.isArray(input) ||
        ![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new LoginError('invalid_request',400);
    const fields=new Set(['school','church','bio','isSchoolChurch','profileImageUrl']);
    if(!Object.keys(input).length || Object.keys(input).some(key=>!fields.has(key)))throw new LoginError('invalid_request',400);
    const result={};
    for(const [key,value] of Object.entries(input)) {
        if(key==='isSchoolChurch') {
            if(typeof value!=='boolean')throw new LoginError('invalid_request',400);
            result[key]=value;continue;
        }
        // Existing inputs have no per-field length policy. Do not introduce one
        // here; HTTP resource limits must be reviewed separately before wiring.
        if(typeof value!=='string' || value.includes('\u0000') || (key==='profileImageUrl'&&value.length>2048))throw new LoginError('invalid_request',400);
        result[key]=value;
    }
    return Object.freeze(result);
}
