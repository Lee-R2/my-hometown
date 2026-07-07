/**
 * 安全配置
 * 集中管理所有安全相关的配置
 */

// ========== 密码配置 ==========

export const PASSWORD_CONFIG = {
  /** 最小密码长度 */
  MIN_LENGTH: 8,
  /** 最大密码长度 */
  MAX_LENGTH: 50,
  /** 密码哈希算法 */
  HASH_ALGORITHM: 'sha256' as const,
  /** 盐值长度 */
  SALT_LENGTH: 32,
  /** 哈希迭代次数 */
  ITERATIONS: 10000,
  /** 常见弱密码列表 */
  COMMON_WEAK_PASSWORDS: [
    '123456',
    'password',
    '123456789',
    '12345678',
    '12345',
    '111111',
    '1234567',
    'qwerty',
    'abc123',
    'password123',
    'admin',
    'root',
    '123123',
  ],
} as const;

// ========== 令牌配置 ==========

export const TOKEN_CONFIG = {
  /** 令牌密钥（生产环境必须更改） */
  SECRET: (() => {
    const secret = process.env.TOKEN_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error(
        '[SECURITY] TOKEN_SECRET 环境变量未设置！生产环境必须配置 TOKEN_SECRET。'
      );
    }
    return secret || 'your-secret-key-change-in-production';
  })(),
  /** 访问令牌有效期（毫秒） */
  ACCESS_TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7天
  /** 刷新令牌有效期（毫秒） */
  REFRESH_TOKEN_EXPIRY: 30 * 24 * 60 * 60 * 1000, // 30天
  /** CSRF 令牌有效期（毫秒） */
  CSRF_TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7天
  /** 令牌算法 */
  ALGORITHM: 'HS256',
} as const;

// ========== 会话配置 ==========

export const SESSION_CONFIG = {
  /** 会话 Cookie 名称 */
  COOKIE_NAME: 'session',
  /** CSRF Cookie 名称 */
  CSRF_COOKIE_NAME: 'csrf_token',
  /** 会话最大有效期（毫秒） */
  MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7天
  /** 同一用户最大并发会话数 */
  MAX_CONCURRENT_SESSIONS: 5,
  /** Cookie 路径 */
  COOKIE_PATH: '/',
  /** Cookie 是否仅 HTTPS */
  COOKIE_SECURE: process.env.NODE_ENV === 'production',
  /** Cookie SameSite 策略 */
  COOKIE_SAMESITE: 'Strict' as const,
} as const;

// ========== 频率限制配置 ==========

export const RATE_LIMIT_CONFIG = {
  /** 登录限制 */
  LOGIN: {
    WINDOW_MS: 15 * 60 * 1000, // 15分钟
    MAX_REQUESTS: 5,
    MESSAGE: '登录尝试过于频繁，请15分钟后再试',
  },
  /** API 限制 */
  API: {
    WINDOW_MS: 60 * 1000, // 1分钟
    MAX_REQUESTS: 60,
    MESSAGE: 'API 请求过于频繁，请稍后再试',
  },
  /** 上传限制 */
  UPLOAD: {
    WINDOW_MS: 60 * 60 * 1000, // 1小时
    MAX_REQUESTS: 20,
    MESSAGE: '文件上传过于频繁，请稍后再试',
  },
  /** 敏感操作限制 */
  SENSITIVE: {
    WINDOW_MS: 24 * 60 * 60 * 1000, // 1天
    MAX_REQUESTS: 10,
    MESSAGE: '敏感操作过于频繁，请明天再试',
  },
  /** 一般访问限制 */
  GENERAL: {
    WINDOW_MS: 60 * 1000, // 1分钟
    MAX_REQUESTS: 100,
    MESSAGE: '访问过于频繁，请稍后再试',
  },
  /** 密码重置限制 */
  PASSWORD_RESET: {
    WINDOW_MS: 60 * 60 * 1000, // 1小时
    MAX_REQUESTS: 3,
    MESSAGE: '密码重置尝试过于频繁，请1小时后再试',
  },
} as const;

