import {createProfileReadService} from './profileReadService.mjs';
import {createProfileUpdateService} from './profileUpdateService.mjs';

export function createProfileBundle({pool,verifyToken,readiness,profileImageOrigin,now=Date.now}){
    return Object.freeze({
        read:createProfileReadService({pool,verifyToken,readiness,now}),
        update:createProfileUpdateService({pool,verifyToken,readiness,profileImageOrigin,now})
    });
}
