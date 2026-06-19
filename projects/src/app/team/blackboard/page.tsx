'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, Plus, Heart, MessageCircle, Clock,
  Trash2, Send, X, Image as ImageIcon, Video, Loader2,
  ChevronDown, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useScrollPosition } from '@/hooks/use-scroll-position';

interface Team {
  id: string;
  code: string;
  name: string;
  currentThemeId?: string;
}

interface Post {
  id: string;
  team_id: string;
  theme_id: string;
  title: string;
  content: string;
  media_urls: string[];
  media_types: string[];
  status: string;
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
  teams: {
    id: string;
    name: string;
    code: string;
    school_name: string;
  };
  signed_media_urls: string[];
  is_liked: boolean;
  is_own: boolean;
}

interface Comment {
  id: string;
  post_id: string;
  team_id: string;
  content: string;
  created_at: string;
  teams: {
    id: string;
    name: string;
    code: string;
    school_name: string;
  };
}

type SortBy = 'created_at' | 'comment_count' | 'like_count';

const sortOptions: { value: SortBy; label: string; icon: any }[] = [
  { value: 'created_at', label: '最新发布', icon: Clock },
  { value: 'comment_count', label: '讨论热度', icon: MessageCircle },
  { value: 'like_count', label: '受欢迎度', icon: Heart },
];

