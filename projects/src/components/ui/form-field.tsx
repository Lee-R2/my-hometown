'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export interface FormFieldProps extends React.ComponentPropsWithoutRef<typeof Input> {
  label?: string;
  error?: string;
  success?: string;
  hint?: string;
  required?: boolean;
  containerClassName?: string;
  showErrorIcon?: boolean;
  showSuccessIcon?: boolean;
}

/**
 * 表单字段组件
 * 包含标签、输入框、错误提示和帮助文本
 */
export const FormField = React.forwardRef<
  React.ElementRef<typeof Input>,
  FormFieldProps
>(({
  label,
  error,
  success,
  hint,
  required,
  containerClassName,
  className,
  showErrorIcon = true,
  showSuccessIcon = false,
  id,
  ...props
}, ref) => {
  const inputId = id || React.useId();
  
  return (
    <div className={cn('space-y-2', containerClassName)}>
      {label && (
        <Label 
          htmlFor={inputId} 
          className={cn(
            'flex items-center gap-1',
            error && 'text-destructive'
          )}
        >
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      
      <div className="relative">
        <Input
          ref={ref}
          id={inputId}
          className={cn(
            error && 'border-destructive focus-visible:ring-destructive/20',
            success && !error && 'border-green-500 focus-visible:ring-green-500/20',
            className
          )}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          {...props}
        />
        
        {/* 错误图标 */}
        {error && showErrorIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <AlertCircle className="h-4 w-4 text-destructive" />
          </div>
        )}
        
        {/* 成功图标 */}
        {success && !error && showSuccessIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </div>
        )}
      </div>
      
      {/* 错误提示 */}
      {error && (
        <p 
          id={`${inputId}-error`}
          className="text-sm text-destructive flex items-center gap-1"
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
      
      {/* 成功提示 */}
      {success && !error && (
        <p className="text-sm text-green-600 flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {success}
        </p>
      )}
      
      {/* 帮助文本 */}
      {hint && !error && !success && (
        <p 
          id={`${inputId}-hint`}
          className="text-sm text-muted-foreground"
        >
          {hint}
        </p>
      )}
    </div>
  );
});

FormField.displayName = 'FormField';

/**
 * 表单文本域组件
 */
export interface FormTextareaProps extends React.ComponentPropsWithoutRef<'textarea'> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  containerClassName?: string;
}

export const FormTextarea = React.forwardRef<
  HTMLTextAreaElement,
  FormTextareaProps
>(({
  label,
  error,
  hint,
  required,
  containerClassName,
  className,
  id,
  ...props
}, ref) => {
  const textareaId = id || React.useId();
  
  return (
    <div className={cn('space-y-2', containerClassName)}>
      {label && (
        <Label 
          htmlFor={textareaId}
          className={cn(
            'flex items-center gap-1',
            error && 'text-destructive'
          )}
        >
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      
      <textarea
        ref={ref}
        id={textareaId}
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          error && 'border-destructive focus-visible:ring-destructive/20',
          className
        )}
        aria-invalid={!!error}
        aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
        {...props}
      />
      
      {error && (
        <p 
          id={`${textareaId}-error`}
          className="text-sm text-destructive flex items-center gap-1"
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
      
      {hint && !error && (
        <p 
          id={`${textareaId}-hint`}
          className="text-sm text-muted-foreground"
        >
          {hint}
        </p>
      )}
    </div>
  );
});

FormTextarea.displayName = 'FormTextarea';

export default FormField;
