'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Star, Trophy, Heart, Award, BookOpen, Target, Zap,
  Share2, CheckCircle, XCircle, Clock, Sparkles, Users
} from 'lucide-react';

interface ReportData {
  completion: {
    id: string;
    completedAt: string;
    totalPoints: number;
    totalTasks: number;
    cycle: number;
  };
  team: {
    id: string;
    name: string;
    slogan: string;
    icon: string;
    members: Array<{ name: string; role: string }>;
  };
  theme: {
    id: string;
    name: string;
    icon: string;
    description: string;
  };
  stats: {
    totalPoints: number;
    likesReceived: number;
    gemFragments: number;
    gems: number;
    badgeCount: number;
    skillCardCount: number;
  };
  charts: {
    taskCompletion: { completed: number; total: number; percentage: number };
    taskTypeRatio: { main: number; side: number; final: number };
    reviewRatio: { excellent: number; approved: number; rejected: number; pending: number };
  };
  excellentWorks: Array<{ submissionId: string; taskTitle: string; imageUrl: string; rating: string | null }>;
  finalTaskQuotes: string[];
}

// 环形进度条组件
function DonutChart({ percentage, size = 120, strokeWidth = 12, color = '#f59e0b' }: {
  percentage: number; size?: number; strokeWidth?: number; color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color}
          strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{percentage}%</span>
      </div>
    </div>
  );
}

