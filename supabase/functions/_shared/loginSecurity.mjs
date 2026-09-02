export class LoginError extends Error {
    constructor(code, status = 401) { super(code); this.code = code; this.status = status; }
}
export const invalidLogin = () => new LoginError('invalid_login');
export const isProfileId = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export const normalizeLoginName = value => value.trim().normalize('NFC').toLocaleLowerCase('ko-KR');

export function validateLogin(input) {
    if (!input || typeof input !== 'object' || !['login','reconfirm'].includes(input.action) || input.protocol !== 1 ||
        typeof input.password !== 'string' || input.password.length < 1 || input.password.length > 128) throw invalidLogin();
    const allowed = input.action === 'reconfirm' ? ['action','protocol','profileId','password'] : ['action','protocol','name','phone','profileId','password'];
    if (Object.keys(input).some(key => !allowed.includes(key))) throw invalidLogin();
    if (input.action === 'reconfirm') {
        if (!isProfileId(input.profileId)) throw invalidLogin();
        return {action: input.action, profileId: input.profileId, password: input.password};
    }
    if(input.profileId!==undefined){
        if(!isProfileId(input.profileId)||input.name!==undefined||input.phone!==undefined)throw invalidLogin();
        return {action:input.action,profileId:input.profileId,password:input.password};
    }
    if (typeof input.name !== 'string' || input.name.length > 80) throw invalidLogin();
    const name = normalizeLoginName(input.name);
    if (!name || /[\u0000-\u001f\u007f]/.test(name)) throw invalidLogin();
    let phone = null;
    if (input.phone !== undefined && input.phone !== '') {
        if (typeof input.phone !== 'string' || input.phone.length > 24) throw invalidLogin();
        phone = input.phone.replace(/[\s()-]/g, '');
        if (!/^0\d{8,10}$/.test(phone)) throw invalidLogin();
    }
    return {action: input.action, name, phone, password: input.password};
}

// Lookup/limit keys are keyed digests, not unsalted hashes of guessable names or
// telephone numbers. This secret is NOT a password derivation key.
export async function createLoginKey(secret) {
    if (typeof secret !== 'string' || secret.length < 32) throw new Error('Missing login lookup secret');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
        {name:'HMAC',hash:'SHA-256'},false,['sign']);
    return async (kind, value) => {
        const bytes = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify([kind,value])));
        return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
    };
}
