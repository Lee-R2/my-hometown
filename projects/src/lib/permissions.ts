// 角色类型定义
export type RoleType = 'super_admin' | 'admin' | 'volunteer' | 'teacher';

// 功能模块定义
export interface Module {
  id: string;
  name: string;
  description: string;
  icon: string;
  href: string;
}

// 权限级别定义
export type PermissionLevel = 'none' | 'read' | 'write' | 'full';

// 角色权限配置
export interface RolePermission {
  moduleId: string;
  level: PermissionLevel;
}

// 完整的角色配置
export interface RoleConfig {
  role: RoleType;
  name: string;
  description: string;
  permissions: RolePermission[];
  dataScope: 'all' | 'school' | 'assigned'; // 数据范围
}

// 功能模块列表
export const MODULES: Module[] = [
  {
    id: 'pretest',
    name: '学生前测',
    description: '设置前测问卷，了解学生初始水平',
    icon: 'ClipboardList',
    href: '/admin/pretest',
  },
  {
    id: 'tasks',
    name: '任务管理',
    description: '配置任务主题和阶段任务',
    icon: 'FileText',
    href: '/admin/tasks',
  },
  {
    id: 'final-tasks',
    name: '最后任务',
    description: '设计主题结束后的反馈表单',
    icon: 'ClipboardList',
    href: '/admin/final-tasks',
  },
  {
    id: 'teams',
    name: '小队管理',
    description: '管理小队账号、查看小队信息',
    icon: 'Users',
    href: '/admin/teams',
  },
  {
    id: 'submissions',
    name: '产出审核',
    description: '审核小队提交的任务产出',
    icon: 'Clock',
    href: '/admin/submissions',
  },
  {
    id: 'schools',
    name: '项目小学',
    description: '管理项目学校，支持批量导入',
    icon: 'Building',
    href: '/admin/schools',
  },
  {
    id: 'volunteers',
    name: '授课志愿者',
    description: '管理志愿者账号，支持批量导入',
    icon: 'UserPlus',
    href: '/admin/volunteers',
  },
  {
    id: 'follow-verifies',
    name: '关注审核',
    description: '审核家长关注小队申请',
    icon: 'UserCheck',
    href: '/admin/follow-verifies',
  },
  {
    id: 'tools',
    name: '工具管理',
    description: '管理工具库，设置工具与技能关联',
    icon: 'Wrench',
    href: '/admin/tools',
  },
  {
    id: 'skills',
    name: '技能学习',
    description: '管理技能库，配置学习资料',
    icon: 'BookOpen',
    href: '/admin/skills',
  },
  {
    id: 'messages',
    name: '消息管理',
    description: '用于接收及发送消息',
    icon: 'MessageCircle',
    href: '/admin/messages',
  },
  {
    id: 'rewards',
    name: '激励配置',
    description: '配置激励卡片和奖励规则',
    icon: 'Award',
    href: '/admin/rewards',
  },
  {
    id: 'feedback',
    name: '反馈查看',
    description: '查看小队反馈表单提交情况，支持导出',
    icon: 'MessageSquare',
    href: '/admin/feedback',
  },
  {
    id: 'blackboard',
    name: '家乡黑板报',
    description: '管理黑板报帖子，审核和删除不当内容',
    icon: 'Newspaper',
    href: '/admin/blackboard',
  },
  {
    id: 'settings',
    name: '系统设置',
    description: '账号权限、系统配置',
    icon: 'Settings',
    href: '/admin/settings',
  },
];

// 权限级别说明
export const PERMISSION_LEVELS: Record<PermissionLevel, { label: string; description: string; color: string }> = {
  none: { label: '无权限', description: '无法访问该模块', color: 'text-gray-500' },
  read: { label: '只读', description: '只能查看，不能修改', color: 'text-blue-500' },
  write: { label: '可编辑', description: '可以创建和编辑', color: 'text-green-500' },
  full: { label: '完全控制', description: '拥有所有权限，包括删除', color: 'text-purple-500' },
};

