'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, Download, Loader2, Users, Award, TrendingUp, AlertTriangle, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';

interface AssessmentResult {
  id: string;
  team_id: string;
  teamName: string;
  teamCode: string;
  schoolName: string;
  member_name: string;
  dimension_a_score: number;
  dimension_b_score: number;
  dimension_c_score: number;
  dimension_d_score: number;
  literacy_total_score: number;
  literacy_level: string;
  literacyLevelLabel: string;
  guide_score: number;
  visual_score: number;
  text_score: number;
  primary_role: string;
  primaryRoleLabel: string;
  role_type: string;
  roleTypeLabel: string;
  secondary_role: string | null;
  secondaryRoleLabel: string | null;
  weak_dimensions: string[] | null;
  suggestions: Record<string, string> | null;
  created_at: string;
}

interface Summary {
  totalStudents: number;
  averageLiteracyScore: number;
  roleDistribution: { guide: number; visual: number; text: number };
  levelDistribution: { advanced: number; intermediate: number; beginner: number; developing: number };
}

interface TeamStat {
  teamName: string;
  teamCode: string;
  schoolName: string;
  memberCount: number;
  avgLiteracyScore: number;
  roleBreakdown: { guide: number; visual: number; text: number };
  weakDimensions: { A: number; B: number; C: number; D: number };
}

const literacyLevelColors: Record<string, string> = {
  advanced: 'bg-green-100 text-green-700',
  intermediate: 'bg-blue-100 text-blue-700',
  beginner: 'bg-yellow-100 text-yellow-700',
  developing: 'bg-red-100 text-red-700',
};

const roleColors: Record<string, string> = {
  guide: 'bg-orange-100 text-orange-700',
  visual: 'bg-blue-100 text-blue-700',
  text: 'bg-purple-100 text-purple-700',
};

const dimensionLabels: Record<string, string> = {
  A: '情感与态度',
  B: '使用与协作',
  C: '认知与理解',
  D: '伦理与责任',
};