/* ── 媒体网格组件：Twitter/X 风格 ── */
function MediaGrid({
  mediaUrls,
  mediaTypes,
  onImageClick,
}: {
  mediaUrls: string[];
  mediaTypes: string[];
  onImageClick: (url: string) => void;
}) {
  const count = mediaUrls.length;
  if (count === 0) return null;

  const renderItem = (url: string, idx: number, className: string) => {
    const isVideo = mediaTypes?.[idx] === 'video';
    return (
      <div key={idx} className={`relative overflow-hidden bg-gray-100 ${className}`}>
        {isVideo ? (
          <video
            src={url}
            controls
            className="w-full h-full object-cover"
            preload="metadata"
          />
        ) : (
          <img
            src={url}
            alt=""
            className="w-full h-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
            onClick={() => onImageClick(url)}
          />
        )}
      </div>
    );
  };

  // 1 image: full width, max height 400px
  if (count === 1) {
    return (
      <div className="mt-3 rounded-2xl overflow-hidden border border-gray-200">
        {renderItem(mediaUrls[0], 0, 'max-h-[400px]')}
      </div>
    );
  }

  // 2 images: side by side
  if (count === 2) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-gray-200">
        {renderItem(mediaUrls[0], 0, 'aspect-square')}
        {renderItem(mediaUrls[1], 1, 'aspect-square')}
      </div>
    );
  }

  // 3 images: 1 large left + 2 small right (Twitter style)
  if (count === 3) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-gray-200" style={{ height: '280px' }}>
        {renderItem(mediaUrls[0], 0, 'h-full')}
        <div className="flex flex-col gap-0.5 h-full">
          {renderItem(mediaUrls[1], 1, 'flex-1')}
          {renderItem(mediaUrls[2], 2, 'flex-1')}
        </div>
      </div>
    );
  }

  // 4+ images: 2x2 grid with "+N" overlay
  const displayUrls = mediaUrls.slice(0, 4);
  const extraCount = count - 4;

  return (
    <div className="mt-3 grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-gray-200">
      {displayUrls.map((url, idx) => (
        <div key={idx} className="relative aspect-square overflow-hidden bg-gray-100">
          {mediaTypes?.[idx] === 'video' ? (
            <video
              src={url}
              controls
              className="w-full h-full object-cover"
              preload="metadata"
            />
          ) : (
            <img
              src={url}
              alt=""
              className="w-full h-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
              onClick={() => onImageClick(url)}
            />
          )}
          {idx === 3 && extraCount > 0 && (
            <div
              className="absolute inset-0 bg-black/50 flex items-center justify-center cursor-pointer"
              onClick={() => onImageClick(url)}
            >
              <span className="text-white text-2xl font-bold">+{extraCount}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── 帖子卡片组件 ── */
function PostCard({
  post,
  teamName,
  onLike,
  onComment,
  onDelete,
  onImageClick,
}: {
  post: Post;
  teamName: string;
  onLike: () => void;
  onComment: () => void;
  onDelete: () => void;
  onImageClick: (url: string) => void;
}) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <article className="px-4 py-3 hover:bg-gray-50/80 transition-colors duration-150 border-b border-gray-200">
      <div className="flex gap-3">
        {/* 头像 */}
        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">
            {(post.teams?.name || '?').charAt(0)}
          </span>
        </div>

        {/* 主体 */}
        <div className="flex-1 min-w-0">
          {/* 头部：队名 + 时间 + 删除 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[15px] font-bold text-[#1a1a1a] truncate">
                {post.teams?.name || '未知小队'}
              </span>
              {post.teams?.school_name && (
                <span className="text-[13px] text-[#536471] truncate">
                  @{post.teams.school_name}
                </span>
              )}
              <span className="text-[#536471] text-[13px] shrink-0">·</span>
              <span className="text-[13px] text-[#536471] shrink-0">
                {formatDate(post.created_at)}
              </span>
            </div>
            {post.is_own && (
              <button
                className="ml-2 w-8 h-8 flex items-center justify-center rounded-full text-[#536471] hover:text-red-500 hover:bg-red-50 transition-colors duration-150 shrink-0"
                onClick={onDelete}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 标题作为内容首行粗体 */}
          {post.title && (
            <p className="text-[15px] font-bold text-[#1a1a1a] mt-0.5 leading-snug">
              {post.title}
            </p>
          )}

          {/* 内容 */}
          {post.content && (
            <p className="text-[15px] text-[#1a1a1a] mt-1 whitespace-pre-wrap leading-relaxed">
              {post.content}
            </p>
          )}

          {/* 媒体 */}
          {post.signed_media_urls && post.signed_media_urls.length > 0 && (
            <MediaGrid
              mediaUrls={post.signed_media_urls}
              mediaTypes={post.media_types || []}
              onImageClick={onImageClick}
            />
          )}

          {/* 互动栏 */}
          <div className="flex items-center justify-between mt-3 -ml-2 max-w-[300px]">
            {/* 评论 */}
            <button
              className="flex items-center gap-0.5 group"
              onClick={onComment}
            >
              <span className="w-9 h-9 flex items-center justify-center rounded-full text-[#536471] group-hover:text-blue-500 group-hover:bg-blue-50 transition-colors duration-150">
                <MessageCircle className="w-[18px] h-[18px]" />
              </span>
              {post.comment_count > 0 && (
                <span className="text-[13px] text-[#536471] group-hover:text-blue-500 transition-colors duration-150">
                  {post.comment_count}
                </span>
              )}
            </button>

            {/* 点赞 */}
            <button
              className="flex items-center gap-0.5 group"
              onClick={onLike}
            >
              <span className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors duration-150 ${
                post.is_liked
                  ? 'text-rose-500'
                  : 'text-[#536471] group-hover:text-rose-500 group-hover:bg-rose-50'
              }`}>
                <Heart className={`w-[18px] h-[18px] ${post.is_liked ? 'fill-current' : ''}`} />
              </span>
              {post.like_count > 0 && (
                <span className={`text-[13px] transition-colors duration-150 ${
                  post.is_liked ? 'text-rose-500' : 'text-[#536471] group-hover:text-rose-500'
                }`}>
                  {post.like_count}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function BlackboardPage() {
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 发帖弹窗
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // 评论弹窗
  const [showCommentsDialog, setShowCommentsDialog] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsPage, setCommentsPage] = useState(1);
  const [submittingComment, setSubmittingComment] = useState(false);

  // 删除确认弹窗
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [postToDelete, setPostToDelete] = useState<Post | null>(null);

  // 图片预览弹窗
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  useScrollPosition('team-blackboard');

  useEffect(() => {
    const teamData = localStorage.getItem('team');
    if (teamData) {
      try {
        setTeam(JSON.parse(teamData));
      } catch {
        router.push('/team/login');
      }
    } else {
      router.push('/team/login');
    }
  }, [router]);

  const loadPosts = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (!team?.id) return;

    try {
      if (pageNum === 1) setLoading(true);

      const res = await fetch(
        `/api/team/blackboard?team_id=${team.id}&sort_by=${sortBy}&page=${pageNum}&page_size=10`
      );
      const data = await res.json();

      if (data.success) {
        setPosts(prev => append ? [...prev, ...data.data.posts] : data.data.posts);
        setHasMore(data.data.hasMore);
        setPage(pageNum);
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [team?.id, sortBy]);

  useEffect(() => {
    if (team?.id) {
      loadPosts(1);
    }
  }, [team?.id, sortBy, loadPosts]);

  // 发帖
  const handleCreatePost = async () => {
    if (!team?.id) return;
    if (!newTitle.trim()) {
      toast.error('请输入标题');
      return;
    }
    if (!newContent.trim()) {
      toast.error('请输入内容');
      return;
    }

    setCreating(true);
    try {
      const formData = new FormData();
      formData.append('team_id', team.id);
      formData.append('title', newTitle.trim());
      formData.append('content', newContent.trim());

      for (const file of selectedFiles) {
        formData.append('files', file);
      }

      const res = await fetch('/api/team/blackboard', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        toast.success('发布成功');
        setShowCreateDialog(false);
        setNewTitle('');
        setNewContent('');
        setSelectedFiles([]);
        setFilePreviews([]);
        loadPosts(1);
      } else {
        toast.error(data.error || '发布失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setCreating(false);
    }
  };

  // 删除帖子
  const handleDeletePost = async () => {
    if (!postToDelete || !team?.id) return;

    try {
      const res = await fetch(
        `/api/team/blackboard/${postToDelete.id}?team_id=${team.id}`,
        { method: 'DELETE' }
      );
      const data = await res.json();

      if (data.success) {
        toast.success('帖子已删除');
        setShowDeleteDialog(false);
        setPostToDelete(null);
        loadPosts(1);
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    }
  };

  // 点赞/取消点赞
  const handleLike = async (post: Post) => {
    if (!team?.id) return;

    try {
      const res = await fetch(`/api/team/blackboard/${post.id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: team.id }),
      });
      const data = await res.json();

      if (data.success) {
        setPosts(prev =>
          prev.map(p =>
            p.id === post.id
              ? { ...p, is_liked: data.data.is_liked, like_count: data.data.like_count }
              : p
          )
        );
        if (selectedPost?.id === post.id) {
          setSelectedPost(prev =>
            prev ? { ...prev, is_liked: data.data.is_liked, like_count: data.data.like_count } : prev
          );
        }
      }
    } catch {
      toast.error('操作失败');
    }
  };

  // 加载评论
  const loadComments = async (postId: string, pageNum: number = 1, append: boolean = false) => {
    setCommentsLoading(true);
    try {
      const res = await fetch(
        `/api/team/blackboard/${postId}/comments?page=${pageNum}&page_size=20`
      );
      const data = await res.json();

      if (data.success) {
        setComments(prev => append ? [...prev, ...data.data.comments] : data.data.comments);
        setCommentsHasMore(data.data.hasMore);
        setCommentsPage(pageNum);
      }
    } catch {
      toast.error('加载评论失败');
    } finally {
      setCommentsLoading(false);
    }
  };

  // 打开评论弹窗
  const openComments = (post: Post) => {
    setSelectedPost(post);
    setShowCommentsDialog(true);
    setComments([]);
    loadComments(post.id);
  };

  // 提交评论
  const handleSubmitComment = async () => {
    if (!selectedPost || !team?.id || !commentText.trim()) return;

    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/team/blackboard/${selectedPost.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: team.id, content: commentText.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        setComments(prev => [...prev, data.data]);
        setCommentText('');
        setPosts(prev =>
          prev.map(p =>
            p.id === selectedPost.id
              ? { ...p, comment_count: (p.comment_count || 0) + 1 }
              : p
          )
        );
        setSelectedPost(prev =>
          prev ? { ...prev, comment_count: (prev.comment_count || 0) + 1 } : prev
        );
        toast.success('评论成功');
      } else {
        toast.error(data.error || '评论失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmittingComment(false);
    }
  };

  // 选择文件
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles: File[] = [];
    const previews: string[] = [];

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`文件 ${file.name} 超过10MB限制`);
        continue;
      }
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        toast.error(`文件 ${file.name} 格式不支持`);
        continue;
      }
      validFiles.push(file);
      previews.push(URL.createObjectURL(file));
    }

    const allFiles = [...selectedFiles, ...validFiles].slice(0, 9);
    const allPreviews = [...filePreviews, ...previews].slice(0, 9);

    setSelectedFiles(allFiles);
    setFilePreviews(allPreviews);
  };

  // 移除文件
  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setFilePreviews(prev => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  if (!team) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* 顶部导航 */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-[600px] mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors duration-150"
              onClick={() => router.push('/team/dashboard')}
            >
              <ArrowLeft className="w-5 h-5 text-[#1a1a1a]" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-rose-500 to-orange-500 rounded-[10px] flex items-center justify-center">
                <span className="text-white text-sm">📝</span>
              </div>
              <h1 className="text-lg font-bold text-[#1a1a1a]">家乡黑板报</h1>
            </div>
          </div>
          <button
            className="bg-gradient-to-r from-rose-500 to-orange-500 text-white text-sm font-bold px-4 py-2 rounded-full hover:opacity-90 transition-opacity duration-150"
            onClick={() => setShowCreateDialog(true)}
          >
            发帖
          </button>
        </div>
      </nav>

      {/* 排序栏 */}
      <div className="max-w-[600px] mx-auto px-4 pt-3 pb-1">
        <div className="flex items-center gap-1">
          {sortOptions.map(option => (
            <button
              key={option.value}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-150 ${
                sortBy === option.value
                  ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white'
                  : 'text-[#536471] hover:bg-gray-100'
              }`}
              onClick={() => setSortBy(option.value)}
            >
              <option.icon className="w-3.5 h-3.5" />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* 帖子列表 */}
      <div className="max-w-[600px] mx-auto">
        {loading && posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500 mb-4"></div>
            <p className="text-[#536471]">加载中...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <MessageCircle className="w-10 h-10 text-gray-300" />
            </div>
            <p className="text-[#1a1a1a] text-lg font-bold">暂无帖子</p>
            <p className="text-[#536471] text-sm mt-1">成为第一个发帖的小队吧！</p>
            <button
              className="mt-4 bg-gradient-to-r from-rose-500 to-orange-500 text-white text-sm font-bold px-5 py-2.5 rounded-full hover:opacity-90 transition-opacity duration-150"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="w-4 h-4 inline mr-1" />
              发布第一条帖子
            </button>
          </div>
        ) : (
          <>
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                teamName={team.name}
                onLike={() => handleLike(post)}
                onComment={() => openComments(post)}
                onDelete={() => {
                  setPostToDelete(post);
                  setShowDeleteDialog(true);
                }}
                onImageClick={(url) => {
                  setPreviewUrl(url);
                  setShowImagePreview(true);
                }}
              />
            ))}

            {/* 加载更多 */}
            {hasMore && (
              <div className="flex justify-center py-4 border-b border-gray-200">
                <button
                  className="flex items-center gap-1 text-sm text-rose-500 hover:text-rose-600 font-medium transition-colors duration-150"
                  onClick={() => loadPosts(page + 1, true)}
                >
                  <ChevronDown className="w-4 h-4" />
                  加载更多
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 发帖弹窗：Twitter 风格 ── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>发布帖子</DialogTitle>
          </DialogHeader>
          {/* 顶部栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <button
              className="text-[15px] text-[#1a1a1a] font-medium hover:opacity-70 transition-opacity"
              onClick={() => setShowCreateDialog(false)}
            >
              取消
            </button>
            <button
              className="bg-gradient-to-r from-rose-500 to-orange-500 text-white text-sm font-bold px-4 py-1.5 rounded-full hover:opacity-90 transition-opacity disabled:opacity-50"
              onClick={handleCreatePost}
              disabled={creating || !newTitle.trim() || !newContent.trim()}
            >
              {creating ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  发布中
                </span>
              ) : (
                '发布'
              )}
            </button>
          </div>

          {/* 内容区 */}
          <div className="p-4">
            {/* 头像 + 队名 */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-bold">
                  {team.name.charAt(0)}
                </span>
              </div>
              <div>
                <p className="text-[15px] font-bold text-[#1a1a1a]">{team.name}</p>
              </div>
            </div>

            {/* 标题输入 */}
            <input
              type="text"
              placeholder="帖子标题"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              maxLength={50}
              className="w-full text-[15px] font-bold text-[#1a1a1a] placeholder-gray-400 outline-none border-none bg-transparent mb-2"
            />

            {/* 内容输入 */}
            <Textarea
              placeholder="分享你们的探索发现..."
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              rows={5}
              maxLength={500}
              className="w-full text-[15px] text-[#1a1a1a] placeholder-gray-400 resize-none border-none shadow-none focus-visible:ring-0 p-0 bg-transparent"
            />

            {/* 媒体预览 */}
            {filePreviews.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {filePreviews.map((preview, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden bg-gray-100">
                    {selectedFiles[idx]?.type.startsWith('video/') ? (
                      <div className="w-full h-full flex items-center justify-center bg-gray-200">
                        <Video className="w-6 h-6 text-gray-400" />
                      </div>
                    ) : (
                      <img src={preview} alt="" className="w-full h-full object-cover" />
                    )}
                    <button
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                      onClick={() => removeFile(idx)}
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 底部工具栏 */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
              <div className="flex items-center gap-1">
                <button
                  className="w-9 h-9 flex items-center justify-center rounded-full text-rose-500 hover:bg-rose-50 transition-colors duration-150"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
                <button
                  className="w-9 h-9 flex items-center justify-center rounded-full text-rose-500 hover:bg-rose-50 transition-colors duration-150"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Video className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                {/* 字数统计 */}
                <div className="flex items-center">
                  <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
                    <circle
                      cx="12" cy="12" r="10"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="2"
                    />
                    <circle
                      cx="12" cy="12" r="10"
                      fill="none"
                      stroke={newTitle.length + newContent.length > 450 ? '#ef4444' : '#f43f5e'}
                      strokeWidth="2"
                      strokeDasharray={`${Math.min(((newTitle.length + newContent.length) / 550) * 62.8, 62.8)} 62.8`}
                      strokeLinecap="round"
                    />
                  </svg>
                  {(newTitle.length + newContent.length) > 450 && (
                    <span className="text-xs text-red-500 ml-1">
                      {550 - newTitle.length - newContent.length}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* 发帖须知 */}
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-700">
                  <p className="font-medium mb-1">发帖须知</p>
                  <ul className="space-y-0.5 list-disc list-inside">
                    <li>请勿发布个人隐私信息（姓名、联系方式、住址等）</li>
                    <li>请勿使用不文明用语</li>
                    <li>分享积极向上的学习内容</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 评论弹窗：Twitter 风格 ── */}
      <Dialog open={showCommentsDialog} onOpenChange={setShowCommentsDialog}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh]">
          <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: 0 }}>
            <DialogTitle>帖子评论</DialogTitle>
          </span>
          {/* 顶部栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
            <button
              className="text-[15px] text-[#1a1a1a] font-medium hover:opacity-70 transition-opacity"
              onClick={() => setShowCommentsDialog(false)}
            >
              关闭
            </button>
            <h2 className="text-[15px] font-bold text-[#1a1a1a]">
              评论
            </h2>
            <div className="w-10" /> {/* 占位对齐 */}
          </div>

          {/* 帖子全文 */}
          {selectedPost && (
            <div className="px-4 py-3 border-b border-gray-200 shrink-0">
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white text-sm font-bold">
                    {(selectedPost.teams?.name || '?').charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[15px] font-bold text-[#1a1a1a]">
                      {selectedPost.teams?.name || '未知小队'}
                    </span>
                    {selectedPost.teams?.school_name && (
                      <span className="text-[13px] text-[#536471]">
                        @{selectedPost.teams.school_name}
                      </span>
                    )}
                    <span className="text-[#536471] text-[13px]">·</span>
                    <span className="text-[13px] text-[#536471]">
                      {formatDate(selectedPost.created_at)}
                    </span>
                  </div>
                  {selectedPost.title && (
                    <p className="text-[15px] font-bold text-[#1a1a1a] mt-0.5">
                      {selectedPost.title}
                    </p>
                  )}
                  <p className="text-[15px] text-[#1a1a1a] mt-1 whitespace-pre-wrap">
                    {selectedPost.content}
                  </p>
                  {/* 帖子媒体 */}
                  {selectedPost.signed_media_urls && selectedPost.signed_media_urls.length > 0 && (
                    <MediaGrid
                      mediaUrls={selectedPost.signed_media_urls}
                      mediaTypes={selectedPost.media_types || []}
                      onImageClick={(url) => {
                        setPreviewUrl(url);
                        setShowImagePreview(true);
                      }}
                    />
                  )}
                  {/* 帖子互动数据 */}
                  <div className="flex items-center gap-4 mt-2 pt-2 border-t border-gray-100">
                    <span className="text-[13px] text-[#536471]">
                      <span className="font-bold text-[#1a1a1a]">{selectedPost.like_count}</span> 赞
                    </span>
                    <span className="text-[13px] text-[#536471]">
                      <span className="font-bold text-[#1a1a1a]">{selectedPost.comment_count}</span> 评论
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 评论列表 */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {commentsLoading && comments.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8 text-[#536471] text-sm">
                暂无评论，来说点什么吧
              </div>
            ) : (
              <>
                {comments.map(comment => (
                  <div key={comment.id} className="px-4 py-3 hover:bg-gray-50/80 transition-colors duration-150 border-b border-gray-100">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-white text-xs font-bold">
                          {(comment.teams?.name || '?').charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-[14px] font-bold text-[#1a1a1a]">
                            {comment.teams?.name || '未知小队'}
                          </span>
                          {comment.teams?.school_name && (
                            <span className="text-[12px] text-[#536471]">
                              @{comment.teams.school_name}
                            </span>
                          )}
                          <span className="text-[#536471] text-[12px]">·</span>
                          <span className="text-[12px] text-[#536471]">
                            {formatDate(comment.created_at)}
                          </span>
                        </div>
                        <p className="text-[15px] text-[#1a1a1a] mt-0.5">{comment.content}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {commentsHasMore && (
                  <div className="text-center py-3">
                    <button
                      className="text-sm text-rose-500 hover:text-rose-600 font-medium"
                      onClick={() => loadComments(selectedPost!.id, commentsPage + 1, true)}
                    >
                      加载更多评论
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 评论输入 */}
          <div className="px-4 py-3 border-t border-gray-200 shrink-0">
            <div className="flex gap-3 items-end">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">
                  {team.name.charAt(0)}
                </span>
              </div>
              <div className="flex-1 flex items-end gap-2">
                <Textarea
                  placeholder="说点什么..."
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  maxLength={200}
                  rows={1}
                  className="flex-1 text-[15px] resize-none border-none shadow-none focus-visible:ring-0 p-0 bg-transparent placeholder:text-gray-400 min-h-[24px]"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmitComment();
                    }
                  }}
                />
                <button
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-orange-500 text-white hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
                  onClick={handleSubmitComment}
                  disabled={submittingComment || !commentText.trim()}
                >
                  {submittingComment ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#536471]">
            确定要删除帖子「{postToDelete?.title}」吗？删除后不可恢复。
          </p>
          <div className="flex justify-end gap-3 mt-2">
            <button
              className="px-4 py-2 text-sm font-medium text-[#1a1a1a] hover:bg-gray-100 rounded-full transition-colors duration-150"
              onClick={() => setShowDeleteDialog(false)}
            >
              取消
            </button>
            <button
              className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-full transition-colors duration-150"
              onClick={handleDeletePost}
            >
              确认删除
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 图片预览弹窗 */}
      <Dialog open={showImagePreview} onOpenChange={setShowImagePreview}>
        <DialogContent className="max-w-3xl p-2 bg-black/90 border-none">
          <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: 0 }}>
            <DialogTitle>图片预览</DialogTitle>
          </span>
          <img src={previewUrl} alt="" className="w-full h-auto max-h-[80vh] object-contain rounded-lg" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
