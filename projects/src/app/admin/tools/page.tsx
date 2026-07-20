'use client';

import { useEffect, useState } from 'react';
import { safeGetJSON } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, Plus, Edit, Trash2, X, Save, 
  Wrench, Link2, Image, Search, Upload, Loader2,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

interface User {
  id: string;
  name: string;
  role: string;
}

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  image_url: string;
  is_active: boolean;
  stock: number | null;
  nature: string; // physical: 实物, virtual: 虚拟
  team_limit: number | null; // 每个小队可领用的最大数量
  needs_return: boolean; // 是否需要还回
}

interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
}

interface LinkedSkill {
  id: string;
  skillId: string;
  isAutoAdd: boolean;
  skills: Skill;
}

const toolCategories = [
  '记录工具', '测量工具', '导航工具', '科学仪器', 
  '数据处理', '创作工具', '采集工具', '其他'
];

const iconOptions = ['📷', '📓', '🎙️', '📏', '🗺️', '🧭', '🔬', '🔭', '🌡️', '💻', '🎨', '🧪', '🔧', '📱', '✏️', '📌', '🎯', '💡', '🔍', '📐'];

export default function ToolsManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // 滚动位置记忆
  useScrollPosition('admin-tools');
  
  const [showDialog, setShowDialog] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [linkedSkills, setLinkedSkills] = useState<LinkedSkill[]>([]);
  const [toolForm, setToolForm] = useState({
    name: '',
    description: '',
    icon: '🔧',
    category: '其他',
    imageUrl: '',
    stock: null as number | null,
    nature: 'physical' as 'physical' | 'virtual',
    teamLimit: null as number | null,
    needsReturn: true, // 默认需要还回
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // 详情面板状态
  const [showDetail, setShowDetail] = useState(false);
  const [detailTool, setDetailTool] = useState<Tool | null>(null);
  const [detailLinkedSkills, setDetailLinkedSkills] = useState<LinkedSkill[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // 判断是否为只读模式（志愿者或助学老师）
  const isReadOnly = user?.role === 'volunteer' || user?.role === 'teacher';

  useEffect(() => {
    // 获取用户信息
    const userObj = safeGetJSON<User | null>('user', null);
    if (!userObj) {
      router.push('/admin/login');
      return;
    }
    setUser(userObj);

    fetchTools();
    fetchSkills();
  }, [router]);

  const fetchTools = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tools');
      const data = await res.json();
      setTools(data.tools || []);
    } catch (error) {
      console.error('获取工具列表失败:', error);
      toast.error('获取工具列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchSkills = async () => {
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      setAllSkills(data.skills || []);
    } catch (error) {
      console.error('获取技能列表失败:', error);
    }
  };

  const fetchToolDetail = async (toolId: string) => {
    try {
      const res = await fetch(`/api/tools/${toolId}`);
      const data = await res.json();
      if (data.tool) {
        return data.tool.linkedSkills || [];
      }
      return [];
    } catch (error) {
      console.error('获取工具详情失败:', error);
      return [];
    }
  };

  // 打开详情面板
  const openDetailPanel = async (tool: Tool) => {
    setDetailTool(tool);
    setLoadingDetail(true);
    setShowDetail(true);
    const skills = await fetchToolDetail(tool.id);
    setDetailLinkedSkills(skills);
    setLoadingDetail(false);
  };

  const openCreateDialog = () => {
    if (isReadOnly) return;
    setEditingTool(null);
    setToolForm({
      name: '',
      description: '',
      icon: '🔧',
      category: '其他',
      imageUrl: '',
      stock: null,
      nature: 'physical',
      teamLimit: null,
      needsReturn: true,
    });
    setLinkedSkills([]);
    setShowDialog(true);
  };

  const openEditDialog = async (tool: Tool) => {
    if (isReadOnly) return;
    setEditingTool(tool);
    setToolForm({
      name: tool.name,
      description: tool.description || '',
      icon: tool.icon || '🔧',
      category: tool.category || '其他',
      imageUrl: tool.image_url || '',
      stock: tool.stock,
      nature: (tool.nature as 'physical' | 'virtual') || 'physical',
      teamLimit: tool.team_limit,
      needsReturn: tool.needs_return !== false, // 默认 true
    });
    const skills = await fetchToolDetail(tool.id);
    setLinkedSkills(skills);
    setShowDialog(true);
  };

  const handleSaveTool = async () => {
    if (!toolForm.name.trim()) {
      toast.error('请输入工具名称');
      return;
    }

    // 验证实物工具必须有库存数量
    if (toolForm.nature === 'physical' && (toolForm.stock === null || toolForm.stock === undefined)) {
      toast.error('实物工具必须设置库存数量');
      return;
    }

    // 验证实物工具必须有小队领用量
    if (toolForm.nature === 'physical' && (toolForm.teamLimit === null || toolForm.teamLimit === undefined)) {
      toast.error('实物工具必须设置小队领用量');
      return;
    }

    setIsSaving(true);
    try {
      if (editingTool) {
        // 更新工具
        const res = await fetch(`/api/tools/${editingTool.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: toolForm.name,
            description: toolForm.description,
            icon: toolForm.icon,
            category: toolForm.category,
            imageUrl: toolForm.imageUrl,
            stock: toolForm.stock,
            nature: toolForm.nature,
            teamLimit: toolForm.teamLimit,
            needsReturn: toolForm.needsReturn,
            linkedSkills: linkedSkills.map(ls => ({
              skillId: ls.skills.id,
              isAutoAdd: ls.isAutoAdd,
            })),
          }),
        });

        const data = await res.json();
        if (data.success) {
          toast.success('工具已更新');
          setShowDialog(false);
          fetchTools();
        } else {
          toast.error(data.error || '更新失败');
        }
      } else {
        // 创建工具
        const res = await fetch('/api/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toolForm),
        });

        const data = await res.json();
        if (data.success) {
          // 创建后更新关联技能
          if (linkedSkills.length > 0) {
            await fetch(`/api/tools/${data.tool.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                linkedSkills: linkedSkills.map(ls => ({
                  skillId: ls.skills.id,
                  isAutoAdd: ls.isAutoAdd,
                })),
              }),
            });
          }
          toast.success('工具创建成功');
          setShowDialog(false);
          fetchTools();
        } else {
          toast.error(data.error || '创建失败');
        }
      }
    } catch (error) {
      toast.error('操作失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTool = async (toolId: string) => {
    if (isReadOnly) return;
    if (!confirm('确定要删除这个工具吗？')) return;

    try {
      const res = await fetch(`/api/tools/${toolId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('工具已删除');
        fetchTools();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const handleToggleLinkedSkill = (skill: Skill) => {
    const existingIndex = linkedSkills.findIndex(ls => ls.skills.id === skill.id);
    if (existingIndex >= 0) {
      setLinkedSkills(linkedSkills.filter((_, i) => i !== existingIndex));
    } else {
      setLinkedSkills([...linkedSkills, {
        id: '',
        skillId: skill.id,
        isAutoAdd: true,
        skills: skill,
      }]);
    }
  };

  const handleToggleAutoAdd = (skillId: string) => {
    setLinkedSkills(linkedSkills.map(ls => 
      ls.skills.id === skillId ? { ...ls, isAutoAdd: !ls.isAutoAdd } : ls
    ));
  };

  // 图片上传处理
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('仅支持 JPG、PNG、GIF、WebP 格式的图片');
      return;
    }

    // 验证文件大小
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片大小不能超过 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setToolForm({ ...toolForm, imageUrl: data.url });
        toast.success('图片上传成功');
      } else {
        toast.error(data.error || '上传失败');
      }
    } catch (error) {
      console.error('上传错误:', error);
      toast.error('图片上传失败，请重试');
    } finally {
      setIsUploading(false);
      // 清空input以便重复选择同一文件
      e.target.value = '';
    }
  };

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tool.description?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Wrench className="w-5 h-5 text-blue-500" />
              工具管理
            </h1>
            {isReadOnly && (
              <Badge variant="outline" className="text-orange-600 border-orange-200">
                只读模式
              </Badge>
            )}
          </div>
          {!isReadOnly && (
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">添加工具</span>
              <span className="sm:hidden">添加</span>
            </Button>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 筛选栏 */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="py-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="搜索工具名称或描述..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分类</SelectItem>
                  {toolCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* 工具列表 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTools.map(tool => (
            <Card 
              key={tool.id} 
              className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => openDetailPanel(tool)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-purple-100 rounded-xl flex items-center justify-center text-2xl shrink-0">
                    {tool.icon || '🔧'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold truncate">{tool.name}</h3>
                    </div>
                    <Badge variant="outline" className="text-xs mt-1">{tool.category}</Badge>
                    {tool.description && (
                      <p className="text-sm text-gray-500 mt-2 line-clamp-2">{tool.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${tool.nature === 'virtual' ? 'border-purple-300 text-purple-600' : 'border-blue-300 text-blue-600'}`}
                      >
                        {tool.nature === 'virtual' ? '虚拟工具' : '实物工具'}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Wrench className="w-3 h-3" />
                        {tool.stock !== null && tool.stock !== undefined 
                          ? `库存: ${tool.stock}` 
                          : (tool.nature === 'virtual' ? '无上限' : '未设置')}
                      </div>
                      {tool.team_limit !== null && tool.team_limit !== undefined && (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <span>小队领用: {tool.team_limit}</span>
                        </div>
                      )}
                      {tool.needs_return !== false ? (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <span>需还回</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-orange-600">
                          <span>无需还回</span>
                        </div>
                      )}
                      {tool.image_url && (
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Image className="w-3 h-3" />
                          已设置图片
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* 编辑/删除按钮 - 仅管理员可见 */}
                {!isReadOnly && (
                  <div className="flex justify-end gap-2 mt-4 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => openEditDialog(tool)}
                      title="编辑"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-red-600"
                      onClick={() => handleDeleteTool(tool.id)}
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredTools.length === 0 && (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 text-center text-gray-500">
              <Wrench className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>暂无工具</p>
              {!isReadOnly && (
                <p className="text-sm mt-1">点击右上角按钮添加工具</p>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* 工具详情面板 */}
      {showDetail && detailTool && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">{detailTool.icon || '🔧'}</span>
                  工具详情
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => setShowDetail(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              {/* 基本信息 */}
              <div className="flex items-start gap-4">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-xl flex items-center justify-center text-4xl shrink-0">
                  {detailTool.icon || '🔧'}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold">{detailTool.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">{detailTool.category}</Badge>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${detailTool.nature === 'virtual' ? 'border-purple-300 text-purple-600' : 'border-blue-300 text-blue-600'}`}
                    >
                      {detailTool.nature === 'virtual' ? '虚拟工具' : '实物工具'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* 工具描述 */}
              <div>
                <Label className="text-sm text-gray-500 mb-2 block">工具描述</Label>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-700">
                    {detailTool.description || '暂无描述'}
                  </p>
                </div>
              </div>

              {/* 库存数量 */}
              <div>
                <Label className="text-sm text-gray-500 mb-2 block">库存数量</Label>
                <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-blue-500" />
                  {detailTool.stock !== null && detailTool.stock !== undefined ? (
                    <>
                      <span className="text-lg font-bold text-blue-600">{detailTool.stock}</span>
                      <span className="text-sm text-gray-500">个</span>
                      <span className="text-xs text-gray-400 ml-2">
                        （每位志愿者老师可使用的最大量）
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-lg font-bold text-purple-600">无上限</span>
                      <span className="text-xs text-gray-400 ml-2">
                        （虚拟工具，使用量无限制）
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* 小队领用量 */}
              <div>
                <Label className="text-sm text-gray-500 mb-2 block">小队领用量</Label>
                <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-green-500" />
                  {detailTool.team_limit !== null && detailTool.team_limit !== undefined ? (
                    <>
                      <span className="text-lg font-bold text-green-600">{detailTool.team_limit}</span>
                      <span className="text-sm text-gray-500">个/小队</span>
                      <span className="text-xs text-gray-400 ml-2">
                        （每个小队可领用的最大数量）
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-lg font-bold text-gray-500">无限制</span>
                      <span className="text-xs text-gray-400 ml-2">
                        （小队领用量无限制）
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* 是否需要还回 */}
              <div>
                <Label className="text-sm text-gray-500 mb-2 block">是否需要还回</Label>
                <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-2">
                  {detailTool.needs_return !== false ? (
                    <>
                      <Badge variant="secondary" className="text-green-600 bg-green-50 border border-green-200">
                        需要还回
                      </Badge>
                      <span className="text-xs text-gray-400 ml-2">
                        （消耗品，使用后需归还）
                      </span>
                    </>
                  ) : (
                    <>
                      <Badge variant="secondary" className="text-orange-600 bg-orange-50 border border-orange-200">
                        无需还回
                      </Badge>
                      <span className="text-xs text-gray-400 ml-2">
                        （一次性使用，无需归还）
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* 工具图片 */}
              {detailTool.image_url && (
                <div>
                  <Label className="text-sm text-gray-500 mb-2 block">工具图片</Label>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <img 
                      src={detailTool.image_url} 
                      alt={detailTool.name}
                      className="w-48 h-48 object-cover rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* 链接的技能 */}
              <div>
                <Label className="text-sm text-gray-500 mb-2 block flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  链接的技能
                </Label>
                {loadingDetail ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : detailLinkedSkills.length > 0 ? (
                  <div className="space-y-2">
                    {detailLinkedSkills.map((ls) => (
                      <div 
                        key={ls.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{ls.skills.icon}</span>
                          <div>
                            <p className="font-medium">{ls.skills.name}</p>
                            <p className="text-xs text-gray-500">{ls.skills.category}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {ls.isAutoAdd ? (
                            <Badge variant="secondary" className="text-green-600 bg-green-50">
                              自动添加
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-gray-500">
                              手动添加
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/admin/skills?highlight=${ls.skills.id}`)}
                            title="查看技能"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                    <Link2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">暂无链接的技能</p>
                  </div>
                )}
              </div>

              {/* 关闭按钮 */}
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowDetail(false)}
                >
                  关闭
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 工具编辑对话框 - 仅管理员可用 */}
      {!isReadOnly && showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <CardTitle>{editingTool ? '编辑工具' : '添加工具'}</CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => setShowDialog(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>工具名称 *</Label>
                  <Input
                    value={toolForm.name}
                    onChange={(e) => setToolForm({ ...toolForm, name: e.target.value })}
                    placeholder="例如：相机/手机"
                  />
                </div>
                <div className="space-y-2">
                  <Label>分类</Label>
                  <Select 
                    value={toolForm.category} 
                    onValueChange={(value) => setToolForm({ ...toolForm, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {toolCategories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>工具图标</Label>
                <div className="flex flex-wrap gap-2">
                  {iconOptions.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setToolForm({ ...toolForm, icon })}
                      className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                        toolForm.icon === icon 
                          ? 'bg-blue-500 ring-2 ring-blue-300' 
                          : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>工具描述</Label>
                <Textarea
                  value={toolForm.description}
                  onChange={(e) => setToolForm({ ...toolForm, description: e.target.value })}
                  placeholder="描述工具的用途..."
                  rows={2}
                />
              </div>

              {/* 工具性质 */}
              <div className="space-y-2">
                <Label>工具性质 *</Label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="nature"
                      value="physical"
                      checked={toolForm.nature === 'physical'}
                      onChange={() => setToolForm({ 
                        ...toolForm, 
                        nature: 'physical',
                        stock: null // 切换时清空库存，让用户重新填写
                      })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm">实物工具</span>
                    <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">需设置库存</Badge>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="nature"
                      value="virtual"
                      checked={toolForm.nature === 'virtual'}
                      onChange={() => setToolForm({ 
                        ...toolForm, 
                        nature: 'virtual'
                      })}
                      className="w-4 h-4 text-purple-600"
                    />
                    <span className="text-sm">虚拟工具</span>
                    <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">库存可选</Badge>
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  {toolForm.nature === 'physical' 
                    ? '实物工具必须设置库存数量，用于限制每位志愿者老师可分配的最大量' 
                    : '虚拟工具可不设置库存数量，表示使用量无上限；设置库存后按最大数量限制'}
                </p>
              </div>

              <div className="space-y-2">
                <Label>
                  库存数量
                  {toolForm.nature === 'physical' && <span className="text-red-500 ml-1">*</span>}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    value={toolForm.stock ?? ''}
                    onChange={(e) => setToolForm({ 
                      ...toolForm, 
                      stock: e.target.value === '' ? null : parseInt(e.target.value) || 0 
                    })}
                    placeholder={toolForm.nature === 'virtual' ? '不填表示无上限' : '请输入库存数量'}
                    className={`w-40 ${toolForm.nature === 'physical' && toolForm.stock === null ? 'border-red-300' : ''}`}
                  />
                  <span className="text-sm text-gray-500">个</span>
                </div>
                <p className="text-xs text-gray-500">
                  {toolForm.nature === 'physical' 
                    ? '实物工具必须设置库存数量，此数量为每位志愿者老师可使用的最大量' 
                    : '虚拟工具不填表示使用量无上限，填写后按此数量限制分配'}
                </p>
              </div>

              {/* 小队领用量 */}
              <div className="space-y-2">
                <Label>
                  小队领用量
                  {toolForm.nature === 'physical' && <span className="text-red-500 ml-1">*</span>}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    value={toolForm.teamLimit ?? ''}
                    onChange={(e) => setToolForm({ 
                      ...toolForm, 
                      teamLimit: e.target.value === '' ? null : parseInt(e.target.value) || 0 
                    })}
                    placeholder={toolForm.nature === 'physical' ? '请输入小队领用量' : '不填表示无限制'}
                    className={`w-40 ${toolForm.nature === 'physical' && toolForm.teamLimit === null ? 'border-red-300' : ''}`}
                  />
                  <span className="text-sm text-gray-500">个/小队</span>
                </div>
                <p className="text-xs text-gray-500">
                  {toolForm.nature === 'physical' 
                    ? '实物工具必须设置小队领用量，限制每个小队可领用的最大数量' 
                    : '虚拟工具可不设置，不填表示无限制'}
                </p>
              </div>

              {/* 是否需要还回 */}
              <div className="space-y-2">
                <Label>是否需要还回</Label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="needsReturn"
                      checked={toolForm.needsReturn === true}
                      onChange={() => setToolForm({ ...toolForm, needsReturn: true })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm">需要还回</span>
                    <Badge variant="outline" className="text-xs border-green-300 text-green-600">消耗品</Badge>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="needsReturn"
                      checked={toolForm.needsReturn === false}
                      onChange={() => setToolForm({ ...toolForm, needsReturn: false })}
                      className="w-4 h-4 text-purple-600"
                    />
                    <span className="text-sm">无需还回</span>
                    <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">一次性使用</Badge>
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  选择"需要还回"表示工具使用后需归还给助学老师，如相机、测量仪器等；
                  选择"无需还回"表示工具为消耗品，使用后无需归还，如实验材料、文具等
                </p>
              </div>

              <div className="space-y-2">
                <Label>工具图片</Label>
                <div className="flex gap-2">
                  <Input
                    value={toolForm.imageUrl}
                    onChange={(e) => setToolForm({ ...toolForm, imageUrl: e.target.value })}
                    placeholder="https://example.com/tool-image.jpg"
                    className="flex-1"
                  />
                  <label className={`cursor-pointer ${isUploading ? 'pointer-events-none' : ''}`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={isUploading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isUploading}
                      className="whitespace-nowrap"
                      onClick={(e) => {
                        e.preventDefault();
                        const input = e.currentTarget.parentElement?.querySelector('input');
                        input?.click();
                      }}
                    >
                      {isUploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      <span className="ml-1 hidden sm:inline">上传图片</span>
                    </Button>
                  </label>
                </div>
                {/* 图片预览 */}
                {toolForm.imageUrl && (
                  <div className="mt-2 relative inline-block">
                    <img
                      src={toolForm.imageUrl}
                      alt="工具图片预览"
                      className="w-32 h-32 object-cover rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={() => setToolForm({ ...toolForm, imageUrl: '' })}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-gray-500">支持 JPG、PNG、GIF、WebP 格式，最大 5MB</p>
              </div>

              {/* 关联技能 */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  关联技能
                </Label>
                <p className="text-xs text-gray-500">添加工具到任务时自动添加这些技能学习资料</p>
                <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                  {allSkills.map(skill => {
                    const isLinked = linkedSkills.some(ls => ls.skills.id === skill.id);
                    const linkedSkill = linkedSkills.find(ls => ls.skills.id === skill.id);
                    
                    return (
                      <div 
                        key={skill.id}
                        className={`flex items-center justify-between p-2 rounded-lg ${
                          isLinked ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={isLinked}
                            onCheckedChange={() => handleToggleLinkedSkill(skill)}
                          />
                          <span className="text-lg">{skill.icon}</span>
                          <div>
                            <p className="text-sm font-medium">{skill.name}</p>
                            <p className="text-xs text-gray-500">{skill.category}</p>
                          </div>
                        </div>
                        {isLinked && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-600">自动添加</label>
                            <Checkbox
                              checked={linkedSkill?.isAutoAdd}
                              onCheckedChange={() => handleToggleAutoAdd(skill.id)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setShowDialog(false)}
                >
                  取消
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleSaveTool}
                  disabled={isSaving}
                >
                  {isSaving ? '保存中...' : (editingTool ? '保存' : '创建')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
