/**
 * 安全工具库
 * 提供加密、令牌、验证等安全功能
 */

import { createHash, randomBytes, createHmac, timingSafeEqual } from 'crypto';

// ========== 加密工具 ==========

/**
 * 使用 SHA-256 进行哈希
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * 使用 HMAC-SHA256 进行签名
 */
export function hmacSha256(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * 生成随机字符串
 * @param length 长度
 */
export function generateRandomString(length: number): string {
  const bytes = randomBytes(Math.ceil(length / 2));
  return bytes.toString('hex').substring(0, length);
}

/**
 * 生成加密盐值
 */
export function generateSalt(): string {
  return randomBytes(16).toString('hex');
}

// ========== 密码哈希 ==========

const PASSWORD_HASH_ALGORITHM = 'sha256';
const PASSWORD_SALT_LENGTH = 32;
const PASSWORD_ITERATIONS = 10000;

/**
 * 哈希密码
 * @param password 明文密码
 * @returns 哈希后的密码格式: salt:hash
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(PASSWORD_SALT_LENGTH).toString('hex');
  let hash = password;

  // 使用多次迭代增加哈希复杂度
  for (let i = 0; i < PASSWORD_ITERATIONS; i++) {
    hash = createHash(PASSWORD_HASH_ALGORITHM).update(hash + salt).digest('hex');
  }

  return `${salt}:${hash}`;
}

/**
 * 验证密码
 * @param password 明文密码
 * @param hashedPassword 哈希后的密码（格式: salt:hash）
 */
export function verifyPassword(password: string, hashedPassword: string): boolean {
  try {
    // 必须是哈希格式（包含冒号），拒绝明文密码
    if (!hashedPassword || !hashedPassword.includes(':')) {
      return false;
    }

    const [salt, storedHash] = hashedPassword.split(':');
    if (!salt || !storedHash) return false;

    let computedHash = password;
    for (let i = 0; i < PASSWORD_ITERATIONS; i++) {
      computedHash = createHash(PASSWORD_HASH_ALGORITHM).update(computedHash + salt).digest('hex');
    }

    // 使用 timing-safe equal 防止时序攻击
    return timingSafeEqual(
      Buffer.from(storedHash, 'hex'),
      Buffer.from(computedHash, 'hex')
    );
  } catch (error) {
    console.error('密码验证错误:', error);
    return false;
  }
}

/**
 * 检查密码强度
 * @param password 密码
 * @returns 密码强度信息
 */
export function checkPasswordStrength(password: string): {
  score: number; // 0-4
  strength: 'very-weak' | 'weak' | 'medium' | 'strong' | 'very-strong';
  suggestions: string[];
} {
  const suggestions: string[] = [];
  let score = 0;

  // 长度检查
  if (password.length >= 8) score += 1;
  else suggestions.push('密码长度至少8位');

  if (password.length >= 12) score += 1;

  // 复杂度检查
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  else suggestions.push('包含大小写字母');

  if (/\d/.test(password)) score += 1;
  else suggestions.push('包含数字');

  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  else suggestions.push('包含特殊字符');

  // 常见弱密码检查
  const commonPasswords = ['123456', 'password', 'qwerty', 'abc123', '111111'];
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    score = 0;
    suggestions.push('避免使用常见密码');
  }

  const strengthMap = {
    0: 'very-weak' as const,
    1: 'weak' as const,
    2: 'medium' as const,
    3: 'strong' as const,
    4: 'very-strong' as const,
  };

  return {
    score: Math.min(score, 4),
    strength: strengthMap[score as keyof typeof strengthMap] || 'very-weak',
    suggestions,
  };
}

// ========== 令牌管理 ==========

const TOKEN_SECRET = (() => {
  const secret = process.env.TOKEN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[SECURITY] TOKEN_SECRET 环境变量未设置！生产环境必须配置 TOKEN_SECRET。'
      );
    }
    console.error(
      '[SECURITY] TOKEN_SECRET 环境变量未设置！令牌签名将不安全。请在 .env 中设置 TOKEN_SECRET'
    );
  }
  return secret || 'dev-only-insecure-key-do-not-use-in-production';
})();
const TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7天

export interface TokenPayload {
  userId: string;
  role: string;
  schoolId?: string;
  iat: number;
  exp: number;
}

/**
 * 生成访问令牌
 */
