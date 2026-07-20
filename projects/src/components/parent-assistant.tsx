'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Send, Loader2, Users, BookOpen, MessageCircle, ChevronRight, Lightbulb, GraduationCap, Mic, MicOff, Volume2, VolumeX, Square, Minimize2 } from 'lucide-react';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestedQuestions?: string[];
}

interface ParentAssistantProps {
  parentId: string;
  parentName?: string;
}

export default function ParentAssistant({ parentId, parentName }: ParentAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');

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

  // 拖拽处理
  const handleDragStart = useCallback((type: 'bubble' | 'dialog', e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    hasMovedRef.current = false;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const currentPos = type === 'bubble' ? bubblePos : dialogPos;
    
    // 如果还没初始化位置，用默认值
    const posX = currentPos.x === -1 ? window.innerWidth - 72 : currentPos.x;
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
  }, [bubblePos, dialogPos]);

  useEffect(() => {
    if (parentId && !sessionId) {
      // LE-M08: 使用 sessionStorage 替代 localStorage,确保退出重进算新对话
      const storedSessionId = sessionStorage.getItem(`laxiang_session_parent_${parentId}`);
      if (storedSessionId) {
        setSessionId(storedSessionId);
      } else {
        // LE-M09: sessionId 加时间戳,防止上下文无限累积
        const newSessionId = `laxiang_parent_${parentId}_${Date.now()}`;
        setSessionId(newSessionId);
        sessionStorage.setItem(`laxiang_session_parent_${parentId}`, newSessionId);
      }
    }
  }, [parentId, sessionId]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // 清理音频资源
  // 安全修复 LE-F02: 之前 cleanup 依赖 isRecording,当 isRecording 从 false→true 变化时,
  // React 会先执行旧 effect 的 cleanup(此时 isRecording 还是旧值 false,不会 stop),
  // 但当 isRecording 从 true→false 变化时,旧 effect 的 cleanup 会在 isRecording=true 时运行,
  // 立即停止用户正在进行的录音。改为仅在组件卸载时清理,并直接检查 mediaRecorderRef.current.state。
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      // 直接检查 MediaRecorder 实例的运行状态,而非依赖 React state
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    };
  }, []);

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

      // 安全修复 LE-F04: 先检查 res.ok,避免服务端返回 HTML 错误页时 res.json() 抛 SyntaxError
      if (!response.ok) {
        console.error('[语音] TTS服务异常:', response.status);
        return;
      }

      const data = await response.json();
      // 临时调试：打印完整响应，便于看到后端返回的错误详情
      if (!data.success) {
        console.error('[语音] TTS失败详情:', {
          status: response.status,
          statusText: response.statusText,
          body: data,
        });
      }

      if (data.success && data.audioUri) {
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

  // 移除消息内容中的 Markdown 符号
  const stripMarkdownSymbols = (content: string): string => {
    if (!content) return '';
    return content
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^#+\s*/gm, '')
      .replace(/^[\-\*]\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\*$/gm, '')
      .replace(/^#$/gm, '');
  };

  // 解析消息中的推荐问题
  const parseSuggestedQuestions = (content: string): { mainContent: string; questions: string[] } => {
    const pattern = /---\s*\n💡[你您]可能还想了解[：:]\s*\n((?:\d+[\.\.、].+\n?)+)/;
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

  // 开始录音
  const startRecording = async () => {
    try {
      let permissionStatus: PermissionState = 'prompt';
      try {
        const permissionResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        permissionStatus = permissionResult.state;
      } catch (e) {
        // 部分浏览器不支持 permissions API，降级为默认状态
        console.warn('无法查询麦克风权限状态:', e);
      }

      if (permissionStatus === 'denied') {
        toast.error('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
        return;
      }

      if (permissionStatus === 'prompt') {
        toast.info('请在弹出的对话框中允许使用麦克风');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
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
    if (!messageText.trim() || isLoading) return;

    const userMessage = messageText.trim();
    setInput('');
    
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const history = messages.slice(-16).map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await fetch('/api/admin/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: parentId,
          userRole: 'parent',
          message: userMessage,
          history,
          sessionId,
        }),
      });

      const newSessionId = response.headers.get('X-Session-Id');
      if (newSessionId && newSessionId !== sessionId) {
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

              if (parsed.content) {
                assistantMessage += parsed.content;
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1].content = assistantMessage;
                  } else {
                    newMessages.push({ role: 'assistant', content: assistantMessage });
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
        const cleanMessage = assistantMessage
          .replace(/\[发送消息\].*?\|.*?\|.*?\n?/g, '')
          .replace(/---\s*\n💡[\s\S]*$/, '')
          .replace(/✅/g, '')
          .replace(/❌/g, '')
          .trim();
        
        if (cleanMessage) {
          await speakText(cleanMessage);
        }
      }

      // 在消息接收完成后，解析推荐问题
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
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '抱歉，发送失败，请稍后重试。' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    sendMessage(input);
  };

  // 家长端快捷问题
  const quickQuestions = [
    { icon: Users, text: '查看孩子小队的基本信息' },
    { icon: BookOpen, text: '小队现在在做什么任务？' },
    { icon: GraduationCap, text: '这个主题对孩子有什么教育意义？' },
    { icon: MessageCircle, text: '孩子遇到困难想放弃怎么办？' },
  ];

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
          ...(bubblePos.x === -1 ? { right: '1rem', bottom: '1rem' } as React.CSSProperties : { left: `${bubblePos.x}px`, top: `${bubblePos.y}px` } as React.CSSProperties)
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
          style={dialogPos.x === -1 ? { right: '0.75rem', bottom: '0.75rem' } as React.CSSProperties : { left: `${dialogPos.x}px`, top: `${dialogPos.y}px` } as React.CSSProperties}
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
                  <p className="text-xs text-gray-500">学习洞察 · 进度查询 · 语音对话</p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto pl-4">
                {/* 语音开关 */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-gray-600 hover:bg-gray-100 rounded-full"
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
                {/* LE-M11: 关闭按钮改为最小化按钮,确保对话连续性 */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-gray-600 hover:bg-gray-100 rounded-full"
                  onClick={() => {
                    stopSpeaking();
                    setIsOpen(false);
                  }}
                  title="最小化"
                >
                  <Minimize2 className="h-5 w-5" />
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
                    我可以帮您了解孩子所在小队的学习情况、任务进度和教育意义
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
                </div>
              )}

              {/* 消息列表 */}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      message.role === 'user'
                        ? 'bg-gray-800 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-700 rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{stripMarkdownSymbols(message.content)}</p>
                    {message.role === 'assistant' && (
                      <p className="text-[10px] text-gray-400 mt-1.5 pt-1.5 border-t border-gray-200/50">此为AI回答，不能确保完全正确，需要你进行思考及验证后判断信息真伪</p>
                    )}
                  </div>
                  
                  {/* 推荐问题展示 */}
                  {message.role === 'assistant' && message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
                    <div className="mt-2 ml-2 space-y-1.5">
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
              ))}

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
                  <div className="bg-gray-800 text-white rounded-2xl rounded-br-md px-4 py-2.5">
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
              <div className="flex gap-2">
                {/* 语音输入按钮 */}
                <Button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isLoading || isProcessingVoice}
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
                  placeholder={isRecording ? '正在录音...' : '输入您的问题...'}
                  className="flex-1 rounded-full"
                  disabled={isLoading || isRecording || isProcessingVoice}
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading || isRecording || isProcessingVoice}
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
                蜡象助手 · {isVoiceEnabled ? '语音已开启' : '语音已关闭'}
              </p>
            </div>
          </Card>
          </div>
        </div>
      )}
    </>
  );
}
