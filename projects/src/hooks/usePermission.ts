'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  RoleType, 
  PermissionLevel, 
  RoleConfig,
  DEFAULT_ROLE_CONFIGS,
  getModulePermission,
  hasModuleAccess,
} from '@/lib/permissions';

interface UsePermissionResult {
  role: RoleType | null;
  roleConfig: RoleConfig | null;
  loading: boolean;
  hasAccess: (moduleId: string) => boolean;
  getPermission: (moduleId: string) => PermissionLevel;
  requireAccess: (moduleId: string, minimumLevel?: PermissionLevel) => boolean;
}

export function usePermission(): UsePermissionResult {
  const router = useRouter();
  const [role, setRole] = useState<RoleType | null>(null);
  const [roleConfig, setRoleConfig] = useState<RoleConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/');
      return;
    }

    try {
      const user = JSON.parse(userData);
      const userRole = user.role as RoleType;
      setRole(userRole);

      // 加载权限配置
      const savedConfigs = localStorage.getItem('roleConfigs');
      let configs: RoleConfig[] = DEFAULT_ROLE_CONFIGS;
      
      if (savedConfigs) {
        try {
          configs = JSON.parse(savedConfigs);
        } catch (e) {
          console.error('解析权限配置失败:', e);
        }
      }

      const config = configs.find(c => c.role === userRole);
      setRoleConfig(config || null);
    } catch (e) {
      console.error('解析用户信息失败:', e);
      router.push('/');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const hasAccess = (moduleId: string): boolean => {
    if (!role) return false;
    return hasModuleAccess(role, moduleId);
  };

  const getPermission = (moduleId: string): PermissionLevel => {
    if (!role) return 'none';
    return getModulePermission(role, moduleId);
  };

  const requireAccess = (moduleId: string, minimumLevel: PermissionLevel = 'read'): boolean => {
    if (!role) return false;
    
    const currentLevel = getPermission(moduleId);
    const levels: PermissionLevel[] = ['none', 'read', 'write', 'full'];
    
    const currentIndex = levels.indexOf(currentLevel);
    const minimumIndex = levels.indexOf(minimumLevel);
    
    return currentIndex >= minimumIndex;
  };

  return {
    role,
    roleConfig,
    loading,
    hasAccess,
    getPermission,
    requireAccess,
  };
}

// 用于保护页面的高阶组件
export function withPermission<P extends object>(
  moduleId: string, 
  minimumLevel: PermissionLevel = 'read'
): (Component: React.ComponentType<P>) => React.FC<P> {
  return function(Component: React.ComponentType<P>): React.FC<P> {
    const ProtectedComponent: React.FC<P> = function(props: P) {
      const router = useRouter();
      const { loading, requireAccess } = usePermission();

      useEffect(() => {
        if (!loading && !requireAccess(moduleId, minimumLevel)) {
          router.push('/admin/dashboard');
        }
      }, [loading, router]);

      if (loading) {
        return React.createElement('div', { className: 'min-h-screen flex items-center justify-center' },
          React.createElement('div', { className: 'text-center' },
            React.createElement('div', { className: 'w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4' }),
            React.createElement('p', { className: 'text-gray-500' }, '加载中...')
          )
        );
      }

      if (!requireAccess(moduleId, minimumLevel)) {
        return null;
      }

      return React.createElement(Component, props);
    };

    return ProtectedComponent;
  };
}
