'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Shield, Users, Save, RotateCcw, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { 
  RoleType, 
  PermissionLevel, 
  RoleConfig, 
  MODULES, 
  PERMISSION_LEVELS,
  DEFAULT_ROLE_CONFIGS,
} from '@/lib/permissions';

export default function AdminSettingsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);
  const [roleConfigs, setRoleConfigs] = useState<RoleConfig[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleType>('volunteer');
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // 滚动位置记忆
  useScrollPosition('admin-settings');

  // 加载权限配置
  const loadRoleConfigs = useCallback(async () => {
    try {
      const response = await fetch('/api/permissions');
      const data = await response.json();
      
      if (data.success && data.configs) {
        setRoleConfigs(data.configs);
      } else {
        // 如果 API 失败，使用默认配置
        setRoleConfigs(DEFAULT_ROLE_CONFIGS);
      }
    } catch (error) {
      console.error('加载权限配置失败:', error);
      // 使用默认配置作为后备
      setRoleConfigs(DEFAULT_ROLE_CONFIGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      const user = JSON.parse(userData);
      setCurrentUser(user);
      
      // 只有管理员（super_admin 或 admin）可以访问权限管理
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        toast.error('您没有权限访问此页面');
        router.push('/admin/dashboard');
        return;
      }
    }

    // 从 API 加载权限配置
    loadRoleConfigs();
  }, [router, loadRoleConfigs]);

  const getCurrentConfig = (): RoleConfig | undefined => {
    return roleConfigs.find(c => c.role === selectedRole);
  };

  const handlePermissionChange = (moduleId: string, level: PermissionLevel) => {
    setRoleConfigs(prev => {
      const newConfigs = prev.map(config => {
        if (config.role === selectedRole) {
          const newPermissions = config.permissions.map(p => 
            p.moduleId === moduleId ? { ...p, level } : p
          );
          // 如果模块不在权限列表中，添加它
          if (!config.permissions.find(p => p.moduleId === moduleId)) {
            newPermissions.push({ moduleId, level });
          }
          return { ...config, permissions: newPermissions };
        }
        return config;
      });
      return newConfigs;
    });
    setHasChanges(true);
  };

  const handleDataScopeChange = (scope: 'all' | 'school' | 'assigned') => {
    setRoleConfigs(prev => 
      prev.map(config => 
        config.role === selectedRole 
          ? { ...config, dataScope: scope }
          : config
      )
    );
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!currentUser) return;
    
    setSaving(true);
    try {
      // 保存所有修改过的配置
      const savePromises = roleConfigs.map(config => 
        fetch('/api/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: config.role,
            config: {
              name: config.name,
              description: config.description,
              dataScope: config.dataScope,
              permissions: config.permissions,
            },
          }),
        })
      );
      
      const results = await Promise.all(savePromises);
      const allSuccess = results.every(r => r.ok);
      
      if (allSuccess) {
        toast.success('权限配置已保存，其他用户将实时看到更新');
        setHasChanges(false);
      } else {
        toast.error('部分配置保存失败');
      }
    } catch (error) {
      console.error('保存权限配置失败:', error);
      toast.error('保存权限配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/permissions', { method: 'DELETE' });
      const data = await response.json();
      
      if (data.success) {
        setRoleConfigs(DEFAULT_ROLE_CONFIGS);
        toast.success('已恢复默认配置');
        setHasChanges(false);
      } else {
        toast.error('恢复默认配置失败');
      }
    } catch (error) {
      console.error('恢复默认配置失败:', error);
      toast.error('恢复默认配置失败');
    } finally {
      setSaving(false);
    }
  };

  const currentConfig = getCurrentConfig();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  if (!currentConfig) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-500" />
              权限管理
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge variant="secondary" className="text-orange-600 hidden sm:inline-flex">有未保存的更改</Badge>
            )}
            <Button variant="outline" size="sm" onClick={handleReset} disabled={saving} className="hidden sm:inline-flex">
              <RotateCcw className="w-4 h-4 mr-1" />
              恢复默认
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              <span className="hidden sm:inline">保存配置</span>
              <span className="sm:hidden">保存</span>
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto py-4 md:py-6 space-y-6">
        {/* 提示信息 */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-blue-700">
              <Info className="w-4 h-4" />
              <span className="text-sm">
                权限配置保存后将实时生效，所有用户将立即看到更新后的权限。志愿者和助学老师无需刷新页面。
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 角色选择 */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">选择角色</CardTitle>
            <CardDescription>选择要配置权限的角色</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {roleConfigs.filter(c => c.role !== 'admin').map(config => (
                <button
                  key={config.role}
                  onClick={() => setSelectedRole(config.role as RoleType)}
                  className={`flex-1 p-4 rounded-lg border-2 transition-all text-left ${
                    selectedRole === config.role
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Users className={`w-5 h-5 ${selectedRole === config.role ? 'text-purple-500' : 'text-gray-400'}`} />
                    <span className="font-semibold">{config.name}</span>
                  </div>
                  <p className="text-sm text-gray-500">{config.description}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 数据范围配置 */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">数据范围</CardTitle>
            <CardDescription>设置该角色可以访问的数据范围</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {[
                { value: 'all', label: '全部数据', desc: '可访问系统所有数据' },
                { value: 'school', label: '本校数据', desc: '只能访问所属学校的数据' },
                { value: 'assigned', label: '指导的小队', desc: '只能访问被分配指导的小队数据' },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleDataScopeChange(option.value as 'all' | 'school' | 'assigned')}
                  disabled={selectedRole === 'teacher' && option.value === 'assigned'}
                  className={`flex-1 p-4 rounded-lg border-2 transition-all text-left ${
                    currentConfig.dataScope === option.value
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  } ${(selectedRole === 'teacher' && option.value === 'assigned') ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="font-semibold mb-1">{option.label}</div>
                  <p className="text-sm text-gray-500">{option.desc}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 模块权限配置 */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">模块权限</CardTitle>
                <CardDescription>配置该角色对各功能模块的访问权限</CardDescription>
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <Info className="w-4 h-4" />
                <span>权限级别说明</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* 权限级别图例 */}
            <div className="flex gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
              {Object.entries(PERMISSION_LEVELS).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    key === 'none' ? 'bg-gray-400' :
                    key === 'read' ? 'bg-blue-500' :
                    key === 'write' ? 'bg-green-500' : 'bg-purple-500'
                  }`} />
                  <span className={`text-sm font-medium ${value.color}`}>{value.label}</span>
                  <span className="text-xs text-gray-500">({value.description})</span>
                </div>
              ))}
            </div>

            {/* 模块权限列表 */}
            <div className="space-y-3">
              {MODULES.map(module => {
                const permission = currentConfig.permissions.find(p => p.moduleId === module.id);
                const level = permission?.level || 'none';

                return (
                  <div 
                    key={module.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        level === 'none' ? 'bg-gray-100' :
                        level === 'read' ? 'bg-blue-100' :
                        level === 'write' ? 'bg-green-100' : 'bg-purple-100'
                      }`}>
                        <span className="text-lg">
                          {module.icon === 'FileText' && '📄'}
                          {module.icon === 'Users' && '👥'}
                          {module.icon === 'Clock' && '⏰'}
                          {module.icon === 'Building' && '🏫'}
                          {module.icon === 'UserPlus' && '➕'}
                          {module.icon === 'Wrench' && '🔧'}
                          {module.icon === 'BookOpen' && '📖'}
                          {module.icon === 'MessageCircle' && '💬'}
                          {module.icon === 'Award' && '🏆'}
                          {module.icon === 'Settings' && '⚙️'}
                          {module.icon === 'MessageSquare' && '📝'}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium">{module.name}</div>
                        <div className="text-sm text-gray-500">{module.description}</div>
                      </div>
                    </div>
                    <Select
                      value={level}
                      onValueChange={(value) => handlePermissionChange(module.id, value as PermissionLevel)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PERMISSION_LEVELS).map(([key, value]) => (
                          <SelectItem key={key} value={key}>
                            <span className={value.color}>{value.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* 权限预览 */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">权限预览</CardTitle>
            <CardDescription>该角色在系统中的实际权限概览</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {MODULES.map(module => {
                const permission = currentConfig.permissions.find(p => p.moduleId === module.id);
                const level = permission?.level || 'none';

                return (
                  <div 
                    key={module.id}
                    className={`p-3 rounded-lg border ${
                      level === 'none' ? 'bg-gray-50 border-gray-200' :
                      level === 'read' ? 'bg-blue-50 border-blue-200' :
                      level === 'write' ? 'bg-green-50 border-green-200' : 'bg-purple-50 border-purple-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{module.name}</span>
                      {level === 'none' && <span className="text-xs text-gray-400">禁止</span>}
                    </div>
                    <Badge className={`text-xs ${
                      level === 'none' ? 'bg-gray-200 text-gray-600' :
                      level === 'read' ? 'bg-blue-200 text-blue-700' :
                      level === 'write' ? 'bg-green-200 text-green-700' : 'bg-purple-200 text-purple-700'
                    }`}>
                      {PERMISSION_LEVELS[level].label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
