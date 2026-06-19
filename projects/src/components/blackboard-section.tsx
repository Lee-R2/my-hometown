'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Plus, Heart, MessageCircle, Trash2, Send, ImageIcon, Video, X, ChevronDown, ChevronRight, Newspaper } from 'lucide-react';

interface Post {
  id: string;
  team_id: string;
  theme_id: string;
  title: string;
  content: string;
  media_urls: string[];
  media_types: string[];
  status: string;
  is_deleted: boolean;
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
  teams?: { id: string; name: string; code: string };
  themes?: { id: string; name: string };
  signed_media_urls?: string[];
  is_liked?: boolean;
}

interface Comment {
  id: string;
  post_id: string;
  team_id: string;
  content: string;
  reply_to_id?: string;
  is_admin?: boolean;
  admin_info?: { name: string; role: string; role_label: string; school_name: string; anonymous_identity?: string } | null;
  anonymous_identity?: string;
  like_count?: number;
  is_liked?: boolean;
  created_at: string;
  teams?: { id: string; name: string; code: string };
  reply_to?: { id: string; content: string; team_id: string; is_admin?: boolean; admin_info?: { name: string; role: string; role_label: string; school_name: string; anonymous_identity?: string } | null; teams?: { id: string; name: string; code: string } } | null;
}

// 未读状态存储键
const getStorageKey = (teamId: string) => `bb_viewed_${teamId}`;

// 获取已查看的帖子计数快照
function getViewedCounts(teamId: string): Record<string, { comment_count: number; like_count: number } | number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(getStorageKey(teamId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// 保存已查看的帖子计数快照
function saveViewedCounts(teamId: string, counts: Record<string, { comment_count: number; like_count: number } | number>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(teamId), JSON.stringify(counts));
  } catch {
    // ignore
  }
}

// 计算单个帖子的未读数，并自动建立基线快照
function getPostUnread(post: Post, viewedCounts: Record<string, { comment_count: number; like_count: number } | number>, currentTeamId: string): number {
  const viewed = viewedCounts[post.id];
  // 跳过 __total_posts 等非帖子条目
  if (!viewed || typeof viewed === 'number') {
    // 没有基线快照时自动建立：
    // 自己的帖子：基线为(0,0)，这样别人的评论/点赞都会产生未读
    // 他人的帖子：基线为当前计数，只计算之后的新增
    if (post.team_id === currentTeamId) {
      viewedCounts[post.id] = { comment_count: 0, like_count: 0 };
    } else {
      viewedCounts[post.id] = { comment_count: post.comment_count || 0, like_count: post.like_count || 0 };
    }
    return 0; // 第一次建立基线不算未读
  }
  const newComments = Math.max(0, (post.comment_count || 0) - viewed.comment_count);
  const newLikes = Math.max(0, (post.like_count || 0) - viewed.like_count);
  return newComments + newLikes;
}

