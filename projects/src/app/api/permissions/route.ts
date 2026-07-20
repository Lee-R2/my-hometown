import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { RoleConfig, RoleType, DEFAULT_ROLE_CONFIGS, MODULES } from '@/lib/permissions';
import { ApiErrors } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role') as RoleType | null;
    
    if (role) {
      const { data, error } = await client
        .from('role_permissions')
        .select('config, updated_at')
        .eq('role', role)
        .single();
      
      if (error) {
        const defaultConfig = DEFAULT_ROLE_CONFIGS.find(c => c.role === role);
        const allModulePermissions = MODULES.map(m => ({
          moduleId: m.id,
          level: defaultConfig?.permissions?.find((p: any) => p.moduleId === m.id)?.level || 'none'
        }));
        return NextResponse.json({
          success: true,
          config: defaultConfig ? {
            ...defaultConfig,
            permissions: allModulePermissions
          } : null,
          updatedAt: null,
        });
      }
      
      const dbConfig = data.config || {};
      const allModulePermissions = MODULES.map(m => ({
        moduleId: m.id,
        level: dbConfig.permissions?.find((p: any) => p.moduleId === m.id)?.level || 'none'
      }));
      
      return NextResponse.json({
        success: true,
        config: {
          role: role,
          name: dbConfig.name || role,
          description: dbConfig.description || '',
          dataScope: dbConfig.dataScope || 'all',
          permissions: allModulePermissions
        },
        updatedAt: data.updated_at,
      });
    } else {
      const { data, error } = await client
        .from('role_permissions')
        .select('role, config, updated_at');
      
      if (error) {
        console.error('获取权限配置失败:', error);
        const configsWithAllModules = DEFAULT_ROLE_CONFIGS.map(config => {
          const allModulePermissions = MODULES.map(m => ({
            moduleId: m.id,
            level: config.permissions?.find((p: any) => p.moduleId === m.id)?.level || 'none'
          }));
          return { ...config, permissions: allModulePermissions };
        });
        return NextResponse.json({
          success: true,
          configs: configsWithAllModules,
          updatedAt: null,
        });
      }
      
      const configs: RoleConfig[] = data.map(item => {
        const config = item.config || {};
        const defaultConfig = DEFAULT_ROLE_CONFIGS.find(c => c.role === item.role);
        const allModulePermissions = MODULES.map(m => {
          const dbLevel = config.permissions?.find((p: any) => p.moduleId === m.id)?.level;
          const defaultLevel = defaultConfig?.permissions?.find((p: any) => p.moduleId === m.id)?.level;
          return {
            moduleId: m.id,
            level: dbLevel || defaultLevel || 'none'
          };
        });

        return {
          role: item.role as RoleType,
          name: config.name || defaultConfig?.name || item.role,
          description: config.description || defaultConfig?.description || '',
          dataScope: config.dataScope || defaultConfig?.dataScope || 'all',
          permissions: allModulePermissions
        };
      });
      
      const updatedAt = data.reduce((max: string | null, item: any) => {
        if (!item.updated_at) return max;
        if (!max) return item.updated_at;
        return new Date(item.updated_at) > new Date(max) ? item.updated_at : max;
      }, null);
      
      return NextResponse.json({
        success: true,
        configs,
        updatedAt,
      });
    }
  } catch (error) {
    console.error('获取权限配置失败:', error);
    return ApiErrors.validation('获取权限配置失败');
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();
    const body = await request.json();
    const { role, config } = body;
    
    if (!role || !config) {
      return ApiErrors.validation('缺少必要参数');
    }
    
    const validRoles: RoleType[] = ['super_admin', 'admin', 'volunteer', 'teacher'];
    if (!validRoles.includes(role)) {
      return ApiErrors.validation('无效的角色');
    }

    // 仅 super_admin 可修改 super_admin 角色的权限配置
    if (role === 'super_admin' && auth.payload!.role !== 'super_admin') {
      return ApiErrors.forbidden('仅超级管理员可修改超级管理员权限配置');
    }

    const { permissions, dataScope } = config;
    if (!Array.isArray(permissions)) {
      return ApiErrors.validation('权限配置格式错误');
    }
    
    const validModuleIds = MODULES.map(m => m.id);
    for (const p of permissions) {
      if (!validModuleIds.includes(p.moduleId)) {
        return NextResponse.json({ error: `无效的模块ID: ${p.moduleId}` }, { status: 400 });
      }
    }
    
    const { error } = await client
      .from('role_permissions')
      .upsert({
        role,
        config: {
          name: config.name,
          description: config.description,
          dataScope: dataScope,
          permissions,
        },
        updated_at: new Date().toISOString(),
        updated_by: auth.payload!.userId,
      }, {
        onConflict: 'role',
      });
    
    if (error) {
      console.error('保存权限配置失败:', error);
      return ApiErrors.validation('保存权限配置失败');
    }
    
    return NextResponse.json({
      success: true,
      message: '权限配置已保存',
    });
  } catch (error) {
    console.error('保存权限配置失败:', error);
    return ApiErrors.validation('保存权限配置失败');
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role') as RoleType | null;
    
    if (role) {
      const defaultConfig = DEFAULT_ROLE_CONFIGS.find(c => c.role === role);
      if (!defaultConfig) {
        return ApiErrors.notFound('找不到默认配置');
      }
      
      const { error } = await client
        .from('role_permissions')
        .upsert({
          role,
          config: {
            name: defaultConfig.name,
            description: defaultConfig.description,
            dataScope: defaultConfig.dataScope,
            permissions: defaultConfig.permissions,
          },
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'role',
        });
      
      if (error) {
        console.error('恢复默认配置失败:', error);
        return ApiErrors.validation('恢复默认配置失败');
      }
      
      return NextResponse.json({
        success: true,
        message: '已恢复默认配置',
        config: defaultConfig,
      });
    } else {
      for (const defaultConfig of DEFAULT_ROLE_CONFIGS) {
        await client
          .from('role_permissions')
          .upsert({
            role: defaultConfig.role,
            config: {
              name: defaultConfig.name,
              description: defaultConfig.description,
              dataScope: defaultConfig.dataScope,
              permissions: defaultConfig.permissions,
            },
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'role',
          });
      }
      
      return NextResponse.json({
        success: true,
        message: '已恢复所有默认配置',
        configs: DEFAULT_ROLE_CONFIGS,
      });
    }
  } catch (error) {
    console.error('恢复默认配置失败:', error);
    return ApiErrors.validation('恢复默认配置失败');
  }
}