// 水平条形图组件
function HorizontalBar({ segments }: { segments: Array<{ value: number; color: string; label: string }> }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <div className="h-6 bg-gray-100 rounded-full" />;

  return (
    <div className="space-y-2">
      <div className="flex h-8 rounded-full overflow-hidden">
        {segments.map((seg, i) => (
          <div
            key={i}
            style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.color }}
            className="flex items-center justify-center text-white text-xs font-medium transition-all duration-700"
          >
            {seg.value > 0 && seg.value}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: seg.color }} />
            <span>{seg.label} ({seg.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportPage() {
  const params = useParams();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchReport() {
      try {
        const id = params.id as string;
        const res = await fetch(`/api/report/${id}`);
        if (!res.ok) {
          setError('报告不存在或已过期');
          return;
        }
        const data = await res.json();
        setReport(data.report);
      } catch {
        setError('加载报告失败');
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [params.id]);

  // 设置分享标题
  useEffect(() => {
    if (report) {
      document.title = `快来看${report.team.name}超酷的${report.theme.name}任务主题报告`;
    }
  }, [report]);

  const handleShare = async () => {
    const shareData = {
      title: `快来看${report?.team.name}超酷的${report?.theme.name}任务主题报告`,
      text: `${report?.team.name}完成了${report?.theme.name}任务主题，获得${report?.stats.totalPoints}积分！快来看看他们的精彩表现吧！`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // 用户取消分享，忽略
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      alert('链接已复制到剪贴板！');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-rose-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4" />
          <p className="text-gray-500">正在加载报告...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-rose-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">报告加载失败</h2>
          <p className="text-gray-500">{error || '未知错误'}</p>
        </div>
      </div>
    );
  }

  const completedDate = new Date(report.completion.completedAt).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-rose-50">
      {/* 顶部英雄区 */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 opacity-90" />
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.1) 0%, transparent 40%)',
        }} />
        <div className="relative max-w-2xl mx-auto px-4 py-8 text-center text-white">
          <div className="text-5xl mb-3">{report.theme.icon}</div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            {report.team.name}
          </h1>
          <p className="text-lg md:text-xl font-medium opacity-95 mb-1">
            {report.theme.name} 任务主题报告
          </p>
          {report.team.slogan && (
            <p className="text-sm opacity-80 mb-3">&ldquo;{report.team.slogan}&rdquo;</p>
          )}
          <p className="text-xs opacity-70">完成于 {completedDate} · 第{report.completion.cycle}周期</p>

          {/* 分享按钮 */}
          <button
            onClick={handleShare}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full text-white font-medium transition-all active:scale-95"
          >
            <Share2 className="w-4 h-4" />
            分享报告
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-4 pb-12 space-y-4">
        {/* 基础数据卡片 */}
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            探索成果
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <StatItem icon={<Star className="w-5 h-5 text-amber-500" />} label="总积分" value={report.stats.totalPoints} />
            <StatItem icon={<Heart className="w-5 h-5 text-rose-500" />} label="获赞数" value={report.stats.likesReceived} />
            <StatItem icon={<Sparkles className="w-5 h-5 text-purple-500" />} label="宝石碎片" value={report.stats.gemFragments} />
            <StatItem icon={<Trophy className="w-5 h-5 text-orange-500" />} label="宝石" value={report.stats.gems} />
            <StatItem icon={<Award className="w-5 h-5 text-blue-500" />} label="徽章" value={report.stats.badgeCount} />
            <StatItem icon={<BookOpen className="w-5 h-5 text-green-500" />} label="技能卡" value={report.stats.skillCardCount} />
          </div>
        </div>

        {/* 图表区域 */}
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-500" />
            数据洞察
          </h2>
          <div className="space-y-6">
            {/* 任务完成比例 */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-3">任务完成比例</h3>
              <div className="flex items-center justify-center gap-6">
                <DonutChart percentage={report.charts.taskCompletion.percentage} color="#f59e0b" />
                <div className="text-sm text-gray-600 space-y-1">
                  <p>已完成 <span className="font-bold text-amber-600">{report.charts.taskCompletion.completed}</span> / {report.charts.taskCompletion.total} 个任务</p>
                </div>
              </div>
            </div>

            {/* 主线/支线任务比例 */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-3">任务类型分布</h3>
              <HorizontalBar segments={[
                { value: report.charts.taskTypeRatio.main, color: '#3b82f6', label: '主线任务' },
                { value: report.charts.taskTypeRatio.side, color: '#8b5cf6', label: '支线任务' },
                { value: report.charts.taskTypeRatio.final, color: '#f59e0b', label: '最终任务' },
              ]} />
            </div>

            {/* 审核结果比例 */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-3">审核结果分布</h3>
              <HorizontalBar segments={[
                { value: report.charts.reviewRatio.excellent, color: '#f59e0b', label: '优秀' },
                { value: report.charts.reviewRatio.approved, color: '#10b981', label: '通过' },
                { value: report.charts.reviewRatio.rejected, color: '#ef4444', label: '退回' },
                { value: report.charts.reviewRatio.pending, color: '#9ca3af', label: '待审核' },
              ]} />
            </div>
          </div>
        </div>

        {/* 产出展示 */}
        {report.excellentWorks.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-5">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              产出展示
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {report.excellentWorks.map((work) => (
                <div key={work.submissionId} className="rounded-xl overflow-hidden border border-gray-100">
                  {!imageErrors.has(work.submissionId) ? (
                    <div className="aspect-[4/3] bg-gray-50 relative">
                      <img
                        src={work.imageUrl}
                        alt={work.taskTitle}
                        className="w-full h-full object-cover"
                        onError={() => {
                          setImageErrors(prev => new Set(prev).add(work.submissionId));
                        }}
                      />
                    </div>
                  ) : (
                    <div className="aspect-[4/3] bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
                      <div className="text-center">
                        <span className="text-3xl">🎨</span>
                        <p className="text-xs text-gray-400 mt-1">{work.taskTitle}</p>
                      </div>
                    </div>
                  )}
                  <div className="p-2 bg-amber-50">
                    <p className="text-xs font-medium text-amber-700">{work.taskTitle}</p>
                    {work.rating === 'excellent' && <BadgeExcellent />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 小队感悟 */}
        {report.finalTaskQuotes.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-5">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Heart className="w-5 h-5 text-rose-500" />
              小队感悟
            </h2>
            <div className="space-y-3">
              {report.finalTaskQuotes.map((quote, index) => (
                <div key={index} className="bg-gradient-to-r from-rose-50 to-pink-50 rounded-xl p-4 border-l-4 border-rose-300">
                  <p className="text-gray-700 text-sm leading-relaxed">&ldquo;{quote}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 小队成员 */}
        {report.team.members.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-5">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              小队成员
            </h2>
            <div className="flex flex-wrap gap-2">
              {report.team.members.map((member, index) => (
                <div key={index} className="flex items-center gap-2 bg-gray-50 rounded-full pl-1 pr-3 py-1">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white text-xs font-bold">
                    {member.name?.charAt(0) || '?'}
                  </div>
                  <span className="text-sm text-gray-700">{member.name}</span>
                  {member.role && (
                    <span className="text-xs text-gray-400">{member.role}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 底部分享栏 */}
        <div className="text-center pt-4 pb-8">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-full shadow-lg transition-all active:scale-95"
          >
            <Share2 className="w-5 h-5" />
            分享这份超酷的报告
          </button>
          <p className="text-xs text-gray-400 mt-3">快来看{report.team.name}超酷的{report.theme.name}任务主题报告</p>
        </div>
      </div>
    </div>
  );
}

function StatItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-xl font-bold text-gray-800">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function BadgeExcellent() {
  return (
    <span className="inline-flex items-center gap-0.5 mt-0.5 text-xs text-amber-600 font-medium">
      <Star className="w-3 h-3" /> 优秀
    </span>
  );
}
