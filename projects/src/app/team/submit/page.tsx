'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  ArrowLeft, Upload, FileText, Image, X, Video, 
  Loader2, AlertCircle, CheckCircle, Trash2, Camera, Package, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { SubmissionReviewDialog } from '@/components/submission-review-dialog';

interface Team {
  id: string;
  code: string;
  name: string;
  currentTaskId: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  stage: number;
  requirements: any[];
  task_type?: 'main' | 'side' | 'final';
  themeName?: string; // 任务主题名
  // 必学技能完成状态
  requiredSkillsTotal?: number;
  requiredSkillsCompleted?: number;
  allRequiredSkillsCompleted?: boolean;
  skills?: Array<{
    id: string;
    is_required: boolean;
    status: string;
  }>;
  // 截止日期
  nextTaskDeadline?: string | null;
  isDeadlineExpired?: boolean;
}

interface UploadedFile {
  id: string;
  url?: string; // 签名URL可能很长，恢复时可能没有
  key: string;
  fileName: string;
  fileSize: number;
  fileType: 'image' | 'video' | 'text' | 'unknown';
  mimeType: string;
  uploadProgress: number;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 总大小限制100MB

// 未提交文件的存储键
const DRAFT_STORAGE_KEY = 'submission_drafts';

// 获取未提交的文件草稿
function getDraftFiles(taskId: string): UploadedFile[] {
  try {
    const drafts = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (drafts) {
      const allDrafts = JSON.parse(drafts);
      return allDrafts[taskId] || [];
    }
  } catch (e) {
    console.error('获取草稿文件失败:', e);
  }
  return [];
}

// 保存未提交的文件草稿（精简版，不存储完整URL）
function saveDraftFiles(taskId: string, files: UploadedFile[]) {
  try {
    // 只存储必要信息，不存储可能很长的签名URL
    const simplifiedFiles = files.map(f => ({
      id: f.id,
      key: f.key,
      fileName: f.fileName,
      fileSize: f.fileSize,
      fileType: f.fileType,
      mimeType: f.mimeType,
      uploadProgress: f.uploadProgress,
      // 不存储 url，因为签名URL会过期，需要时重新生成
    }));
    
    const drafts = localStorage.getItem(DRAFT_STORAGE_KEY);
    const allDrafts = drafts ? JSON.parse(drafts) : {};
    allDrafts[taskId] = simplifiedFiles;
    
    const dataStr = JSON.stringify(allDrafts);
    // 检查是否超出 localStorage 限制（通常 5MB）
    if (dataStr.length > 4 * 1024 * 1024) {
      console.warn('草稿数据较大，可能超出存储限制');
    }
    
    localStorage.setItem(DRAFT_STORAGE_KEY, dataStr);
    console.log('草稿保存成功，文件数:', files.length);
  } catch (e) {
    console.error('保存草稿文件失败:', e);
    // 如果存储失败，尝试清理旧数据
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      console.log('已清理旧草稿数据');
    } catch {
      // ignore
    }
  }
}

// 清除未提交的文件草稿
function clearDraftFiles(taskId: string) {
  try {
    const drafts = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (drafts) {
      const allDrafts = JSON.parse(drafts);
      delete allDrafts[taskId];
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(allDrafts));
    }
  } catch (e) {
    console.error('清除草稿文件失败:', e);
  }
}

// 获取未提交的文字内容草稿
function getDraftContent(taskId: string): string {
  try {
    const key = `submission_content_${taskId}`;
    return localStorage.getItem(key) || '';
  } catch (e) {
    return '';
  }
}

// 保存未提交的文字内容草稿
function saveDraftContent(taskId: string, content: string) {
  try {
    const key = `submission_content_${taskId}`;
    localStorage.setItem(key, content);
  } catch (e) {
    console.error('保存草稿内容失败:', e);
  }
}

// 清除未提交的文字内容草稿
function clearDraftContent(taskId: string) {
  try {
    const key = `submission_content_${taskId}`;
    localStorage.removeItem(key);
  } catch (e) {
    console.error('清除草稿内容失败:', e);
  }
}