export default function AdminPretestResultsPage() {
  const router = useRouter();
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [teamStats, setTeamStats] = useState<Record<string, TeamStat>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  
  // 筛选
  const [roleFilter, setRoleFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetchResults();
    fetchSchools();
  }, []);

  const fetchResults = async () => {
    try {
      const res = await fetch('/api/admin/pretest/results');
      const data = await res.json();
      if (data.success) {
        setResults(data.results || []);
        setSummary(data.summary || null);
        setTeamStats(data.teamStats || {});
      } else {
        toast.error(data.error || '获取结果失败');
      }
    } catch (error) {
      console.error('获取结果失败:', error);
      toast.error('获取结果失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchSchools = async () => {
    try {
      const res = await fetch('/api/admin/schools');
      const data = await res.json();
      if (data.success && data.schools) {
        setSchools(data.schools.map((s: any) => ({ id: s.id, name: s.name })));
      }
    } catch {
      // 静默处理
    }
  };

  // 导出CSV
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('format', 'csv');
      if (schoolFilter !== 'all') params.set('schoolId', schoolFilter);

      const res = await fetch(`/api/admin/pretest/results?${params.toString()}`);
      const blob = await res.blob();
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai_literacy_results_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('导出成功');
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  // 筛选结果
  const filteredResults = results.filter(r => {
    const matchRole = roleFilter === 'all' || r.primary_role === roleFilter;
    const matchLevel = levelFilter === 'all' || r.literacy_level === levelFilter;
    const matchSchool = schoolFilter === 'all' || r.schoolName === schoolFilter;
    return matchRole && matchLevel && matchSchool;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/pretest')} className="shrink-0">
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900">AI素养评估结果</h1>
          </div>
          <Button onClick={handleExport} size="sm" disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            导出CSV
          </Button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
        {results.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-500 mb-4">暂无评估结果数据</p>
              <p className="text-sm text-gray-400">等待小队完成前测问卷后，评估结果将自动生成</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 总览统计 */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-purple-600">{summary.totalStudents}</p>
                    <p className="text-sm text-gray-500">评估学生数</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-blue-600">{summary.averageLiteracyScore}</p>
                    <p className="text-sm text-gray-500">平均素养分</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm text-orange-600">🧭 {summary.roleDistribution.guide}</span>
                      <span className="text-sm text-blue-600">📷 {summary.roleDistribution.visual}</span>
                      <span className="text-sm text-purple-600">📜 {summary.roleDistribution.text}</span>
                    </div>
                    <p className="text-sm text-gray-500">角色分布</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <Badge className="bg-green-100 text-green-700 text-xs">高级{summary.levelDistribution.advanced}</Badge>
                      <Badge className="bg-blue-100 text-blue-700 text-xs">中级{summary.levelDistribution.intermediate}</Badge>
                      <Badge className="bg-yellow-100 text-yellow-700 text-xs">初级{summary.levelDistribution.beginner}</Badge>
                      <Badge className="bg-red-100 text-red-700 text-xs">待发展{summary.levelDistribution.developing}</Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">素养水平分布</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* 筛选栏 */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="角色筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部角色</SelectItem>
                  <SelectItem value="guide">🧭 引导者</SelectItem>
                  <SelectItem value="visual">📷 光影法师</SelectItem>
                  <SelectItem value="text">📜 秘语学者</SelectItem>
                </SelectContent>
              </Select>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="素养水平" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部水平</SelectItem>
                  <SelectItem value="advanced">高级</SelectItem>
                  <SelectItem value="intermediate">中级</SelectItem>
                  <SelectItem value="beginner">初级</SelectItem>
                  <SelectItem value="developing">待发展</SelectItem>
                </SelectContent>
              </Select>
              {schools.length > 0 && (
                <Select value={schoolFilter} onValueChange={setSchoolFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="学校筛选" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部学校</SelectItem>
                    {schools.map(s => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex-1" />
              <span className="text-sm text-gray-500 self-center">
                共 {filteredResults.length} 条结果
              </span>
            </div>

            {/* 小队汇总 */}
            {Object.keys(teamStats).length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-purple-500" />
                    小队汇总
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2">学校</th>
                          <th className="text-left py-2 px-2">小队</th>
                          <th className="text-center py-2 px-2">人数</th>
                          <th className="text-center py-2 px-2">平均素养分</th>
                          <th className="text-center py-2 px-2">角色分布</th>
                          <th className="text-center py-2 px-2">短板维度</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(teamStats).map(([teamId, stat]) => (
                          <tr key={teamId} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-2">{stat.schoolName}</td>
                            <td className="py-2 px-2">{stat.teamName}</td>
                            <td className="text-center py-2 px-2">{stat.memberCount}</td>
                            <td className="text-center py-2 px-2 font-medium">{stat.avgLiteracyScore}/48</td>
                            <td className="text-center py-2 px-2">
                              <span className="text-orange-600">🧭{stat.roleBreakdown.guide}</span>{' '}
                              <span className="text-blue-600">📷{stat.roleBreakdown.visual}</span>{' '}
                              <span className="text-purple-600">📜{stat.roleBreakdown.text}</span>
                            </td>
                            <td className="text-center py-2 px-2">
                              {Object.entries(stat.weakDimensions).filter(([, v]) => v > 0).map(([k, v]) => (
                                <span key={k} className="text-red-600 text-xs mr-1">
                                  {dimensionLabels[k]}×{v}
                                </span>
                              ))}
                              {Object.values(stat.weakDimensions).every(v => v === 0) && (
                                <span className="text-green-600 text-xs">无短板</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 学生详细结果列表 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-500" />
                  学生评估详情
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">学校</th>
                        <th className="text-left py-2 px-2">小队</th>
                        <th className="text-left py-2 px-2">姓名</th>
                        <th className="text-center py-2 px-2">素养总分</th>
                        <th className="text-center py-2 px-2">素养水平</th>
                        <th className="text-center py-2 px-2">倾向角色</th>
                        <th className="text-center py-2 px-2">角色类型</th>
                        <th className="text-center py-2 px-2">A</th>
                        <th className="text-center py-2 px-2">B</th>
                        <th className="text-center py-2 px-2">C</th>
                        <th className="text-center py-2 px-2">D</th>
                        <th className="text-center py-2 px-2">短板</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-2 text-xs">{r.schoolName}</td>
                          <td className="py-2 px-2 text-xs">{r.teamName}</td>
                          <td className="py-2 px-2 font-medium">{r.member_name}</td>
                          <td className="text-center py-2 px-2 font-medium">{r.literacy_total_score}/48</td>
                          <td className="text-center py-2 px-2">
                            <Badge className={literacyLevelColors[r.literacy_level] || ''}>
                              {r.literacyLevelLabel}
                            </Badge>
                          </td>
                          <td className="text-center py-2 px-2">
                            <Badge className={roleColors[r.primary_role] || ''}>
                              {r.primaryRoleLabel}
                            </Badge>
                          </td>
                          <td className="text-center py-2 px-2 text-xs">{r.roleTypeLabel}</td>
                          <td className={`text-center py-2 px-2 ${r.dimension_a_score <= 6 ? 'text-red-600 font-medium' : ''}`}>
                            {r.dimension_a_score}
                          </td>
                          <td className={`text-center py-2 px-2 ${r.dimension_b_score <= 6 ? 'text-red-600 font-medium' : ''}`}>
                            {r.dimension_b_score}
                          </td>
                          <td className={`text-center py-2 px-2 ${r.dimension_c_score <= 6 ? 'text-red-600 font-medium' : ''}`}>
                            {r.dimension_c_score}
                          </td>
                          <td className={`text-center py-2 px-2 ${r.dimension_d_score <= 6 ? 'text-red-600 font-medium' : ''}`}>
                            {r.dimension_d_score}
                          </td>
                          <td className="text-center py-2 px-2">
                            {r.weak_dimensions && r.weak_dimensions.length > 0 ? (
                              r.weak_dimensions.map(d => dimensionLabels[d] || d).join(', ')
                            ) : (
                              <span className="text-green-600">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* 个性化教学建议说明 */}
            <Card className="mt-6 border-l-4 border-l-amber-500">
              <CardContent className="p-4">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  个性化教学建议
                </h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• 短板维度（得分≤6）的学生需要针对性加强，建议参考下方策略</li>
                  <li>• <strong>情感低(A)</strong>：从趣味体验入手（AI画画、AI聊天），先激发兴趣</li>
                  <li>• <strong>使用低(B)</strong>：增加上机实操，从最简单的AI对话开始手把手带</li>
                  <li>• <strong>认知低(C)</strong>：用"你当AI"游戏、动画视频讲AI原理</li>
                  <li>• <strong>伦理低(D)</strong>：用情境讨论："AI帮我写作业该不该交""AI造假照片对不对"</li>
                  <li>• 银蛇博士和蜡象助手可根据角色倾向和短板维度，向小队提供个性化教学建议</li>
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
