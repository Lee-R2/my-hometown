'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Send, Loader2, BarChart3, Users, TrendingUp, AlertTriangle, Mic, MicOff, Volume2, VolumeX, Square, Image, FileText, Film, Paperclip, FileDown, ChevronRight, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { subscribeAssistantContext } from '@/lib/assistant-context';

interface MediaFile {
  key: string;
  url: string;
  name: string;
  type: 'image' | 'video' | 'document';
  contentType: string;
  size: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  mediaFiles?: MediaFile[];
  suggestedQuestions?: string[];
}

interface AdminAssistantProps {
  userId: string;
  userRole: 'admin' | 'volunteer' | 'teacher';
  position?: 'bottom-right' | 'bottom-left';
}

export default function AdminAssistant({ 
  userId, 
  userRole,
  position = 'bottom-right' 
}: AdminAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>(''); // 会话ID，用于记忆系统
  
  // 初始化会话ID（基于userId生成固定会话）
  useEffect(() => {
    if (userId && !sessionId) {
      const storedSessionId = localStorage.getItem(`laxiang_session_${userId}`);
      if (storedSessionId) {
        setSessionId(storedSessionId);
      } else {
        // 首次使用，生成新会话
        const newSessionId = `laxiang_user_${userId}`;
        setSessionId(newSessionId);
        localStorage.setItem(`laxiang_session_${userId}`, newSessionId);
      }
    }
  }, [userId, sessionId]);
  
  // 文件上传相关状态
  const [uploadedFiles, setUploadedFiles] = useState<MediaFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  // 语音相关状态
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  // 拖拽相关状态
  const [bubblePos, setBubblePos] = useState({ x: -1, y: -1 }); // -1 表示使用默认位置
  const [dialogPos, setDialogPos] = useState({ x: -1, y: -1 });
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);

  // 页面上下文 - 读取当前打开的页面数据
  const [pageContext, setPageContext] = useState<{type: string; title: string; data: Record<string, unknown>} | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAssistantContext((context) => {
      setPageContext(context);
    });
    return unsubscribe;
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 拖拽处理
  const handleDragStart = useCallback((type: 'bubble' | 'dialog', e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    hasMovedRef.current = false;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const currentPos = type === 'bubble' ? bubblePos : dialogPos;
    
    const posX = currentPos.x === -1
      ? (position === 'bottom-left' ? 24 : window.innerWidth - 72)
      : currentPos.x;
    const posY = currentPos.y === -1 ? window.innerHeight - 88 : currentPos.y;
    
    dragStartRef.current = { x: clientX, y: clientY, posX, posY };

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return;
      // 阻止默认行为（触摸滚动）和事件冒泡，确保只移动智能体
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      const moveX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
      
      const dx = moveX - dragStartRef.current.x;
      const dy = moveY - dragStartRef.current.y;
      
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMovedRef.current = true;
      }

      const newX = Math.max(0, Math.min(window.innerWidth - 56, dragStartRef.current.posX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 56, dragStartRef.current.posY + dy));

      if (type === 'bubble') {
        setBubblePos({ x: newX, y: newY });
      } else {
        setDialogPos({ x: newX, y: newY });
      }
    };

    const handleEnd = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
  }, [bubblePos, dialogPos, position]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 打开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // 清理音频资源
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording]);

  // 文本转语音
  const speakText = async (text: string) => {
    if (!isVoiceEnabled || !text.trim()) return;

    try {
      setIsSpeaking(true);
      
      const response = await fetch('/api/admin/assistant/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'tts',
          text: text,
          speaker: 'zh_female_vv_uranus_bigtts',
        }),
      });

      const data = await response.json();

      if (data.success && data.audioUri) {
        // 创建并播放音频
        if (audioRef.current) {
          audioRef.current.pause();
        }
        
        audioRef.current = new Audio(data.audioUri);
        audioRef.current.onended = () => {
          setIsSpeaking(false);
        };
        audioRef.current.onerror = () => {
          setIsSpeaking(false);
          console.error('[语音] 播放失败');
        };
        
        // 使用 Promise.catch 捕获播放错误
        audioRef.current.play().catch((err) => {
          if (err.name === 'NotAllowedError') {
            console.log('[语音] 需要用户交互才能播放');
          } else {
            console.error('[语音] 播放失败:', err);
          }
          setIsSpeaking(false);
        });
      } else {
        setIsSpeaking(false);
      }
    } catch (error) {
      console.error('[语音] TTS错误:', error);
      setIsSpeaking(false);
    }
  };

  // 停止语音播放
  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  };

  // 处理文件上传
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/admin/assistant/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (data.success && data.file) {
          setUploadedFiles(prev => [...prev, data.file]);
          toast.success(`已上传: ${file.name}`);
        } else {
          toast.error(data.error || `上传失败: ${file.name}`);
        }
      }
    } catch (error) {
      console.error('[文件上传] 错误:', error);
      toast.error('文件上传失败');
    } finally {
      setIsUploading(false);
      // 清空input，允许重复上传同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 移除已上传的文件
  const removeUploadedFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 获取文件图标
  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <Image className="w-4 h-4" />;
      case 'video':
        return <Film className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  // 移除消息内容中的 Markdown 符号（* 和 #）
  const stripMarkdownSymbols = (content: string): string => {
    if (!content) return '';
    return content
      // 移除 Markdown 加粗符号 **text** -> text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      // 移除 Markdown 斜体符号 *text* -> text
      .replace(/\*(.*?)\*/g, '$1')
      // 移除 Markdown 标题符号 # -> 移除
      .replace(/^#+\s*/gm, '')
      // 移除 Markdown 列表符号 - 或 * -> 移除
      .replace(/^[\-\*]\s+/gm, '')
      // 移除 Markdown 链接 [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // 移除剩余的单独 * 和 #
      .replace(/^\*$/gm, '')
      .replace(/^#$/gm, '');
  };

  // 清理命令标签及其 JSON 内容，防止泄漏到用户可见的消息中
  const stripCommandTags = (content: string): string => {
    const cmdNames = '创建主题|修改主题|配置最后任务|创建任务组|配置任务资源|记住';
    // 1. 移除 [命令名]{...}[/命令名] 格式的完整命令块（惰量+结束标签边界）
    let cleaned = content.replace(
      new RegExp(`\\[(?:${cmdNames})\\]\\s*\\{[\\s\\S]*?\\}\\s*\\[\\/(?:${cmdNames})\\]`, 'g'),
      ''
    );
    // 2. 移除不完整命令块：[命令名]{... 到行尾（JSON 未闭合、结束标签未生成）
    cleaned = cleaned.replace(
      new RegExp(`\\[(?:${cmdNames})\\]\\s*\\{[^]*`, 'g'),
      (match) => {
        // 如果匹配到行尾后面还有正常文本，保留正常文本
        const lastNewline = match.lastIndexOf('\n');
        if (lastNewline > 0) {
          const afterLastNewline = match.slice(lastNewline + 1);
          // 如果最后一行不是 JSON 的一部分（不以 { [ " , : 开头），保留它
          if (afterLastNewline && !/^[\s{}\[\]",:]/.test(afterLastNewline)) {
            return '\n' + afterLastNewline;
          }
        }
        return '';
      }
    );
    // 3. 移除残留的开始/结束标签（含完整 [命令名] 和 [/命令名]）
    cleaned = cleaned.replace(
      new RegExp(`\\[\\\/?(?:${cmdNames})\\]`, 'g'),
      ''
    );
    // 3.5 移除流式输出中不完整的开标签（[命令名 没有 ]）
    cleaned = cleaned.replace(
      new RegExp(`\\[(?:${cmdNames})`, 'g'),
      ''
    );
    // 4. 移除残留的未闭合 JSON 片段（以 { 开头但没有闭合的行）
    cleaned = cleaned.replace(
      /^\s*\{[\s\S]*$/gm,
      ''
    );
    // 5. 清理多余空行
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    return cleaned;
  };

  // 解析消息中的推荐问题
  const parseSuggestedQuestions = (content: string): { mainContent: string; questions: string[] } => {
    // 先清理命令标签
    const stripped = stripCommandTags(content);
    const pattern = /---\s*\n💡[你您]可能还想了解[：:]\s*\n((?:\d+[\.\.、].+\n?)+)/;
    const match = stripped.match(pattern);
    
    if (match) {
      const questionsText = match[1];
      const questions = questionsText
        .split(/\n/)
        .map(q => q.replace(/^\d+[\.\.、]\s*/, '').trim())
        .filter(q => q.length > 0);
      
      const mainContent = stripped.replace(pattern, '').trim();
      return { mainContent, questions };
    }
    
    return { mainContent: stripped, questions: [] };
  };

  // 开始录音
  const startRecording = async () => {
    try {
      // 先检查当前权限状态
      let permissionStatus: PermissionState = 'prompt';
      try {
        const permissionResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        permissionStatus = permissionResult.state;
        console.log('[语音录制] 当前权限状态:', permissionStatus);
      } catch (e) {
        console.log('[语音录制] 无法查询权限状态');
      }

      // 如果权限被拒绝，给出提示
      if (permissionStatus === 'denied') {
        toast.error('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
        return;
      }

      // 如果是首次请求权限，给出提示
      if (permissionStatus === 'prompt') {
        toast.info('请在弹出的对话框中允许使用麦克风');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // 检测支持的音频格式
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/wav',
      ];
      
      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        toast.error('您的浏览器不支持录音功能');
        return;
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        
        const audioBlob = new Blob(audioChunksRef.current, { type: selectedMimeType });
        
        // 将音频转为base64
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          await processVoiceInput(base64Data);
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('[语音] 录音启动失败:', error);
      toast.error('无法启动录音，请检查麦克风权限');
    }
  };

  // 停止录音
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // 处理语音输入
  const processVoiceInput = async (base64Data: string) => {
    setIsProcessingVoice(true);
    
    try {
      const response = await fetch('/api/admin/assistant/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'asr',
          audioBase64: base64Data,
        }),
      });

      const data = await response.json();

      if (data.success && data.text) {
        setInput(data.text);
        // 自动发送语音识别的文字
        await sendMessage(data.text);
      } else {
        toast.error('语音识别失败，请重试');
      }
    } catch (error) {
      console.error('[语音] ASR错误:', error);
      toast.error('语音识别失败，请重试');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  // 发送消息
  const sendMessage = async (messageText: string) => {
    if ((!messageText.trim() && uploadedFiles.length === 0) || isLoading) return;

    const userMessage = messageText.trim();
    const currentFiles = [...uploadedFiles]; // 保存当前文件
    
    // 清空输入和文件
    setInput('');
    setUploadedFiles([]);
    
    // 添加用户消息（包含文件信息）
    setMessages(prev => [...prev, { 
      role: 'user', 
      content: userMessage || (currentFiles.length > 0 ? '请分析这些文件' : ''),
      mediaFiles: currentFiles.length > 0 ? currentFiles : undefined
    }]);
    setIsLoading(true);

    try {
      // 构建历史消息
      const history = messages.slice(-16).map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await fetch('/api/admin/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          userRole,
          message: userMessage || (currentFiles.length > 0 ? '请分析这些文件' : ''),
          history,
          mediaFiles: currentFiles.length > 0 ? currentFiles : undefined,
          sessionId,
          pageContext: pageContext ? {
            type: pageContext.type,
            title: pageContext.title,
            data: pageContext.data,
          } : undefined,
        }),
      });

      // 从响应头中获取新的 sessionId（如果后端创建了新会话）
      const newSessionId = response.headers.get('X-Session-Id');
      if (newSessionId && newSessionId !== sessionId) {
        console.log('[蜡象助手] 更新会话ID:', sessionId, '->', newSessionId);
        setSessionId(newSessionId);
      }

      if (!response.ok) {
        throw new Error('请求失败');
      }

      // 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应');
      }

      const decoder = new TextDecoder();
      let assistantMessage = '';
      let receivedAudio = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              // 处理主题创建成功事件
              if (parsed.type === 'theme_created' && parsed.theme) {
                const theme = parsed.theme;
                const themeType = theme.is_exclusive ? '专属主题' : '全局主题';
                assistantMessage += `\n\n---\n✅ **主题创建成功！**\n\n📋 **主题信息**\n- 名称：${theme.name}\n- 描述：${theme.description || '无'}\n- 图标：${theme.icon || '🔬'}\n- 类型：${themeType}\n\n🎯 **下一步操作**\n1. 进入「任务管理」页面\n2. 为该主题配置四阶段任务组：走进与发现 → 动手与实验 → 深入与创新 → 展示与分享\n3. 每个阶段可设置简单/中等/困难三个难度任务\n\n💡 蜡象助手可以帮你拆解阶段任务，随时告诉我！`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = stripCommandTags(assistantMessage);
                  } else {
                    newMessages.push({ role: 'assistant', content: stripCommandTags(assistantMessage) });
                  }
                  return newMessages;
                });
                continue;
              }

              // 处理主题创建失败事件
              if (parsed.type === 'theme_create_error' && parsed.error) {
                assistantMessage += `\n\n❌ 主题创建失败：${parsed.error}\n请检查信息后重试。`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = stripCommandTags(assistantMessage);
                  } else {
                    newMessages.push({ role: 'assistant', content: stripCommandTags(assistantMessage) });
                  }
                  return newMessages;
                });
                continue;
              }

              // 处理主题修改成功事件
              if (parsed.type === 'theme_updated' && parsed.theme) {
                const theme = parsed.theme;
                assistantMessage += `\n\n---\n✅ **主题修改成功！**\n\n📋 **当前主题信息**\n- 名称：${theme.name}\n- 描述：${theme.description || '无'}\n- 图标：${theme.icon || '🔬'}`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = stripCommandTags(assistantMessage);
                  } else {
                    newMessages.push({ role: 'assistant', content: stripCommandTags(assistantMessage) });
                  }
                  return newMessages;
                });
                continue;
              }

              // 处理主题修改失败事件
              if (parsed.type === 'theme_update_error' && parsed.error) {
                assistantMessage += `\n\n❌ 主题修改失败：${parsed.error}`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = stripCommandTags(assistantMessage);
                  } else {
                    newMessages.push({ role: 'assistant', content: stripCommandTags(assistantMessage) });
                  }
                  return newMessages;
                });
                continue;
              }

              // 处理最后任务配置成功事件
              if (parsed.type === 'final_task_configured') {
                const configured = parsed.configured || [];
                const missing = parsed.missing || [];
                const configuredStr = configured.length > 0 ? configured.join('、') : '无';
                const missingStr = missing.length > 0 ? missing.join('、') : '无';
                assistantMessage += `\n\n---\n✅ **最后任务配置完成！**\n\n📋 **配置结果**\n- 已配置角色：${configuredStr}\n${missing.length > 0 ? `- ⚠️ 缺少表单的角色：${missingStr}\n- 💡 请先在「最后任务」模块创建对应角色的表单` : '- ✅ 所有角色均已配置表单'}`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = stripCommandTags(assistantMessage);
                  } else {
                    newMessages.push({ role: 'assistant', content: stripCommandTags(assistantMessage) });
                  }
                  return newMessages;
                });
                continue;
              }

              // 处理最后任务配置失败事件
              if (parsed.type === 'final_task_config_error' && parsed.error) {
                assistantMessage += `\n\n❌ 配置最后任务失败：${parsed.error}`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = stripCommandTags(assistantMessage);
                  } else {
                    newMessages.push({ role: 'assistant', content: stripCommandTags(assistantMessage) });
                  }
                  return newMessages;
                });
                continue;
              }

              // 处理任务创建成功事件
              if (parsed.type === 'tasks_created' && parsed.tasks) {
                const taskCount = parsed.tasks.length;
                const groupName = parsed.tasks[0]?.group_name || '未命名';
                assistantMessage += `\n\n✅ 任务组「${groupName}」创建成功！共${taskCount}个任务。`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = stripCommandTags(assistantMessage);
                  } else {
                    newMessages.push({ role: 'assistant', content: stripCommandTags(assistantMessage) });
                  }
                  return newMessages;
                });
                continue;
              }

              // 处理任务创建失败事件
              if (parsed.type === 'tasks_create_error' && parsed.error) {
                assistantMessage += `\n\n❌ 创建任务失败：${parsed.error}`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = stripCommandTags(assistantMessage);
                  } else {
                    newMessages.push({ role: 'assistant', content: stripCommandTags(assistantMessage) });
                  }
                  return newMessages;
                });
                continue;
              }

              // 处理任务资源配置成功事件
              if (parsed.type === 'task_resources_configured') {
                assistantMessage += `\n\n✅ 任务资源配置完成！工具${parsed.tools || 0}个，技能${parsed.skills || 0}个，激励${parsed.rewards || 0}个。`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = stripCommandTags(assistantMessage);
                  } else {
                    newMessages.push({ role: 'assistant', content: stripCommandTags(assistantMessage) });
                  }
                  return newMessages;
                });
                continue;
              }

              // 处理任务资源配置失败事件
              if (parsed.type === 'task_resources_config_error' && parsed.error) {
                assistantMessage += `\n\n❌ 配置任务资源失败：${parsed.error}`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = stripCommandTags(assistantMessage);
                  } else {
                    newMessages.push({ role: 'assistant', content: stripCommandTags(assistantMessage) });
                  }
                  return newMessages;
                });
                continue;
              }

              // 处理用户记忆保存成功事件
              if (parsed.type === 'memory_saved' && parsed.data) {
                assistantMessage += `\n\n💾 已记住：${parsed.data.summary || '用户偏好已保存'}`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = stripCommandTags(assistantMessage);
                  } else {
                    newMessages.push({ role: 'assistant', content: stripCommandTags(assistantMessage) });
                  }
                  return newMessages;
                });
                continue;
              }

              // 处理用户记忆保存失败事件
              if (parsed.type === 'memory_save_error' && parsed.error) {
                assistantMessage += `\n\n⚠️ 记忆保存失败：${parsed.error}`;
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = stripCommandTags(assistantMessage);
                  } else {
                    newMessages.push({ role: 'assistant', content: stripCommandTags(assistantMessage) });
                  }
                  return newMessages;
                });
                continue;
              }

              // 处理TTS音频流事件
              if (parsed.type === 'audio' && parsed.audio) {
                try {
                  receivedAudio = true;
                  setIsSpeaking(true);
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current = null;
                  }
                  const audioBytes = atob(parsed.audio);
                  const audioArray = new Uint8Array(audioBytes.length);
                  for (let i = 0; i < audioBytes.length; i++) {
                    audioArray[i] = audioBytes.charCodeAt(i);
                  }
                  const audioBlob = new Blob([audioArray], { type: 'audio/mp3' });
                  const audioUrl = URL.createObjectURL(audioBlob);
                  const audio = new Audio(audioUrl);
                  audioRef.current = audio;
                  audio.onended = () => {
                    setIsSpeaking(false);
                    URL.revokeObjectURL(audioUrl);
                    audioRef.current = null;
                  };
                  audio.onerror = () => {
                    setIsSpeaking(false);
                    URL.revokeObjectURL(audioUrl);
                    audioRef.current = null;
                    console.error('[TTS音频] 播放失败');
                  };
                  audio.play().catch((err) => {
                    setIsSpeaking(false);
                    URL.revokeObjectURL(audioUrl);
                    audioRef.current = null;
                    if (err.name === 'NotAllowedError') {
                      console.log('[TTS音频] 需要用户交互才能播放');
                    } else {
                      console.error('[TTS音频] 播放失败:', err);
                    }
                  });
                } catch (audioError) {
                  console.error('[TTS音频] 处理失败:', audioError);
                  setIsSpeaking(false);
                }
                continue;
              }

              // 处理普通文字流
              if (parsed.content) {
                assistantMessage += parsed.content;
                // 更新消息（显示时清理命令标签）
                const displayMessage = stripCommandTags(assistantMessage);
                setMessages(prev => {
                  const newMessages = [...prev];
                  // 检查最后一条是否是assistant消息
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = displayMessage;
                  } else {
                    newMessages.push({ role: 'assistant', content: displayMessage });
                  }
                  return newMessages;
                });
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      // 如果开启了语音输出且未收到服务端音频，播放助手回复
      if (isVoiceEnabled && assistantMessage && !receivedAudio) {
        // 清理消息中的特殊标记和推荐问题部分
        const cleanMessage = assistantMessage
          .replace(/\[发送消息\].*?\|.*?\|.*?\n?/g, '')
          .replace(/---\s*\n💡[\s\S]*$/, '') // 移除推荐问题部分
          .replace(/✅/g, '')
          .replace(/❌/g, '')
          .trim();
        
        if (cleanMessage) {
          await speakText(cleanMessage);
        }
      }

      // 在消息接收完成后，解析推荐问题并更新消息
      if (assistantMessage) {
        const { mainContent, questions } = parseSuggestedQuestions(assistantMessage);
        setMessages(prev => {
          const newMessages = [...prev];
          if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
            newMessages[newMessages.length - 1] = {
              ...newMessages[newMessages.length - 1],
              content: mainContent,
              suggestedQuestions: questions.length > 0 ? questions : undefined
            };
          }
          return newMessages;
        });
      }

    } catch (error) {
      console.error('[蜡象助手] 错误:', error);
      toast.error('发送失败，请重试');
      setMessages(prev => prev.slice(0, -1)); // 移除用户消息
    } finally {
      setIsLoading(false);
    }
  };

  // 发送消息（从输入框）
  const handleSend = () => {
    sendMessage(input);
  };

  // 快捷问题（涵盖12个管理后台模块）
  const quickQuestions = [
    // 数据概览
    { icon: BarChart3, text: '当前平台数据概览' },
    // 小队管理
    { icon: Users, text: '所有小队积分排名情况' },
    { icon: Users, text: '哪些小队进度落后需要关注' },
    // 任务管理
    { icon: TrendingUp, text: '各主题任务完成情况统计' },
    // 产出审核
    { icon: AlertTriangle, text: '当前有多少产出待审核' },
    // 趋势分析
    { icon: TrendingUp, text: '近期产出趋势分析' },
    { icon: AlertTriangle, text: '有哪些异常数据需要关注' },
    // 消息管理
    { icon: Send, text: '向所有小队发送提醒消息' },
    { icon: Send, text: '向进度落后的小队发送鼓励' },
    // 激励配置
    { icon: TrendingUp, text: '哪些激励物品最受欢迎' },
    // 反馈查看
    { icon: TrendingUp, text: '小队反馈中有哪些改进建议' },
  ];

  // 报告下载选项
  const reportOptions = [
    { type: 'overview', name: '平台概览报告' },
    { type: 'teams', name: '小队分析报告' },
    { type: 'submissions', name: '产出审核报告' },
    { type: 'comprehensive', name: '综合分析报告' },
  ];

  const handleDownloadReport = (type: string) => {
    const reportUrl = `/api/ai/laxiang-report?type=${type}`;
    window.open(reportUrl, '_blank');
  };

  const handleQuickQuestion = (question: string) => {
    setInput(question);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <>
      {/* 悬浮按钮 - 可拖拽 */}
      <div
        className="fixed z-50"
        style={{
          touchAction: 'none',
          ...(bubblePos.x === -1
            ? { [position === 'bottom-left' ? 'left' : 'right']: '1rem', bottom: '1rem' } as React.CSSProperties
            : { left: `${bubblePos.x}px`, top: `${bubblePos.y}px` } as React.CSSProperties)
        }}
      >
        <Button
          onMouseDown={(e) => handleDragStart('bubble', e)}
          onTouchStart={(e) => handleDragStart('bubble', e)}
          onClick={() => { if (!hasMovedRef.current) setIsOpen(true); }}
          className={`w-14 h-14 rounded-full shadow-lg transition-all duration-300 cursor-grab active:cursor-grabbing ${
            isOpen ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'
          } bg-transparent hover:bg-transparent shadow-none`}
          size="icon"
        >
          <img 
            src="/laxiang-assistant.png" 
            alt="蜡象助手" 
            className="w-full h-full object-contain drop-shadow-lg"
            onError={(e) => {
              // 如果图片加载失败，显示默认图标
              e.currentTarget.style.display = 'none';
              if (e.currentTarget.parentElement) {
                e.currentTarget.parentElement.innerHTML = '<span class="text-3xl">🐘</span>';
              }
            }}
          />
        </Button>
      </div>

      {/* 对话框 - 头部可拖拽 */}
      {isOpen && (
        <div 
          className="fixed z-[9999]"
          style={dialogPos.x === -1
            ? { [position === 'bottom-left' ? 'left' : 'right']: '0.75rem', bottom: '0.75rem' } as React.CSSProperties
            : { left: `${dialogPos.x}px`, top: `${dialogPos.y}px` } as React.CSSProperties
          }
        >
        <div
          style={{
            width: 'calc(100vw - 24px)',
            maxWidth: '420px',
            height: 'min(580px, calc(100vh - 100px))',
            maxHeight: '80vh',
          }}
        >
          <Card className="h-full flex flex-col shadow-2xl border border-white/20 rounded-2xl overflow-hidden bg-white/95 backdrop-blur-sm">
            {/* 头部 */}
            <CardHeader 
              className="flex flex-row items-center justify-between space-y-0 pb-3 pt-4 px-4 bg-white/80 backdrop-blur-sm cursor-grab active:cursor-grabbing select-none"
              style={{ touchAction: 'none' }}
              onMouseDown={(e) => handleDragStart('dialog', e)}
              onTouchStart={(e) => handleDragStart('dialog', e)}
            >
              <div className="flex items-center gap-3">
                <img 
                  src="/laxiang-assistant.png" 
                  alt="蜡象助手" 
                  className="w-12 h-12 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    if (e.currentTarget.parentElement) {
                      e.currentTarget.parentElement.innerHTML = '<span class="text-3xl">🐘</span>';
                    }
                  }}
                />
                <div>
                  <CardTitle className="text-base font-semibold text-gray-800">蜡象助手</CardTitle>
                  <p className="text-xs text-gray-500">数据洞察 · 趋势分析 · 语音对话</p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto pl-4">
                {/* 语音开关 */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-gray-600 hover:bg-gray-100 rounded-full"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={() => {
                    if (isSpeaking) {
                      stopSpeaking();
                    }
                    setIsVoiceEnabled(!isVoiceEnabled);
                    toast.success(isVoiceEnabled ? '已关闭语音输出' : '已开启语音输出');
                  }}
                  title={isVoiceEnabled ? '关闭语音输出' : '开启语音输出'}
                >
                  {isVoiceEnabled ? (
                    <Volume2 className="h-5 w-5" />
                  ) : (
                    <VolumeX className="h-5 w-5" />
                  )}
                </Button>
                {/* 关闭按钮 */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-gray-600 hover:bg-gray-100 rounded-full"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={() => {
                    stopSpeaking();
                    setIsOpen(false);
                  }}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>

            {/* 消息区域 */}
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-white/90">
              {/* 欢迎消息 */}
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <img 
                    src="/laxiang-assistant.png" 
                    alt="蜡象助手" 
                    className="w-20 h-20 mx-auto mb-4 object-contain"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.parentElement) {
                          e.currentTarget.parentElement.innerHTML = '<span class="text-4xl">🐘</span>';
                        }
                      }}
                    />
                  <p className="font-medium text-gray-700 mb-2 mt-4">你好，我是蜡象助手！</p>
                  <p className="text-sm text-gray-500 mb-4">
                    我可以帮你分析平台数据、发现潜在问题、提供决策建议
                  </p>
                  <p className="text-xs text-gray-400 mb-4">
                    📎 支持上传图片、视频、文档进行分析
                  </p>
                  {isVoiceEnabled && (
                    <p className="text-xs text-purple-500 mb-4">
                      🎤 支持语音对话，点击麦克风开始说话
                    </p>
                  )}
                  
                  {/* 快捷问题 */}
                  <div className="space-y-2">
                    {quickQuestions.map((q, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-left h-auto py-2 px-3"
                        onClick={() => handleQuickQuestion(q.text)}
                      >
                        <q.icon className="w-4 h-4 mr-2 shrink-0 text-purple-500" />
                        <span className="text-xs">{q.text}</span>
                      </Button>
                    ))}
                  </div>

                  {/* 报告下载 */}
                  <div className="pt-4 border-t">
                    <p className="text-xs font-medium text-gray-500 mb-2">下载分析报告</p>
                    <div className="grid grid-cols-2 gap-2">
                      {reportOptions.map((report) => (
                        <Button
                          key={report.type}
                          variant="ghost"
                          size="sm"
                          className="h-auto py-2 px-2 text-xs justify-start"
                          onClick={() => handleDownloadReport(report.type)}
                        >
                          <FileText className="w-3 h-3 mr-1.5 text-green-500" />
                          {report.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 消息列表 */}
              {messages.map((message, index) => {
                // 检测消息中是否包含报告下载链接
                const reportLinkMatch = message.content && message.role === 'assistant' 
                  ? message.content.match(/\/api\/ai\/laxiang-report\?type=(\w+)/)
                  : null;
                const reportType = reportLinkMatch ? reportLinkMatch[1] : null;
                
                return (
                  <div
                    key={index}
                    className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                        message.role === 'user'
                          ? 'bg-gray-800 text-white rounded-br-md'
                          : 'bg-gray-100 text-gray-700 rounded-bl-md'
                      }`}
                    >
                      {/* 显示上传的文件预览 */}
                      {message.mediaFiles && message.mediaFiles.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {message.mediaFiles.map((file, fileIndex) => (
                            <div key={fileIndex} className="flex items-center gap-1 bg-white/10 rounded px-1.5 py-0.5 text-xs">
                              {getFileIcon(file.type)}
                              <span className="max-w-[80px] truncate">{file.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{stripMarkdownSymbols(message.content)}</p>
                      {message.role === 'assistant' && (
                        <p className="text-[10px] text-gray-400 mt-1.5 pt-1.5 border-t border-gray-200/50">此为AI回答，不能确保完全正确，需要你进行思考及验证后判断信息真伪</p>
                      )}
                      
                      {/* 报告下载按钮 */}
                      {reportType && (
                        <div className="mt-3 pt-2 border-t border-gray-200">
                          <a
                            href={`/api/ai/laxiang-report?type=${reportType}`}
                            download
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg"
                            onClick={(e) => {
                              e.preventDefault();
                              // 使用 fetch 下载文件
                              fetch(`/api/ai/laxiang-report?type=${reportType}`)
                                .then(res => res.blob())
                                .then(blob => {
                                  const url = window.URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `STEM教育综合分析报告_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.docx`;
                                  document.body.appendChild(a);
                                  a.click();
                                  window.URL.revokeObjectURL(url);
                                  document.body.removeChild(a);
                                })
                                .catch(err => {
                                  console.error('下载失败:', err);
                                  // 降级：直接打开链接
                                  window.open(`/api/ai/laxiang-report?type=${reportType}`, '_blank');
                                });
                            }}
                          >
                            <FileDown className="w-4 h-4" />
                            点击下载 Word 报告
                          </a>
                        </div>
                      )}
                    </div>
                    
                    {/* 推荐问题展示 - 独立一行，放在回复气泡下方 */}
                    {message.role === 'assistant' && message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
                      <div className="mt-1 space-y-1.5 max-w-[85%]">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                          <span>您可能还想了解：</span>
                        </div>
                        <div className="space-y-1">
                          {message.suggestedQuestions.map((q, qIndex) => (
                            <button
                              key={qIndex}
                              onClick={() => sendMessage(q)}
                              disabled={isLoading}
                              className="w-full text-left bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-purple-50 hover:border-purple-200 transition-colors group"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium group-hover:bg-purple-500 group-hover:text-white transition-colors">
                                  {qIndex + 1}
                                </span>
                                <span className="text-xs text-gray-600 flex-1">{q}</span>
                                <ChevronRight className="w-3 h-3 text-gray-400 group-hover:text-purple-500 transition-colors" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 加载指示器 */}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex justify-start">
                  <div className="bg-white text-gray-700 rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm border">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                      <span className="text-sm text-gray-500">思考中...</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 语音处理指示器 */}
              {isProcessingVoice && (
                <div className="flex justify-end">
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-2xl rounded-br-md px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">识别中...</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 正在播放语音指示器 */}
              {isSpeaking && (
                <div className="flex justify-start">
                  <div className="bg-white text-gray-700 rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm border">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-purple-500 animate-pulse" />
                      <span className="text-sm text-gray-500">正在朗读...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </CardContent>

            {/* 输入区域 */}
            <div className="p-3 border-t border-gray-100 bg-white/80">
              {/* 已上传文件预览 */}
              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {uploadedFiles.map((file, index) => (
                    <div 
                      key={index} 
                      className="flex items-center gap-1.5 bg-gray-100 rounded-full px-2 py-1 text-xs"
                    >
                      {getFileIcon(file.type)}
                      <span className="max-w-[100px] truncate">{file.name}</span>
                      <button
                        onClick={() => removeUploadedFile(index)}
                        className="ml-1 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex gap-2">
                {/* 隐藏的文件输入 */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                  multiple
                  className="hidden"
                />
                
                {/* 文件上传按钮 */}
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isRecording || isProcessingVoice || isUploading}
                  className="rounded-full w-10 h-10 p-0 bg-gray-100 hover:bg-gray-200"
                  title="上传图片、视频或文档"
                >
                  {isUploading ? (
                    <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
                  ) : (
                    <Paperclip className="w-5 h-5 text-gray-600" />
                  )}
                </Button>
                
                {/* 语音输入按钮 */}
                <Button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isLoading || isProcessingVoice || isUploading}
                  className={`rounded-full w-10 h-10 p-0 ${
                    isRecording 
                      ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                  title={isRecording ? '停止录音' : '开始语音输入'}
                >
                  {isRecording ? (
                    <Square className="w-4 h-4 text-white" />
                  ) : (
                    <Mic className="w-5 h-5 text-gray-600" />
                  )}
                </Button>
                
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={isRecording ? '正在录音...' : '输入问题或上传文件...'}
                  className="flex-1 rounded-full"
                  disabled={isLoading || isRecording || isProcessingVoice || isUploading}
                />
                <Button
                  onClick={handleSend}
                  disabled={(!input.trim() && uploadedFiles.length === 0) || isLoading || isRecording || isProcessingVoice || isUploading}
                  className="rounded-full w-10 h-10 p-0 bg-gray-800 hover:bg-gray-700"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">
                蜡象助手 · 支持图片/视频/文档 · {isVoiceEnabled ? '语音已开启' : '语音已关闭'}
              </p>
            </div>
          </Card>
          </div>
        </div>
      )}
    </>
  );
}