export function generateToken(userId: string, role: string, schoolId?: string): string {
  const payload: TokenPayload = {
    userId,
    role,
    schoolId,
    iat: Date.now(),
    exp: Date.now() + TOKEN_EXPIRY,
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = hmacSha256(encoded, TOKEN_SECRET);

  return `${encoded}.${signature}`;
}

/**
 * 验证令牌
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const [encoded, signature] = token.split('.');

    if (!encoded || !signature) return null;

    // 验证签名（使用 timingSafeEqual 防止时序攻击）
    const expectedSignature = hmacSha256(encoded, TOKEN_SECRET);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (signatureBuffer.length !== expectedBuffer.length) return null;
    if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

    // 解析载荷
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());

    // 检查过期时间
    if (Date.now() > payload.exp) return null;

    return payload;
  } catch (error) {
    console.error('令牌验证错误:', error);
    return null;
  }
}

/**
 * 刷新令牌
 */
export function refreshToken(oldToken: string): string | null {
  const payload = verifyToken(oldToken);
  if (!payload) return null;

  return generateToken(payload.userId, payload.role, payload.schoolId);
}

// ========== CSRF 防护 ==========

/**
 * 生成 CSRF 令牌
 */
export function generateCSRFToken(): string {
  return generateRandomString(32);
}

/**
 * 验证 CSRF 令牌
 */
export function verifyCSRFToken(token: string, sessionToken: string): boolean {
  if (!token || !sessionToken) return false;
  try {
    return timingSafeEqual(
      Buffer.from(token, 'utf8'),
      Buffer.from(sessionToken, 'utf8')
    );
  } catch {
    return false;
  }
}

// ========== 请求签名 ==========

/**
 * 生成请求签名
 * @param method HTTP 方法
 * @param path 请求路径
 * @param body 请求体
 * @param secret 签名密钥
 */
export function generateRequestSignature(
  method: string,
  path: string,
  body: any,
  secret: string
): string {
  const timestamp = Date.now().toString();
  const content = `${method}:${path}:${JSON.stringify(body)}:${timestamp}`;
  const signature = hmacSha256(content, secret);
  return `${timestamp}:${signature}`;
}

/**
 * 验证请求签名
 */
export function verifyRequestSignature(
  signature: string,
  method: string,
  path: string,
  body: any,
  secret: string
): boolean {
  try {
    const [timestamp, sig] = signature.split(':');

    if (!timestamp || !sig) return false;

    // 检查时间戳（请求在5分钟内有效）
    const requestTime = parseInt(timestamp);
    const now = Date.now();
    if (now - requestTime > 5 * 60 * 1000) return false;

    // 重新计算签名（使用 timingSafeEqual 防止时序攻击）
    const content = `${method}:${path}:${JSON.stringify(body)}:${timestamp}`;
    const expectedSig = hmacSha256(content, secret);
    const sigBuffer = Buffer.from(sig);
    const expectedSigBuffer = Buffer.from(expectedSig);
    if (sigBuffer.length !== expectedSigBuffer.length) return false;
    return timingSafeEqual(sigBuffer, expectedSigBuffer);
  } catch (error) {
    console.error('请求签名验证错误:', error);
    return false;
  }
}

// ========== 数据脱敏 ==========

/**
 * 脱敏手机号
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 7) return phone;
  return phone.substring(0, 3) + '****' + phone.substring(phone.length - 4);
}

/**
 * 脱敏邮箱
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [username, domain] = email.split('@');
  const maskedUsername = username.length > 2
    ? username.substring(0, 2) + '*'.repeat(username.length - 2)
    : username;
  return `${maskedUsername}@${domain}`;
}

/**
 * 脱敏姓名
 */
export function maskName(name: string): string {
  if (!name || name.length < 2) return name;
  return name.substring(0, 1) + '*'.repeat(name.length - 1);
}

// ========== URL 安全 ==========

/**
 * 验证 URL 是否安全
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // 只允许 http 和 https 协议
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // 防止 JavaScript 注入
    if (url.toLowerCase().includes('javascript:')) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 验证文件类型
 */
export function isSafeFileType(filename: string, allowedTypes: string[]): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return false;

  return allowedTypes.includes(`.${ext}`);
}

/**
 * 验证文件大小
 */
export function isSafeFileSize(size: number, maxSize: number): boolean {
  return size <= maxSize;
}

// ========== 输入清理 ==========

/**
 * 清理 HTML 输入，防止 XSS
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * 验证 SQL 输入，防止注入
 */
export function isSafeSqlInput(input: string): boolean {
  const sqlPatterns = [
    /['";\\]/,
    /\b(OR|AND)\s+\d+\s*=\s*\d+/i,
    /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|UNION)\b/i,
    /--/,
    /\/\*/,
    /\*\//,
  ];

  return !sqlPatterns.some(pattern => pattern.test(input));
}
