/**
 * 安全工具库
 * 提供加密、令牌、验证等安全功能
 */

import bcrypt from 'bcryptjs';
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

// 旧版 SHA-256 参数，仅用于兼容验证历史数据，不再用于生成新哈希
const LEGACY_PASSWORD_HASH_ALGORITHM = 'sha256';
const LEGACY_PASSWORD_ITERATIONS = 10000;
const BCRYPT_COST_FACTOR = 10;

/**
 * 旧版 SHA-256 密码哈希（仅用于兼容验证历史数据）
 * 返回格式: salt:hash
 */
function legacySha256Hash(password: string, salt: string): string {
  let hash = password;
  for (let i = 0; i < LEGACY_PASSWORD_ITERATIONS; i++) {
    hash = createHash(LEGACY_PASSWORD_HASH_ALGORITHM).update(hash + salt).digest('hex');
  }
  return hash;
}

/**
 * 哈希密码（使用 bcrypt，cost factor 10）
 * bcrypt 自带盐值且抗 GPU/ASIC 破解，替代旧的 SHA-256 迭代方案
 * @param password 明文密码
 * @returns bcrypt 哈希字符串（以 $2a$ / $2b$ 开头）
 */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_COST_FACTOR);
}

/**
 * 异步哈希密码 — 不阻塞事件循环，推荐在 API 路由中使用
 */
export async function hashPasswordAsync(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

/**
 * 验证密码（兼容 bcrypt 与旧 SHA-256 哈希）
 * - 新哈希（bcrypt，$2a$ / $2b$ / $2y$ 开头）：直接 bcrypt.compare
 * - 旧哈希（salt:hash 格式）：回退到 SHA-256 验证
 *
 * 验证成功后，调用方应通过 needsRehash() 判断是否需要用 bcrypt 重新哈希升级，
 * 以实现平滑迁移：老用户登录后哈希自动升级。
 * @param password 明文密码
 * @param hashedPassword 哈希后的密码（bcrypt 或旧 salt:hash 格式）
 */
export function verifyPassword(password: string, hashedPassword: string): boolean {
  try {
    if (!hashedPassword) return false;

    // 先尝试 bcrypt（新哈希以 $2a$ / $2b$ / $2y$ 开头）
    if (
      hashedPassword.startsWith('$2a$') ||
      hashedPassword.startsWith('$2b$') ||
      hashedPassword.startsWith('$2y$')
    ) {
      return bcrypt.compareSync(password, hashedPassword);
    }

    // 回退到旧 SHA-256 验证（兼容老数据，格式 salt:hash）
    if (hashedPassword.includes(':')) {
      const [salt, storedHash] = hashedPassword.split(':');
      if (!salt || !storedHash) return false;
      const computedHash = legacySha256Hash(password, salt);
      try {
        const storedBuffer = Buffer.from(storedHash, 'hex');
        const computedBuffer = Buffer.from(computedHash, 'hex');
        // 使用 timing-safe equal 防止时序攻击
        if (storedBuffer.length !== computedBuffer.length) return false;
        return timingSafeEqual(storedBuffer, computedBuffer);
      } catch {
        return false;
      }
    }

    return false;
  } catch (error) {
    console.error('密码验证错误:', error);
    return false;
  }
}

/**
 * 异步验证密码 — 不阻塞事件循环，推荐在 API 路由中使用
 * 语义与 verifyPassword 完全一致，仅改为异步 bcrypt.compare
 */
export async function verifyPasswordAsync(password: string, hashedPassword: string): Promise<boolean> {
  try {
    if (!hashedPassword) return false;

    if (
      hashedPassword.startsWith('$2a$') ||
      hashedPassword.startsWith('$2b$') ||
      hashedPassword.startsWith('$2y$')
    ) {
      return bcrypt.compare(password, hashedPassword);
    }

    // SHA-256 回退路径：CPU 密集但非事件循环瓶颈，直接调同步版
    return verifyPassword(password, hashedPassword);
  } catch (error) {
    console.error('密码验证错误:', error);
    return false;
  }
}

/**
 * 判断密码哈希是否需要升级到 bcrypt
 * 登录成功后调用：若返回 true，应用 hashPassword 重新哈希并写回数据库
 */
export function needsRehash(hashedPassword: string): boolean {
  if (!hashedPassword) return false;
  return !(
    hashedPassword.startsWith('$2a$') ||
    hashedPassword.startsWith('$2b$') ||
    hashedPassword.startsWith('$2y$')
  );
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

// 安全修复 VULN-API-019: TOKEN_SECRET 缺失时不允许降级为公开硬编码密钥，
// 否则攻击者可使用公开密钥伪造任意 JWT 令牌冒充任意用户。
// 无条件抛错，要求所有环境（含开发）都必须在 .env.local 中配置 TOKEN_SECRET。
const TOKEN_SECRET = (() => {
  const secret = process.env.TOKEN_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error(
      '[SECURITY] TOKEN_SECRET 环境变量未配置！请在 .env / .env.local 中设置一个足够随机的 TOKEN_SECRET 后再启动服务。'
    );
  }
  return secret;
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
 * 脱敏手机号（maskPhoneNumber 的别名，统一对外命名）
 * 显示为 138****1234 格式
 */
export function maskPhone(phone: string): string {
  return maskPhoneNumber(phone);
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
 * 判断 IP 字符串是否为内网/保留地址（IPv4）
 * 覆盖：10.x、172.16-31.x、192.168.x、127.x、169.254.x、0.x
 * 安全修复（P3 SSRF）：防止服务端被诱导请求内网资源
 */
export function isPrivateIp(ip: string): boolean {
  // 仅处理 IPv4，IPv6 暂按非内网处理（下方 isInternalHost 兜底）
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) return false;
  const [a, b] = [parseInt(ipv4Match[1], 10), parseInt(ipv4Match[2], 10)];
  if (a === 10) return true;                 // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;   // 192.168.0.0/16
  if (a === 127) return true;                // 127.0.0.0/8 回环
  if (a === 169 && b === 254) return true;   // 169.254.0.0/16 链路本地
  if (a === 0) return true;                  // 0.0.0.0/8
  return false;
}

/**
 * 判断主机名是否指向内部/本机（用于 SSRF 防御）
 * 覆盖：localhost、*.local、IP 字面量回环、内网 IP
 */
export function isInternalHost(host: string): boolean {
  const h = host.toLowerCase().trim();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === 'local' || h.endsWith('.local')) return true;
  // 方括号包裹的 IPv6 字面量（如 [::1]）
  if (h.startsWith('[') && h.endsWith(']')) return true;
  // IPv4 字面量
  if (isPrivateIp(h)) return true;
  return false;
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
 * 危险扩展名黑名单（即使 MIME 类型看起来正常也拒绝）
 * 安全修复（P3 输入校验）：防止上传可执行脚本/可含 XSS 的文件
 * - .exe/.bat/.cmd/.sh：可执行脚本
 * - .php/.js：服务端/客户端脚本
 * - .html/.svg：可内嵌脚本导致 XSS
 */
const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'php', 'js', 'html', 'htm', 'svg',
]);

/**
 * 判断文件扩展名是否在危险黑名单中
 */
export function isDangerousExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return true; // 无扩展名视为危险
  return DANGEROUS_EXTENSIONS.has(ext);
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
