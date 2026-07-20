'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  X,
  Send,
  Loader2,
  Sparkles,
  Mic,
  Volume2,
  Square,
  ImagePlus,
  Camera,
  ChevronRight,
  Lightbulb,
  Minimize2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAssistantAdapt } from '@/hooks/use-assistant-adapt';

// 提取的模块
import { parseSuggestedQuestions, detectPlanOptions, extractPlanName } from './lib/message-parser';
import { uploadImage, processSSEStream } from './lib/sse-utils';
import { useDraggable } from './lib/use-draggable';
import { useSession } from './lib/use-session';
import { usePageContext } from './lib/use-page-context';
import { useRecording, type RecordingResult } from './lib/use-recording';
import { useSpeech } from './lib/use-speech';
import { useImageSelect } from './lib/use-image-select';
import { useConversationLimit } from './lib/use-conversation-limit';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  imageFiles?: File[];
  generatedImage?: string;
  generatedVideo?: string;
  prompt?: string;
  duration?: number;
  resolution?: string;
  suggestedQuestions?: string[];
}

interface AIAssistantProps {
  teamId: string;
  assistantType?: string;
  position?: 'bottom-right' | 'bottom-left';
}

export default function AIAssistant({
  teamId,
  assistantType = 'yinhe',
  position = 'bottom-right',
}: AIAssistantProps) {
  // 设备适配
  const adaptConfig = useAssistantAdapt(position);

  // 基础状态
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState(true);
  const [generatingContent, setGeneratingContent] = useState<{
    type: 'image' | 'video';
    prompt?: string;
  } | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);

  // 提取的 Hooks
  const { bubblePos, dialogPos, handleDragStart, hasMovedRef } = useDraggable(position);
  const { sessionId, setSessionId } = useSession(teamId);
  const pageContext = usePageContext();
  const {
    usageStats,
    setUsageStats,
    showLimitWarning,
    limitWarningType,
    addConversationTime,
  } = useConversationLimit(teamId);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // LE-F07: 用 ref 跟踪最新 messages,避免 handleRecordingComplete 依赖 messages 导致频繁重建
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 语音播放 Hook（依赖 hasUserInteracted）
  const {
    playingMessageIndex,
    ttsLoading,
    isSpeaking,
    audioRef,
    toggleSpeech,
    autoSpeak,
    playBase64Audio,
    stopAll,
  } = useSpeech(hasUserInteracted);

  // 图片选择 Hook
  const {
    selectedImages,
    selectedImageFiles,
    handleImageSelect,
    handleCameraCapture,
    removeImage,
    clearImages,
  } = useImageSelect(fileInputRef);

  // 语音录制 Hook - 录音完成后调用 ASR 并发送
  const handleRecordingComplete = useCallback(
    async (result: RecordingResult) => {
      try {
        setIsLoading(true);
        toast.info('正在识别语音...');

        const response = await fetch('/api/ai/asr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioData: result.base64Audio,
            audioFormat: result.mimeType,
          }),
        });

        // 安全修复 LE-F04: 先检查 res.ok,避免服务端返回 HTML 错误页时 res.json() 抛 SyntaxError
        if (!response.ok) {
          toast.error('语音识别服务异常,请稍后重试');
          return;
        }

        const data = await response.json();

        if (data.success && data.text) {
          toast.success('语音识别成功');
          const voiceMessage = data.text;
          setInput('');

          setMessages((prev) => [...prev, { role: 'user', content: voiceMessage }]);
          setIsLoading(true);

          try {
            const assistantResponse = await fetch('/api/ai/assistant', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                teamId,
                message: voiceMessage,
                images: [],
                history: messagesRef.current.slice(-16),
                sessionId, // 修复：补充 sessionId，保持语音与文本对话上下文一致
              }),
            });

            if (!assistantResponse.ok) {
              throw new Error(`请求失败: ${assistantResponse.status}`);
            }

            const reader = assistantResponse.body?.getReader();
            let voiceReceivedAudio = false;

            if (reader) {
              const fullText = await processSSEStream(reader, {
                onContent: (_content, fullText) => {
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage?.role === 'assistant') {
                      lastMessage.content = fullText;
                    } else {
                      newMessages.push({ role: 'assistant', content: fullText });
                    }
                    return newMessages;
                  });
                },
                onUsageStats: () => {},
                onImageGenerating: () => {},
                onVideoGenerating: () => {},
                onImageGenerated: () => {},
                onVideoGenerated: () => {},
                onAudio: (base64Audio) => {
                  voiceReceivedAudio = true;
                  playBase64Audio(base64Audio);
                },
              });

              if (fullText && autoSpeakEnabled && !voiceReceivedAudio) {
                await autoSpeak(fullText);
              }
            }
          } catch (sendError) {
            console.error('发送消息失败:', sendError);
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: '抱歉，网络连接出现问题，请稍后再试。' },
            ]);
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
    },
    [teamId, autoSpeakEnabled, autoSpeak, playBase64Audio]
  );

  const { isRecording, startRecording, stopRecording } = useRecording(handleRecordingComplete);

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

  // ==================== 发送消息 ====================
  const sendMessage = async (overrideInput?: string) => {
    if (generatingContent) {
      toast.warning(`图片正在生成中，请稍候...`);
      return;
    }

    const inputText = (overrideInput || input).trim();
    if ((!inputText && selectedImages.length === 0) || isLoading) return;

    setHasUserInteracted(true);

    const userMessage = inputText;
    const imageFilesToSend = [...selectedImageFiles];
    const previewImages = [...selectedImages];

    console.log('[银蛇博士] 发送消息:', {
      message: userMessage || '(发送图片)',
      imageCount: imageFilesToSend.length,
    });

    setInput('');
    clearImages();

    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: userMessage || '(发送图片)',
        images: previewImages.length > 0 ? previewImages : undefined,
      },
    ]);
    setIsLoading(true);

    try {
      let imageUrls: string[] = [];
      if (imageFilesToSend.length > 0) {
        console.log('[银蛇博士] 上传图片中...');
        toast.info('正在上传图片...');

        try {
          imageUrls = await Promise.all(imageFilesToSend.map((file) => uploadImage(file)));
          console.log('[银蛇博士] 图片上传成功:', imageUrls.length);
        } catch (uploadError) {
          console.error('[银蛇博士] 图片上传失败:', uploadError);
          toast.error('图片上传失败，请重试');
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: '图片上传失败，请检查网络后重试。' },
          ]);
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
        pageContext: pageContext
          ? {
              type: pageContext.type,
              title: pageContext.title,
              data: pageContext.data,
            }
          : undefined,
      };

      console.log('[银蛇博士] 发送请求，图片URL数量:', imageUrls.length, 'sessionId:', sessionId);

      const response = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const newSessionId = response.headers.get('X-Session-Id');
      if (newSessionId && newSessionId !== sessionId) {
        console.log('[银蛇博士] 更新会话ID:', sessionId, '->', newSessionId);
        setSessionId(newSessionId);
        sessionStorage.setItem(`yinshe_session_${teamId}`, newSessionId);
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[银蛇博士] 请求失败:', response.status, errorText);
        throw new Error(`请求失败: ${response.status}`);
      }

      const reader = response.body?.getReader();
      let receivedAudio = false;

      if (reader) {
        const assistantMessage = await processSSEStream(reader, {
          onContent: (_content, fullText) => {
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage?.role === 'assistant') {
                lastMessage.content = fullText;
              } else {
                newMessages.push({ role: 'assistant', content: fullText });
              }
              return newMessages;
            });
          },
          onUsageStats: (stats) => {
            console.log('[银蛇博士] 对话统计:', stats);
            setUsageStats(stats);
            addConversationTime(2);
          },
          onImageGenerating: (prompt) => {
            console.log('[AI助手] 图片生成中:', prompt);
            setGeneratingContent({ type: 'image', prompt });
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `🎨 正在为你们生成图片，请稍候...\n\n"${prompt}"`,
                generatedImage: undefined,
                prompt,
              },
            ]);
          },
          onVideoGenerating: (prompt) => {
            console.log('[AI助手] 视频生成中:', prompt);
            setGeneratingContent({ type: 'video', prompt });
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `🎬 正在为你们生成视频，请稍候...\n\n"${prompt}"`,
                generatedVideo: undefined,
                prompt,
              },
            ]);
          },
          onImageGenerated: (imageUrl, prompt) => {
            console.log('[AI助手] 收到图片生成结果:', imageUrl);
            setGeneratingContent(null);
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: prompt
                  ? `✨ 我为你们生成了一张图片：${prompt}`
                  : '✨ 我为你们生成了一张图片！',
                generatedImage: imageUrl,
                prompt,
              },
            ]);
          },
          onVideoGenerated: (data) => {
            console.log('[AI助手] 收到视频生成结果:', data.videoUrl);
            setGeneratingContent(null);
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: data.prompt
                  ? `🎬 我为你们生成了一段视频：${data.prompt}`
                  : '🎬 我为你们生成了一段视频！',
                generatedVideo: data.videoUrl,
                prompt: data.prompt,
                duration: data.duration,
                resolution: data.resolution,
              },
            ]);
          },
          onAudio: (base64Audio) => {
            receivedAudio = true;
            playBase64Audio(base64Audio);
          },
        });

        if (!assistantMessage) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: '抱歉，我暂时无法回答这个问题，请稍后再试。' },
          ]);
        } else {
          const { mainContent, questions } = parseSuggestedQuestions(assistantMessage);
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage?.role === 'assistant') {
              newMessages[newMessages.length - 1] = {
                ...lastMessage,
                content: mainContent,
                suggestedQuestions: questions.length > 0 ? questions : undefined,
              };
            }
            return newMessages;
          });

          if (autoSpeakEnabled && !receivedAudio) {
            await autoSpeak(mainContent);
          }
        }
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '抱歉，网络连接出现问题，请稍后再试。' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

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
            ? ({ [position === 'bottom-left' ? 'left' : 'right']: '1rem', bottom: '1rem' } as React.CSSProperties)
            : ({ left: `${bubblePos.x}px`, top: `${bubblePos.y}px` } as React.CSSProperties)),
        }}
      >
        <Button
          onMouseDown={(e) => handleDragStart('bubble', e)}
          onTouchStart={(e) => handleDragStart('bubble', e)}
          onClick={() => {
            if (!hasMovedRef.current) setIsOpen(true);
          }}
          className={`${
            adaptConfig.isMobile ? 'w-12 h-12' : 'w-14 h-14'
          } rounded-full bg-transparent hover:bg-transparent border-0 p-0 shadow-none cursor-grab active:cursor-grabbing`}
        >
          <img
            src="/yinhe-doctor.png"
            alt="银蛇博士"
            className={`w-full h-full object-contain drop-shadow-lg ${
              isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
            } transition-all duration-300`}
          />
        </Button>
      </div>

      {/* 对话框 - 头部可拖拽 */}
      {isOpen && (
        <div
          className="fixed"
          style={
            dialogPos.x === -1
              ? ({ [position === 'bottom-left' ? 'left' : 'right']: '0.75rem', bottom: '0.75rem', zIndex: 9999 } as React.CSSProperties)
              : ({ left: `${dialogPos.x}px`, top: `${dialogPos.y}px`, zIndex: 9999 } as React.CSSProperties)
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
            style={
              adaptConfig.isMobile
                ? {
                    width: 'calc(100vw - 24px)',
                    maxWidth: 'calc(100vw - 24px)',
                    height: adaptConfig.dialogHeight,
                    maxHeight: adaptConfig.dialogMaxHeight,
                  }
                : adaptConfig.isFullscreen
                ? undefined
                : {
                    width: adaptConfig.dialogWidth,
                    height: adaptConfig.dialogHeight,
                    maxHeight: adaptConfig.dialogMaxHeight,
                  }
            }
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-gray-600 hover:bg-gray-100 rounded-full"
                  onClick={() => {
                    stopAll();
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-gray-600 hover:bg-gray-100 rounded-full"
                  onClick={() => {
                    stopAll();
                    setIsOpen(false);
                  }}
                  title="最小化"
                >
                  {/* LE-M12: 关闭按钮改为最小化按钮,确保对话连续性 */}
                  <Minimize2 className="h-5 w-5" />
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
                <div
                  className={`rounded-xl p-3 mb-3 border-2 ${
                    limitWarningType === 'end'
                      ? 'bg-red-50 border-red-300'
                      : limitWarningType === 'task'
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-amber-50 border-amber-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg flex-shrink-0">
                      {limitWarningType === 'end' ? '🛑' : limitWarningType === 'task' ? '🎯' : '⏰'}
                    </span>
                    <div className="flex-1">
                      <p
                        className={`font-bold text-sm ${
                          limitWarningType === 'end'
                            ? 'text-red-700'
                            : limitWarningType === 'task'
                            ? 'text-blue-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {limitWarningType === 'end'
                          ? '今天的对话时间已很长了'
                          : limitWarningType === 'task'
                          ? '回归任务，继续探索吧'
                          : '休息一下，和队友讨论吧'}
                      </p>
                      <p
                        className={`text-xs mt-1 ${
                          limitWarningType === 'end'
                            ? 'text-red-600'
                            : limitWarningType === 'task'
                            ? 'text-blue-600'
                            : 'text-amber-600'
                        }`}
                      >
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
                          <a href={msg.generatedImage} target="_blank" rel="noopener noreferrer">
                            <img
                              src={msg.generatedImage}
                              alt="AI生成"
                              className="max-w-[280px] rounded-lg object-cover border-2 border-blue-200 hover:border-blue-400 transition-colors cursor-pointer"
                            />
                          </a>
                          <a
                            href={msg.generatedImage}
                            download={`yinhe-image-${Date.now()}.png`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute top-2 right-2 p-1.5 bg-blue-500 rounded-full shadow hover:bg-blue-600 transition-colors"
                            title="下载图片"
                          >
                            <svg
                              className="w-4 h-4 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                              />
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
                      <p className="text-[10px] text-gray-400 mt-1.5 pt-1.5 border-t border-gray-200/50">
                        此为AI回答，不能确保完全正确，需要你进行思考及验证后判断信息真伪
                      </p>
                    )}

                    {/* 方案选择按钮 */}
                    {msg.role === 'assistant' &&
                      msg.content &&
                      (() => {
                        const planOptions = detectPlanOptions(msg.content);
                        if (planOptions.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-gray-200">
                            {['A', 'B', 'C'].map((letter) => {
                              if (!msg.content.includes(`方案${letter}`)) return null;
                              return (
                                <button
                                  key={letter}
                                  onClick={() => {
                                    const planName = extractPlanName(msg.content, letter);
                                    setInput(`我选择方案${letter}：${planName}`);
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
                                setInput('我想了解更多详细执行步骤');
                                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                              }}
                              className="px-4 py-1.5 bg-gray-500 text-white text-sm rounded-full hover:bg-gray-600 transition-colors"
                            >
                              询问详细步骤
                            </button>
                          </div>
                        );
                      })()}

                    {/* 推荐问题展示 */}
                    {msg.role === 'assistant' &&
                      msg.suggestedQuestions &&
                      msg.suggestedQuestions.length > 0 && (
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
                    <div key={idx} className="relative">
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

                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isRecording || selectedImageFiles.length >= 3 || !!generatingContent}
                  className="rounded-full w-9 h-9 p-0 bg-gray-100 hover:bg-gray-200"
                  title={generatingContent ? '图片生成中' : '选择图片'}
                >
                  <ImagePlus className="w-4 h-4 text-gray-600" />
                </Button>

                <Button
                  onClick={handleCameraCapture}
                  disabled={isLoading || isRecording || selectedImageFiles.length >= 3 || !!generatingContent}
                  className="rounded-full w-9 h-9 p-0 bg-gray-100 hover:bg-gray-200"
                  title="拍照"
                >
                  <Camera className="w-4 h-4 text-gray-600" />
                </Button>

                <Button
                  onClick={() => setAutoSpeakEnabled(!autoSpeakEnabled)}
                  className={`rounded-full w-9 h-9 p-0 ml-auto ${
                    autoSpeakEnabled
                      ? 'bg-blue-100 hover:bg-blue-200'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                  title={autoSpeakEnabled ? '已开启语音朗读' : '关闭语音朗读'}
                >
                  <Volume2
                    className={`w-4 h-4 ${autoSpeakEnabled ? 'text-blue-600' : 'text-gray-600'}`}
                  />
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
                  placeholder={
                    generatingContent
                      ? '图片生成中，请稍候...'
                      : selectedImageFiles.length > 0
                      ? '描述你的图片...'
                      : '输入问题...'
                  }
                  className="flex-1 rounded-full h-12 text-base px-4"
                  disabled={isLoading || isRecording || !!generatingContent}
                />
                <Button
                  onClick={() => sendMessage()}
                  disabled={
                    (!input.trim() && selectedImageFiles.length === 0) ||
                    isLoading ||
                    isRecording ||
                    !!generatingContent
                  }
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
