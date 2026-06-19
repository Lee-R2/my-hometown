'use client';

import { useState, useCallback, useMemo } from 'react';
import { validateField, ValidationRule, ValidationResult } from '@/lib/validation';

export interface FormFieldConfig {
  rules: ValidationRule[];
  validateOnBlur?: boolean;
  validateOnChange?: boolean;
}

export interface UseFormValidationOptions {
  fields: Record<string, FormFieldConfig>;
  validateOnSubmit?: boolean;
}

export interface UseFormValidationReturn<T extends Record<string, string>> {
  values: T;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  setValue: (field: keyof T, value: string) => void;
  setValues: (values: Partial<T>) => void;
  handleBlur: (field: keyof T) => void;
  handleChange: (field: keyof T, value: string) => void;
  validateField: (field: keyof T) => ValidationResult;
  validateForm: () => boolean;
  resetForm: (initialValues?: Partial<T>) => void;
  getFieldProps: (field: keyof T) => {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
    onBlur: () => void;
    error?: string;
  };
  hasError: boolean;
  isValid: boolean;
}

/**
 * 表单验证 Hook
 * 支持实时验证、失焦验证、提交验证
 */
export function useFormValidation<T extends Record<string, string>>(
  initialValues: T,
  options: UseFormValidationOptions
): UseFormValidationReturn<T> {
  const [values, setValuesState] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // 设置单个字段值
  const setValue = useCallback((field: keyof T, value: string) => {
    setValuesState(prev => ({ ...prev, [field]: value }));
    
    // 如果配置了实时验证，验证该字段
    const fieldConfig = options.fields[field as string];
    if (fieldConfig?.validateOnChange && touched[field as string]) {
      const result = validateField(value, fieldConfig.rules);
      setErrors(prev => ({
        ...prev,
        [field]: result.isValid ? '' : result.message,
      }));
    } else if (errors[field as string]) {
      // 清除已有错误（如果值已改变）
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field as string];
        return newErrors;
      });
    }
  }, [options.fields, touched, errors]);

  // 批量设置值
  const setValues = useCallback((newValues: Partial<T>) => {
    setValuesState(prev => ({ ...prev, ...newValues }));
  }, []);

  // 验证单个字段
  const validateSingleField = useCallback((field: keyof T): ValidationResult => {
    const fieldConfig = options.fields[field as string];
    if (!fieldConfig) {
      return { isValid: true, message: '' };
    }

    const value = values[field as string] || '';
    const result = validateField(value, fieldConfig.rules);
    
    setErrors(prev => ({
      ...prev,
      [field]: result.isValid ? '' : result.message,
    }));

    return result;
  }, [values, options.fields]);

  // 验证整个表单
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    for (const [field, config] of Object.entries(options.fields)) {
      const value = values[field] || '';
      const result = validateField(value, config.rules);
      
      if (!result.isValid) {
        newErrors[field] = result.message;
        isValid = false;
      }
    }

    setErrors(newErrors);
    
    // 标记所有字段为已触碰
    const allTouched: Record<string, boolean> = {};
    for (const field of Object.keys(options.fields)) {
      allTouched[field] = true;
    }
    setTouched(allTouched);

    return isValid;
  }, [values, options.fields]);

  // 处理失焦事件
  const handleBlur = useCallback((field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    
    // 如果配置了失焦验证
    const fieldConfig = options.fields[field as string];
    if (fieldConfig?.validateOnBlur !== false) {
      validateSingleField(field);
    }
  }, [options.fields, validateSingleField]);

  // 处理输入变化
  const handleChange = useCallback((field: keyof T, value: string) => {
    setValue(field, value);
  }, [setValue]);

  // 重置表单
  const resetForm = useCallback((newInitialValues?: Partial<T>) => {
    setValuesState(newInitialValues ? { ...initialValues, ...newInitialValues } : initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  // 获取字段属性（用于绑定到 Input 组件）
  const getFieldProps = useCallback((field: keyof T) => {
    return {
      value: values[field as string] || '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        handleChange(field, e.target.value);
      },
      onBlur: () => handleBlur(field),
      error: touched[field as string] ? errors[field as string] : undefined,
    };
  }, [values, errors, touched, handleChange, handleBlur]);

  // 计算是否有错误
  const hasError = useMemo(() => Object.values(errors).some(e => e), [errors]);
  const isValid = useMemo(() => !hasError, [hasError]);

  return {
    values,
    errors,
    touched,
    setValue,
    setValues,
    handleBlur,
    handleChange,
    validateField: validateSingleField,
    validateForm,
    resetForm,
    getFieldProps,
    hasError,
    isValid,
  };
}

/**
 * 简化的表单验证 Hook
 * 用于简单的表单场景
 */
export function useFieldValidation(
  initialValue: string = '',
  rules: ValidationRule[]
) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string>('');
  const [touched, setTouched] = useState(false);

  const handleChange = useCallback((newValue: string) => {
    setValue(newValue);
    if (touched) {
      const result = validateField(newValue, rules);
      setError(result.isValid ? '' : result.message);
    } else if (error) {
      setError('');
    }
  }, [rules, touched, error]);

  const handleBlur = useCallback(() => {
    setTouched(true);
    const result = validateField(value, rules);
    setError(result.isValid ? '' : result.message);
  }, [value, rules]);

  const validate = useCallback((): boolean => {
    const result = validateField(value, rules);
    setError(result.isValid ? '' : result.message);
    setTouched(true);
    return result.isValid;
  }, [value, rules]);

  const reset = useCallback(() => {
    setValue(initialValue);
    setError('');
    setTouched(false);
  }, [initialValue]);

  return {
    value,
    error,
    touched,
    handleChange,
    handleBlur,
    validate,
    reset,
    setValue,
  };
}
