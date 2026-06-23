'use client';

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { base64ToAudio } from './audio-utils';

/**
 * 语音播放 Hook
 * 从 ai-assistant.tsx 提取，负责 TTS 语音合成和播放控制
 * @param hasUserInteracted - 用户是否有过交互（影响自动播放）
 * @param onAudioStateChange - 音频播放状态变化回调（用于 SSE 音频流场景）
 */
export function useSpeech(
  hasUserInteracted: boolean,
  onAudioStateChange?: (isPlaying: boolean) => void
) {
  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(null);
  const [ttsLoading, setTtsLoading] = useState<number | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /** 释放当前音频资源 */
  const releaseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  // 播放/停止语音（手动触发）
  const toggleSpeech = useCallback(
    async (messageIndex: number, text: string) => {
      // 如果正在播放这条消息，停止播放
      if (playingMessageIndex === messageIndex) {
        releaseAudio();
        setPlayingMessageIndex(null);
        return;
      }

      // 停止之前的播放
      releaseAudio();

      try {
        setTtsLoading(messageIndex);

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
            toast.error('音频播放失败');
            setPlayingMessageIndex(null);
            audioRef.current = null;
          };

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
    },
    [playingMessageIndex, releaseAudio]
  );

  // 自动朗读（用于语音输入后的自动回复）
  const autoSpeak = useCallback(
    async (text: string) => {
      releaseAudio();

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

          audio.play().catch((err) => {
            if (err.name === 'NotAllowedError') {
              console.log('[自动朗读] 需要用户交互才能自动播放');
            } else {
              console.error('[自动朗读] 播放失败:', err);
            }
          });
          setPlayingMessageIndex(-1); // -1 表示自动播放的最新消息

          if (data.truncated) {
            toast.info('消息过长，仅播放前500字');
          }
        }
      } catch (error) {
        console.error('自动朗读失败:', error);
      }
    },
    [hasUserInteracted, releaseAudio]
  );

  /**
   * 播放 SSE 流中收到的 base64 音频
   * 用于服务端 TTS 音频流场景
   */
  const playBase64Audio = useCallback(
    (base64: string) => {
      try {
        setIsSpeaking(true);
        onAudioStateChange?.(true);
        releaseAudio();

        const { audio, url } = base64ToAudio(base64);
        audioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
          onAudioStateChange?.(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          onAudioStateChange?.(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
          console.error('[TTS音频] 播放失败');
        };

        audio.play().catch((err) => {
          setIsSpeaking(false);
          onAudioStateChange?.(false);
          URL.revokeObjectURL(url);
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
        onAudioStateChange?.(false);
      }
    },
    [releaseAudio, onAudioStateChange]
  );

  /** 停止所有播放 */
  const stopAll = useCallback(() => {
    releaseAudio();
    setPlayingMessageIndex(null);
    setIsSpeaking(false);
  }, [releaseAudio]);

  return {
    playingMessageIndex,
    ttsLoading,
    isSpeaking,
    audioRef,
    toggleSpeech,
    autoSpeak,
    playBase64Audio,
    stopAll,
  };
}