// ========== IP 配置 ==========

export const IP_CONFIG = {
  /** 是否启用 IP 白名单 */
  ENABLE_WHITELIST: false,
  /** 是否启用 IP 黑名单 */
  ENABLE_BLACKLIST: true,
  /** 默认黑名单过期时间（毫秒） */
  BLACKLIST_DEFAULT_EXPIRY: 30 * 24 * 60 * 60 * 1000, // 30天
  /** 是否自动检测异常 IP */
  AUTO_DETECT_SUSPICIOUS: false,
  /** 异常检测阈值（1小时内请求数） */
  SUSPICIOUS_THRESHOLD: 1000,
} as const;

// ========== 文件上传配置 ==========

export const FILE_UPLOAD_CONFIG = {
  /** 最大文件大小（字节） */
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  /** 允许的图片类型 */
  ALLOWED_IMAGE_TYPES: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  /** 允许的文档类型 */
  ALLOWED_DOCUMENT_TYPES: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'],
  /** 允许的视频类型 */
  ALLOWED_VIDEO_TYPES: ['.mp4', '.avi', '.mov', '.wmv', '.flv'],
  /** 允许的音频类型 */
  ALLOWED_AUDIO_TYPES: ['.mp3', '.wav', '.ogg', '.m4a'],
  /** 所有允许的类型 */
  getAllowedTypes(): string[] {
    return [
      ...this.ALLOWED_IMAGE_TYPES,
      ...this.ALLOWED_DOCUMENT_TYPES,
      ...this.ALLOWED_VIDEO_TYPES,
      ...this.ALLOWED_AUDIO_TYPES,
    ];
  },
} as const;

// ========== 输入验证配置 ==========

export const INPUT_VALIDATION_CONFIG = {
  /** 用户名正则表达式 */
  USERNAME_REGEX: /^[a-zA-Z0-9_@.-]{3,50}$/,
  /** 用户名最小长度 */
  USERNAME_MIN_LENGTH: 3,
  /** 用户名最大长度 */
  USERNAME_MAX_LENGTH: 50,
  /** 邮箱正则表达式 */
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  /** 手机号正则表达式 */
  PHONE_REGEX: /^1[3-9]\d{9}$/,
  /** URL 正则表达式 */
  URL_REGEX: /^https?:\/\/.+/,
  /** SQL 注入检测正则表达式 */
  SQL_INJECTION_PATTERNS: [
    /['";\\]/,
    /\b(OR|AND)\s+\d+\s*=\s*\d+/i,
    /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|UNION)\b/i,
    /--/,
    /\/\*/,
    /\*\//,
  ],
  /** XSS 检测正则表达式 */
  XSS_PATTERNS: [
    /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
    /<iframe\b[^>]*>([\s\S]*?)<\/iframe>/gi,
    /on\w+\s*=/gi,
    /javascript:/gi,
  ],
} as const;

// ========== 安全响应头配置 ==========

export const SECURITY_HEADERS_CONFIG = {
  /** 内容类型嗅探保护 */
  'X-Content-Type-Options': 'nosniff',
  /** 点击劫持保护 */
  'X-Frame-Options': 'DENY',
  /** XSS 保护 */
  'X-XSS-Protection': '1; mode=block',
  /** 引用策略 */
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  /** 权限策略 */
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
  /** 内容安全策略（可选） */
  'Content-Security-Policy': process.env.NODE_ENV === 'production'
    ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    : undefined,
  /** 严格传输安全（仅 HTTPS） */
  'Strict-Transport-Security': process.env.NODE_ENV === 'production'
    ? 'max-age=31536000; includeSubDomains'
    : undefined,
} as const;

// ========== 日志配置 ==========

