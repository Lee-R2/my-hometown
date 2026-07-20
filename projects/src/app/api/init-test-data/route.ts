import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';
import { hashPassword } from '@/lib/security';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();

    // 1. 创建学校
    const { data: school, error: schoolError } = await client
      .from('schools')
      .upsert({
        id: 'school-test-001',
        name: '阳光小学',
        address: '北京市海淀区阳光路1号',
      }, { onConflict: 'id' })
      .select()
      .single();

    if (schoolError) {
      console.error('创建学校失败:', schoolError);
    }

    // 2. 创建项目小学管理员账号（密码哈希存储）
    const { data: schoolAdmin, error: adminError } = await client
      .from('users')
      .upsert({
        id: 'admin-school-001',
        username: 'school_admin',
        password: hashPassword('123456'),
        name: '张老师（阳光小学管理员）',
        role: 'teacher',
        school_id: 'school-test-001',
      }, { onConflict: 'id' })
      .select()
      .single();

    if (adminError) {
      console.error('创建学校管理员失败:', adminError);
    }

    // 3. 创建授课志愿者账号（密码哈希存储）
    const { data: volunteer, error: volunteerError } = await client
      .from('users')
      .upsert({
        id: 'volunteer-001',
        username: 'volunteer',
        password: hashPassword('123456'),
        name: '李志愿者',
        role: 'volunteer',
        school_id: 'school-test-001',
      }, { onConflict: 'id' })
      .select()
      .single();

    if (volunteerError) {
      console.error('创建志愿者失败:', volunteerError);
    }

    // 4. 创建全局管理员账号（密码哈希存储）
    // 统一 admin 密码为 123456，与 init-users/route.ts 保持一致
    const { data: globalAdmin, error: globalAdminError } = await client
      .from('users')
      .upsert({
        id: 'admin-global-001',
        username: 'admin',
        password: hashPassword('123456'),
        name: '系统管理员',
        role: 'admin',
        school_id: null,
      }, { onConflict: 'id' })
      .select()
      .single();

    if (globalAdminError) {
      console.error('创建全局管理员失败:', globalAdminError);
    }

    // 5. 创建测试主题（属于阳光小学）
    const themes = [
      { id: 'theme-001', name: '我的家乡', description: '探索家乡的地理、历史和文化特色', icon: '🏘️' },
      { id: 'theme-002', name: '身边的植物', description: '观察和记录身边的植物种类与生长规律', icon: '🌿' },
      { id: 'theme-003', name: '水资源调查', description: '调查家乡水资源状况，学习水资源保护', icon: '💧' },
      { id: 'theme-004', name: '垃圾分类实践', description: '学习垃圾分类知识，开展社区实践活动', icon: '♻️' },
    ];

    for (const theme of themes) {
      await client
        .from('task_themes')
        .upsert({
          id: theme.id,
          name: theme.name,
          description: theme.description,
          icon: theme.icon,
          school_id: 'school-test-001',
          is_active: true,
          is_selected: false, // 新增字段：是否已被选择
        }, { onConflict: 'id' });
    }

    // 6. 为每个主题创建阶段任务
    const tasks = [
      // 我的家乡任务
      { themeId: 'theme-001', stage: 1, title: '家乡地理初探', description: '绘制家乡地图，标注重要地标', points: 10 },
      { themeId: 'theme-001', stage: 2, title: '家乡历史寻访', description: '采访长辈，了解家乡历史变迁', points: 15 },
      { themeId: 'theme-001', stage: 3, title: '家乡美食调查', description: '调查家乡特色美食及其制作方法', points: 15 },
      { themeId: 'theme-001', stage: 4, title: '家乡文化展示', description: '制作家乡文化宣传作品', points: 20 },
      
      // 身边的植物任务
      { themeId: 'theme-002', stage: 1, title: '植物观察入门', description: '学习植物观察方法，记录观察日记', points: 10 },
      { themeId: 'theme-002', stage: 2, title: '植物标本制作', description: '采集植物制作标本', points: 15 },
      { themeId: 'theme-002', stage: 3, title: '植物生长实验', description: '设计并完成一个植物生长实验', points: 20 },
      
      // 水资源调查任务
      { themeId: 'theme-003', stage: 1, title: '家乡水域调查', description: '调查家乡河流湖泊状况', points: 10 },
      { themeId: 'theme-003', stage: 2, title: '水质检测实验', description: '学习水质检测方法并实践', points: 15 },
      { themeId: 'theme-003', stage: 3, title: '节水方案设计', description: '设计家庭或学校节水方案', points: 20 },
      
      // 垃圾分类实践任务
      { themeId: 'theme-004', stage: 1, title: '垃圾分类知识学习', description: '学习垃圾分类标准和方法', points: 10 },
      { themeId: 'theme-004', stage: 2, title: '社区垃圾分类调查', description: '调查社区垃圾分类实施情况', points: 15 },
      { themeId: 'theme-004', stage: 3, title: '垃圾分类宣传活动', description: '策划并开展垃圾分类宣传活动', points: 20 },
    ];

    for (const task of tasks) {
      await client
        .from('tasks')
        .upsert({
          theme_id: task.themeId,
          stage: task.stage,
          title: task.title,
          description: task.description,
          points: task.points,
          is_active: true,
        }, { onConflict: 'theme_id,stage' });
    }

    return NextResponse.json({
      success: true,
      message: '测试数据初始化成功',
      data: {
        school,
        schoolAdmin,
        volunteer,
        globalAdmin,
        themesCreated: themes.length,
        tasksCreated: tasks.length,
      },
      accounts: {
        schoolAdmin: { username: 'school_admin', password: '123456', school: '阳光小学' },
        volunteer: { username: 'volunteer', password: '123456', school: '阳光小学' },
        globalAdmin: { username: 'admin', password: '123456' },
      },
    });
  } catch (error) {
    console.error('初始化测试数据错误:', error);
    return ApiErrors.validation('初始化测试数据失败');
  }
}