export default function SubmitPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null); // 文档选择
  const [team, setTeam] = useState<Team | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [content, setContent] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(true); // 加载状态
  
  // 确认提交对话框
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  // 工具归还提示
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [toolsToReturn, setToolsToReturn] = useState<Array<{
    id: string;
    name: string;
    icon: string;
    quantity: number;
  }>>([]);
  const [lastSubmissionId, setLastSubmissionId] = useState<string>('');
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  // 滚动位置记忆
  useScrollPosition('team-submit');

  useEffect(() => {
    const teamData = localStorage.getItem('team');
    if (!teamData) {
      router.push('/');
      return;
    }
    
    const teamObj = JSON.parse(teamData);
    setTeam({
      ...teamObj,
      currentTaskId: teamObj.current_task_id || teamObj.currentTaskId,
    });
    
    // 优先使用URL参数中的taskId，其次使用localStorage中的currentTaskId
    const urlParams = new URLSearchParams(window.location.search);
    const urlTaskId = urlParams.get('taskId');
    const taskId = urlTaskId || teamObj.current_task_id || teamObj.currentTaskId;
    
    if (taskId) {
      fetchTask(taskId, teamObj.id);
    } else {
      // 没有任务ID，返回任务详情页
      toast.error('请先选择任务');
      router.push('/team/dashboard');
    }
  }, [router]);

  // 自动保存文字内容草稿
  useEffect(() => {
    if (task?.id && content) {
      // 防抖保存
      const timer = setTimeout(() => {
        saveDraftContent(task.id, content);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [content, task?.id]);

  const fetchTask = async (taskId: string, teamId?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}?teamId=${teamId || team?.id}`);
      
      // 检查响应是否成功
      if (!res.ok) {
        let errorMessage = '获取任务失败';
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = res.statusText || `获取任务失败 (${res.status})`;
        }
        toast.error(errorMessage);
        router.push('/team/dashboard');
        return;
      }

      const data = await res.json();
      if (data.task) {
        setTask(data.task);
        
        // 检查是否超时
        if (data.task.isDeadlineExpired) {
          toast.error('已超过提交截止时间，无法上传任务产出');
          router.push(`/team/task/${taskId}`);
          return;
        }
        
        // 加载之前保存的草稿内容
        const draftContent = getDraftContent(taskId);
        if (draftContent) {
          setContent(draftContent);
        }
        
        // 加载之前上传但未提交的文件
        const draftFiles = getDraftFiles(taskId);
        if (draftFiles.length > 0) {
          setUploadedFiles(draftFiles);
          toast.success(`已恢复 ${draftFiles.length} 个之前上传的文件`);
        }
        
        // 检查必学技能是否完成
        if (data.task.skills && data.task.skills.length > 0 && !data.task.allRequiredSkillsCompleted) {
          toast.error('请先完成所有必学技能');
          router.push(`/team/task/${taskId}`);
        }
      } else {
        toast.error('任务不存在');
        router.push('/team/dashboard');
      }
    } catch (error) {
      console.error('获取任务失败:', error);
      toast.error('获取任务失败');
      router.push('/team/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'image':
        return <Image className="w-5 h-5 text-blue-500" />;
      case 'video':
        return <Video className="w-5 h-5 text-purple-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 计算当前已上传文件总大小
    const currentTotalSize = uploadedFiles.reduce((sum, f) => sum + f.fileSize, 0);
    
    // 验证每个文件
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // 检查单个文件大小
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`文件 "${file.name}" 超过100MB限制`);
        continue;
      }
      
      // 检查总大小
      if (currentTotalSize + file.size > MAX_TOTAL_SIZE) {
        toast.error('所有文件总大小不能超过100MB');
        break;
      }

      // 上传文件
      await uploadFile(file);
    }

    // 清空所有input以便重复选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (docInputRef.current) docInputRef.current.value = '';
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 计算当前文件序号（已有文件数 + 1）
      const fileIndex = uploadedFiles.length + 1;
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('teamId', team?.id || '');
      formData.append('teamName', team?.name || '');
      formData.append('themeName', task?.themeName || '');
      formData.append('stage', task?.stage?.toString() || '');
      formData.append('fileIndex', fileIndex.toString());

      // 视频文件使用较慢的进度模拟（视频上传需要更长时间）
      const isVideo = file.type.startsWith('video/');
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          // 视频文件进度更慢，最大到85%
          const increment = isVideo ? 2 : 5;
          const maxProgress = isVideo ? 85 : 90;
          return Math.min(prev + increment, maxProgress);
        });
      }, isVideo ? 500 : 200); // 视频文件间隔更长

      console.log('开始上传文件:', file.name, '类型:', file.type, '大小:', (file.size / 1024 / 1024).toFixed(2) + 'MB');

      const res = await fetch('/api/upload/submission', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      console.log('上传响应状态:', res.status, res.statusText);

      // 检查响应是否成功
      if (!res.ok) {
        // 尝试解析错误信息
        let errorMessage = '上传失败';
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
          console.error('上传错误响应:', errorData);
        } catch (parseError) {
          // 如果响应不是 JSON，使用状态文本
          errorMessage = res.statusText || `上传失败 (${res.status})`;
          console.error('解析错误响应失败:', parseError);
        }
        toast.error(errorMessage);
        return;
      }

      const data = await res.json();
      console.log('上传响应数据:', data);

      if (data.success) {
        const uploadedFile: UploadedFile = {
          id: Date.now().toString() + Math.random(),
          url: data.url,
          key: data.key,
          fileName: data.fileName,
          fileSize: data.fileSize,
          fileType: data.fileType,
          mimeType: data.mimeType,
          uploadProgress: 100,
        };
        
        const newFiles = [...uploadedFiles, uploadedFile];
        setUploadedFiles(newFiles);
        
        // 保存草稿文件
        if (task?.id) {
          saveDraftFiles(task.id, newFiles);
        }
        
        toast.success(`文件 "${file.name}" 上传成功`);
        console.log('文件上传成功并已保存到草稿');
      } else {
        toast.error(data.error || '上传失败');
        console.error('上传失败:', data.error);
      }
    } catch (error) {
      console.error('上传错误:', error);
      toast.error('上传失败，请重试');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const removeFile = async (fileId: string) => {
    const newFiles = uploadedFiles.filter(f => f.id !== fileId);
    setUploadedFiles(newFiles);
    
    // 更新草稿文件
    if (task?.id) {
      if (newFiles.length > 0) {
        saveDraftFiles(task.id, newFiles);
      } else {
        clearDraftFiles(task.id);
      }
    }
  };

  // 点击提交按钮，显示确认对话框
  const handleConfirmSubmit = () => {
    if (!team || !task) {
      toast.error('请先选择任务');
      return;
    }

    if (!content.trim() && uploadedFiles.length === 0) {
      toast.error('请填写产出内容或上传文件');
      return;
    }

    // 再次检查必学技能是否完成
    if (task.skills && task.skills.length > 0 && !task.allRequiredSkillsCompleted) {
      toast.error('请先完成所有必学技能');
      router.push(`/team/task/${task.id}`);
      return;
    }

    // 显示确认对话框
    setShowConfirmDialog(true);
  };

  // 确认后实际提交
  const handleSubmit = async () => {
    if (!team || !task) return;

    setShowConfirmDialog(false);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.id,
          taskId: task.id,
          content,
          fileUrls: uploadedFiles.map(f => f.url),
          fileKeys: uploadedFiles.map(f => f.key),
          fileNames: uploadedFiles.map(f => f.fileName),
          fileSizes: uploadedFiles.map(f => f.fileSize),
          fileTypes: uploadedFiles.map(f => f.fileType),
        }),
      });

      // 检查响应是否成功
      if (!res.ok) {
        let errorMessage = '提交失败';
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = res.statusText || `提交失败 (${res.status})`;
        }
        toast.error(errorMessage);
        return;
      }

      const data = await res.json();
      if (data.success) {
        // 提交成功后清除草稿
        clearDraftFiles(task.id);
        clearDraftContent(task.id);
        
        // 保存提交ID用于银蛇博士评价
        if (data.submission?.id) {
          setLastSubmissionId(data.submission.id);
        }
        
        // 检查是否有需要归还的工具
        if (data.toolsToReturn && data.toolsToReturn.length > 0) {
          setToolsToReturn(data.toolsToReturn);
        }
        // 提交成功后统一显示成功对话框（含银蛇博士评价入口）
        setShowReturnDialog(true);
      } else {
        toast.error(data.error || '提交失败');
      }
    } catch (error) {
      toast.error('提交失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-gray-600 mb-4">任务不存在</p>
            <Button onClick={() => router.push('/team/dashboard')}>返回首页</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 计算总文件大小
  const totalFileSize = uploadedFiles.reduce((sum, f) => sum + f.fileSize, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 pb-24">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
          <h1 className="text-lg font-bold">提交产出</h1>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 任务信息 */}
        <Card className="border-0 shadow-lg mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{task.title}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary">阶段 {task.stage}</Badge>
                  {task.task_type === 'side' ? (
                    <Badge className="bg-purple-500">支线任务</Badge>
                  ) : (
                    <Badge className="bg-blue-500">主线任务</Badge>
                  )}
                </div>
              </div>
              {task.allRequiredSkillsCompleted && (
                <div className="flex items-center gap-1 text-green-600 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span>必学技能已完成</span>
                </div>
              )}
            </div>
            <CardDescription>{task.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {task.requirements && (
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold mb-2 text-blue-700">任务要求：</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  {(typeof task.requirements === 'string' 
                    ? JSON.parse(task.requirements) 
                    : task.requirements).map((req: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-blue-500">•</span>
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 提交表单 */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>提交你的成果</CardTitle>
            <CardDescription>
              支持上传图片、视频和文档，单个文件最大100MB
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 文字描述 */}
            <div className="space-y-2">
              <Label htmlFor="content">文字描述</Label>
              <Textarea
                id="content"
                placeholder="描述你们小队的发现和每个人在其中起的作用"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="resize-none"
              />
            </div>

            {/* 文件上传 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>上传文件</Label>
                <span className="text-xs text-gray-500">
                  已上传: {formatFileSize(totalFileSize)} / 100MB
                </span>
              </div>
              
              {/* 快捷拍摄按钮 */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                {/* 拍摄照片 */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                  ref={imageInputRef}
                  disabled={isUploading}
                />
                <Button
                  variant="outline"
                  className="h-20 flex flex-col items-center gap-1 border-2 border-dashed border-blue-200 hover:border-blue-400 hover:bg-blue-50"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Camera className="w-6 h-6 text-blue-500" />
                  <span className="text-xs">拍照上传</span>
                </Button>
                
                {/* 拍摄视频 */}
                <input
                  type="file"
                  accept="video/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                  ref={videoInputRef}
                  disabled={isUploading}
                />
                <Button
                  variant="outline"
                  className="h-20 flex flex-col items-center gap-1 border-2 border-dashed border-purple-200 hover:border-purple-400 hover:bg-purple-50"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Video className="w-6 h-6 text-purple-500" />
                  <span className="text-xs">拍摄视频</span>
                </Button>
              </div>
              
              {/* 从文件选择 */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                {/* 从相册选择 */}
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  ref={fileInputRef}
                  disabled={isUploading}
                />
                <Button
                  variant="outline"
                  className="h-16 flex flex-col items-center gap-1 border-2 border-dashed border-green-200 hover:border-green-400 hover:bg-green-50"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Image className="w-5 h-5 text-green-500" />
                  <span className="text-xs">从相册选择</span>
                  <span className="text-xs text-gray-400">图片/视频</span>
                </Button>
                
                {/* 选择文档 */}
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
                  onChange={handleFileSelect}
                  className="hidden"
                  ref={docInputRef}
                  disabled={isUploading}
                />
                <Button
                  variant="outline"
                  className="h-16 flex flex-col items-center gap-1 border-2 border-dashed border-orange-200 hover:border-orange-400 hover:bg-orange-50"
                  onClick={() => docInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <FileText className="w-5 h-5 text-orange-500" />
                  <span className="text-xs">选择文档</span>
                  <span className="text-xs text-gray-400">PDF/Word/Excel等</span>
                </Button>
              </div>
              
              {/* 上传进度 */}
              {isUploading && (
                <div className="border-2 border-dashed border-blue-200 rounded-lg p-4 text-center bg-blue-50">
                  <div className="flex flex-col items-center">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                    <p className="text-sm text-gray-600">上传中... {uploadProgress}%</p>
                    <Progress value={uploadProgress} className="w-48 mt-2" />
                  </div>
                </div>
              )}

              {/* 已上传文件列表 */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2 mt-4">
                  <Label className="text-sm font-medium">已上传文件</Label>
                  {uploadedFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        {getFileIcon(file.fileType)}
                        <div>
                          <p className="text-sm font-medium truncate max-w-[200px]">{file.fileName}</p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(file.fileSize)}
                            {file.fileType === 'image' && ' · 图片'}
                            {file.fileType === 'video' && ' · 视频'}
                            {file.fileType === 'text' && ' · 文档'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {file.fileType === 'image' && file.url && (
                          <img 
                            src={file.url} 
                            alt={file.fileName}
                            className="w-12 h-12 object-cover rounded border"
                          />
                        )}
                        {file.fileType === 'video' && (
                          <div className="w-12 h-12 bg-purple-100 rounded flex items-center justify-center">
                            <Video className="w-6 h-6 text-purple-500" />
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(file.id)}
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 上传说明 */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4">
              <p className="text-sm text-purple-700">
                💡 小提示：
              </p>
              <ul className="text-sm text-purple-600 mt-2 space-y-1">
                <li>• 点击「拍照上传」可直接调用手机摄像头拍照</li>
                <li>• 点击「拍摄视频」可直接调用手机摄像头录制视频</li>
                <li>• 图片支持 JPG、PNG、GIF、WebP 格式</li>
                <li>• 视频支持 MP4、MOV、AVI、WebM 格式</li>
                <li>• 文档支持 PDF、Word、TXT 格式</li>
                <li>• 单个文件最大100MB，总大小不超过100MB</li>
              </ul>
            </div>

            {/* 提交按钮 */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => router.back()} className="flex-1">
                取消
              </Button>
              <Button 
                onClick={handleConfirmSubmit}
                disabled={isSubmitting || isUploading}
                className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    提交中...
                  </>
                ) : '提交产出'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* 确认提交对话框 */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-500" />
              确认提交
            </DialogTitle>
            <DialogDescription>
              请确认已完成所有产出内容的上传，提交后将无法修改。
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-700 font-medium mb-2">当前提交内容：</p>
              <ul className="text-sm text-blue-600 space-y-1">
                {content.trim() && (
                  <li>• 文字描述：已填写</li>
                )}
                {uploadedFiles.length > 0 && (
                  <li>• 已上传文件：{uploadedFiles.length} 个</li>
                )}
              </ul>
              {!content.trim() && uploadedFiles.length === 0 && (
                <p className="text-sm text-gray-500">暂无内容</p>
              )}
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowConfirmDialog(false)}
              className="flex-1"
            >
              再检查一下
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  提交中...
                </>
              ) : '确认提交'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 工具归还提示对话框 */}
      <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              提交成功！
            </DialogTitle>
            <DialogDescription>
              产出已提交，等待老师审核。
            </DialogDescription>
          </DialogHeader>
          
          {toolsToReturn.length > 0 && (
            <div className="py-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                  <Package className="w-5 h-5 text-orange-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-orange-800">请将领取的工具归还给助学老师</p>
                    <p className="text-sm text-orange-600 mt-1">以下工具使用完毕后需要归还：</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                {toolsToReturn.map((tool, index) => (
                  <div 
                    key={tool.id || index}
                    className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{tool.icon}</span>
                      <span className="font-medium">{tool.name}</span>
                    </div>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      {tool.quantity} 个
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2">
            {lastSubmissionId && (
              <Button 
                variant="outline"
                className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                onClick={() => {
                  setShowReturnDialog(false);
                  setShowReviewDialog(true);
                }}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                让银蛇博士帮我把关
              </Button>
            )}
            <Button 
              onClick={() => {
                setShowReturnDialog(false);
                router.push('/team/dashboard');
              }}
              className="w-full"
            >
              我知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 银蛇博士产出评价对话框 */}
      {lastSubmissionId && task && (
        <SubmissionReviewDialog
          open={showReviewDialog}
          onOpenChange={(open) => {
            setShowReviewDialog(open);
            if (!open) router.push('/team/dashboard');
          }}
          teamId={team?.id || ''}
          taskId={task.id}
          taskTitle={task.title}
          submissionId={lastSubmissionId}
        />
      )}
    </div>
  );
}
