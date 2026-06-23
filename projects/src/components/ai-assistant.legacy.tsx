'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Send, Loader2, Sparkles, Mic, Volume2, Square, ImagePlus, Camera, ChevronRight, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { subscribeAssistantContext } from '@/lib/assistant-context';
import { useAssistantAdapt } from '@/hooks/use-assistant-adapt';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  images?: string[]; // 图片URL数组（显示用）
  imageFiles?: File[]; // 原始文件（上传前暂存）
  generatedImage?: string; // AI生成的图片
  generatedVideo?: string; // AI生成的视频
  prompt?: string; // 生成提示词
  duration?: number; // 视频时长
  resolution?: string; // 视频分辨率
  suggestedQuestions?: string[]; // 推荐问题
}

interface AIAssistantProps {
  teamId: string;
  assistantType?: string;
  position?: 'bottom-right' | 'bottom-left';
}

export default function AIAssistant({ 
  teamId, 
  assistantType = 'yinhe',
  position = 'bottom-right' 
}: AIAssistantProps) {
  // 设备适配
  const adaptConfig = useAssistantAdapt(position);
  
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]); // base64预览
  const [selectedImageFiles, setSelectedImageFiles] = useState<File[]>([]); // 原始文件
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(null); // 正在播放的消息索引
  const [ttsLoading, setTtsLoading] = useState<number | null>(null); // 正在加载TTS的消息索引
  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState(true); // 自动语音回复开关
  const [sessionId, setSessionId] = useState<string>(''); // 会话ID，用于记忆系统
  const [hasUserInteracted, setHasUserInteracted] = useState(false); // 用户是否有过交互，用于控制自动播放
  const [isSpeaking, setIsSpeaking] = useState(false); // TTS音频流播放状态
  const [generatingContent, setGeneratingContent] = useState<{type: 'image' | 'video'; prompt?: string} | null>(null); // 正在生成的内容

  // ===== 对话限制相关状态 =====
  const [usageStats, setUsageStats] = useState<{
    conversationRounds: number;
    dailyMinutes: number;
    offTopicRatio: number;
    offTopicCount: number;
  } | null>(null);
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const [limitWarningType, setLimitWarningType] = useState<'rest' | 'task' | 'end'>('rest');

  // 每日累计对话时长追踪
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const storedDate = localStorage.getItem(`yinshe_usage_date_${teamId}`);
    const storedMinutes = localStorage.getItem(`yinshe_usage_minutes_${teamId}`);
    
    // 如果日期变了，重置时长
    if (storedDate !== today) {
      localStorage.setItem(`yinshe_usage_date_${teamId}`, today);
      localStorage.setItem(`yinshe_usage_minutes_${teamId}`, '0');
    }
  }, [teamId]);

  // 每次对话增加时长（每轮约2分钟）
  const addConversationTime = useCallback((minutes: number) => {
    const today = new Date().toISOString().split('T')[0];
    const storedDate = localStorage.getItem(`yinshe_usage_date_${teamId}`);
    if (storedDate !== today) return;
    
    const currentMinutes = parseInt(localStorage.getItem(`yinshe_usage_minutes_${teamId}`) || '0');
    const newMinutes = currentMinutes + minutes;
    localStorage.setItem(`yinshe_usage_minutes_${teamId}`, String(newMinutes));
  }, [teamId]);

  // 拖拽相关状态
  const [bubblePos, setBubblePos] = useState({ x: -1, y: -1 }); // -1 表示使用默认位置
  const [dialogPos, setDialogPos] = useState({ x: -1, y: -1 });
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);

  // 初始化会话ID（基于teamId生成固定会话）
  useEffect(() => {
    if (teamId && !sessionId) {
      const storedSessionId = localStorage.getItem(`yinshe_session_${teamId}`);
      if (storedSessionId) {
        setSessionId(storedSessionId);
      } else {
        // 首次使用，生成新会话
        const newSessionId = `yinhe_team_${teamId}`;
        setSessionId(newSessionId);
        localStorage.setItem(`yinshe_session_${teamId}`, newSessionId);
      }
    }
  }, [teamId, sessionId]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAssistantMessageRef = useRef<string>(''); // 记录最后一条助手消息，用于自动朗读

  // 页面上下文 - 读取当前打开的页面数据
  const [pageContext, setPageContext] = useState<{type: string; title: string; data: Record<string, unknown>} | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAssistantContext((context) => {
      setPageContext(context);
    });
    return unsubscribe;
  }, []);

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

  // ==================== 解析推荐问题 ====================
  
  // 解析消息中的推荐问题
  const parseSuggestedQuestions = (content: string): { mainContent: string; questions: string[] } => {
    const pattern = /---\s*\n💡还想了解什么[？?]\s*\n((?:\d+[\.\.、].+\n?)+)/;
    const match = content.match(pattern);
    
    if (match) {
      const questionsText = match[1];
      const questions = questionsText
        .split(/\n/)
        .map(q => q.replace(/^\d+[\.\.、]\s*/, '').trim())
        .filter(q => q.length > 0);
      
      const mainContent = content.replace(pattern, '').trim();
      return { mainContent, questions };
    }
    
    return { mainContent: content, questions: [] };
  };

  // ==================== 语音录制功能 ====================
  
  // 获取支持的音频格式
  const getSupportedAudioFormat = useCallback((): string => {
    const formats = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/aac',
    ];
    
    for (const format of formats) {
      if (MediaRecorder.isTypeSupported(format)) {
        console.log('[语音录制] 支持格式:', format);
        return format;
      }
    }
    
    // 默认返回 webm，让浏览器自行处理
    console.log('[语音录制] 使用默认格式: audio/webm');
    return 'audio/webm';
  }, []);

  const startRecording = useCallback(async () => {
    console.log('[语音录制] 开始录音被调用');
    
    try {
      // 检查浏览器是否支持 MediaRecorder
      if (typeof MediaRecorder === 'undefined') {
        console.error('[语音录制] MediaRecorder 不支持');
        toast.error('您的浏览器不支持录音功能');
        return;
      }

      // 检查是否支持 getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('[语音录制] getUserMedia 不支持');
        toast.error('您的浏览器不支持麦克风访问');
        return;
      }

      console.log('[语音录制] 检查麦克风权限状态...');
      
      // 先检查当前权限状态
      let permissionStatus: PermissionState = 'prompt';
      try {
        const permissionResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        permissionStatus = permissionResult.state;
        console.log('[语音录制] 当前权限状态:', permissionStatus);
        
        // 监听权限状态变化
        permissionResult.onchange = () => {
          console.log('[语音录制] 权限状态变更为:', permissionResult.state);
        };
      } catch (e) {
        // 某些浏览器不支持 permissions.query，继续尝试获取权限
        console.log('[语音录制] 无法查询权限状态，直接请求权限');
      }

      // 如果权限被拒绝，给出提示
      if (permissionStatus === 'denied') {
        toast.error('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
        return;
      }

      // 如果是首次请求权限（prompt状态），给出提示
      if (permissionStatus === 'prompt') {
        toast.info('请在弹出的对话框中允许使用麦克风');
      }

      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        } 
      });

      console.log('[语音录制] 麦克风权限已获取');
      
      // 获取支持的音频格式
      const mimeType = getSupportedAudioFormat();
      
      // 创建 MediaRecorder
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, { mimeType });
      } catch (e) {
        // 如果指定格式失败，尝试不指定格式
        console.log('[语音录制] 指定格式失败，使用默认设置');
        mediaRecorder = new MediaRecorder(stream);
      }
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // 停止所有音轨
        stream.getTracks().forEach(track => track.stop());
        
        // 获取实际录制的格式
        const actualMimeType = mediaRecorder.mimeType || mimeType;
        console.log('[语音录制] 实际格式:', actualMimeType, '数据块数:', audioChunksRef.current.length);
        
        // 创建音频 Blob
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        console.log('[语音录制] 音频大小:', audioBlob.size, '字节');
        
        if (audioBlob.size < 100) {
          toast.error('录音时间太短，请重新录制');
          setIsLoading(false);
          return;
        }
        
        // 转换为 base64
        const reader = new FileReader();
        reader.onload = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          
          try {
            setIsLoading(true);
            toast.info('正在识别语音...');
            
            const response = await fetch('/api/ai/asr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                audioData: base64Audio,
                audioFormat: actualMimeType,
              }),
            });

            const data = await response.json();
            
            if (data.success && data.text) {
              toast.success('语音识别成功');
              // 语音识别成功后直接发送消息
              const voiceMessage = data.text;
              setInput(''); // 清空输入
              
              // 添加用户消息
              setMessages(prev => [...prev, { 
                role: 'user', 
                content: voiceMessage
              }]);
              setIsLoading(true);

              // 发送到后端
              try {
                const assistantResponse = await fetch('/api/ai/assistant', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    teamId,
                    message: voiceMessage,
                    images: [],
                    history: messages.slice(-16),
                  }),
                });

                if (!assistantResponse.ok) {
                  throw new Error(`请求失败: ${assistantResponse.status}`);
                }

                const reader = assistantResponse.body?.getReader();
                const decoder = new TextDecoder();
                let assistantMessage = '';
                let voiceReceivedAudio = false;

                if (reader) {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                      if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') break;
                        try {
                          const parsed = JSON.parse(data);
                          if (parsed.content) {
                            assistantMessage += parsed.content;
                            setMessages(prev => {
                              const newMessages = [...prev];
                              const lastMessage = newMessages[newMessages.length - 1];
                              if (lastMessage?.role === 'assistant') {
                                lastMessage.content = assistantMessage;
                              } else {
                                newMessages.push({ role: 'assistant', content: assistantMessage });
                              }
                              return newMessages;
                            });
                          }
                          // 处理TTS音频流事件
                          if (parsed.type === 'audio' && parsed.audio) {
                            try {
                              voiceReceivedAudio = true;
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
                          }
                        } catch (e) {
                          // 忽略解析错误
                        }
                      }
                    }
                  }
                }

                // 自动朗读助手回复（如果已收到服务端音频则跳过）
                if (assistantMessage && autoSpeakEnabled && !voiceReceivedAudio) {
                  await autoSpeak(assistantMessage);
                }
              } catch (sendError) {
                console.error('发送消息失败:', sendError);
                setMessages(prev => [...prev, { 
                  role: 'assistant', 
                  content: '抱歉，网络连接出现问题，请稍后再试。' 
                }]);
              } finally {
                setIsLoading(false);
              }
            } else {
              toast.error(data.error || '语音识别失败');
            }
          } catch (error) {
            console.error('ASR error:', error);
            toast.error('语音识别失败，请重试');
          } finally {
            setIsLoading(false);
          }
        };
        
        reader.onerror = () => {
          toast.error('音频处理失败');
          setIsLoading(false);
        };
        
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.onerror = (event) => {
        console.error('[语音录制] 录音错误:', event);
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        toast.error('录音过程中发生错误');
      };

      // 开始录音
      mediaRecorder.start(1000); // 每秒收集一次数据
      setIsRecording(true);
      console.log('[语音录制] 录音已开始');
      toast.success('开始录音，点击停止按钮结束');
      
    } catch (error: any) {
      console.error('[语音录制] 获取麦克风权限失败:', error);
      setIsRecording(false);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        toast.error('请允许访问麦克风权限');
      } else if (error.name === 'NotFoundError') {
        toast.error('未找到麦克风设备');
      } else if (error.name === 'NotReadableError') {
        toast.error('麦克风被其他应用占用');
      } else if (error.name === 'NotSupportedError') {
        toast.error('您的浏览器不支持录音功能');
      } else if (error.name === 'SecurityError') {
        toast.error('安全限制：请使用 HTTPS 访问');
      } else {
        toast.error('无法访问麦克风: ' + (error.message || '未知错误'));
      }
    }
  }, [getSupportedAudioFormat]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      } catch (error) {
        console.error('[语音录制] 停止录音失败:', error);
        setIsRecording(false);
      }
    }
  }, [isRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // ==================== 语音播放功能 ====================

  // 播放/停止语音
  const toggleSpeech = useCallback(async (messageIndex: number, text: string) => {
    // 如果正在播放这条消息，停止播放
    if (playingMessageIndex === messageIndex) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingMessageIndex(null);
      return;
    }

    // 停止之前的播放
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      setTtsLoading(messageIndex);
      
      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (data.success && data.audioUri) {
        // 创建音频元素并播放
        const audio = new Audio(data.audioUri);
        audioRef.current = audio;
        
        audio.onended = () => {
          setPlayingMessageIndex(null);
          audioRef.current = null;
        };

        audio.onerror = () => {
          toast.error('音频播放失败');
          setPlayingMessageIndex(null);
          audioRef.current = null;
        };

        // 使用 Promise.catch 捕获播放错误
        audio.play().catch((err) => {
          if (err.name === 'NotAllowedError') {
            toast.error('请先点击页面任意位置以启用音频播放');
          } else {
            console.error('[TTS] 播放失败:', err);
          }
          setPlayingMessageIndex(null);
          audioRef.current = null;
        });
        setPlayingMessageIndex(messageIndex);
        
        if (data.truncated) {
          toast.info('消息过长，仅播放前500字');
        }
      } else {
        toast.error(data.error || '语音合成失败');
      }
    } catch (error) {
      console.error('TTS error:', error);
      toast.error('语音合成失败，请重试');
    } finally {
      setTtsLoading(null);
    }
  }, [playingMessageIndex]);

  // 自动朗读（用于语音输入后的自动回复）
  const autoSpeak = useCallback(async (text: string) => {
    // 停止之前的播放
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // 只有在用户有交互后才自动播放
    if (!hasUserInteracted) {
      return;
    }

    try {
      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (data.success && data.audioUri) {
        const audio = new Audio(data.audioUri);
        audioRef.current = audio;
        
        audio.onended = () => {
          setPlayingMessageIndex(null);
          audioRef.current = null;
        };

        audio.onerror = () => {
          audioRef.current = null;
        };

        // 使用 Promise.catch 捕获播放错误（如用户未交互导致的 NotAllowedError）
        audio.play().catch((err) => {
          // 静默处理自动播放被阻止的情况（这是正常的浏览器行为）
          if (err.name === 'NotAllowedError') {
            console.log('[自动朗读] 需要用户交互才能自动播放');
          } else {
            console.error('[自动朗读] 播放失败:', err);
          }
        });
        // 设置最后一条消息为正在播放
        setPlayingMessageIndex(-1); // -1 表示自动播放的最新消息
        
        if (data.truncated) {
          toast.info('消息过长，仅播放前500字');
        }
      }
    } catch (error) {
      console.error('自动朗读失败:', error);
    }
  }, [hasUserInteracted]);

  // ==================== 图片选择功能 ====================

  // 将文件转换为 base64 的辅助函数
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const maxImages = 3;
    const currentCount = selectedImages.length;
    const filesToProcess = Array.from(files).slice(0, maxImages - currentCount);

    if (filesToProcess.length === 0) {
      toast.error('最多只能上传3张图片');
      return;
    }

    // 检查文件大小
    for (const file of filesToProcess) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`图片 "${file.name}" 大小超过10MB，请选择更小的图片`);
        return;
      }
    }

    try {
      // 并行处理所有文件，生成预览
      const base64Promises = filesToProcess.map(file => fileToBase64(file));
      const base64Images = await Promise.all(base64Promises);
      
      setSelectedImages(prev => [...prev, ...base64Images]);
      setSelectedImageFiles(prev => [...prev, ...filesToProcess]);
      toast.success(`已添加 ${base64Images.length} 张图片`);
    } catch (error) {
      console.error('图片读取失败:', error);
      toast.error('图片读取失败，请重试');
    }

    // 清空 input 以便重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [selectedImages.length]);

  const handleCameraCapture = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('capture', 'environment');
      fileInputRef.current.click();
      fileInputRef.current.removeAttribute('capture');
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setSelectedImageFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // ==================== 发送消息 ====================

  // 上传单张图片到服务器
  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/ai/upload-image', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('图片上传失败');
    }
    
    const data = await response.json();
    return data.url; // 返回签名URL
  };

  const sendMessage = async (overrideInput?: string) => {
    // 防止在生成内容时发送新消息
    if (generatingContent) {
      toast.warning(`图片正在生成中，请稍候...`);
      return;
    }
    
    const inputText = (overrideInput || input).trim();
    if ((!inputText && selectedImages.length === 0) || isLoading) return;

    // 标记用户已交互，允许自动播放
    setHasUserInteracted(true);
    
    const userMessage = inputText;
    const imageFilesToSend = [...selectedImageFiles];
    const previewImages = [...selectedImages]; // 用于本地显示的预览
    
    console.log('[银蛇博士] 发送消息:', {
      message: userMessage || '(发送图片)',
      imageCount: imageFilesToSend.length,
    });
    
    // 清空输入和选择的图片
    setInput('');
    setSelectedImages([]);
    setSelectedImageFiles([]);
    
    // 先显示用户消息（使用预览图）
    setMessages(prev => [...prev, { 
      role: 'user', 
      content: userMessage || '(发送图片)',
      images: previewImages.length > 0 ? previewImages : undefined
    }]);
    setIsLoading(true);

    try {
      // 如果有图片，先上传到服务器获取URL
      let imageUrls: string[] = [];
      if (imageFilesToSend.length > 0) {
        console.log('[银蛇博士] 上传图片中...');
        toast.info('正在上传图片...');
        
        try {
          imageUrls = await Promise.all(imageFilesToSend.map(file => uploadImage(file)));
          console.log('[银蛇博士] 图片上传成功:', imageUrls.length);
        } catch (uploadError) {
          console.error('[银蛇博士] 图片上传失败:', uploadError);
          toast.error('图片上传失败，请重试');
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: '图片上传失败，请检查网络后重试。' 
          }]);
          setIsLoading(false);
          return;
        }
      }
      
      const requestBody = {
        teamId,
        message: userMessage || '',
        images: imageUrls,
        history: messages.slice(-16),
        sessionId,
        pageContext: pageContext ? {
          type: pageContext.type,
          title: pageContext.title,
          data: pageContext.data,
        } : undefined,
      };
      
      console.log('[银蛇博士] 发送请求，图片URL数量:', imageUrls.length, 'sessionId:', sessionId);
      
      const response = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      // 从响应头中获取新的 sessionId（如果后端创建了新会话）
      const newSessionId = response.headers.get('X-Session-Id');
      if (newSessionId && newSessionId !== sessionId) {
        console.log('[银蛇博士] 更新会话ID:', sessionId, '->', newSessionId);
        setSessionId(newSessionId);
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[银蛇博士] 请求失败:', response.status, errorText);
        throw new Error(`请求失败: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      let receivedAudio = false;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  assistantMessage += parsed.content;
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage?.role === 'assistant') {
                      lastMessage.content = assistantMessage;
                    } else {
                      newMessages.push({ role: 'assistant', content: assistantMessage });
                    }
                    return newMessages;
                  });
                }
                // 处理对话限制统计
                if (parsed.type === 'usage_stats') {
                  console.log('[银蛇博士] 对话统计:', parsed);
                  setUsageStats({
                    conversationRounds: parsed.conversationRounds || 0,
                    dailyMinutes: parsed.dailyMinutes || 0,
                    offTopicRatio: parsed.offTopicRatio || 0,
                    offTopicCount: parsed.offTopicCount || 0,
                  });
                  // 追加本轮对话时长（约2分钟）
                  addConversationTime(2);
                }
                // 处理图片生成中状态
                if (parsed.type === 'image_generating' && parsed.prompt) {
                  console.log('[AI助手] 图片生成中:', parsed.prompt);
                  setGeneratingContent({ type: 'image', prompt: parsed.prompt });
                  setMessages(prev => {
                    const newMessage: Message = {
                      role: 'assistant',
                      content: `🎨 正在为你们生成图片，请稍候...\n\n"${parsed.prompt}"`,
                      generatedImage: undefined, // 生成中，无图片
                      prompt: parsed.prompt
                    };
                    return [...prev, newMessage];
                  });
                }
                // 处理视频生成中状态
                if (parsed.type === 'video_generating' && parsed.prompt) {
                  console.log('[AI助手] 视频生成中:', parsed.prompt);
                  setGeneratingContent({ type: 'video', prompt: parsed.prompt });
                  setMessages(prev => {
                    const newMessage: Message = {
                      role: 'assistant',
                      content: `🎬 正在为你们生成视频，请稍候...\n\n"${parsed.prompt}"`,
                      generatedVideo: undefined, // 生成中，无视频
                      prompt: parsed.prompt
                    };
                    return [...prev, newMessage];
                  });
                }
                // 处理图片生成结果
                if (parsed.type === 'image_generated' && parsed.imageUrl) {
                  console.log('[AI助手] 收到图片生成结果:', parsed);
                  console.log('[AI助手] 图片URL:', parsed.imageUrl);
                  // 清除生成中状态
                  setGeneratingContent(null);
                  const newMessage: Message = {
                    role: 'assistant',
                    content: parsed.prompt ? `✨ 我为你们生成了一张图片：${parsed.prompt}` : '✨ 我为你们生成了一张图片！',
                    generatedImage: parsed.imageUrl,
                    prompt: parsed.prompt
                  };
                  console.log('[AI助手] 新消息:', newMessage);
                  setMessages(prev => {
                    const updated = [...prev, newMessage];
                    console.log('[AI助手] 更新后的消息列表:', updated.length, '条');
                    return updated;
                  });
                }
                // 处理视频生成结果
                if (parsed.type === 'video_generated' && parsed.videoUrl) {
                  console.log('[AI助手] 收到视频生成结果:', parsed);
                  // 清除生成中状态
                  setGeneratingContent(null);
                  const newMessage: Message = {
                    role: 'assistant',
                    content: parsed.prompt ? `🎬 我为你们生成了一段视频：${parsed.prompt}` : '🎬 我为你们生成了一段视频！',
                    generatedVideo: parsed.videoUrl,
                    prompt: parsed.prompt,
                    duration: parsed.duration,
                    resolution: parsed.resolution
                  };
                  setMessages(prev => [...prev, newMessage]);
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
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      }

      if (!assistantMessage) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: '抱歉，我暂时无法回答这个问题，请稍后再试。' 
        }]);
      } else {
        // 解析推荐问题并更新消息
        const { mainContent, questions } = parseSuggestedQuestions(assistantMessage);
        
        // 更新消息，移除推荐问题部分，添加推荐问题字段
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage?.role === 'assistant') {
            newMessages[newMessages.length - 1] = {
              ...lastMessage,
              content: mainContent,
              suggestedQuestions: questions.length > 0 ? questions : undefined
            };
          }
          return newMessages;
        });
        
        // 自动朗读助手回复（如果已收到服务端音频则跳过）
        if (autoSpeakEnabled && !receivedAudio) {
          await autoSpeak(mainContent);
        }
      }

    } catch (error) {
      console.error('发送消息失败:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '抱歉，网络连接出现问题，请稍后再试。' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // 监控对话限制，显示提醒
  useEffect(() => {
    if (!usageStats) return;
    
    const today = new Date().toISOString().split('T')[0];
    const storedDate = localStorage.getItem(`yinshe_usage_date_${teamId}`);
    const storedMinutes = parseInt(localStorage.getItem(`yinshe_usage_minutes_${teamId}`) || '0');
    const totalMinutes = storedDate === today ? storedMinutes : 0;
    
    // 超过2小时（120分钟）主动结束对话
    if (totalMinutes >= 120 || usageStats.dailyMinutes >= 120) {
      setLimitWarningType('end');
      setShowLimitWarning(true);
      return;
    }
    
    // 离题超过50% - 提醒回归任务
    if (usageStats.offTopicRatio >= 0.5) {
      setLimitWarningType('task');
      setShowLimitWarning(true);
      return;
    }
    
    // 超过50轮 - 提示休息
    if (usageStats.conversationRounds >= 50) {
      setLimitWarningType('rest');
      setShowLimitWarning(true);
      return;
    }
    
    // 条件不再满足时隐藏提示
    setShowLimitWarning(false);
  }, [usageStats, teamId]);

  const quickQuestions = [
    '这个任务有什么要求？',
    '如何使用这些工具？',
    '我能获得什么激励？',
    '积分有什么用？',
  ];

  return (
    <>
      {/* 浮动按钮 - 可拖拽 */}
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
          className={`${
            adaptConfig.isMobile ? 'w-12 h-12' : 'w-14 h-14'
          } rounded-full bg-transparent hover:bg-transparent border-0 p-0 shadow-none cursor-grab active:cursor-grabbing`}
        >
          <img 
            src="/yinhe-doctor.png" 
            alt="银蛇博士" 
            className={`w-full h-full object-contain drop-shadow-lg ${isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'} transition-all duration-300`}
          />
        </Button>
      </div>

      {/* 对话框 - 头部可拖拽 */}
      {isOpen && (
        <div
          className="fixed"
          style={dialogPos.x === -1
            ? { [position === 'bottom-left' ? 'left' : 'right']: '0.75rem', bottom: '0.75rem', zIndex: 9999 } as React.CSSProperties
            : { left: `${dialogPos.x}px`, top: `${dialogPos.y}px`, zIndex: 9999 } as React.CSSProperties
          }
        >
        <Card 
          className={`flex flex-col ${
            adaptConfig.isMobile
              ? 'rounded-2xl'
              : adaptConfig.isFullscreen 
                ? 'w-full h-full rounded-none' 
                : 'rounded-2xl'
          } shadow-2xl border border-white/20 bg-white/95 backdrop-blur-sm`}
          style={adaptConfig.isMobile ? {
            width: 'calc(100vw - 24px)',
            maxWidth: 'calc(100vw - 24px)',
            height: adaptConfig.dialogHeight,
            maxHeight: adaptConfig.dialogMaxHeight,
          } : adaptConfig.isFullscreen ? undefined : {
            width: adaptConfig.dialogWidth,
            height: adaptConfig.dialogHeight,
            maxHeight: adaptConfig.dialogMaxHeight,
          }}
        >
          {/* 头部 */}
          <CardHeader 
            className="flex flex-row items-center justify-between space-y-0 pb-3 pt-4 px-4 bg-white/80 backdrop-blur-sm cursor-grab active:cursor-grabbing select-none"
            style={{ touchAction: 'none' }}
            onMouseDown={(e) => handleDragStart('dialog', e)}
            onTouchStart={(e) => handleDragStart('dialog', e)}
          >
            <div className="flex items-center gap-3">
              <img 
                src="/yinhe-doctor.png" 
                alt="银蛇博士" 
                className={`${adaptConfig.isCompactMode ? 'w-10 h-10' : 'w-12 h-12'} object-contain`}
              />
              <div>
                <CardTitle className="text-base font-semibold text-gray-800">银蛇博士</CardTitle>
                <p className="text-xs text-gray-500">乡村守护神 · 任务指引</p>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto pl-4">
              {/* 语音自动回复开关 */}
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-gray-600 hover:bg-gray-100 rounded-full"
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current = null;
                  }
                  setPlayingMessageIndex(null);
                  setAutoSpeakEnabled(!autoSpeakEnabled);
                  toast.success(autoSpeakEnabled ? '已关闭自动语音回复' : '已开启自动语音回复');
                }}
                title={autoSpeakEnabled ? '关闭自动语音回复' : '开启自动语音回复'}
              >
                {autoSpeakEnabled ? (
                  <Volume2 className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5 text-gray-300" />
                )}
              </Button>
              {/* 关闭按钮 */}
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-gray-600 hover:bg-gray-100 rounded-full"
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current = null;
                  }
                  setPlayingMessageIndex(null);
                  setIsOpen(false);
                }}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-white/90">
            {/* 欢迎消息 */}
            {messages.length === 0 ? (
              <div className="text-center py-6">
                <img 
                  src="/yinhe-doctor.png" 
                  alt="银蛇博士" 
                  className={`${adaptConfig.isCompactMode ? 'w-16 h-16' : 'w-20 h-20'} mx-auto mb-4 object-contain`}
                />
                <p className="font-medium text-gray-700 mb-2 mt-4">你好，我是银蛇博士！</p>
                <p className="text-sm text-gray-500 mb-4">
                  我可以帮你解答关于任务、工具、技能、激励的问题
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  🎤 语音自动发送 · {autoSpeakEnabled ? '自动语音回复' : '点击播放朗读'}
                </p>
                <div className="space-y-2">
                  {quickQuestions.map((q, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-left h-auto py-2 px-3"
                      onClick={() => {
                        setInput(q);
                        inputRef.current?.focus();
                      }}
                    >
                      <Sparkles className="w-4 h-4 mr-2 shrink-0 text-gray-500" />
                      <span className="text-xs">{q}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            {/* 对话限制提醒 */}
            {showLimitWarning && messages.length > 0 && (
              <div className={`rounded-xl p-3 mb-3 border-2 ${
                limitWarningType === 'end' 
                  ? 'bg-red-50 border-red-300' 
                  : limitWarningType === 'task'
                  ? 'bg-blue-50 border-blue-300'
                  : 'bg-amber-50 border-amber-300'
              }`}>
                <div className="flex items-start gap-2">
                  <span className="text-lg flex-shrink-0">
                    {limitWarningType === 'end' ? '🛑' : limitWarningType === 'task' ? '🎯' : '⏰'}
                  </span>
                  <div className="flex-1">
                    <p className={`font-bold text-sm ${
                      limitWarningType === 'end' ? 'text-red-700' : limitWarningType === 'task' ? 'text-blue-700' : 'text-amber-700'
                    }`}>
                      {limitWarningType === 'end' 
                        ? '今天的对话时间已很长了' 
                        : limitWarningType === 'task'
                        ? '回归任务，继续探索吧'
                        : '休息一下，和队友讨论吧'}
                    </p>
                    <p className={`text-xs mt-1 ${
                      limitWarningType === 'end' ? 'text-red-600' : limitWarningType === 'task' ? 'text-blue-600' : 'text-amber-600'
                    }`}>
                      {limitWarningType === 'end' 
                        ? '你们今天已经和银蛇博士对话超过2小时了！建议休息一下，明天再来找我聊天吧~ 💤' 
                        : limitWarningType === 'task'
                        ? '与当前任务无关的讨论较多，快和小队成员一起回到任务中，继续完成你们的探索目标吧！🎯'
                        : `今天已经对话了${usageStats?.conversationRounds || 50}轮！和队友们一起讨论今天学到的东西，团队合作更重要哦~ 🤝`}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {/* 消息列表 */}
            {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      msg.role === 'user'
                        ? 'bg-gray-800 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-700 rounded-bl-md'
                    }`}
                  >
                    {/* 显示图片 */}
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {msg.images.map((img, idx) => (
                          <div key={idx} className="relative group">
                            <img 
                              src={img} 
                              alt={`图片${idx + 1}`} 
                              className="max-w-[120px] max-h-[80px] rounded object-cover"
                              onError={(e) => {
                                // 图片加载失败时隐藏图片，显示占位符
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const placeholder = target.nextElementSibling as HTMLElement;
                                if (placeholder) placeholder.style.display = 'flex';
                              }}
                            />
                            <div className="hidden w-[120px] h-[80px] rounded bg-gray-200 items-center justify-center text-gray-400 text-xs">
                              图片加载失败
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* 显示AI生成的图片 */}
                    {msg.generatedImage && (
                      <div className="mt-2 mb-2 p-2 bg-blue-50 rounded-lg">
                        <div className="text-xs text-blue-600 mb-1 flex items-center gap-1 font-medium">
                          <span>🖼️</span> AI生成的图片
                          <span className="text-blue-400">(点击可查看大图)</span>
                        </div>
                        <div className="relative group">
                          <a 
                            href={msg.generatedImage} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <img 
                              src={msg.generatedImage} 
                              alt="AI生成" 
                              className="max-w-[280px] rounded-lg object-cover border-2 border-blue-200 hover:border-blue-400 transition-colors cursor-pointer"
                            />
                          </a>
                          {/* 下载按钮 */}
                          <a
                            href={msg.generatedImage}
                            download={`yinhe-image-${Date.now()}.png`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute top-2 right-2 p-1.5 bg-blue-500 rounded-full shadow hover:bg-blue-600 transition-colors"
                            title="下载图片"
                          >
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </a>
                        </div>
                        {msg.prompt && (
                          <p className="text-xs text-blue-500 mt-2 italic">描述：{msg.prompt}</p>
                        )}
                      </div>
                    )}
                    
                    {/* 显示AI生成的视频 */}
                    {msg.generatedVideo && (
                      <div className="mt-2 mb-2">
                        <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                          <span>🎬</span> AI生成的视频
                          {msg.duration && <span className="ml-1">({msg.duration}秒)</span>}
                          {msg.resolution && <span className="ml-1">{msg.resolution}</span>}
                        </div>
                        <video
                          src={msg.generatedVideo}
                          controls
                          className="max-w-[280px] rounded-lg border border-gray-200"
                          poster={msg.generatedImage}
                        />
                        {msg.prompt && (
                          <p className="text-xs text-gray-400 mt-1 italic">描述：{msg.prompt}</p>
                        )}
                      </div>
                    )}

                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.role === 'assistant' && (
                      <p className="text-[10px] text-gray-400 mt-1.5 pt-1.5 border-t border-gray-200/50">此为AI回答，不能确保完全正确，需要你进行思考及验证后判断信息真伪</p>
                    )}
                    
                    {/* 方案选择按钮 */}
                    {msg.role === 'assistant' && msg.content && (() => {
                      // 检测是否包含方案A/B/C选择
                      const planMatch = msg.content.match(/方案[A-C]/g);
                      const hasPlans = planMatch && planMatch.length >= 2;
                      
                      if (hasPlans) {
                        return (
                          <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-gray-200">
                            {['A', 'B', 'C'].map((letter) => {
                              const planExists = msg.content.includes(`方案${letter}`);
                              if (!planExists) return null;
                              return (
                                <button
                                  key={letter}
                                  onClick={() => {
                                    // 提取方案名称并填入输入框
                                    const planNameMatch = msg.content.match(
                                      new RegExp(`【方案${letter}】([^\\n]+)`)
                                    );
                                    const planName = planNameMatch ? planNameMatch[1].trim() : `方案${letter}`;
                                    setInput(`我选择方案${letter}：${planName}`);
                                    // 滚动到底部
                                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                                  }}
                                  className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded-full hover:bg-blue-600 transition-colors flex items-center gap-1"
                                >
                                  <span>选择</span>
                                  <span className="font-medium">方案{letter}</span>
                                </button>
                              );
                            })}
                            <button
                              onClick={() => {
                                setInput("我想了解更多详细执行步骤");
                                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                              }}
                              className="px-4 py-1.5 bg-gray-500 text-white text-sm rounded-full hover:bg-gray-600 transition-colors"
                            >
                              询问详细步骤
                            </button>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    
                    {/* 推荐问题展示 */}
                    {msg.role === 'assistant' && msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-gray-200">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                          <span>还想了解什么？</span>
                        </div>
                        <div className="space-y-1.5">
                          {msg.suggestedQuestions.map((q, qIndex) => (
                            <button
                              key={qIndex}
                              onClick={() => {
                                sendMessage(q);
                              }}
                              className="w-full text-left bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-amber-50 hover:border-amber-200 transition-colors group"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium group-hover:bg-amber-400 group-hover:text-white transition-colors">
                                  {qIndex + 1}
                                </span>
                                <span className="text-xs text-gray-600 flex-1">{q}</span>
                                <ChevronRight className="w-3 h-3 text-gray-400 group-hover:text-amber-500 transition-colors" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* 助手消息添加播放按钮 */}
                  {msg.role === 'assistant' && msg.content && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 ml-1 self-end shrink-0 text-gray-600 hover:bg-gray-100 rounded-full"
                      onClick={() => toggleSpeech(i, msg.content)}
                      disabled={ttsLoading !== null && ttsLoading !== i}
                      title={playingMessageIndex === i ? '停止播放' : '播放语音'}
                    >
                      {ttsLoading === i ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : playingMessageIndex === i ? (
                        <Square className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>
              ))}
            {/* 加载指示器 */}
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-700 rounded-2xl rounded-bl-md px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                    <span className="text-sm text-gray-500">思考中...</span>
                  </div>
                </div>
              </div>
            )}
            {/* TTS音频播放指示器 */}
            {isSpeaking && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-700 rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm border">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-blue-500 animate-pulse" />
                    <span className="text-sm text-gray-500">正在朗读...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </CardContent>

          {/* 输入区域 */}
          <div className="p-3 border-t border-gray-100 bg-white/80">
            {/* 图片预览区域 */}
            {selectedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedImages.map((img, idx) => (
                  <div 
                    key={idx} 
                    className="relative"
                  >
                    <img 
                      src={img} 
                      alt={`预览${idx + 1}`} 
                      className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                    />
                    <button
                      onClick={() => removeImage(idx)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-gray-800 text-white rounded-full flex items-center justify-center text-xs hover:bg-gray-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {selectedImageFiles.length > 0 && (
                  <span className="text-xs text-gray-400 self-center ml-1">
                    {selectedImageFiles.length}/3
                  </span>
                )}
              </div>
            )}

            {/* 隐藏的文件输入 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageSelect}
            />

            {/* 功能按钮行 */}
            <div className="flex items-center gap-2 mb-3">
              {/* 语音输入按钮 */}
              <Button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isLoading && !isRecording}
                className={`rounded-full w-9 h-9 p-0 ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
                title={isRecording ? '停止录音' : '开始语音输入'}
              >
                {isRecording ? (
                  <Square className="w-4 h-4 text-white" />
                ) : (
                  <Mic className="w-4 h-4 text-gray-600" />
                )}
              </Button>

              {/* 图片选择按钮 */}
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isRecording || selectedImageFiles.length >= 3 || !!generatingContent}
                className="rounded-full w-9 h-9 p-0 bg-gray-100 hover:bg-gray-200"
                title={generatingContent ? "图片生成中" : "选择图片"}
              >
                <ImagePlus className="w-4 h-4 text-gray-600" />
              </Button>

              {/* 拍照按钮 */}
              <Button
                onClick={handleCameraCapture}
                disabled={isLoading || isRecording || selectedImageFiles.length >= 3 || !!generatingContent}
                className="rounded-full w-9 h-9 p-0 bg-gray-100 hover:bg-gray-200"
                title="拍照"
              >
                <Camera className="w-4 h-4 text-gray-600" />
              </Button>

              {/* 语音朗读按钮 */}
              <Button
                onClick={() => setAutoSpeakEnabled(!autoSpeakEnabled)}
                className={`rounded-full w-9 h-9 p-0 ml-auto ${
                  autoSpeakEnabled 
                    ? 'bg-blue-100 hover:bg-blue-200' 
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
                title={autoSpeakEnabled ? '已开启语音朗读' : '关闭语音朗读'}
              >
                <Volume2 className={`w-4 h-4 ${autoSpeakEnabled ? 'text-blue-600' : 'text-gray-600'}`} />
              </Button>
            </div>

            {/* 输入框和发送按钮 */}
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={generatingContent ? "图片生成中，请稍候..." : selectedImageFiles.length > 0 ? "描述你的图片..." : "输入问题..."}
                className="flex-1 rounded-full h-12 text-base px-4"
                disabled={isLoading || isRecording || !!generatingContent}
              />
              <Button
                onClick={() => sendMessage()}
                disabled={(!input.trim() && selectedImageFiles.length === 0) || isLoading || isRecording || !!generatingContent}
                className="rounded-full w-12 h-12 p-0 bg-gray-800 hover:bg-gray-700"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </Card>
        </div>
      )}
    </>
  );
}
