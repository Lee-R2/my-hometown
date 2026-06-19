'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  Heart, MessageCircle, Clock, Trash2, Search,
  ChevronDown, ChevronRight, Loader2, Newspaper, Image as ImageIcon, Video,
  Send, ThumbsUp, X, Eye, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface Post {
  id: string;
  team_id: string;
  author_id: string;
  author_name: string;
  author_type: string;
  content: string;
  media_urls: string[];
  media_types: string[];
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
  teams: {
    id: string;
    name: string;
    code: string;
    school_name?: string;
  } | null;
  signed_media_urls?: string[];
}

type SortBy = 'created_at' | 'comment_count' | 'like_count';

const sortOptions: { value: SortBy; label: string; icon: any }[] = [
  { value: 'created_at', label: '最新', icon: Clock },
  { value: 'comment_count', label: '热议', icon: MessageCircle },
  { value: 'like_count', label: '热门', icon: Heart },
];

interface AdminBlackboardSectionProps {
  userRole?: string;
  userId?: string;
  userName?: string;
  schoolName?: string;
}

export default function AdminBlackboardSection({ userRole, userId, userName, schoolName }: AdminBlackboardSectionProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ totalPosts: 0, totalComments: 0, totalLikes: 0 });
  const [isCollapsed, setIsCollapsed] = useState(true);

  // 删除弹窗
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [postToDelete, setPostToDelete] = useState<Post | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  // 详情弹窗（含评论和点赞）
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [detailComments, setDetailComments] = useState<any[]>([]);
  const [detailCommentsLoading, setDetailCommentsLoading] = useState(false);
  const [detailCommentsHasMore, setDetailCommentsHasMore] = useState(false);
  const [detailCommentsPage, setDetailCommentsPage] = useState(1);
  const [detailMediaUrls, setDetailMediaUrls] = useState<string[]>([]);

  // 图片预览
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  // 点赞和评论状态
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [likingPostId, setLikingPostId] = useState<string | null>(null);
  const [replyToComment, setReplyToComment] = useState<any | null>(null);
  const [commentIdentity, setCommentIdentity] = useState<'real' | '银蛇博士' | '雾影博士'>('real');

  const isSuperAdmin = userRole === 'admin' || userRole === 'super_admin';

  // 未读通知状态
  const [adminUnread, setAdminUnread] = useState({ newPosts: 0, newComments: 0, newLikes: 0, totalUnread: 0 });
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  // localStorage 键
  const ADMIN_VIEWED_KEY = 'admin_bb_viewed_stats';
  const ADMIN_VIEWED_POSTS_KEY = 'admin_bb_viewed_posts';

  // 获取已查看的统计数据
  const getAdminViewedStats = useCallback((): { totalPosts: number; totalComments: number; totalLikes: number } | null => {
    try {
      const stored = localStorage.getItem(ADMIN_VIEWED_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  }, []);

  // 保存已查看的统计数据
  const saveAdminViewedStats = useCallback((s: { totalPosts: number; totalComments: number; totalLikes: number }) => {
    try {
      localStorage.setItem(ADMIN_VIEWED_KEY, JSON.stringify(s));
    } catch { /* ignore */ }
  }, []);

  // 获取帖子级别的已查看计数
  const getAdminViewedPosts = useCallback((): Record<string, { comment_count: number; like_count: number }> => {
    try {
      const stored = localStorage.getItem(ADMIN_VIEWED_POSTS_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  }, []);

  // 保存帖子级别的已查看计数
  const saveAdminViewedPosts = useCallback((map: Record<string, { comment_count: number; like_count: number }>) => {
    try {
      localStorage.setItem(ADMIN_VIEWED_POSTS_KEY, JSON.stringify(map));
    } catch { /* ignore */ }
  }, []);

  // 计算管理员未读数
  const computeAdminUnread = useCallback((currentStats: { totalPosts: number; totalComments: number; totalLikes: number }, postList?: Post[]) => {
    const viewed = getAdminViewedStats();
    const newPosts = viewed ? Math.max(0, currentStats.totalPosts - viewed.totalPosts) : 0;
    const newComments = viewed ? Math.max(0, currentStats.totalComments - viewed.totalComments) : 0;
    const newLikes = viewed ? Math.max(0, currentStats.totalLikes - viewed.totalLikes) : 0;
    const totalUnread = newPosts + newComments + newLikes;
    setAdminUnread({ newPosts, newComments, newLikes, totalUnread });

    // 计算帖子级别未读
    if (postList && postList.length > 0) {
      const viewedPosts = getAdminViewedPosts();
      const map: Record<string, number> = {};
      for (const post of postList) {
        const viewed = viewedPosts[post.id];
        if (!viewed) {
          map[post.id] = 0;
        } else {
          const unreadComments = Math.max(0, post.comment_count - viewed.comment_count);
          const unreadLikes = Math.max(0, post.like_count - viewed.like_count);
          const total = unreadComments + unreadLikes;
          if (total > 0) map[post.id] = total;
        }
      }
      setUnreadMap(map);
    }
  }, [getAdminViewedStats, getAdminViewedPosts]);

  const loadPosts = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    try {
      if (pageNum === 1) setLoading(true);

      const params = new URLSearchParams({
        page: pageNum.toString(),
        page_size: '10',
        sort_by: sortBy,
      });
      if (search) params.set('search', search);
      if (userId) params.set('user_id', userId);
      if (userRole) params.set('user_role', userRole);

      const res = await fetch(`/api/admin/blackboard?${params}`);
      const data = await res.json();

      if (data.success) {
        const newPosts: Post[] = data.data.posts;

        // 批量获取签名URL
        const allMediaKeys: string[] = [];
        const postMediaIndex: { postIdx: number; keyIdx: number; mediaIdx: number }[] = [];
        newPosts.forEach((post: Post, pIdx: number) => {
          if (post.media_urls && post.media_urls.length > 0) {
            post.media_urls.forEach((key: string, mIdx: number) => {
              allMediaKeys.push(key);
              postMediaIndex.push({ postIdx: pIdx, keyIdx: allMediaKeys.length - 1, mediaIdx: mIdx });
            });
          }
        });

        if (allMediaKeys.length > 0) {
          try {
            const signRes = await fetch('/api/team/blackboard/sign-urls', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keys: allMediaKeys }),
            });
            const signData = await signRes.json();
            if (signData.success && signData.data) {
              const signedUrls: string[] = signData.data;
              newPosts.forEach((post: Post, pIdx: number) => {
                if (post.media_urls && post.media_urls.length > 0) {
                  post.signed_media_urls = post.media_urls.map((_: string, mIdx: number) => {
                    const entry = postMediaIndex.find(e => e.postIdx === pIdx && e.mediaIdx === mIdx);
                    return entry ? signedUrls[entry.keyIdx] : '';
                  });
                }
              });
            }
          } catch { /* ignore */ }
        }

        const merged = append ? [...posts, ...newPosts] : newPosts;
        setPosts(merged);
        setHasMore(data.data.hasMore);
        setPage(pageNum);
        if (data.data.stats) {
          setStats(data.data.stats);
          computeAdminUnread(data.data.stats, data.data.posts);
        }

        // 批量检查点赞状态
        if (userId) {
          checkLikedPosts(merged);
        }
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [sortBy, search, userId]);

  // 批量检查点赞状态
  const checkLikedPosts = async (postList: Post[]) => {
    if (!userId) return;
    const likedMap: Record<string, boolean> = { ...likedPosts };
    for (const post of postList) {
      try {
        const res = await fetch(`/api/admin/blackboard/${post.id}/like?admin_id=${userId}`);
        const data = await res.json();
        if (data.success) {
          likedMap[post.id] = data.liked;
        }
      } catch { /* ignore */ }
    }
    setLikedPosts(likedMap);
  };

  // 组件挂载时立即加载统计数据 + 计算未读数
  useEffect(() => {
    const loadStats = async () => {
      try {
        const res = await fetch(`/api/admin/blackboard?page=1&page_size=1&sort_by=created_at${userId ? '&user_id=' + userId : ''}${userRole ? '&user_role=' + userRole : ''}`);
        const data = await res.json();
        if (data.success && data.data.stats) {
          setStats(data.data.stats);
          computeAdminUnread(data.data.stats);
          if (!getAdminViewedStats()) {
            saveAdminViewedStats(data.data.stats);
          }
        }
      } catch { /* silent */ }
    };
    loadStats();
    const timer = setInterval(loadStats, 30000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 排序变化时重新加载
  useEffect(() => {
    loadPosts(1);
  }, [sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

  // 首次加载时保存已查看统计
  useEffect(() => {
    if (posts.length > 0 && stats.totalPosts > 0) {
      saveAdminViewedStats(stats);
      setAdminUnread(prev => ({ ...prev, newPosts: 0, totalUnread: prev.newComments + prev.newLikes }));
    }
  }, [posts.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // 搜索防抖
  const [searchTimer, setSearchTimer] = useState<NodeJS.Timeout | null>(null);

  // 获取评论者显示名称
  const getCommenterName = (comment: any) => {
    if (comment.is_admin) {
      if (comment.anonymous_identity) return comment.anonymous_identity;
      if (comment.admin_info) {
        const info = comment.admin_info;
        const schoolPrefix = info.school_name ? `${info.school_name}` : '';
        return `${schoolPrefix}${info.name}`;
      }
    }
    if (comment.content?.startsWith('[管理员]')) {
      const match = comment.content?.match(/^\[管理员\]\s*(.+?)：/);
      return match ? match[1] : '管理员';
    }
    return comment.teams?.name || '未知小队';
  };

  const getAdminRealName = (comment: any) => {
    if (comment.is_admin && comment.admin_info) {
      return comment.admin_info.name || '管';
    }
    return null;
  };

  const getAvatarChar = (comment: any) => {
    const name = getCommenterName(comment);
    return name.charAt(0);
  };

  const getAdminBadge = (comment: any) => {
    if (!comment.is_admin) return null;
    if (comment.admin_info?.role === 'admin' || comment.admin_info?.role === 'super_admin') return '超级管理员';
    return comment.admin_info?.role_label || '管理员';
  };

  const getCommentContent = (comment: any) => {
    if (comment.content?.startsWith('[管理员]')) {
      return comment.content.replace(/^\[管理员\]\s*.+?：/, '').trim();
    }
    return comment.content;
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimer) clearTimeout(searchTimer);
    const timer = setTimeout(() => {
      loadPosts(1);
    }, 500);
    setSearchTimer(timer);
  };

  // 删除帖子
  const handleDelete = async () => {
    if (!postToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/blackboard', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: postToDelete.id,
          reason: deleteReason.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success('帖子已删除');
        setShowDeleteDialog(false);
        setPostToDelete(null);
        setDeleteReason('');
        loadPosts(1);
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setDeleting(false);
    }
  };

  // 点赞/取消点赞
  const handleLike = async (postId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!userId || likingPostId) return;
    setLikingPostId(postId);
    try {
      const res = await fetch(`/api/admin/blackboard/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: userId }),
      });
      const data = await res.json();
      if (data.success) {
        const newLiked = data.data?.is_liked;
        const newCount = data.data?.like_count;
        setLikedPosts(prev => ({ ...prev, [postId]: newLiked }));
        if (newCount !== undefined) {
          setPosts(prev => prev.map(p =>
            p.id === postId ? { ...p, like_count: newCount } : p
          ));
          setSelectedPost(prev => prev ? { ...prev, like_count: newCount } : prev);
        }
        const postToUpdate = posts.find(p => p.id === postId) || selectedPost;
        if (postToUpdate) {
          const viewedPosts = getAdminViewedPosts();
          viewedPosts[postId] = { comment_count: postToUpdate.comment_count, like_count: newCount ?? postToUpdate.like_count };
          saveAdminViewedPosts(viewedPosts);
        }
      }
    } catch {
      toast.error('操作失败');
    } finally {
      setLikingPostId(null);
    }
  };

  // 评论点赞
  const handleCommentLike = async (comment: any) => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/admin/blackboard/comments/${comment.id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: userId }),
      });
      const data = await res.json();
      if (data.is_liked !== undefined) {
        const newLiked = data.is_liked;
        const newCount = data.like_count;
        setDetailComments(prev => prev.map(c => {
          if (c.id === comment.id) {
            return { ...c, is_liked: newLiked, like_count: newCount };
          }
          if (c.reply_to && c.reply_to.id === comment.id) {
            return { ...c, reply_to: { ...c.reply_to, is_liked: newLiked, like_count: newCount } };
          }
          return c;
        }));
      }
    } catch {
      toast.error('操作失败');
    }
  };

  // 发送评论
  const handleComment = async () => {
    if (!selectedPost || !commentText.trim() || submittingComment || !userId) return;
    setSubmittingComment(true);
    try {
      const body: any = {
        admin_id: userId,
        admin_name: userName || '管理员',
        admin_role: userRole || 'admin',
        school_name: schoolName || '',
        content: commentText.trim(),
        anonymous_identity: commentIdentity !== 'real' ? commentIdentity : null,
      };
      if (replyToComment) {
        body.reply_to_id = replyToComment.id;
      }
      const res = await fetch(`/api/admin/blackboard/${selectedPost.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setCommentText('');
        setReplyToComment(null);
        await loadDetailComments(selectedPost.id);
        const newCommentCount = selectedPost.comment_count + 1;
        setPosts(prev => prev.map(p =>
          p.id === selectedPost.id ? { ...p, comment_count: p.comment_count + 1 } : p
        ));
        setSelectedPost(prev => prev ? { ...prev, comment_count: prev.comment_count + 1 } : prev);
        const viewedPosts = getAdminViewedPosts();
        viewedPosts[selectedPost.id] = { comment_count: newCommentCount, like_count: selectedPost.like_count };
        saveAdminViewedPosts(viewedPosts);
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

  // 加载评论详情
  const loadDetailComments = async (postId: string, pageNum: number = 1) => {
    setDetailCommentsLoading(true);
    try {
      const res = await fetch(`/api/admin/blackboard/${postId}/comments?page=${pageNum}&page_size=100&liker_id=${encodeURIComponent(userId || '')}`);
      const data = await res.json();
      if (data.success) {
        if (pageNum === 1) {
          setDetailComments(data.data.comments || []);
        } else {
          setDetailComments(prev => [...prev, ...(data.data.comments || [])]);
        }
        setDetailCommentsHasMore(data.data.hasMore || false);
        setDetailCommentsPage(pageNum);
      }
    } catch { /* ignore */ }
    finally {
      setDetailCommentsLoading(false);
    }
  };

  // 查看详情
  const handleViewDetail = async (post: Post) => {
    setSelectedPost(post);
    setShowDetailDialog(true);
    setDetailComments([]);
    setDetailCommentsPage(1);
    setCommentText('');
    setReplyToComment(null);
    loadDetailComments(post.id, 1);

    // 获取签名URL
    if (post.media_urls && post.media_urls.length > 0) {
      try {
        const res = await fetch('/api/team/blackboard/sign-urls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: post.media_urls }),
        });
        const data = await res.json();
        if (data.success && data.data) {
          setDetailMediaUrls(data.data);
        } else {
          setDetailMediaUrls([]);
        }
      } catch {
        setDetailMediaUrls([]);
      }
    } else {
      setDetailMediaUrls([]);
    }

    // 清除该帖子的未读
    const viewedPosts = getAdminViewedPosts();
    viewedPosts[post.id] = { comment_count: post.comment_count, like_count: post.like_count };
    saveAdminViewedPosts(viewedPosts);
    setUnreadMap(prev => {
      const next = { ...prev };
      delete next[post.id];
      return next;
    });
  };

  // 加载更多评论
  const loadMoreComments = async () => {
    if (!selectedPost) return;
    const nextPage = detailCommentsPage + 1;
    loadDetailComments(selectedPost.id, nextPage);
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

  // 媒体网格布局
  const renderMediaGrid = (urls: string[], mediaTypes: string[], isDetail: boolean = false) => {
    const count = urls.length;
    if (count === 0) return null;

    const imgHeight = isDetail ? 'h-48' : 'h-32';
    const singleHeight = isDetail ? 'h-64' : 'h-44';

    if (count === 1) {
      return (
        <div className="rounded-xl overflow-hidden bg-gray-100 mt-2.5">
          {mediaTypes?.[0] === 'video' ? (
            <video src={urls[0]} controls className={`w-full ${singleHeight} object-cover`} preload="metadata" />
          ) : (
            <img
              src={urls[0]}
              alt=""
              className={`w-full ${singleHeight} object-cover cursor-pointer`}
              onClick={() => { setPreviewUrl(urls[0]); setShowImagePreview(true); }}
            />
          )}
        </div>
      );
    }

    if (count === 2) {
      return (
        <div className="grid grid-cols-2 gap-1 mt-2.5">
          {urls.map((url, idx) => (
            <div key={idx} className="rounded-xl overflow-hidden bg-gray-100">
              {mediaTypes?.[idx] === 'video' ? (
                <video src={url} controls className={`w-full ${imgHeight} object-cover`} preload="metadata" />
              ) : (
                <img
                  src={url}
                  alt=""
                  className={`w-full ${imgHeight} object-cover cursor-pointer`}
                  onClick={() => { setPreviewUrl(url); setShowImagePreview(true); }}
                />
              )}
            </div>
          ))}
        </div>
      );
    }

    // 3+ grid
    return (
      <div className="grid grid-cols-3 gap-1 mt-2.5">
        {urls.slice(0, 6).map((url, idx) => (
          <div key={idx} className="relative rounded-xl overflow-hidden bg-gray-100">
            {mediaTypes?.[idx] === 'video' ? (
              <video src={url} controls className={`w-full ${imgHeight} object-cover`} preload="metadata" />
            ) : (
              <img
                src={url}
                alt=""
                className={`w-full ${imgHeight} object-cover cursor-pointer`}
                onClick={() => { setPreviewUrl(url); setShowImagePreview(true); }}
              />
            )}
            {idx === 5 && count > 6 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white text-lg font-bold">+{count - 6}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* 折叠头部 - 始终可见 */}
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center">
              <Newspaper className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#1a1a1a]">家乡黑板报</h2>
                {adminUnread.totalUnread > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {adminUnread.totalUnread > 99 ? '99+' : adminUnread.totalUnread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-[#536471] mt-0.5">
                <span className="flex items-center gap-1">
                  <Newspaper className="w-3 h-3 text-purple-400" />
                  {stats.totalPosts} 帖
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3 text-blue-400" />
                  {stats.totalComments} 评
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="w-3 h-3 text-rose-400" />
                  {stats.totalLikes} 赞
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isCollapsed && (
              <Link href="/admin/blackboard" onClick={e => e.stopPropagation()}>
                <button className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-700 font-medium transition-colors">
                  查看全部
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </Link>
            )}
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 text-[#536471]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#536471]" />
            )}
          </div>
        </div>

        {/* 展开内容 */}
        {!isCollapsed && (<>

        {/* 搜索 + 排序 */}
        <div className="px-4 py-2.5 border-b border-gray-100 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              placeholder="搜索帖子..."
              className="pl-9 h-8 text-sm bg-gray-50 border-0 focus-visible:ring-1 focus-visible:ring-purple-400 rounded-lg"
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1">
            {sortOptions.map(option => (
              <button
                key={option.value}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  sortBy === option.value
                    ? 'bg-purple-500 text-white'
                    : 'text-[#536471] hover:bg-gray-100'
                }`}
                onClick={() => setSortBy(option.value)}
              >
                <option.icon className="w-3 h-3" />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Feed 流 */}
        {loading && posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-purple-400 mb-3" />
            <p className="text-sm text-[#536471]">加载中...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Newspaper className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm text-[#1a1a1a] font-medium">暂无帖子</p>
            <p className="text-xs text-[#536471] mt-1">等待小队发布分享</p>
          </div>
        ) : (
          <div>
            {posts.map((post, idx) => (
              <article
                key={post.id}
                className={`px-4 py-3 hover:bg-gray-50/80 cursor-pointer transition-colors ${
                  idx !== posts.length - 1 ? 'border-b border-gray-100' : ''
                }`}
                onClick={() => handleViewDetail(post)}
              >
                {/* 帖子头部 */}
                <div className="flex items-start gap-2.5">
                  {/* 头像 */}
                  <div className="w-9 h-9 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-full flex items-center justify-center shrink-0 relative">
                    <span className="text-white text-xs font-bold">
                      {(post.teams?.name || '?').charAt(0)}
                    </span>
                    {unreadMap[post.id] > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white" />
                    )}
                  </div>

                  {/* 内容区 */}
                  <div className="flex-1 min-w-0">
                    {/* 名称行 */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-[#1a1a1a] truncate">
                        {post.teams?.name || '未知小队'}
                      </span>
                      {post.teams?.school_name && (
                        <span className="text-xs text-[#536471] truncate">
                          @{post.teams.school_name}
                        </span>
                      )}
                      <span className="text-xs text-[#536471]">·</span>
                      <span className="text-xs text-[#536471] shrink-0">{formatDate(post.created_at)}</span>
                    </div>

                    {/* 内容 */}
                    <p className="text-sm text-[#1a1a1a] leading-relaxed mt-0.5 line-clamp-3 whitespace-pre-wrap">
                      {post.content}
                    </p>

                    {/* 媒体 */}
                    {post.signed_media_urls && post.signed_media_urls.length > 0 && (
                      <div className="mt-2" onClick={e => e.stopPropagation()}>
                        {renderMediaGrid(post.signed_media_urls, post.media_types || [])}
                      </div>
                    )}

                    {/* 操作栏 */}
                    <div className="flex items-center gap-0.5 mt-2 -ml-2" onClick={e => e.stopPropagation()}>
                      <button
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors ${
                          likedPosts[post.id]
                            ? 'text-rose-500'
                            : 'text-[#536471] hover:text-rose-500 hover:bg-rose-50'
                        }`}
                        onClick={() => handleLike(post.id)}
                        disabled={!!likingPostId}
                      >
                        <Heart className={`w-3.5 h-3.5 ${likedPosts[post.id] ? 'fill-current' : ''}`} />
                        {post.like_count > 0 && <span>{post.like_count}</span>}
                      </button>
                      <button
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-[#536471] hover:text-blue-500 hover:bg-blue-50 transition-colors"
                        onClick={() => handleViewDetail(post)}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        {post.comment_count > 0 && <span>{post.comment_count}</span>}
                      </button>
                      {isSuperAdmin && (
                        <button
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-[#536471] hover:text-red-500 hover:bg-red-50 transition-colors ml-auto"
                          onClick={() => { setPostToDelete(post); setShowDeleteDialog(true); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {/* 加载更多 */}
            {hasMore && (
              <div className="flex justify-center py-3 border-t border-gray-100">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-full"
                  onClick={() => loadPosts(page + 1, true)}
                >
                  <ChevronDown className="w-3.5 h-3.5 mr-1" />
                  加载更多
                </Button>
              </div>
            )}
          </div>
        )}
        </>)}
      </div>

      {/* 删除弹窗 - 仅超级管理员 */}
      {isSuperAdmin && (
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>删除帖子</DialogTitle>
              <DialogDescription>删除后将通知发帖小队</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                确定要删除该帖子吗？
              </p>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  删除原因（可选）
                </label>
                <Input
                  placeholder="请输入删除原因"
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowDeleteDialog(false); setDeleteReason(''); }}>
                取消
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                确认删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 详情弹窗 - 含完整图片、点赞和评论 */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: 0 }}>
            <DialogTitle>帖子详情</DialogTitle>
          </span>
          {selectedPost && (
            <div className="divide-y divide-gray-100">
              {/* 帖子主体 */}
              <div className="p-5">
                {/* 帖子头部 */}
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-white text-base font-bold">
                      {(selectedPost.teams?.name || '?').charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[#1a1a1a]">
                        {selectedPost.teams?.name || '未知小队'}
                      </span>
                      {selectedPost.teams?.school_name && (
                        <span className="text-xs text-[#536471]">
                          @{selectedPost.teams.school_name}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[#536471]">{formatDate(selectedPost.created_at)}</span>
                  </div>
                  {/* 超级管理员删除按钮 */}
                  {isSuperAdmin && (
                    <button
                      className="p-2 rounded-full text-[#536471] hover:text-red-500 hover:bg-red-50 transition-colors"
                      onClick={() => {
                        setShowDetailDialog(false);
                        setPostToDelete(selectedPost);
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* 内容 */}
                <p className="text-sm text-[#1a1a1a] leading-relaxed whitespace-pre-wrap mt-3">{selectedPost.content}</p>

                {/* 媒体 */}
                {detailMediaUrls.length > 0 && (
                  <div className="mt-3">
                    {renderMediaGrid(detailMediaUrls, selectedPost.media_types || [], true)}
                  </div>
                )}

                {/* 互动数据 */}
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100">
                  <button
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                      likedPosts[selectedPost.id]
                        ? 'text-rose-500'
                        : 'text-[#536471] hover:text-rose-500 hover:bg-rose-50'
                    }`}
                    onClick={() => handleLike(selectedPost.id)}
                    disabled={!!likingPostId}
                  >
                    <Heart className={`w-4 h-4 ${likedPosts[selectedPost.id] ? 'fill-current' : ''}`} />
                    {likedPosts[selectedPost.id] ? '已赞' : '点赞'} {selectedPost.like_count}
                  </button>
                  <span className="flex items-center gap-1.5 text-sm text-[#536471] px-3 py-1.5">
                    <MessageCircle className="w-4 h-4" />
                    {selectedPost.comment_count} 评论
                  </span>
                </div>
              </div>

              {/* 评论输入区 */}
              <div className="p-4">
                {/* 回复提示 */}
                {replyToComment && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg text-xs mb-2">
                    <span className="text-[#536471]">
                      回复 <span className="font-medium">{getCommenterName(replyToComment)}</span>
                    </span>
                    <button
                      className="ml-auto text-[#536471] hover:text-[#1a1a1a]"
                      onClick={() => setReplyToComment(null)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* 身份选择 */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-[#536471] shrink-0">身份：</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setCommentIdentity('real')}
                      className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                        commentIdentity === 'real'
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-100 text-[#536471] hover:bg-gray-200'
                      }`}
                    >
                      真实身份
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommentIdentity('银蛇博士')}
                      className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                        commentIdentity === '银蛇博士'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-100 text-[#536471] hover:bg-gray-200'
                      }`}
                    >
                      🐍 银蛇博士
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommentIdentity('雾影博士')}
                      className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                        commentIdentity === '雾影博士'
                          ? 'bg-violet-500 text-white'
                          : 'bg-gray-100 text-[#536471] hover:bg-gray-200'
                      }`}
                    >
                      🌫️ 雾影博士
                    </button>
                  </div>
                </div>

                {/* 输入框 */}
                <div className="flex gap-2">
                  <Input
                    placeholder={replyToComment ? `回复 ${getCommenterName(replyToComment)}...` : '写下你的评论...'}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && commentText.trim()) {
                        e.preventDefault();
                        handleComment();
                      }
                    }}
                    className="flex-1 h-9 text-sm bg-gray-50 border-0 focus-visible:ring-1 focus-visible:ring-purple-400 rounded-lg"
                    disabled={submittingComment}
                  />
                  <Button
                    size="sm"
                    onClick={handleComment}
                    disabled={!commentText.trim() || submittingComment}
                    className="h-9 px-3 rounded-lg bg-purple-500 hover:bg-purple-600"
                  >
                    {submittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* 评论列表 */}
              <div className="px-4 pb-4">
                <h4 className="text-sm font-semibold text-[#1a1a1a] mb-3">
                  评论 ({selectedPost.comment_count})
                </h4>
                {detailCommentsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                ) : detailComments.length === 0 ? (
                  <div className="text-center py-6 text-[#536471] text-sm">
                    暂无评论，来写下第一条评论吧
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detailComments.map((comment: any) => {
                      const isAdmin = comment.is_admin || comment.content?.startsWith('[管理员]');
                      const displayName = getCommenterName(comment);
                      const displayContent = getCommentContent(comment);
                      return (
                        <div key={comment.id} className="flex gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            isAdmin
                              ? (comment.anonymous_identity === '银蛇博士'
                                ? 'bg-gradient-to-br from-emerald-400 to-teal-600'
                                : comment.anonymous_identity === '雾影博士'
                                  ? 'bg-gradient-to-br from-violet-400 to-purple-600'
                                  : 'bg-gradient-to-br from-amber-400 to-orange-500')
                              : 'bg-gradient-to-br from-blue-400 to-indigo-500'
                          }`}>
                            <span className="text-white text-xs font-bold">
                              {getAvatarChar(comment)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-[#1a1a1a]">
                                {displayName}
                              </span>
                              {isAdmin && !comment.anonymous_identity && (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-amber-100 text-amber-700 border-0">
                                  {getAdminBadge(comment)}
                                </Badge>
                              )}
                              <span className="text-xs text-[#536471]">{formatDate(comment.created_at)}</span>
                            </div>
                            {/* 回复引用 */}
                            {comment.reply_to && (
                              <div className="text-xs text-[#536471] bg-gray-50 rounded px-2 py-1 mt-0.5 border-l-2 border-gray-200">
                                回复 <span className="font-medium">{getCommenterName(comment.reply_to)}</span>：{getCommentContent(comment.reply_to)?.length > 40 ? getCommentContent(comment.reply_to).slice(0, 40) + '...' : getCommentContent(comment.reply_to)}
                              </div>
                            )}
                            <p className="text-sm text-[#1a1a1a] mt-0.5">
                              {displayContent}
                            </p>
                            {/* 点赞 + 回复 */}
                            <div className="flex items-center gap-2 mt-0.5">
                              <button
                                className={`text-xs flex items-center gap-0.5 transition-colors ${comment.is_liked ? 'text-rose-500' : 'text-[#536471] hover:text-rose-400'}`}
                                onClick={() => handleCommentLike(comment)}
                              >
                                <Heart className={`w-3 h-3 ${comment.is_liked ? 'fill-current' : ''}`} />
                                {(comment.like_count || 0) > 0 && <span>{comment.like_count}</span>}
                              </button>
                              <button
                                className="text-xs text-[#536471] hover:text-[#1a1a1a] transition-colors"
                                onClick={() => setReplyToComment(comment)}
                              >
                                回复
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {detailCommentsHasMore && (
                      <div className="text-center pt-2">
                        <Button variant="link" size="sm" onClick={loadMoreComments} className="text-purple-500">
                          加载更多评论
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 图片预览弹窗 */}
      <Dialog open={showImagePreview} onOpenChange={setShowImagePreview}>
        <DialogContent className="max-w-3xl p-2">
          <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: 0 }}>
            <DialogTitle>图片预览</DialogTitle>
          </span>
          <img src={previewUrl} alt="" className="w-full h-auto max-h-[80vh] object-contain rounded-lg" />
        </DialogContent>
      </Dialog>
    </>
  );
}
