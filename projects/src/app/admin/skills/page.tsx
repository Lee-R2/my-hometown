'use client';

import { useEffect, useState } from 'react';
import { safeGetJSON } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, Plus, Edit, Trash2, X, 
  BookOpen, Link2, Video, FileText, Search, Target,
  FileQuestion, Presentation, ExternalLink, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

// 学习资料类型
type MaterialType = 'video' | 'document' | 'ppt' | 'test' | 'link';

interface User {
  id: string;
  name: string;
  role: string;
}

interface LearningMaterial {
  id: string;
  type: MaterialType;
  title: string;
  url: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  content: string;
  video_url: string;
  learning_materials: LearningMaterial[];
  usage: string;
  is_active: boolean;
  is_required: boolean;
}

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  image_url: string;
}

interface LinkedTool {
  id: string;
  toolId: string;
  isAutoAdd: boolean;
  tools: Tool;
}

const skillCategories = [
  '科学方法', '沟通能力', '数据处理', '地理技能', 
  '实验技能', '记录技能', '写作技能', '协作能力', 
  '研究方法', '自我管理', '其他'
];

const iconOptions = ['👁️', '💬', '📊', '🗺️', '🦋', '📸', '📝', '🤝', '📚', '⏰', '🔬', '🎯', '💡', '🔍', '🎨', '✏️', '📌', '🧪', '📐', '🌟'];

// 学习资料类型配置
const materialTypeConfig: Record<MaterialType, { label: string; icon: React.ReactNode; placeholder: string }> = {
  video: { label: '在线视频', icon: <Video className="w-4 h-4" />, placeholder: 'https://www.bilibili.com/video/...' },
  document: { label: '在线文档', icon: <FileText className="w-4 h-4" />, placeholder: 'https://docs.qq.com/doc/...' },
  ppt: { label: '在线PPT', icon: <Presentation className="w-4 h-4" />, placeholder: 'https://docs.qq.com/slide/...' },
  test: { label: '在线测试', icon: <FileQuestion className="w-4 h-4" />, placeholder: 'https://ks.wjx.top/...' },
  link: { label: '其他链接', icon: <ExternalLink className="w-4 h-4" />, placeholder: 'https://...' },
};

