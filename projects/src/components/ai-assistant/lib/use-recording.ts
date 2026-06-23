'use client';

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * 录音结果
 */
export interface RecordingResult {
  base64Audio: string;
  mimeType: string;
}

/**
 * 语音录制 Hook
 * 从 ai-assistant.tsx 提取，只负责录音和获取 base64 音频数据
 * 语音识别和消息发送由调用方通过回调处理
 * @param onRecordingComplete - 录音完成回调，接收 base64 音频和 MIME 类型
 */
export function useRecording(onRecordingComplete: (result: RecordingResult) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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
        const permissionResult = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });
        permissionStatus = permissionResult.state;
        console.log('[语音录制] 当前权限状态:', permissionStatus);

        permissionResult.onchange = () => {
          console.log('[语音录制] 权限状态变更为:', permissionResult.state);
        };
      } catch (e) {
        console.log('[语音录制] 无法查询权限状态，直接请求权限');
      }

      if (permissionStatus === 'denied') {
        toast.error('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
        return;
      }

      if (permissionStatus === 'prompt') {
        toast.info('请在弹出的对话框中允许使用麦克风');
      }

      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      console.log('[语音录制] 麦克风权限已获取');

      const mimeType = getSupportedAudioFormat();

      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, { mimeType });
      } catch (e) {
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
        stream.getTracks().forEach((track) => track.stop());

        const actualMimeType = mediaRecorder.mimeType || mimeType;
        console.log(
          '[语音录制] 实际格式:',
          actualMimeType,
          '数据块数:',
          audioChunksRef.current.length
        );

        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        console.log('[语音录制] 音频大小:', audioBlob.size, '字节');

        if (audioBlob.size < 100) {
          toast.error('录音时间太短，请重新录制');
          return;
        }

        // 转换为 base64
        const reader = new FileReader();
        reader.onload = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          onRecordingComplete({ base64Audio, mimeType: actualMimeType });
        };

        reader.onerror = () => {
          toast.error('音频处理失败');
        };

        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.onerror = (event) => {
        console.error('[语音录制] 录音错误:', event);
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        toast.error('录音过程中发生错误');
      };

      mediaRecorder.start(1000);
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
  }, [getSupportedAudioFormat, onRecordingComplete]);

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

  return {
    isRecording,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
