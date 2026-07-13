import { useSyncExternalStore } from 'react';

/**
 * 响应式断点配置
 */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

/**
 * 响应式配置接口
 */
export interface ResponsiveConfig {
  /** 是否为移动端 (< 640px) */
  isMobile: boolean;
  /** 是否为平板 (640px - 1024px) */
  isTablet: boolean;
  /** 是否为桌面端 (>= 1024px) */
  isDesktop: boolean;
  /** 屏幕宽度 */
  screenWidth: number;
  /** 屏幕高度 */
  screenHeight: number;
  /** 是否为小屏幕 (宽度 < 768px) */
  isSmallScreen: boolean;
  /** 是否为中等屏幕 (768px - 1280px) */
  isMediumScreen: boolean;
  /** 是否为大屏幕 (>= 1280px) */
  isLargeScreen: boolean;
  /** 是否为横屏模式 */
  isLandscape: boolean;
  /** 是否为竖屏模式 */
  isPortrait: boolean;
  /** 网格列数建议 */
  gridCols: {
    /** 数据卡片网格列数 */
    dataCards: number;
    /** 功能菜单网格列数 */
    menuCards: number;
    /** 表单网格列数 */
    formCols: number;
  };
  /** 间距建议 */
  spacing: {
    /** 页面内边距 */
    pagePadding: string;
    /** 卡片间距 */
    cardGap: string;
  };
}

/**
 * 服务端渲染默认配置（安全默认值，避免 hydration mismatch）
 * 使用桌面端配置作为默认值，与大部分客户端首屏渲染一致
 */
const SERVER_DEFAULT: ResponsiveConfig = {
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  screenWidth: 1024,
  screenHeight: 768,
  isSmallScreen: false,
  isMediumScreen: false,
  isLargeScreen: true,
  isLandscape: true,
  isPortrait: false,
  gridCols: {
    dataCards: 4,
    menuCards: 3,
    formCols: 2,
  },
  spacing: {
    pagePadding: 'px-4 md:px-6',
    cardGap: 'gap-4',
  },
};

/**
 * 根据宽高计算响应式配置（纯函数，不访问 window）
 */
function calculateConfig(width: number, height: number): ResponsiveConfig {
  // 设备类型判断
  const isMobile = width < breakpoints.sm;
  const isTablet = width >= breakpoints.sm && width < breakpoints.lg;
  const isDesktop = width >= breakpoints.lg;

  // 屏幕大小判断
  const isSmallScreen = width < breakpoints.md;
  const isMediumScreen = width >= breakpoints.md && width < breakpoints.xl;
  const isLargeScreen = width >= breakpoints.xl;

  // 屏幕方向判断
  const isLandscape = width > height;
  const isPortrait = width <= height;

  // 计算网格列数
  let dataCards: number;
  let menuCards: number;
  let formCols: number;

  if (isMobile) {
    dataCards = 2;
    menuCards = 1;
    formCols = 1;
  } else if (width < breakpoints.md) {
    dataCards = 2;
    menuCards = 2;
    formCols = 1;
  } else if (width < breakpoints.lg) {
    dataCards = 3;
    menuCards = 2;
    formCols = 2;
  } else if (width < breakpoints.xl) {
    dataCards = 4;
    menuCards = 3;
    formCols = 2;
  } else {
    dataCards = 6;
    menuCards = 3;
    formCols = 2;
  }

  // 计算间距
  const pagePadding = isMobile ? 'px-3' : isTablet ? 'px-4' : 'px-6';
  const cardGap = isMobile ? 'gap-3' : 'gap-4';

  return {
    isMobile,
    isTablet,
    isDesktop,
    screenWidth: width,
    screenHeight: height,
    isSmallScreen,
    isMediumScreen,
    isLargeScreen,
    isLandscape,
    isPortrait,
    gridCols: {
      dataCards,
      menuCards,
      formCols,
    },
    spacing: {
      pagePadding,
      cardGap,
    },
  };
}

/**
 * 缓存上一次的快照，确保 getSnapshot 返回稳定引用（useSyncExternalStore 要求）
 * 只有当宽高真正变化时才重新计算
 */
let cachedSnapshot: ResponsiveConfig | null = null;
let lastWidth = -1;
let lastHeight = -1;

/**
 * 客户端快照：读取 window 尺寸并返回缓存的配置
 */
function getSnapshot(): ResponsiveConfig {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (cachedSnapshot && width === lastWidth && height === lastHeight) {
    return cachedSnapshot;
  }
  lastWidth = width;
  lastHeight = height;
  cachedSnapshot = calculateConfig(width, height);
  return cachedSnapshot;
}

/**
 * 服务端快照：返回固定默认值，避免 hydration mismatch
 */
function getServerSnapshot(): ResponsiveConfig {
  return SERVER_DEFAULT;
}

/**
 * 订阅窗口尺寸变化（debounce 100ms 减少渲染次数）
 */
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
function subscribe(callback: () => void): () => void {
  const debouncedResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(callback, 100);
  };

  window.addEventListener('resize', debouncedResize);

  // 监听屏幕方向变化（移动端）
  const mediaQuery = window.matchMedia('(orientation: portrait)');
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', callback);
  } else {
    // Safari < 14 兼容
    mediaQuery.addListener(callback);
  }

  return () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    window.removeEventListener('resize', debouncedResize);
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener('change', callback);
    } else {
      mediaQuery.removeListener(callback);
    }
  };
}

/**
 * 响应式布局Hook
 * 根据屏幕尺寸自动计算最佳布局配置
 *
 * 使用 useSyncExternalStore 实现，正确支持 SSR：
 * - 服务端渲染返回固定默认值（桌面端配置）
 * - 客户端 hydrate 时使用相同默认值，避免 hydration mismatch warning
 * - hydrate 完成后立即同步到实际窗口尺寸
 */
export function useResponsive(): ResponsiveConfig {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * 获取响应式类名
 */
export function getResponsiveClass(
  config: ResponsiveConfig,
  options: {
    mobile?: string;
    tablet?: string;
    desktop?: string;
  }
): string {
  if (config.isMobile && options.mobile) {
    return options.mobile;
  }
  if (config.isTablet && options.tablet) {
    return options.tablet;
  }
  if (config.isDesktop && options.desktop) {
    return options.desktop;
  }
  return '';
}

/**
 * 判断是否应该使用简化布局（移动端或小屏幕）
 */
export function shouldUseSimplifiedLayout(config: ResponsiveConfig): boolean {
  return config.isMobile || config.isSmallScreen;
}

/**
 * 获取卡片网格类名
 */
export function getCardGridClass(config: ResponsiveConfig, type: 'data' | 'menu' = 'data'): string {
  if (type === 'data') {
    switch (config.gridCols.dataCards) {
      case 2: return 'grid-cols-2';
      case 3: return 'grid-cols-3';
      case 4: return 'grid-cols-4';
      case 6: return 'grid-cols-3 md:grid-cols-6';
      default: return 'grid-cols-2 md:grid-cols-4';
    }
  } else {
    switch (config.gridCols.menuCards) {
      case 1: return 'grid-cols-1';
      case 2: return 'grid-cols-1 md:grid-cols-2';
      case 3: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
      default: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    }
  }
}