// 默认角色权限配置
export const DEFAULT_ROLE_CONFIGS: RoleConfig[] = [
  {
    role: 'super_admin',
    name: '超级管理员',
    description: '拥有系统所有功能完全控制权限，可管理所有数据和用户',
    dataScope: 'all',
    permissions: MODULES.map(m => ({ moduleId: m.id, level: 'full' as PermissionLevel })),
  },
  {
    role: 'admin',
    name: '管理员',
    description: '拥有系统所有功能完全控制权限，可管理所有数据',
    dataScope: 'all',
    permissions: MODULES.map(m => ({ moduleId: m.id, level: 'full' as PermissionLevel })),
  },
  {
    role: 'volunteer',
    name: '授课志愿者',
    description: '负责授课和指导小队，可管理自己指导的小队',
    dataScope: 'assigned',
    permissions: [
      { moduleId: 'pretest', level: 'read' },
      { moduleId: 'tasks', level: 'read' },
      { moduleId: 'final-tasks', level: 'read' },
      { moduleId: 'teams', level: 'write' },
      { moduleId: 'submissions', level: 'write' },
      { moduleId: 'schools', level: 'read' },
      { moduleId: 'volunteers', level: 'none' },
      { moduleId: 'tools', level: 'read' },
      { moduleId: 'skills', level: 'read' },
      { moduleId: 'messages', level: 'write' },
      { moduleId: 'rewards', level: 'read' },
      { moduleId: 'feedback', level: 'full' },
      { moduleId: 'blackboard', level: 'write' },
      { moduleId: 'settings', level: 'none' },
    ],
  },
  {
    role: 'teacher',
    name: '助学老师',
    description: '负责学校管理，可管理本校所有数据和志愿者',
    dataScope: 'school',
    permissions: [
      { moduleId: 'pretest', level: 'read' },
      { moduleId: 'tasks', level: 'read' },
      { moduleId: 'final-tasks', level: 'none' },
      { moduleId: 'teams', level: 'read' },
      { moduleId: 'submissions', level: 'read' },
      { moduleId: 'schools', level: 'write' },
      { moduleId: 'volunteers', level: 'read' },
      { moduleId: 'tools', level: 'read' },
      { moduleId: 'skills', level: 'read' },
      { moduleId: 'messages', level: 'read' },
      { moduleId: 'rewards', level: 'none' },
      { moduleId: 'feedback', level: 'none' },
      { moduleId: 'blackboard', level: 'read' },
      { moduleId: 'settings', level: 'none' },
    ],
  },
];

// 权限配置缓存
let cachedRoleConfigs: RoleConfig[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60 * 1000; // 1分钟缓存

// 从 API 获取权限配置
export async function fetchRoleConfigs(): Promise<RoleConfig[]> {
  const now = Date.now();
  
  // 如果缓存有效，直接返回缓存
  if (cachedRoleConfigs && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedRoleConfigs;
  }
  
  try {
    const response = await fetch('/api/permissions');
    const data = await response.json();
    
    if (data.success && data.configs) {
      cachedRoleConfigs = data.configs;
      cacheTimestamp = now;
      return data.configs;
    }
  } catch (error) {
    console.error('获取权限配置失败:', error);
  }
  
  // 如果 API 失败，使用默认配置
  return DEFAULT_ROLE_CONFIGS;
}

// 清除权限配置缓存
export function clearPermissionsCache(): void {
  cachedRoleConfigs = null;
  cacheTimestamp = 0;
}

// 获取角色的权限配置（同步版本，使用缓存或默认配置）
export function getRolePermissions(role: RoleType): RolePermission[] {
  // 如果有缓存，使用缓存
  if (cachedRoleConfigs) {
    const config = cachedRoleConfigs.find(c => c.role === role);
    return config?.permissions || [];
  }
  
  // 否则使用默认配置
  const config = DEFAULT_ROLE_CONFIGS.find(c => c.role === role);
  return config?.permissions || [];
}

// 检查角色是否有某个模块的访问权限
export function hasModuleAccess(role: RoleType, moduleId: string): boolean {
  const permissions = getRolePermissions(role);
  const permission = permissions.find(p => p.moduleId === moduleId);
  return permission?.level !== 'none' && permission?.level !== undefined;
}

// 获取角色对某个模块的权限级别
export function getModulePermission(role: RoleType, moduleId: string): PermissionLevel {
  const permissions = getRolePermissions(role);
  const permission = permissions.find(p => p.moduleId === moduleId);
  return permission?.level || 'none';
}

// 获取角色的数据范围
export function getDataScope(role: RoleType): 'all' | 'school' | 'assigned' {
  // 如果有缓存，使用缓存
  if (cachedRoleConfigs) {
    const config = cachedRoleConfigs.find(c => c.role === role);
    return config?.dataScope || 'assigned';
  }
  
  // 否则使用默认配置
  const config = DEFAULT_ROLE_CONFIGS.find(c => c.role === role);
  return config?.dataScope || 'assigned';
}

// 根据角色过滤可访问的模块
export function getAccessibleModules(role: RoleType): Module[] {
  const permissions = getRolePermissions(role);
  return MODULES.filter(module => {
    const permission = permissions.find(p => p.moduleId === module.id);
    return permission?.level !== 'none' && permission?.level !== undefined;
  });
}

// 获取角色的完整配置（同步版本）
export function getRoleConfig(role: RoleType): RoleConfig | undefined {
  // 如果有缓存，使用缓存
  if (cachedRoleConfigs) {
    return cachedRoleConfigs.find(c => c.role === role);
  }
  
  // 否则使用默认配置
  return DEFAULT_ROLE_CONFIGS.find(c => c.role === role);
}
