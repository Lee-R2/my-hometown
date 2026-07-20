import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  try {
    const { id } = await params;
    // SEC-001: generateMetadata 运行在服务端无 request 上下文，且为公开报告页生成 OG 元数据，
    // 需跨表读取 theme_completions/teams/task_themes，使用 admin client 确保数据可读
    const client = getSupabaseAdminClient();

    const { data: completion } = await client
      .from('theme_completions')
      .select('team_id, theme_id')
      .eq('id', id)
      .single();

    if (!completion) {
      return { title: '任务报告' };
    }

    const [teamRes, themeRes] = await Promise.all([
      client.from('teams').select('name').eq('id', completion.team_id).single(),
      client.from('task_themes').select('name').eq('id', completion.theme_id).single(),
    ]);

    const teamName = teamRes.data?.name || '小队';
    const themeName = themeRes.data?.name || '任务主题';
    const title = `快来看${teamName}超酷的${themeName}任务主题报告`;
    const description = `${teamName}完成了${themeName}任务主题！快来看看他们的精彩表现吧！`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'article',
        images: [
          {
            url: '/og-image.svg',
            width: 1200,
            height: 630,
            alt: `${teamName}的${themeName}任务报告`,
          },
        ],
      },
    };
  } catch {
    return { title: '任务报告' };
  }
}

export default function ReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