export const LOGGING_CONFIG = {
  /** 是否记录所有请求 */
  LOG_ALL_REQUESTS: true,
  /** 是否记录失败的请求 */
  LOG_FAILED_REQUESTS: true,
  /** 是否记录慢请求（超过1秒） */
  LOG_SLOW_REQUESTS: true,
  /** 慢请求阈值（毫秒） */
  SLOW_REQUEST_THRESHOLD: 1000,
  /** 日志保留天数 */
  LOG_RETENTION_DAYS: 90,
  /** 是否记录安全事件 */
  LOG_SECURITY_EVENTS: true,
  /** 安全事件严重级别 */
  SECURITY_EVENT_SEVERITY: ['info', 'warning', 'error', 'critical'] as const,
} as const;

// ========== 清理配置 ==========

export const CLEANUP_CONFIG = {
  /** 过期会话清理间隔（毫秒） */
  SESSION_CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // 1天
  /** 过期频率限制记录清理间隔（毫秒） */
  RATE_LIMIT_CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // 1天
  /** 过期日志清理间隔（毫秒） */
  LOG_CLEANUP_INTERVAL: 7 * 24 * 60 * 60 * 1000, // 7天
} as const;

// ========== 安全事件类型 ==========

export const SECURITY_EVENT_TYPES = {
  /** 登录成功 */
  LOGIN_SUCCESS: 'login_success',
  /** 登录失败 */
  LOGIN_FAILURE: 'login_failure',
  /** 登录被锁定 */
  LOGIN_LOCKED: 'login_locked',
  /** 密码重置 */
  PASSWORD_RESET: 'password_reset',
  /** 会话创建 */
  SESSION_CREATED: 'session_created',
  /** 会话失效 */
  SESSION_INVALIDATED: 'session_invalidated',
  /** 权限提升 */
  PRIVILEGE_ESCALATION: 'privilege_escalation',
  /** 数据访问 */
  DATA_ACCESS: 'data_access',
  /** 数据修改 */
  DATA_MODIFICATION: 'data_modification',
  /** 频率限制触发 */
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  /** IP 被封禁 */
  IP_BLOCKED: 'ip_blocked',
  /** 检测到异常活动 */
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  /** SQL 注入尝试 */
  SQL_INJECTION_ATTEMPT: 'sql_injection_attempt',
  /** XSS 尝试 */
  XSS_ATTEMPT: 'xss_attempt',
  /** CSRF 攻击尝试 */
  CSRF_ATTEMPT: 'csrf_attempt',
} as const;

// ========== 安全事件严重性 ==========

export const SECURITY_EVENT_SEVERITY = {
  /** 信息 */
  INFO: 'info',
  /** 警告 */
  WARNING: 'warning',
  /** 错误 */
  ERROR: 'error',
  /** 严重 */
  CRITICAL: 'critical',
} as const;

// ========== 环境特定配置 ==========

export const ENV_SPECIFIC_CONFIG = {
  development: {
    ENABLE_SECURITY_HEADERS: false,
    ENABLE_RATE_LIMIT: false,
    ENABLE_IP_BLACKLIST: false,
    LOG_ALL_REQUESTS: true,
  },
  production: {
    ENABLE_SECURITY_HEADERS: true,
    ENABLE_RATE_LIMIT: true,
    ENABLE_IP_BLACKLIST: true,
    LOG_ALL_REQUESTS: true,
  },
} as const;

// ========== 获取当前环境的配置 ==========

export function getEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';
  return ENV_SPECIFIC_CONFIG[env as keyof typeof ENV_SPECIFIC_CONFIG] || ENV_SPECIFIC_CONFIG.development;
}

// ========== 验证配置 ==========

export function validateSecurityConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 检查令牌密钥
  if (TOKEN_CONFIG.SECRET === 'your-secret-key-change-in-production') {
    errors.push('⚠️ TOKEN_SECRET 使用了默认值，生产环境必须更改');
  }

  // 检查密码配置
  if (PASSWORD_CONFIG.MIN_LENGTH < 8) {
    errors.push('⚠️ 密码最小长度应至少为8位');
  }

  // 检查频率限制配置
  if (RATE_LIMIT_CONFIG.LOGIN.MAX_REQUESTS < 3) {
    errors.push('⚠️ 登录频率限制过少，可能导致用户体验问题');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
