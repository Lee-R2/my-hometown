/**
 * 表单验证工具
 * 提供常用的验证规则和错误提示
 */

// 验证规则类型
export interface ValidationRule {
  required?: boolean;
  message?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
  custom?: (value: string) => boolean | string;
}

// 验证结果
export interface ValidationResult {
  isValid: boolean;
  message: string;
}

// 常用正则表达式
export const PATTERNS = {
  // 手机号：1开头，11位数字
  phone: /^1[3-9]\d{9}$/,
  // 邮箱
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  // 用户名：字母开头，允许字母数字下划线，4-20位
  username: /^[a-zA-Z][a-zA-Z0-9_]{3,19}$/,
  // 密码：至少6位
  password: /^.{6,}$/,
  // 数字
  number: /^\d+$/,
  // 整数
  integer: /^-?\d+$/,
  // 正整数
  positiveInteger: /^[1-9]\d*$/,
  // URL
  url: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
  // 中文
  chinese: /^[\u4e00-\u9fa5]+$/,
  // 身份证号
  idCard: /^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/,
};

// 默认错误消息
export const DEFAULT_MESSAGES = {
  required: '此项为必填项',
  minLength: (min: number) => `长度不能少于 ${min} 个字符`,
  maxLength: (max: number) => `长度不能超过 ${max} 个字符`,
  pattern: '格式不正确',
  phone: '请输入正确的手机号格式',
  email: '请输入正确的邮箱格式',
  username: '用户名需以字母开头，4-20位字母数字下划线',
  password: '密码长度至少6位',
  number: '请输入数字',
  positiveInteger: '请输入正整数',
  url: '请输入正确的网址',
  chinese: '请输入中文',
  idCard: '请输入正确的身份证号',
};

/**
 * 验证单个字段
 */
export function validateField(value: string, rules: ValidationRule[]): ValidationResult {
  for (const rule of rules) {
    // 必填验证
    if (rule.required && (!value || value.trim() === '')) {
      return {
        isValid: false,
        message: rule.message || DEFAULT_MESSAGES.required,
      };
    }

    // 如果值为空且非必填，跳过其他验证
    if (!value || value.trim() === '') {
      continue;
    }

    // 最小长度验证
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      return {
        isValid: false,
        message: rule.message || DEFAULT_MESSAGES.minLength(rule.minLength),
      };
    }

    // 最大长度验证
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      return {
        isValid: false,
        message: rule.message || DEFAULT_MESSAGES.maxLength(rule.maxLength),
      };
    }

    // 正则验证
    if (rule.pattern && !rule.pattern.test(value)) {
      return {
        isValid: false,
        message: rule.patternMessage || rule.message || DEFAULT_MESSAGES.pattern,
      };
    }

    // 自定义验证
    if (rule.custom) {
      const result = rule.custom(value);
      if (result !== true) {
        return {
          isValid: false,
          message: typeof result === 'string' ? result : (rule.message || '验证失败'),
        };
      }
    }
  }

  return { isValid: true, message: '' };
}

/**
 * 验证手机号
 */
export function validatePhone(value: string, required: boolean = true): ValidationResult {
  const rules: ValidationRule[] = [];
  
  if (required) {
    rules.push({ required: true, message: '请输入手机号' });
  }
  
  rules.push({
    pattern: PATTERNS.phone,
    patternMessage: DEFAULT_MESSAGES.phone,
  });

  return validateField(value, rules);
}

/**
 * 验证邮箱
 */
export function validateEmail(value: string, required: boolean = true): ValidationResult {
  const rules: ValidationRule[] = [];
  
  if (required) {
    rules.push({ required: true, message: '请输入邮箱' });
  }
  
  rules.push({
    pattern: PATTERNS.email,
    patternMessage: DEFAULT_MESSAGES.email,
  });

  return validateField(value, rules);
}

/**
 * 验证必填字段
 */
export function validateRequired(value: string, fieldName: string = '此项'): ValidationResult {
  return validateField(value, [{ required: true, message: `请输入${fieldName}` }]);
}

/**
 * 验证数字
 */
export function validateNumber(value: string, required: boolean = true, min?: number, max?: number): ValidationResult {
  const rules: ValidationRule[] = [];
  
  if (required) {
    rules.push({ required: true, message: '请输入数字' });
  }
  
  rules.push({
    pattern: PATTERNS.number,
    patternMessage: DEFAULT_MESSAGES.number,
  });

  if (min !== undefined || max !== undefined) {
    rules.push({
      custom: (val) => {
        const num = parseFloat(val);
        if (min !== undefined && num < min) {
          return `数值不能小于 ${min}`;
        }
        if (max !== undefined && num > max) {
          return `数值不能大于 ${max}`;
        }
        return true;
      },
    });
  }

  return validateField(value, rules);
}

/**
 * 验证正整数
 */
export function validatePositiveInteger(value: string, required: boolean = true): ValidationResult {
  const rules: ValidationRule[] = [];
  
  if (required) {
    rules.push({ required: true, message: '请输入数值' });
  }
  
  rules.push({
    pattern: PATTERNS.positiveInteger,
    patternMessage: DEFAULT_MESSAGES.positiveInteger,
  });

  return validateField(value, rules);
}

/**
 * 验证长度范围
 */
export function validateLength(value: string, min: number, max: number, required: boolean = true): ValidationResult {
  const rules: ValidationRule[] = [];
  
  if (required) {
    rules.push({ required: true, message: '此项为必填项' });
  }
  
  rules.push({ minLength: min, maxLength: max });

  return validateField(value, rules);
}

/**
 * 验证整个表单
 */
export function validateForm(
  formData: Record<string, string>,
  rules: Record<string, ValidationRule[]>
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  let isValid = true;

  for (const [field, fieldRules] of Object.entries(rules)) {
    const value = formData[field] || '';
    const result = validateField(value, fieldRules);
    
    if (!result.isValid) {
      errors[field] = result.message;
      isValid = false;
    }
  }

  return { isValid, errors };
}
