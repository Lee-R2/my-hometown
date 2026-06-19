import { useState, useEffect, useCallback } from 'react';

/**
 * 智能体适配配置接口
 */
export interface AssistantAdaptConfig {
  /** 是否为移动端 */
  isMobile: boolean;
  /** 是否为平板 */
  isTablet: boolean;
  /** 是否为桌面端 */
  isDesktop: boolean;
  /** 屏幕宽度 */
  screenWidth: number;
  /** 屏幕高度 */
  screenHeight: number;
  /** 对话框宽度 */
  dialogWidth: string;
  /** 对话框高度 */
  dialogHeight: string;
  /** 对话框最大高度 */
  dialogMaxHeight: string;
  /** 按钮位置样式 */
  buttonPosition: string;
  /** 对话框位置样式 */
  dialogPosition: string;
  /** 是否全屏模式 */
  isFullscreen: boolean;
  /** 是否显示小图标模式 */
  isCompactMode: boolean;
  /** 移动端对话框样式类名 */
  mobileDialogClass: string;
  /** 移动端对话框内联样式 */
  mobileDialogStyle: React.CSSProperties;
}

/**
 * 智能体适配Hook
 * 根据设备类型和屏幕尺寸自动计算最佳对话框配置
 */
export function useAssistantAdapt(position: 'bottom-right' | 'bottom-left' = 'bottom-right'): AssistantAdaptConfig {
  const [config, setConfig] = useState<AssistantAdaptConfig>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    screenWidth: 1024,
    screenHeight: 768,
    dialogWidth: '384px',
    dialogHeight: '600px',
    dialogMaxHeight: '70vh',
    buttonPosition: 'bottom-6 right-6',
    dialogPosition: 'bottom-24 right-6',
    isFullscreen: false,
    isCompactMode: false,
    mobileDialogClass: '',
    mobileDialogStyle: {},
  });

  const calculateConfig = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // 设备类型判断
    const isMobile = width < 640; // sm breakpoint
    const isTablet = width >= 640 && width < 1024; // md to lg
    const isDesktop = width >= 1024;
    
    // 紧凑模式：高度较小的屏幕
    const isCompactMode = height < 600;
    
    // 计算对话框尺寸
    let dialogWidth: string;
    let dialogHeight: string;
    let dialogMaxHeight: string;
    let dialogPosition: string;
    let mobileDialogClass: string = '';
    let mobileDialogStyle: React.CSSProperties = {};
    
    if (isMobile) {
      // 移动端：对话框浮在页面之上，从底部弹出
      // 根据屏幕高度计算对话框高度，留出顶部空间
      const topSpace = Math.max(60, height * 0.05); // 顶部留出5%或至少60px
      const dialogHeightVh = Math.min(85, Math.floor((height - topSpace) / height * 100));
      
      dialogWidth = 'calc(100vw - 24px)';
      dialogHeight = `${dialogHeightVh}vh`;
      dialogMaxHeight = `${dialogHeightVh}vh`;
      dialogPosition = 'bottom-3 left-3 right-3';
      
      // 移动端专用样式类
      mobileDialogClass = 'fixed left-3 right-3 bottom-3 mx-auto rounded-2xl shadow-2xl';
      mobileDialogStyle = {
        width: 'calc(100vw - 24px)',
        maxWidth: 'calc(100vw - 24px)',
        height: `${dialogHeightVh}vh`,
        maxHeight: `${dialogHeightVh}vh`,
        zIndex: 9999,
      };
    } else if (isTablet) {
      // 平板
      dialogWidth = '380px';
      dialogHeight = '550px';
      dialogMaxHeight = '70vh';
      dialogPosition = position === 'bottom-left' 
        ? 'bottom-24 left-4' 
        : 'bottom-24 right-4';
    } else {
      // 桌面端
      dialogWidth = '420px';
      dialogHeight = '580px';
      dialogMaxHeight = '80vh';
      dialogPosition = position === 'bottom-left' 
        ? 'bottom-20 left-6' 
        : 'bottom-20 right-6';
    }
    
    // 计算按钮位置
    const buttonPosition = position === 'bottom-left' 
      ? 'bottom-5 left-5' 
      : 'bottom-5 right-5';
    
    setConfig({
      isMobile,
      isTablet,
      isDesktop,
      screenWidth: width,
      screenHeight: height,
      dialogWidth,
      dialogHeight,
      dialogMaxHeight,
      buttonPosition,
      dialogPosition,
      isFullscreen: false, // 不使用全屏模式
      isCompactMode,
      mobileDialogClass,
      mobileDialogStyle,
    });
  }, [position]);

  useEffect(() => {
    // 初始计算
    calculateConfig();
    
    // 监听窗口大小变化
    const handleResize = () => {
      calculateConfig();
    };
    
    // 使用防抖优化性能
    let resizeTimer: NodeJS.Timeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(handleResize, 100);
    };
    
    window.addEventListener('resize', debouncedResize);
    
    // 监听屏幕方向变化（移动端）
    const handleOrientationChange = () => {
      setTimeout(calculateConfig, 100);
    };
    window.addEventListener('orientationchange', handleOrientationChange);
    
    return () => {
      window.removeEventListener('resize', debouncedResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      clearTimeout(resizeTimer);
    };
  }, [calculateConfig]);

  return config;
}
