import { hashPassword as secureHashPassword, verifyPassword as secureVerifyPassword } from './security';

export const hashPassword = secureHashPassword;
export const verifyPassword = secureVerifyPassword;
