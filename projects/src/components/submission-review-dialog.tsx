'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Loader2, RotateCcw, X } from 'lucide-react';

interface SubmissionReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  taskId: string;
  taskTitle?: string;
  submissionId?: string;
  cycle?: number;
}

export function SubmissionReviewDialog({
  open,
  onOpenChange,
  teamId,
  taskId,
  taskTitle,
  submissionId,
  cycle,
}: SubmissionReviewDialogProps) {
  const [reviewContent, setReviewContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [reviewContent]);

  const startReview = useCallback(async () => {
    if (!teamId || !taskId) return;

    setIsLoading(true);
    setReviewContent('');
    setError(null);

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/ai/review-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, taskId, submissionId, cycle }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '评价请求失败' }));
        throw new Error(errorData.error || '评价请求失败');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                setReviewContent(prev => prev + data.content);
              } else if (data.type === 'error') {
                setError(data.error || '评价生成失败');
              } else if (data.type === 'done') {
                // 完成
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || '评价服务暂时不可用');
    } finally {
      setIsLoading(false);
    }
  }, [teamId, taskId, submissionId]);

  // 打开对话框时自动开始评价
  useEffect(() => {
    if (open && teamId && taskId) {
      startReview();
    }
    return () => {
      // 关闭时取消请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [open, teamId, taskId, startReview]);

  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setReviewContent('');
    setError(null);
    setIsLoading(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            银蛇博士帮你把关
          </DialogTitle>
          <DialogDescription>
            {taskTitle ? `正在评价「${taskTitle}」的产出` : '银蛇博士正在评价你的产出'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-4" ref={scrollRef}>
          <div className="space-y-4">
            {reviewContent && (
              <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                {reviewContent}
              </div>
            )}

            {isLoading && !reviewContent && (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <Sparkles className="w-4 h-4 absolute -top-1 -right-1 text-yellow-500" />
                  </div>
                  <p className="text-sm text-muted-foreground">银蛇博士正在仔细阅读你的产出...</p>
                </div>
              </div>
            )}

            {isLoading && reviewContent && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                正在生成评价...
              </div>
            )}

            {error && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={startReview}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  重试
                </Button>
              </div>
            )}

            {!isLoading && !error && reviewContent && (
              <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4 text-yellow-500" />
                评价完成
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-2 border-t">
          {!isLoading && !error && reviewContent && (
            <Button variant="outline" size="sm" onClick={startReview}>
              <RotateCcw className="w-3 h-3 mr-1" />
              重新评价
            </Button>
          )}
          <Button variant="default" size="sm" onClick={handleClose}>
            <X className="w-3 h-3 mr-1" />
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