export default function SkillsManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [allTools, setAllTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // 滚动位置记忆
  useScrollPosition('admin-skills');
  
  const [showDialog, setShowDialog] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [linkedTools, setLinkedTools] = useState<LinkedTool[]>([]);
  const [learningMaterials, setLearningMaterials] = useState<LearningMaterial[]>([]);
  const [skillForm, setSkillForm] = useState({
    name: '',
    description: '',
    icon: '📚',
    category: '其他',
    content: '',
    videoUrl: '',
    usage: '',
    isRequired: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  // 详情面板状态
  const [showDetail, setShowDetail] = useState(false);
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null);
  const [detailLinkedTools, setDetailLinkedTools] = useState<LinkedTool[]>([]);
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

    fetchSkills();
    fetchTools();
  }, [router]);

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      setSkills(data.skills || []);
    } catch (error) {
      console.error('获取技能列表失败:', error);
      toast.error('获取技能列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTools = async () => {
    try {
      const res = await fetch('/api/tools');
      const data = await res.json();
      setAllTools(data.tools || []);
    } catch (error) {
      console.error('获取工具列表失败:', error);
    }
  };

  const fetchSkillDetail = async (skillId: string) => {
    try {
      const res = await fetch(`/api/skills/${skillId}`);
      const data = await res.json();
      if (data.skill) {
        return data.skill.linkedTools || [];
      }
      return [];
    } catch (error) {
      console.error('获取技能详情失败:', error);
      return [];
    }
  };

  // 打开详情面板
  const openDetailPanel = async (skill: Skill) => {
    setDetailSkill(skill);
    setLoadingDetail(true);
    setShowDetail(true);
    const tools = await fetchSkillDetail(skill.id);
    setDetailLinkedTools(tools);
    setLoadingDetail(false);
  };

  const openCreateDialog = () => {
    if (isReadOnly) return;
    setEditingSkill(null);
    setSkillForm({
      name: '',
      description: '',
      icon: '📚',
      category: '其他',
      content: '',
      videoUrl: '',
      usage: '',
      isRequired: true,
    });
    setLinkedTools([]);
    setLearningMaterials([]);
    setShowDialog(true);
  };

  const openEditDialog = async (skill: Skill) => {
    if (isReadOnly) return;
    setEditingSkill(skill);
    setSkillForm({
      name: skill.name,
      description: skill.description || '',
      icon: skill.icon || '📚',
      category: skill.category || '其他',
      content: skill.content || '',
      videoUrl: skill.video_url || '',
      usage: skill.usage || '',
      isRequired: skill.is_required !== false,
    });
    setLearningMaterials(skill.learning_materials || []);
    const tools = await fetchSkillDetail(skill.id);
    setLinkedTools(tools);
    setShowDialog(true);
  };

  const handleSaveSkill = async () => {
    if (!skillForm.name.trim()) {
      toast.error('请输入技能名称');
      return;
    }

    setIsSaving(true);
    try {
      if (editingSkill) {
        // 更新技能
        const res = await fetch(`/api/skills/${editingSkill.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: skillForm.name,
            description: skillForm.description,
            icon: skillForm.icon,
            category: skillForm.category,
            content: skillForm.content,
            videoUrl: skillForm.videoUrl,
            usage: skillForm.usage,
            isRequired: skillForm.isRequired,
            learningMaterials: learningMaterials,
            linkedTools: linkedTools.map(lt => ({
              toolId: lt.tools.id,
              isAutoAdd: lt.isAutoAdd,
            })),
          }),
        });

        const data = await res.json();
        if (data.success) {
          toast.success('技能已更新');
          setShowDialog(false);
          fetchSkills();
        } else {
          toast.error(data.error || '更新失败');
        }
      } else {
        // 创建技能
        const res = await fetch('/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...skillForm,
            isRequired: skillForm.isRequired,
            learningMaterials: learningMaterials,
          }),
        });

        const data = await res.json();
        if (data.success) {
          // 创建后更新关联工具
          if (linkedTools.length > 0) {
            await fetch(`/api/skills/${data.skill.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                linkedTools: linkedTools.map(lt => ({
                  toolId: lt.tools.id,
                  isAutoAdd: lt.isAutoAdd,
                })),
              }),
            });
          }
          toast.success('技能创建成功');
          setShowDialog(false);
          fetchSkills();
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

  const handleDeleteSkill = async (skillId: string) => {
    if (isReadOnly) return;
    if (!confirm('确定要删除这个技能吗？')) return;

    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('技能已删除');
        fetchSkills();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const handleToggleLinkedTool = (tool: Tool) => {
    const existingIndex = linkedTools.findIndex(lt => lt.tools.id === tool.id);
    if (existingIndex >= 0) {
      setLinkedTools(linkedTools.filter((_, i) => i !== existingIndex));
    } else {
      setLinkedTools([...linkedTools, {
        id: '',
        toolId: tool.id,
        isAutoAdd: true,
        tools: tool,
      }]);
    }
  };

  const handleToggleAutoAdd = (toolId: string) => {
    setLinkedTools(linkedTools.map(lt => 
      lt.tools.id === toolId ? { ...lt, isAutoAdd: !lt.isAutoAdd } : lt
    ));
  };

  // 添加学习资料
  const handleAddMaterial = () => {
    const newMaterial: LearningMaterial = {
      id: `temp-${Date.now()}`,
      type: 'link',
      title: '',
      url: '',
    };
    setLearningMaterials([...learningMaterials, newMaterial]);
  };

  // 更新学习资料
  const handleUpdateMaterial = (id: string, field: 'type' | 'title' | 'url', value: string) => {
    setLearningMaterials(learningMaterials.map(m => 
      m.id === id ? { ...m, [field]: value } : m
    ));
  };

  // 删除学习资料
  const handleDeleteMaterial = (id: string) => {
    setLearningMaterials(learningMaterials.filter(m => m.id !== id));
  };

  // 打开学习资料链接
  const openMaterialUrl = (url: string) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  const filteredSkills = skills.filter(skill => {
    const matchesSearch = skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (skill.description?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
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
              <BookOpen className="w-5 h-5 text-purple-500" />
              技能学习管理
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
              <span className="hidden sm:inline">添加技能</span>
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
                  placeholder="搜索技能名称或描述..."
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
                  {skillCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* 技能列表 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredSkills.map(skill => (
            <Card 
              key={skill.id} 
              className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => openDetailPanel(skill)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl flex items-center justify-center text-2xl shrink-0">
                    {skill.icon || '📚'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{skill.name}</h3>
                      <Badge variant="outline" className="text-xs">{skill.category}</Badge>
                      {skill.is_required !== false ? (
                        <Badge variant="destructive" className="text-xs">必学</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">选学</Badge>
                      )}
                    </div>
                    {skill.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{skill.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {skill.usage && (
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Target className="w-3 h-3" />
                          有用途说明
                        </div>
                      )}
                      {skill.content && (
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <FileText className="w-3 h-3" />
                          有学习内容
                        </div>
                      )}
                      {skill.learning_materials && skill.learning_materials.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <BookOpen className="w-3 h-3" />
                          {skill.learning_materials.length} 个学习资料
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
                      onClick={() => openEditDialog(skill)}
                      title="编辑"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-red-600"
                      onClick={() => handleDeleteSkill(skill.id)}
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

        {filteredSkills.length === 0 && (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 text-center text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>暂无技能</p>
              {!isReadOnly && (
                <p className="text-sm mt-1">点击右上角按钮添加技能</p>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* 技能详情面板 */}
      {showDetail && detailSkill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">{detailSkill.icon || '📚'}</span>
                  技能详情
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
                <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl flex items-center justify-center text-3xl shrink-0">
                  {detailSkill.icon || '📚'}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold">{detailSkill.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline">{detailSkill.category}</Badge>
                    {detailSkill.is_required !== false ? (
                      <Badge variant="destructive" className="text-xs">必学</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">选学</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* 技能描述 */}
              <div>
                <Label className="text-sm text-gray-500 mb-2 block">技能描述</Label>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-700">
                    {detailSkill.description || '暂无描述'}
                  </p>
                </div>
              </div>

              {/* 技能用途 */}
              {detailSkill.usage && (
                <div>
                  <Label className="text-sm text-gray-500 mb-2 block flex items-center gap-2">
                    <Target className="w-4 h-4 text-green-500" />
                    技能用途
                  </Label>
                  <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{detailSkill.usage}</p>
                  </div>
                </div>
              )}

              {/* 学习内容 */}
              {detailSkill.content && (
                <div>
                  <Label className="text-sm text-gray-500 mb-2 block flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" />
                    学习内容
                  </Label>
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{detailSkill.content}</p>
                  </div>
                </div>
              )}

              {/* 学习资料 */}
              <div>
                <Label className="text-sm text-gray-500 mb-2 block flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-purple-500" />
                  学习资料
                </Label>
                {detailSkill.learning_materials && detailSkill.learning_materials.length > 0 ? (
                  <div className="space-y-2">
                    {detailSkill.learning_materials.map((material) => (
                      <div 
                        key={material.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                        onClick={() => openMaterialUrl(material.url)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border">
                            {materialTypeConfig[material.type]?.icon || <ExternalLink className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{material.title || '未命名资料'}</p>
                            <p className="text-xs text-gray-500">{materialTypeConfig[material.type]?.label || '链接'}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="shrink-0">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">暂无学习资料</p>
                  </div>
                )}
              </div>

              {/* 链接的工具 */}
              <div>
                <Label className="text-sm text-gray-500 mb-2 block flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  链接的工具
                </Label>
                {loadingDetail ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : detailLinkedTools.length > 0 ? (
                  <div className="space-y-2">
                    {detailLinkedTools.map((lt) => (
                      <div 
                        key={lt.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{lt.tools.icon}</span>
                          <div>
                            <p className="font-medium">{lt.tools.name}</p>
                            <p className="text-xs text-gray-500">{lt.tools.category}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {lt.isAutoAdd ? (
                            <Badge variant="secondary" className="text-green-600 bg-green-50">
                              自动关联
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-gray-500">
                              手动关联
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/admin/tools?highlight=${lt.tools.id}`)}
                            title="查看工具"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg">
                    <Link2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">暂无链接的工具</p>
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

      {/* 技能编辑对话框 - 仅管理员可用 */}
      {!isReadOnly && showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <CardTitle>{editingSkill ? '编辑技能' : '添加技能'}</CardTitle>
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
            <CardContent className="pt-4">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">基本信息</TabsTrigger>
                  <TabsTrigger value="content">学习资料</TabsTrigger>
                  <TabsTrigger value="tools">关联工具</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>技能名称 *</Label>
                      <Input
                        value={skillForm.name}
                        onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
                        placeholder="例如：观察记录"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>分类</Label>
                      <Select 
                        value={skillForm.category} 
                        onValueChange={(value) => setSkillForm({ ...skillForm, category: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {skillCategories.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>学习类型</Label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setSkillForm({ ...skillForm, isRequired: true })}
                        className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                          skillForm.isRequired
                            ? 'border-red-300 bg-red-50 text-red-700'
                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-lg">📌</span>
                        <div className="text-left">
                          <p className="font-medium text-sm">必学</p>
                          <p className="text-xs opacity-70">小队必须学习此技能</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSkillForm({ ...skillForm, isRequired: false })}
                        className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                          !skillForm.isRequired
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-lg">💡</span>
                        <div className="text-left">
                          <p className="font-medium text-sm">选学</p>
                          <p className="text-xs opacity-70">小队可自主选择学习</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>技能图标</Label>
                    <div className="flex flex-wrap gap-2">
                      {iconOptions.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => setSkillForm({ ...skillForm, icon })}
                          className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                            skillForm.icon === icon 
                              ? 'bg-purple-500 ring-2 ring-purple-300' 
                              : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>技能描述</Label>
                    <Textarea
                      value={skillForm.description}
                      onChange={(e) => setSkillForm({ ...skillForm, description: e.target.value })}
                      placeholder="简短描述这个技能..."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-green-500" />
                      技能用途
                    </Label>
                    <Textarea
                      value={skillForm.usage}
                      onChange={(e) => setSkillForm({ ...skillForm, usage: e.target.value })}
                      placeholder="说明这个技能的用途和应用场景..."
                      rows={2}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="content" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      学习内容
                    </Label>
                    <Textarea
                      value={skillForm.content}
                      onChange={(e) => setSkillForm({ ...skillForm, content: e.target.value })}
                      placeholder="详细的学习内容，支持多段落..."
                      rows={8}
                    />
                    <p className="text-xs text-gray-500">学生完成技能学习时会看到这些内容</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-purple-500" />
                      学习资料
                    </Label>
                    <p className="text-xs text-gray-500">添加在线文档、视频、PPT、测试等学习资料链接</p>
                    
                    {/* 学习资料列表 */}
                    <div className="space-y-3 mt-3">
                      {learningMaterials.map((material) => (
                        <div 
                          key={material.id} 
                          className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg border"
                        >
                          {/* 类型选择 */}
                          <Select
                            value={material.type}
                            onValueChange={(value) => handleUpdateMaterial(material.id, 'type', value)}
                          >
                            <SelectTrigger className="w-28 shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(materialTypeConfig).map(([type, config]) => (
                                <SelectItem key={type} value={type}>
                                  <div className="flex items-center gap-2">
                                    {config.icon}
                                    <span>{config.label}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          {/* 标题输入 */}
                          <Input
                            value={material.title}
                            onChange={(e) => handleUpdateMaterial(material.id, 'title', e.target.value)}
                            placeholder="标题"
                            className="flex-1"
                          />
                          
                          {/* URL输入 */}
                          <Input
                            value={material.url}
                            onChange={(e) => handleUpdateMaterial(material.id, 'url', e.target.value)}
                            placeholder={materialTypeConfig[material.type]?.placeholder || '链接地址'}
                            className="flex-1"
                          />
                          
                          {/* 删除按钮 */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                            onClick={() => handleDeleteMaterial(material.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    
                    {/* 添加按钮 */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={handleAddMaterial}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      添加学习资料
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="tools" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Link2 className="w-4 h-4" />
                      关联工具
                    </Label>
                    <p className="text-sm text-gray-500">当这些工具被添加到任务时，该技能会自动关联</p>
                    <div className="border rounded-lg p-3 space-y-2 max-h-64 overflow-y-auto">
                      {allTools.map(tool => {
                        const isLinked = linkedTools.some(lt => lt.tools.id === tool.id);
                        const linkedTool = linkedTools.find(lt => lt.tools.id === tool.id);
                        
                        return (
                          <div 
                            key={tool.id}
                            className={`flex items-center justify-between p-2 rounded-lg ${
                              isLinked ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={isLinked}
                                onCheckedChange={() => handleToggleLinkedTool(tool)}
                              />
                              <span className="text-lg">{tool.icon}</span>
                              <div>
                                <p className="text-sm font-medium">{tool.name}</p>
                                <p className="text-xs text-gray-500">{tool.category}</p>
                              </div>
                            </div>
                            {isLinked && (
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-600">自动关联</label>
                                <Checkbox
                                  checked={linkedTool?.isAutoAdd}
                                  onCheckedChange={() => handleToggleAutoAdd(tool.id)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex gap-3 pt-4 mt-4 border-t">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setShowDialog(false)}
                >
                  取消
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleSaveSkill}
                  disabled={isSaving}
                >
                  {isSaving ? '保存中...' : (editingSkill ? '保存' : '创建')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
