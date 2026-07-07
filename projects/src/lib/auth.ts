import {
  hashPassword as secureHashPassword,
  verifyPassword as secureVerifyPassword,
  needsRehash as secureNeedsRehash,
  maskPhone as secureMaskPhone,
} from './security';

export const hashPassword = secureHashPassword;
export const verifyPassword = secureVerifyPassword;
export const needsRehash = secureNeedsRehash;
export const maskPhone = secureMaskPhone;