export default function BlackboardSection({ teamId, teamCode }: { teamId: string; teamCode: string }) {
  const [hasLoaded, setHasLoaded] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'created_at' | 'comment_count' | 'like_count'>('created_at');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // 未读通知状态
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [newPostIds, setNewPostIds] = useState<Set<string>>(new Set());

  // 发帖
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newMediaFiles, setNewMediaFiles] = useState<File[]>([]);
  const [newMediaPreviews, setNewMediaPreviews] = useState<string[]>([]);
  const [newMediaTypes, setNewMediaTypes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 详情弹窗
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [detailComments, setDetailComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  // 删除确认
  const [showDelete, setShowDelete] = useState(false);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);

  // 图片预览
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  // 计算未读数
  const computeUnread = useCallback((postsData: Post[], totalCount?: number) => {
    const viewedCounts = getViewedCounts(teamId);
    const map: Record<string, number> = {};
    let commentLikeUnread = 0;
    const newIds = new Set<string>();

    // 1. 计算每个帖子的评论/点赞未读
    for (const post of postsData) {
      const unread = getPostUnread(post, viewedCounts, teamId);
      map[post.id] = unread;
      commentLikeUnread += unread;
    }

    // 2. 计算新帖子未读数（他人发的新帖，自己还没看过）
    const viewedTotal = typeof viewedCounts.__total_posts === 'number' ? viewedCounts.__total_posts : -1;
    const currentTotal = totalCount ?? postsData.length;
    let newPostCount = 0;
    if (viewedTotal === -1) {
      // 首次访问：初始化总帖子数，不算未读
      viewedCounts.__total_posts = currentTotal;
    } else if (currentTotal > viewedTotal) {
      newPostCount = currentTotal - viewedTotal;
      // 找出不在 viewedCounts 中的他人帖子（新帖子）
      const newPosts = postsData.filter(p => p.team_id !== teamId && !(p.id in viewedCounts));
      for (const p of newPosts) {
        newIds.add(p.id);
      }
    }

    // 保存自动建立的基线快照
    saveViewedCounts(teamId, viewedCounts);
    setUnreadMap(map);
    setTotalUnread(commentLikeUnread + newPostCount);
    setNewPostIds(newIds);
  }, [teamId]);

  // 加载所有帖子计数（折叠状态下用于计算未读气泡）- 轻量请求获取所有帖子id和计数
  const loadUnreadCounts = useCallback(async () => {
    if (!teamId) return;
    try {
      // 请求大page_size获取所有帖子（只需要计数字段）
      const params = new URLSearchParams({
        team_id: teamId,
        sort_by: 'created_at',
        page: '1',
        page_size: '100',
      });
      const res = await fetch(`/api/team/blackboard?${params}`);
      const data = await res.json();
      if (data.success) {
        const allPosts: Post[] = data.data.posts || [];
        const totalPosts = data.data.total || allPosts.length;
        computeUnread(allPosts, totalPosts);
      }
    } catch {
      // ignore
    }
  }, [teamId, computeUnread]);

  const loadPosts = useCallback(async (pageNum = 1, append = false) => {
    try {
      if (pageNum === 1) setLoading(true);
      const params = new URLSearchParams({
        team_id: teamId,
        sort_by: sortBy,
        page: String(pageNum),
        page_size: '10',
      });
      const res = await fetch(`/api/team/blackboard?${params}`);
      const data = await res.json();
      if (data.success) {
        const newPosts = data.data.posts || [];
        setPosts(append ? prev => [...prev, ...newPosts] : newPosts);
        setTotal(data.data.total || 0);
        setHasMore(data.data.hasMore || false);
        setPage(pageNum);
        // 更新已查看的帖子总数（展开查看后标记为已读）
        if (pageNum === 1 && !append) {
          const viewedCounts = getViewedCounts(teamId);
          viewedCounts.__total_posts = data.data.total || newPosts.length;
          saveViewedCounts(teamId, viewedCounts);
          loadUnreadCounts();
        }
      }
    } catch (err) {
      console.error('加载黑板报失败:', err);
    } finally {
      setLoading(false);
    }
  }, [teamId, sortBy, computeUnread]);

  // 组件挂载时加载未读计数（即使折叠状态）
  useEffect(() => {
    loadUnreadCounts();
  }, [loadUnreadCounts]);

  // 每30秒刷新未读
  useEffect(() => {
    const timer = setInterval(loadUnreadCounts, 30000);
    return () => clearInterval(timer);
  }, [loadUnreadCounts]);

  // 展开时加载数据
  useEffect(() => {
    if (!isCollapsed && !hasLoaded) {
      loadPosts();
      setHasLoaded(true);
    }
  }, [isCollapsed, hasLoaded, loadPosts]);

  // 展开时重新加载
  const handleExpand = () => {
    setIsCollapsed(!isCollapsed);
    if (isCollapsed) {
      loadPosts();
    }
  };

  // 切换排序
  const handleSortChange = (newSort: typeof sortBy) => {
    setSortBy(newSort);
    setPosts([]);
    setPage(1);
  };

  // 排序变化时重新加载
  useEffect(() => {
    if (!isCollapsed && hasLoaded) {
      loadPosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy]);

  // 添加图片
  const handleAddImages = () => {
    const currentImageCount = newMediaTypes.filter(t => t === 'image').length;
    const remaining = 6 - currentImageCount;
    if (remaining <= 0) {
      alert('最多添加6张图片');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      const oversized = files.filter(f => f.size > 10 * 1024 * 1024);
      if (oversized.length > 0) {
        alert('单个文件不能超过10MB');
        return;
      }
      const available = 6 - currentImageCount;
      const toAdd = files.slice(0, available);
      if (files.length > available) {
        alert(`最多添加6张图片，已选${available}张`);
      }
      const previews = toAdd.map(f => URL.createObjectURL(f));
      const types = toAdd.map(() => 'image');
      setNewMediaFiles(prev => [...prev, ...toAdd]);
      setNewMediaPreviews(prev => [...prev, ...previews]);
      setNewMediaTypes(prev => [...prev, ...types]);
    };
    input.click();
  };

  // 添加视频
  const handleAddVideo = () => {
    const hasVideo = newMediaTypes.includes('video');
    if (hasVideo) {
      alert('最多添加1段视频');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.multiple = false;
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        alert('视频不能超过10MB');
        return;
      }
      const preview = URL.createObjectURL(file);
      setNewMediaFiles(prev => [...prev, file]);
      setNewMediaPreviews(prev => [...prev, preview]);
      setNewMediaTypes(prev => [...prev, 'video']);
    };
    input.click();
  };

  // 移除文件
  const removeFile = (idx: number) => {
    setNewMediaFiles(prev => prev.filter((_, i) => i !== idx));
    setNewMediaPreviews(prev => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
    setNewMediaTypes(prev => prev.filter((_, i) => i !== idx));
  };

  // 发帖
  const handleSubmit = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSubmitting(true);
    try {
      let uploadedKeys: string[] = [];
      // 逐个上传文件到对象存储
      for (let i = 0; i < newMediaFiles.length; i++) {
        const file = newMediaFiles[i];
        const uploadType = newMediaTypes[i] === 'video' ? 'video' : 'image';
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await fetch(`/api/upload?type=${uploadType}`, {
          method: 'POST',
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success && uploadData.key) {
          uploadedKeys.push(uploadData.key);
        } else {
          console.error('文件上传失败:', file.name, uploadData.error);
        }
      }
      const res = await fetch('/api/team/blackboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: teamId,
          title: newTitle.trim(),
          content: newContent.trim(),
          media_urls: uploadedKeys,
          media_types: newMediaTypes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreate(false);
        setNewTitle('');
        setNewContent('');
        setNewMediaFiles([]);
        setNewMediaPreviews([]);
        setNewMediaTypes([]);
        loadPosts();
        loadUnreadCounts(); // 刷新未读计数，新帖子会自动建立(0,0)基线
      } else {
        alert(data.error || '发帖失败');
      }
    } catch (err) {
      console.error('发帖失败:', err);
      alert('发帖失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // 删除帖子
  const handleDeletePost = async () => {
    if (!deletePostId) return;
    try {
      const res = await fetch(`/api/team/blackboard/${deletePostId}?team_id=${teamId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setShowDelete(false);
        setDeletePostId(null);
        setSelectedPost(null);
        loadPosts();
      } else {
        alert(data.error || '删除失败');
      }
    } catch {
      alert('删除失败');
    }
  };

  // 点赞
  const handleLike = async (postId: string) => {
    try {
      const res = await fetch(`/api/team/blackboard/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId }),
      });
      const data = await res.json();
      if (data.success) {
        const isLiked = data.data.is_liked;
        const newCount = data.data.like_count;
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, like_count: newCount ?? p.like_count, is_liked: isLiked } : p));
        setSelectedPost(prev => prev && prev.id === postId ? { ...prev, like_count: newCount ?? prev.like_count, is_liked: isLiked } : prev);
      }
    } catch {
      // ignore
    }
  };

  // 评论点赞
  const handleCommentLike = async (commentId: string) => {
    try {
      const res = await fetch(`/api/team/blackboard/comments/${commentId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId }),
      });
      const data = await res.json();
      if (data.is_liked !== undefined) {
        const isLiked = data.is_liked;
        const newLikeCount = data.like_count;
        setDetailComments(prev => prev.map(c => {
          if (c.id === commentId) {
            return { ...c, is_liked: isLiked, like_count: newLikeCount };
          }
          // 同时更新回复中的点赞
          if (c.reply_to && c.reply_to.id === commentId) {
            return { ...c, reply_to: { ...c.reply_to, is_liked: isLiked, like_count: newLikeCount } };
          }
          return c;
        }));
      }
    } catch {
      // ignore
    }
  };

  // 打开详情 - 标记该帖子为已读
  const openDetail = async (post: Post) => {
    setSelectedPost(post);
    setDetailComments([]);
    setNewComment('');
    setReplyTo(null);

    // 标记已读：将当前计数存入localStorage
    const viewedCounts = getViewedCounts(teamId);
    viewedCounts[post.id] = { comment_count: post.comment_count || 0, like_count: post.like_count || 0 };
    saveViewedCounts(teamId, viewedCounts);

    // 清除该帖子的新帖标记和未读气泡
    setNewPostIds(prev => { const next = new Set(prev); next.delete(post.id); return next; });
    setUnreadMap(prev => { const next = { ...prev }; delete next[post.id]; return next; });
    setTotalUnread(prev => Math.max(0, prev - (unreadMap[post.id] || 0) - (newPostIds.has(post.id) ? 1 : 0)));

    // 清除该帖子的未读气泡
    setUnreadMap(prev => {
      const next = { ...prev };
      delete next[post.id];
      return next;
    });
    setTotalUnread(prev => Math.max(0, prev - (unreadMap[post.id] || 0)));

    // 加载评论
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/team/blackboard/${post.id}/comments?liker_id=${teamId}`);
      const data = await res.json();
      if (data.success) {
        setDetailComments(data.data.comments || []);
      }
    } catch {
      // ignore
    } finally {
      setCommentsLoading(false);
    }
  };

  // 发送评论
  // 获取评论者显示名称
  const getCommenterName = (comment: any) => {
    if (comment.is_admin) {
      // 优先使用匿名身份：仅显示匿名名称
      if (comment.anonymous_identity) return comment.anonymous_identity;
      // 真实身份：学校名 + 姓名
      if (comment.admin_info) {
        const info = comment.admin_info;
        const schoolPrefix = info.school_name ? `${info.school_name} ` : '';
        return `${schoolPrefix}${info.name}`;
      }
    }
    // 向后兼容：旧的管理员评论在内容中有 [管理员] 前缀
    if (comment.content?.startsWith('[管理员]')) {
      const match = comment.content.match(/^\[管理员\]\s*(.+?)：/);
      if (match) return match[1];
      return '管理员';
    }
    return comment.teams?.name || '未知小队';
  };

  // 获取管理员评论的身份标签
  const getAdminBadge = (comment: any) => {
    if (!comment.is_admin && !comment.content?.startsWith('[管理员]')) return null;
    // 匿名身份时显示角色标签（不重复显示匿名名称）
    if (comment.admin_info) {
      return (comment.admin_info.role === 'admin' || comment.admin_info.role === 'super_admin') ? '超级管理员' : comment.admin_info.role_label || '管理员';
    }
    return '管理员';
  };

  // 获取评论实际内容（剥离旧格式的管理员前缀）
  const getCommentContent = (comment: any) => {
    if (comment.is_admin) return comment.content;
    // 向后兼容：旧的管理员评论格式 "[管理员] XXX：实际内容"
    if (comment.content?.startsWith('[管理员]')) {
      const match = comment.content.match(/^\[管理员\]\s*.+?：(.+)/);
      if (match) return match[1];
    }
    return comment.content;
  };

  const handleSendComment = async () => {
    if (!newComment.trim() || !selectedPost) return;
    setCommentSubmitting(true);
    try {
      const body: any = { team_id: teamId, content: newComment.trim() };
      if (replyTo) {
        body.reply_to_id = replyTo.id;
      }
      const res = await fetch(`/api/team/blackboard/${selectedPost.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setNewComment('');
        setReplyTo(null);
        // 重新加载评论
        const commentsRes = await fetch(`/api/team/blackboard/${selectedPost.id}/comments?liker_id=${teamId}`);
        const commentsData = await commentsRes.json();
        if (commentsData.success) {
          setDetailComments(commentsData.data.comments || []);
        }
        // 更新评论数
        setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comment_count: p.comment_count + 1 } : p));
        setSelectedPost(prev => prev ? { ...prev, comment_count: prev.comment_count + 1 } : prev);
        // 更新已读快照（自己的评论也算已读）
        const viewedCounts = getViewedCounts(teamId);
        viewedCounts[selectedPost.id] = {
          comment_count: (selectedPost.comment_count || 0) + 1,
          like_count: selectedPost.like_count || 0,
        };
        saveViewedCounts(teamId, viewedCounts);
      } else {
        alert(data.error || '评论失败');
      }
    } catch {
      alert('评论失败');
    } finally {
      setCommentSubmitting(false);
    }
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  // 头像渐变色生成
  const getAvatarGradient = (name: string) => {
    const gradients = [
      'from-blue-400 to-blue-600',
      'from-emerald-400 to-teal-600',
      'from-violet-400 to-purple-600',
      'from-rose-400 to-pink-600',
      'from-amber-400 to-orange-500',
      'from-cyan-400 to-sky-600',
      'from-fuchsia-400 to-pink-600',
      'from-lime-400 to-green-600',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return gradients[Math.abs(hash) % gradients.length];
  };

  // 媒体网格布局
  const getMediaGridClass = (count: number) => {
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    return 'grid-cols-3';
  };

  if (!teamId) return null;

  return (
    <div className="mt-4">
      {/* 折叠头部 - 始终可见 */}
      <div
        className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-sky-400 to-blue-500 rounded-lg flex items-center justify-center">
            <Newspaper className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[#1a1a1a]">家乡黑板报</h2>
              {totalUnread > 0 && (
                <span className="min-w-[16px] h-[16px] px-1 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-[#536471] mt-0.5">
              <span className="flex items-center gap-1">
                <Newspaper className="w-3 h-3 text-blue-400" />
                {total} 帖
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="w-3 h-3 text-sky-400" />
                {posts.reduce((sum, p) => sum + (p.comment_count || 0), 0)} 评
              </span>
              <span className="flex items-center gap-1">
                <Heart className="w-3 h-3 text-rose-400" />
                {posts.reduce((sum, p) => sum + (p.like_count || 0), 0)} 赞
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isCollapsed && (
            <Button
              size="sm"
              className="rounded-full bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white text-xs font-medium gap-1 h-7 px-3 shadow-none"
              onClick={(e) => { e.stopPropagation(); setShowCreate(true); }}
            >
              <Plus className="w-3 h-3" />发帖
            </Button>
          )}
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4 text-[#536471]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#536471]" />
          )}
        </div>
      </div>

      {/* 展开内容 */}
      {!isCollapsed && (
        <>
          {/* 排序标签 - pill形状 */}
          <div className="flex gap-1.5 mt-3 mb-3">
            {([
              { key: 'created_at', label: '最新发布' },
              { key: 'comment_count', label: '讨论热度' },
              { key: 'like_count', label: '受欢迎度' },
            ] as const).map(s => (
              <button
                key={s.key}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                  sortBy === s.key
                    ? 'bg-[#1d9bf0] text-white shadow-sm'
                    : 'bg-gray-100 text-[#536471] hover:bg-gray-200'
                }`}
                onClick={() => handleSortChange(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* 帖子Feed */}
          {loading && posts.length === 0 ? (
            <div className="text-center py-12 text-[#536471]">
              <div className="animate-pulse text-sm">加载中...</div>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-[#536471]">
              <p className="text-sm">暂无帖子，来发第一条吧！</p>
            </div>
          ) : (
            <div className="space-y-0">
              {posts.map(post => {
                const unread = unreadMap[post.id] || 0;
                const isNew = newPostIds.has(post.id);
            const teamName = post.teams?.name || '未知小队';
            const mediaUrls = post.signed_media_urls?.filter((url: string) => url) || [];
            const hasMedia = mediaUrls.length > 0;

            return (
              <div
                key={post.id}
                className="relative bg-white border-b border-gray-100 hover:bg-gray-50/50 transition-colors duration-150"
              >
                {/* 左侧品牌色边条 */}
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#1d9bf0] rounded-r" />

                {/* 未读小蓝点 */}
                {(unread > 0 || isNew) && (
                  <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-[#1d9bf0] shadow-sm shadow-blue-200" />
                )}

                <div className="pl-4 pr-3 py-3.5">
                  {/* 帖子头部：头像 + 团队名 + 时间 */}
                  <div className="flex items-start gap-3">
                    {/* 头像 */}
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarGradient(teamName)} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                      <span className="text-sm font-bold text-white">{teamName.charAt(0)}</span>
                    </div>

                    {/* 内容区 */}
                    <div className="flex-1 min-w-0">
                      {/* 名称行 */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-[#1a1a1a] truncate">{teamName}</span>
                        <span className="text-xs text-[#536471]">·</span>
                        <span className="text-xs text-[#536471] flex-shrink-0">{formatTime(post.created_at)}</span>
                      </div>

                      {/* 标题（加粗） */}
                      <p className="text-[15px] font-bold text-[#1a1a1a] mt-1 leading-snug">{post.title}</p>

                      {/* 内容 */}
                      {post.content && post.content !== post.title && (
                        <p className="text-[15px] text-[#1a1a1a] mt-1 leading-relaxed whitespace-pre-wrap break-words">{post.content}</p>
                      )}

                      {/* 媒体预览 */}
                      {hasMedia && (
                        <div className={`grid gap-1.5 mt-2.5 ${getMediaGridClass(mediaUrls.length)}`}>
                          {mediaUrls.map((url: string, idx: number) => (
                            <div
                              key={idx}
                              className="relative rounded-xl overflow-hidden bg-gray-100 cursor-pointer group"
                              style={{ aspectRatio: mediaUrls.length === 1 ? '16/9' : '1/1' }}
                              onClick={() => { setPreviewUrl(url); setShowImagePreview(true); }}
                            >
                              {post.media_types?.[idx] === 'video' ? (
                                <>
                                  <video src={url} className="w-full h-full object-cover" preload="metadata" />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center">
                                      <Video className="w-5 h-5 text-white" />
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <img src={url} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200" loading="lazy" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 操作栏 */}
                      <div className="flex items-center gap-8 mt-2.5 -ml-2">
                        {/* 评论 */}
                        <button
                          className="flex items-center gap-1.5 text-[#536471] hover:text-[#1d9bf0] transition-colors group"
                          onClick={() => openDetail(post)}
                        >
                          <div className="p-1.5 rounded-full group-hover:bg-[#1d9bf0]/10 transition-colors">
                            <MessageCircle className="w-[18px] h-[18px]" />
                          </div>
                          {post.comment_count > 0 && (
                            <span className="text-[13px]">{post.comment_count}</span>
                          )}
                        </button>

                        {/* 点赞 */}
                        <button
                          className={`flex items-center gap-1.5 transition-colors group ${
                            post.is_liked ? 'text-rose-500' : 'text-[#536471] hover:text-rose-500'
                          }`}
                          onClick={() => handleLike(post.id)}
                        >
                          <div className={`p-1.5 rounded-full transition-colors ${post.is_liked ? 'bg-rose-50' : 'group-hover:bg-rose-50'}`}>
                            <Heart className={`w-[18px] h-[18px] ${post.is_liked ? 'fill-current' : ''}`} />
                          </div>
                          {post.like_count > 0 && (
                            <span className="text-[13px]">{post.like_count}</span>
                          )}
                        </button>

                        {/* 删除（仅自己的帖子） */}
                        {post.team_id === teamId && (
                          <button
                            className="flex items-center gap-1.5 text-[#536471] hover:text-red-500 transition-colors group ml-auto"
                            onClick={() => { setDeletePostId(post.id); setShowDelete(true); }}
                          >
                            <div className="p-1.5 rounded-full group-hover:bg-red-50 transition-colors">
                              <Trash2 className="w-[18px] h-[18px]" />
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 加载更多 */}
      {hasMore && (
        <div className="flex justify-center py-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-[#1d9bf0] hover:text-[#1a8cd8] hover:bg-[#1d9bf0]/5 rounded-full"
            onClick={() => loadPosts(page + 1, true)}
          >
            加载更多
          </Button>
        </div>
      )}
      </>
      )}

      {/* 帖子详情/评论弹窗 */}
      <Dialog open={!!selectedPost} onOpenChange={(open) => { if (!open) setSelectedPost(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          {selectedPost && (
            <>
              <DialogHeader className="p-5 pb-0">
                <DialogTitle className="text-lg">{selectedPost.title}</DialogTitle>
                <DialogDescription className="sr-only">{selectedPost.teams?.name || '未知小队'}发布的帖子详情</DialogDescription>
                <div className="flex items-center gap-2 text-sm text-[#536471] mt-1">
                  <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${getAvatarGradient(selectedPost.teams?.name || '未知')} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-[10px] font-bold text-white">{(selectedPost.teams?.name || '未').charAt(0)}</span>
                  </div>
                  <span className="font-medium text-[#1a1a1a]">{selectedPost.teams?.name || '未知小队'}</span>
                  <span>·</span>
                  <span>{formatTime(selectedPost.created_at)}</span>
                  {selectedPost.themes && <span className="text-xs bg-gray-100 text-[#536471] px-2 py-0.5 rounded-full">{selectedPost.themes.name}</span>}
                </div>
              </DialogHeader>

              {/* 正文内容 */}
              <div className="px-5 py-3">
                <p className="text-[15px] whitespace-pre-wrap leading-relaxed text-[#1a1a1a]">{selectedPost.content}</p>
              </div>

              {/* 媒体附件 */}
              {selectedPost.signed_media_urls && selectedPost.signed_media_urls.filter((url: string) => url).length > 0 && (
                <div className={`grid gap-1.5 px-5 mb-3 ${
                  selectedPost.signed_media_urls.filter((u: string) => u).length === 1 ? 'grid-cols-1' :
                  selectedPost.signed_media_urls.filter((u: string) => u).length === 2 ? 'grid-cols-2' :
                  'grid-cols-3'
                }`}>
                  {selectedPost.signed_media_urls.filter((url: string) => url).map((url: string, idx: number) => (
                    <div key={idx} className="relative rounded-xl overflow-hidden bg-gray-100 cursor-pointer group" style={{ aspectRatio: (selectedPost.signed_media_urls?.filter((u: string) => u).length || 0) === 1 ? '16/9' : '1/1' }} onClick={() => { setPreviewUrl(url); setShowImagePreview(true); }}>
                      {selectedPost.media_types?.[idx] === 'video' ? (
                        <>
                          <video src={url} controls className="w-full h-full object-cover" preload="metadata" />
                        </>
                      ) : (
                        <img src={url} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 互动栏 */}
              <div className="flex items-center gap-4 px-5 py-2.5 border-t border-gray-100">
                <button
                  className={`flex items-center gap-1.5 text-sm transition-colors group ${selectedPost.is_liked ? 'text-rose-500' : 'text-[#536471] hover:text-rose-500'}`}
                  onClick={() => handleLike(selectedPost.id)}
                >
                  <div className={`p-1.5 rounded-full transition-colors ${selectedPost.is_liked ? 'bg-rose-50' : 'group-hover:bg-rose-50'}`}>
                    <Heart className={`w-[18px] h-[18px] ${selectedPost.is_liked ? 'fill-current' : ''}`} />
                  </div>
                  {selectedPost.like_count > 0 && <span className="text-[13px]">{selectedPost.like_count}</span>}
                </button>
                <span className="flex items-center gap-1.5 text-sm text-[#536471]">
                  <div className="p-1.5 rounded-full">
                    <MessageCircle className="w-[18px] h-[18px]" />
                  </div>
                  {selectedPost.comment_count > 0 && <span className="text-[13px]">{selectedPost.comment_count}</span>}
                </span>
                {selectedPost.team_id === teamId && (
                  <button
                    className="ml-auto flex items-center gap-1.5 text-sm text-[#536471] hover:text-red-500 transition-colors group"
                    onClick={() => { setDeletePostId(selectedPost.id); setShowDelete(true); }}
                  >
                    <div className="p-1.5 rounded-full group-hover:bg-red-50 transition-colors">
                      <Trash2 className="w-[18px] h-[18px]" />
                    </div>
                    <span>删除</span>
                  </button>
                )}
              </div>

              {/* 评论区 */}
              <div className="border-t border-gray-100 px-5 pt-3">
                <h4 className="text-sm font-bold text-[#1a1a1a] mb-3">评论 ({detailComments.length})</h4>
                {commentsLoading ? (
                  <div className="text-center py-3 text-sm text-[#536471]">加载中...</div>
                ) : detailComments.length === 0 ? (
                  <div className="text-center py-3 text-sm text-[#536471]">暂无评论</div>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto mb-3">
                    {detailComments.map(c => {
                      const isAdmin = c.is_admin || c.content?.startsWith('[管理员]');
                      const commenterName = getCommenterName(c);
                      return (
                        <div key={c.id} className="flex gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            isAdmin
                              ? (c.anonymous_identity === '银蛇博士'
                                ? 'bg-gradient-to-br from-emerald-400 to-teal-600'
                                : c.anonymous_identity === '雾影博士'
                                  ? 'bg-gradient-to-br from-violet-400 to-purple-600'
                                  : 'bg-gradient-to-br from-amber-400 to-orange-500')
                              : `bg-gradient-to-br ${getAvatarGradient(commenterName)}`
                          }`}>
                            <span className="text-xs font-bold text-white">{commenterName.charAt(0)}</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-[#1a1a1a]">{commenterName}</span>
                              {isAdmin && !c.anonymous_identity && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                  {getAdminBadge(c)}
                                </span>
                              )}
                              <span className="text-xs text-[#536471]">{formatTime(c.created_at)}</span>
                            </div>
                            {/* 回复引用 */}
                            {c.reply_to && (
                              <div className="text-xs text-[#536471] bg-gray-50 rounded-lg px-2.5 py-1.5 mt-1 border-l-2 border-[#1d9bf0]/30">
                                回复 <span className="font-medium text-[#1a1a1a]">{getCommenterName(c.reply_to)}</span>：{getCommentContent(c.reply_to).length > 40 ? getCommentContent(c.reply_to).slice(0, 40) + '...' : getCommentContent(c.reply_to)}
                              </div>
                            )}
                            <p className="text-sm mt-1 text-[#1a1a1a]">{getCommentContent(c)}</p>
                            {/* 回复和点赞按钮 */}
                            <div className="flex items-center gap-4 mt-1">
                              <button
                                className="text-xs text-[#536471] hover:text-[#1d9bf0] transition-colors"
                                onClick={() => setReplyTo(c)}
                              >
                                回复
                              </button>
                              <button
                                className={`text-xs flex items-center gap-0.5 transition-colors ${c.is_liked ? 'text-rose-500' : 'text-[#536471] hover:text-rose-400'}`}
                                onClick={() => handleCommentLike(c.id)}
                              >
                                <Heart className={`w-3 h-3 ${c.is_liked ? 'fill-current' : ''}`} />
                                {(c.like_count || 0) > 0 && <span>{c.like_count}</span>}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 回复提示 */}
                {replyTo && (
                  <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-[#1d9bf0]/5 rounded-full text-xs">
                    <span className="text-[#536471]">
                      回复 <span className="font-medium text-[#1a1a1a]">{getCommenterName(replyTo)}</span>
                    </span>
                    <button
                      className="ml-auto text-[#536471] hover:text-[#1a1a1a]"
                      onClick={() => setReplyTo(null)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* 评论输入 */}
                <div className="flex gap-2 pb-4">
                  <Input
                    placeholder={replyTo ? `回复 ${getCommenterName(replyTo)}...` : '写评论...'}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendComment()}
                    className="flex-1 rounded-full bg-gray-50 border-gray-200 focus:border-[#1d9bf0] focus:ring-[#1d9bf0]/20 text-sm"
                  />
                  <Button size="sm" onClick={handleSendComment} disabled={!newComment.trim() || commentSubmitting} className="rounded-full bg-[#1d9bf0] hover:bg-[#1a8cd8] shadow-none px-4">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 发帖弹窗 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>发帖</DialogTitle>
            <DialogDescription className="sr-only">发布新的黑板报帖子</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="标题" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="rounded-lg" />
            <Textarea placeholder="分享你的发现..." value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={4} className="rounded-lg resize-none" />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-[#536471]">附件</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 rounded-full"
                  onClick={handleAddImages}
                  disabled={newMediaTypes.filter(t => t === 'image').length >= 6}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  添加图片 ({newMediaTypes.filter(t => t === 'image').length}/6)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 rounded-full"
                  onClick={handleAddVideo}
                  disabled={newMediaTypes.includes('video')}
                >
                  <Video className="w-3.5 h-3.5" />
                  {newMediaTypes.includes('video') ? '已添加视频' : '添加视频'}
                </Button>
              </div>
              {newMediaPreviews.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {newMediaPreviews.map((preview, idx) => (
                    <div key={idx} className="relative rounded-xl overflow-hidden bg-gray-100">
                      {newMediaTypes[idx] === 'video' ? (
                        <div className="relative">
                          <video src={preview} className="w-full h-20 object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <Video className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      ) : (
                        <img src={preview} alt="" className="w-full h-20 object-cover" />
                      )}
                      <button
                        className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-black/70 transition-colors"
                        onClick={() => removeFile(idx)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="rounded-full">取消</Button>
            <Button onClick={handleSubmit} disabled={!newTitle.trim() || !newContent.trim() || submitting} className="rounded-full bg-[#1d9bf0] hover:bg-[#1a8cd8] shadow-none">
              {submitting ? '发布中...' : '发布'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription className="sr-only">删除后不可恢复</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-[#536471]">确定要删除这篇帖子吗？删除后不可恢复。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)} className="rounded-full">
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeletePost} className="rounded-full">
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 图片预览弹窗 */}
      <Dialog open={showImagePreview} onOpenChange={setShowImagePreview}>
        <DialogContent className="max-w-3xl p-2">
          <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: 0 }}>
            <DialogTitle>图片预览</DialogTitle>
            <DialogDescription>查看图片大图</DialogDescription>
          </span>
          {previewUrl && (
            <img src={previewUrl} alt="图片预览" className="w-full h-auto rounded-xl" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
