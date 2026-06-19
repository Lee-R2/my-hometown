'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  ArrowLeft, Trash2, Search, MessageCircle, Heart,
  Clock, ChevronDown, Loader2, Newspaper, Eye, Image as ImageIcon, Video
} from 'lucide-react';
import { toast } from 'sonner';

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
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
  task_themes: {
    id: string;
    name: string;
  };
  signed_media_urls?: string[];
}

export default function AdminBlackboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState({ totalPosts: 0, totalComments: 0, totalLikes: 0 });

  // 删除弹窗
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [postToDelete, setPostToDelete] = useState<Post | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  // 详情弹窗
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [detailMediaUrls, setDetailMediaUrls] = useState<string[]>([]);

  // 图片预览弹窗
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch {
        router.push('/admin/login');
      }
    } else {
      router.push('/admin/login');
    }
  }, [router]);

  const loadPosts = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    try {
      if (pageNum === 1) setLoading(true);

      const params = new URLSearchParams({
        page: pageNum.toString(),
        page_size: '20',
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/admin/blackboard?${params}`);
      const data = await res.json();

      if (data.success) {
        const newPosts: Post[] = data.data.posts;
        // 为新加载的帖子获取签名URL
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
          } catch {
            // 签名URL获取失败，不影响帖子显示
          }
        }

        setPosts(prev => append ? [...prev, ...newPosts] : newPosts);
        setHasMore(data.data.hasMore);
        setPage(pageNum);
        if (data.data.stats) {
          setStats(data.data.stats);
        }
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (user) {
      loadPosts(1);
    }
  }, [user, loadPosts]);

  // 搜索防抖
  const [searchTimer, setSearchTimer] = useState<NodeJS.Timeout | null>(null);
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

  // 查看帖子详情
  const handleViewDetail = async (post: Post) => {
    setSelectedPost(post);
    setShowDetailDialog(true);

    // 通过API生成签名URL
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

    const imgHeight = isDetail ? 'h-56' : 'h-40';
    const singleHeight = isDetail ? 'h-72' : 'h-52';

    if (count === 1) {
      return (
        <div className="rounded-xl overflow-hidden bg-gray-100 mt-3">
          {mediaTypes?.[0] === 'video' ? (
            <video src={urls[0]} controls className={`w-full ${singleHeight} object-cover`} preload="metadata" />
          ) : (
            <img
              src={urls[0]}
              alt=""
              className={`w-full ${singleHeight} object-cover cursor-pointer`}
              onClick={() => {
                setPreviewUrl(urls[0]);
                setShowImagePreview(true);
              }}
            />
          )}
        </div>
      );
    }

    if (count === 2) {
      return (
        <div className="grid grid-cols-2 gap-1.5 mt-3">
          {urls.map((url, idx) => (
            <div key={idx} className="rounded-xl overflow-hidden bg-gray-100">
              {mediaTypes?.[idx] === 'video' ? (
                <video src={url} controls className={`w-full ${imgHeight} object-cover`} preload="metadata" />
              ) : (
                <img
                  src={url}
                  alt=""
                  className={`w-full ${imgHeight} object-cover cursor-pointer`}
                  onClick={() => {
                    setPreviewUrl(url);
                    setShowImagePreview(true);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      );
    }

    // 3+ grid
    return (
      <div className="grid grid-cols-3 gap-1.5 mt-3">
        {urls.slice(0, 6).map((url, idx) => (
          <div key={idx} className="relative rounded-xl overflow-hidden bg-gray-100">
            {mediaTypes?.[idx] === 'video' ? (
              <video src={url} controls className={`w-full ${imgHeight} object-cover`} preload="metadata" />
            ) : (
              <img
                src={url}
                alt=""
                className={`w-full ${imgHeight} object-cover cursor-pointer`}
                onClick={() => {
                  setPreviewUrl(url);
                  setShowImagePreview(true);
                }}
              />
            )}
            {idx === 5 && count > 6 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white text-xl font-bold">+{count - 6}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center">
                <Newspaper className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-lg font-bold text-gray-900">家乡黑板报</h1>
              <Badge className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs border-0">
                管理后台
              </Badge>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-4 md:py-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="p-3 md:p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                <Newspaper className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xl md:text-2xl font-bold text-gray-900">{stats.totalPosts}</p>
                <p className="text-xs text-[#536471]">总帖子数</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="p-3 md:p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xl md:text-2xl font-bold text-gray-900">{stats.totalComments}</p>
                <p className="text-xs text-[#536471]">总评论数</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="p-3 md:p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                <Heart className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <p className="text-xl md:text-2xl font-bold text-gray-900">{stats.totalLikes}</p>
                <p className="text-xs text-[#536471]">总点赞数</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 搜索栏 */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="搜索帖子标题或内容..."
            className="pl-11 h-11 bg-white border-0 shadow-sm rounded-xl text-sm focus-visible:ring-1 focus-visible:ring-purple-500"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>

        {/* 帖子列表 */}
        {loading && posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400 mb-4" />
            <p className="text-[#536471]">加载中...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Newspaper className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-[#1a1a1a] text-lg font-medium">暂无帖子</p>
            <p className="text-[#536471] text-sm mt-1">还没有小队发布帖子</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map(post => (
              <Card key={post.id} className="border-0 shadow-sm hover:shadow-md transition-shadow bg-white">
                <CardContent className="p-4 md:p-5">
                  {/* 帖子头部：头像 + 小队名 + 学校 + 时间 */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-white text-sm font-bold">
                        {(post.teams?.name || '?').charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-[#1a1a1a] truncate">
                          {post.teams?.name || '未知小队'}
                        </span>
                        {post.teams?.school_name && (
                          <span className="text-xs text-[#536471] truncate">
                            @{post.teams.school_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[#536471]">{formatDate(post.created_at)}</span>
                      </div>
                    </div>
                    <Badge
                      className="text-xs shrink-0 bg-purple-50 text-purple-600 border-0 hover:bg-purple-100 font-medium"
                    >
                      {post.task_themes?.name || '未知主题'}
                    </Badge>
                  </div>

                  {/* 标题 */}
                  <h3 className="text-base font-bold text-[#1a1a1a] mb-1">{post.title}</h3>

                  {/* 内容 */}
                  <p className="text-sm text-[#1a1a1a] leading-relaxed whitespace-pre-wrap line-clamp-4">{post.content}</p>

                  {/* 媒体内容 */}
                  {post.signed_media_urls && post.signed_media_urls.length > 0 && (
                    renderMediaGrid(post.signed_media_urls, post.media_types || [])
                  )}

                  {/* 操作栏 */}
                  <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 -mx-1">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-[#536471] hover:text-rose-500 hover:bg-rose-50 transition-colors">
                      <Heart className="w-4 h-4" />
                      {post.like_count > 0 && <span>{post.like_count}</span>}
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-[#536471] hover:text-blue-500 hover:bg-blue-50 transition-colors">
                      <MessageCircle className="w-4 h-4" />
                      {post.comment_count > 0 && <span>{post.comment_count}</span>}
                    </button>
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-[#536471] hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                      onClick={() => handleViewDetail(post)}
                    >
                      <Eye className="w-4 h-4" />
                      <span>详情</span>
                    </button>
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-[#536471] hover:text-red-500 hover:bg-red-50 transition-colors ml-auto"
                      onClick={() => {
                        setPostToDelete(post);
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* 加载更多 */}
            {hasMore && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-purple-200 text-purple-600 hover:bg-purple-50 hover:text-purple-700"
                  onClick={() => loadPosts(page + 1, true)}
                >
                  <ChevronDown className="w-4 h-4 mr-1" />
                  加载更多
                </Button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 删除弹窗 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除帖子</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              确定要删除帖子「{postToDelete?.title}」吗？删除后将通知发帖小队。
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

      {/* 详情弹窗 */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: 0 }}>
            <DialogTitle>帖子详情</DialogTitle>
          </span>
          {selectedPost && (
            <>
              {/* 帖子头部 */}
              <div className="flex items-center gap-3 mb-4">
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
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[#536471]">{formatDate(selectedPost.created_at)}</span>
                    <Badge className="text-xs bg-purple-50 text-purple-600 border-0 hover:bg-purple-100 font-medium">
                      {selectedPost.task_themes?.name}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* 标题和内容 */}
              <h3 className="text-lg font-bold text-[#1a1a1a] mb-2">{selectedPost.title}</h3>
              <p className="text-sm text-[#1a1a1a] leading-relaxed whitespace-pre-wrap">{selectedPost.content}</p>

              {/* 媒体 */}
              {detailMediaUrls.length > 0 && (
                renderMediaGrid(detailMediaUrls, selectedPost.media_types || [], true)
              )}

              {/* 互动数据 + 操作 */}
              <div className="flex items-center gap-1 mt-4 pt-3 border-t border-gray-100">
                <span className="flex items-center gap-1.5 text-sm text-[#536471] px-3 py-1.5">
                  <Heart className="w-4 h-4" />
                  {selectedPost.like_count} 赞
                </span>
                <span className="flex items-center gap-1.5 text-sm text-[#536471] px-3 py-1.5">
                  <MessageCircle className="w-4 h-4" />
                  {selectedPost.comment_count} 评论
                </span>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-[#536471] hover:text-red-500 hover:bg-red-50 transition-colors ml-auto"
                  onClick={() => {
                    setShowDetailDialog(false);
                    setPostToDelete(selectedPost);
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
              </div>
            </>
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
    </div>
  );
}
