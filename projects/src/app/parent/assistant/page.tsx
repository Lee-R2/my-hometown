'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  ArrowLeft, Send, Loader2, MessageCircle, RefreshCw, Trash2, Sparkles,
  ChevronRight, Lightbulb
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestedQuestions?: string[];
}

export default function ParentAssistantPage() {
  const router = useRouter();
  const [parent, setParent] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `parent_${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedParent = localStorage.getItem('parent');
    if (!savedParent) {
      router.push('/parent/login');
      return;
    }
    setParent(JSON.parse(savedParent));
  }, [router]);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  // 发送消息
  const handleSend = async (question?: string) => {
    const userMessage = question || inputMessage.trim();
    if (!userMessage || loading) return;
    
    setInputMessage('');
    
    // 添加用户消息
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    }]);
    
    setLoading(true);
    
    try {
      const res = await fetch('/api/admin/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: parent.id,
          userRole: 'parent',
          message: userMessage,
          history: messages.slice(-20).map(m => ({
            role: m.role,
            content: m.content
          })),
          sessionId
        })
      });
      
      const data = await res.json();
      
      if (data.error) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `抱歉，遇到了问题：${data.error}`,
          timestamp: new Date()
        }]);
      } else if (data.message) {
        // 解析推荐问题
        const { mainContent, questions } = parseSuggestedQuestions(data.message);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: mainContent,
          timestamp: new Date(),
          suggestedQuestions: questions
        }]);
      }
    } catch (err) {
      console.error('发送消息失败:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '网络连接失败，请稍后重试。',
        timestamp: new Date()
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // 处理回车发送
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 清除对话
  const handleClear = () => {
    setMessages([]);
  };

  // 欢迎语（带推荐问题）
  useEffect(() => {
    if (parent && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `您好！我是蜡象助手，很高兴为您服务！

作为家长，您可以通过我了解以下信息：

📋 关于孩子小队的信息：
• 小队的名称、口号、积分
• 孩子在小队中的分工
• 任务完成进度

📚 关于学习内容：
• 当前探索的主题
• 已完成的阶段任务
• 技能学习情况

💬 关于项目疑问：
• 项目整体介绍
• 各主题的含义
• 任务设计的初衷

请随时向我提问，我会尽力为您解答！`,
        timestamp: new Date(),
        suggestedQuestions: [
          '查看我家孩子所在小队的基本信息',
          '小队现在在做什么任务？',
          '这个主题对孩子有什么教育意义？'
        ]
      }]);
    }
  }, [parent]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white pb-24">
      {/* 顶部导航 */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/parent/dashboard')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            <h1 className="font-semibold">蜡象助手</h1>
          </div>
          <div className="flex-1" />
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClear}
            disabled={messages.length <= 1}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6">
        <div className="space-y-4">
          {messages.map((msg, index) => (
            <div key={index}>
              <div 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user' 
                      ? 'bg-violet-500 text-white rounded-br-md' 
                      : 'bg-white shadow-md text-gray-800 rounded-bl-md'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </div>
                  <div className={`text-xs mt-1 ${
                    msg.role === 'user' ? 'text-violet-100' : 'text-gray-400'
                  }`}>
                    {msg.timestamp.toLocaleTimeString('zh-CN', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                </div>
              </div>
              
              {/* 推荐问题展示 */}
              {msg.role === 'assistant' && msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                <div className="mt-3 ml-2 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <span>您可能还想了解：</span>
                  </div>
                  <div className="space-y-2">
                    {msg.suggestedQuestions.map((q, qIndex) => (
                      <button
                        key={qIndex}
                        onClick={() => handleSend(q)}
                        disabled={loading}
                        className="w-full text-left bg-white border border-violet-100 rounded-xl px-4 py-3 hover:bg-violet-50 hover:border-violet-200 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 text-xs flex items-center justify-center font-medium group-hover:bg-violet-500 group-hover:text-white transition-colors">
                            {qIndex + 1}
                          </span>
                          <span className="text-sm text-gray-700 flex-1">{q}</span>
                          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-violet-500 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {/* 加载指示器 */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white shadow-md rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">蜡象助手正在思考...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入框 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="请输入您的问题..."
              disabled={loading}
              className="flex-1"
            />
            <Button 
              onClick={() => handleSend()} 
              disabled={loading || !inputMessage.trim()}
              className="bg-violet-500 hover:bg-violet-600"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            蜡象助手可以回答关于小队、任务、学习内容等方面的问题
          </p>
        </div>
      </div>
    </div>
  );
}
