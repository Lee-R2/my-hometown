'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  ArrowLeft, Users, Search, Check, X, Clock, CheckCircle, XCircle,
  Phone, Building, Eye
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FollowRequest {
  id: string;
  childName: string;
  childGrade: string;
  relation: string;
  guardianReason: string | null;
  schoolId: string;
  schoolName: string;
  status: string;
  isActive: boolean;
  followedAt: string;
  review_remark: string | null;
  parent: {
    id: string;
    name: string;
    phone: string;
  };
  team: {
    id: string;
    name: string;
    slogan: string;
  };
}

interface User {
  id: string;
  school_id: string;
  role: string;
}

export default function AdminFollowVerifiesPage() {
  const [follows, setFollows] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [user, setUser] = useState<User | null>(null);
  
  // 各状态的数量统计
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  
  // 详情弹窗状态
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [detailFollow, setDetailFollow] = useState<FollowRequest | null>(null);
  
  // 审核状态
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [reviewRemark, setReviewRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
        }
      } catch {
        // ignore
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadFollows();
      loadCounts(); // 加载各状态数量
    }
  }, [status, user]);

  // 加载各状态的数量统计
  const loadCounts = async () => {
    if (!user) return;
    
    const schoolId = user.school_id || '';
    
    try {
      // 并行获取各状态的数量
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        fetch(`/api/admin/follows?status=pending&userRole=${user.role}&schoolId=${schoolId}&countOnly=true`),
        fetch(`/api/admin/follows?status=approved&userRole=${user.role}&schoolId=${schoolId}&countOnly=true`),
        fetch(`/api/admin/follows?status=rejected&userRole=${user.role}&schoolId=${schoolId}&countOnly=true`)
      ]);
      
      const [pendingData, approvedData, rejectedData] = await Promise.all([
        pendingRes.json(),
        approvedRes.json(),
        rejectedRes.json()
      ]);
      
      setPendingCount(pendingData.count || 0);
      setApprovedCount(approvedData.count || 0);
      setRejectedCount(rejectedData.count || 0);
    } catch (err) {
      console.error('加载数量统计失败', err);
    }
  };

  const loadFollows = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const schoolId = user.school_id || '';
      const res = await fetch(`/api/admin/follows?status=${status}&userRole=${user.role}&schoolId=${schoolId}`);
      const data = await res.json();
      if (data.success) {
        setFollows(data.follows || []);
      }
    } catch (err) {
      console.error('加载失败', err);
    } finally {
      setLoading(false);
    }
  };

  // 直接在详情页审核
  const handleReviewDirectly = async (action: 'approve' | 'reject') => {
    if (!detailFollow) return;
    
    if (action === 'reject' && !reviewRemark.trim()) {
      alert('请填写拒绝原因');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followId: detailFollow.id,
          action,
          remark: action === 'reject' ? reviewRemark : undefined,
          userId: user?.id
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowDetailDialog(false);
        setDetailFollow(null);
        setReviewRemark('');
        loadFollows();
        loadCounts(); // 重新加载数量统计
      } else {
        alert(data.error || '操作失败');
      }
    } catch (err) {
      console.error('审核失败', err);
      alert('审核失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async () => {
    if (!detailFollow) return;
    
    if (reviewAction === 'reject' && !reviewRemark.trim()) {
      alert('请填写拒绝原因');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followId: detailFollow.id,
          action: reviewAction,
          remark: reviewRemark,
          userId: user?.id
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowReviewDialog(false);
        setShowDetailDialog(false);
        setDetailFollow(null);
        setReviewRemark('');
        loadFollows();
        loadCounts(); // 重新加载数量统计
      } else {
        alert(data.error || '操作失败');
      }
    } catch (err) {
      console.error('审核失败', err);
      alert('审核失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetailDialog = (follow: FollowRequest) => {
    setDetailFollow(follow);
    setShowDetailDialog(true);
  };

  const filteredFollows = follows.filter(f => 
    !searchKeyword || 
    f.parent?.phone?.includes(searchKeyword) || 
    f.parent?.name?.includes(searchKeyword) ||
    f.childName.includes(searchKeyword) ||
    f.team?.name?.includes(searchKeyword) ||
    f.schoolName?.includes(searchKeyword)
  );

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (!isActive && status === 'pending') {
      return <Badge className="bg-yellow-100 text-yellow-700">待审核</Badge>;
    }
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-700">已通过</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700">已拒绝</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin/dashboard" className="p-1">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div className="flex-1">
            <h1 className="font-semibold text-lg">家长关注审核</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 筛选标签 */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={status === 'pending' ? 'default' : 'outline'}
            onClick={() => setStatus('pending')}
            className={status === 'pending' ? 'bg-violet-500' : ''}
          >
            <Clock className="w-4 h-4 mr-1" />
            待审核 ({pendingCount})
          </Button>
          <Button
            variant={status === 'approved' ? 'default' : 'outline'}
            onClick={() => setStatus('approved')}
            className={status === 'approved' ? 'bg-green-500' : ''}
          >
            <Check className="w-4 h-4 mr-1" />
            已通过 ({approvedCount})
          </Button>
          <Button
            variant={status === 'rejected' ? 'default' : 'outline'}
            onClick={() => setStatus('rejected')}
            className={status === 'rejected' ? 'bg-red-500' : ''}
          >
            <X className="w-4 h-4 mr-1" />
            已拒绝 ({rejectedCount})
          </Button>
        </div>

        {/* 搜索框 */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="搜索家长姓名、手机号、小队名称..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* 列表 */}
        {loading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-500 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-500">加载中...</p>
          </div>
        ) : filteredFollows.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {status === 'pending' ? '暂无待审核的关注申请' : '暂无记录'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredFollows.map(follow => (
              <Card 
                key={follow.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => openDetailDialog(follow)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    {/* 待审核：精简显示 */}
                    {status === 'pending' ? (
                      <div className="flex items-center gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">家长姓名：</span>
                          <span className="font-medium">{follow.parent?.name || '未知'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">手机号：</span>
                          <span className="font-medium text-blue-600">{follow.parent?.phone || '-'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">关系：</span>
                          <span className="font-medium">{follow.relation || '-'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">学生姓名：</span>
                          <span className="font-medium">{follow.childName}</span>
                        </div>
                      </div>
                    ) : (
                      /* 已审核状态：完整信息 */
                      <div className="flex-1">
                        <div className="flex items-center gap-3 text-sm mb-2">
                          <span className="font-medium">{follow.parent?.name || '未知'}</span>
                          <span className="text-blue-600">{follow.parent?.phone || '-'}</span>
                          <span className="text-gray-500">{follow.relation || '-'}</span>
                          <span className="text-gray-400">→</span>
                          <span className="font-medium">{follow.childName}</span>
                          <span className="text-gray-500">{follow.childGrade || ''}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span>{follow.schoolName}</span>
                          <span>{follow.team?.name}</span>
                          <span>{new Date(follow.followedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    )}
                    
                    {/* 操作按钮/状态标签 */}
                    {status === 'pending' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetailDialog(follow);
                        }}
                        className="text-blue-600 border-blue-300 hover:bg-blue-50"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        详情
                      </Button>
                    ) : (
                      getStatusBadge(follow.status, follow.isActive)
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 详情弹窗 - 可滚动查看 */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>关注申请详情</DialogTitle>
          </DialogHeader>
          
          {detailFollow && (
            <div className="space-y-4 py-4">
              {/* 审核状态提示 */}
              {detailFollow.status === 'pending' ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-yellow-600" />
                    <span className="text-yellow-800 font-medium">等待审核</span>
                  </div>
                </div>
              ) : detailFollow.status === 'rejected' ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-600" />
                    <span className="text-red-800 font-medium">已拒绝</span>
                  </div>
                  {detailFollow.review_remark && (
                    <p className="text-red-600 text-sm mt-2">拒绝原因：{detailFollow.review_remark}</p>
                  )}
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-green-800 font-medium">已通过</span>
                  </div>
                </div>
              )}

              {/* 家长信息 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-700 mb-3">家长信息</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">姓名</p>
                    <p className="font-medium">{detailFollow.parent?.name || '未知'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">手机号</p>
                    <p className="font-medium text-blue-600">{detailFollow.parent?.phone || '-'}</p>
                  </div>
                </div>
              </div>

              {/* 孩子信息 */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-700 mb-3">孩子信息</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">学生姓名</p>
                    <p className="font-medium">{detailFollow.childName}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">年级</p>
                    <p className="font-medium">{detailFollow.childGrade || '-'}</p>
                  </div>
                  <div className={detailFollow.relation ? '' : 'col-span-2'}>
                    <p className="text-gray-500 text-xs">与孩子关系</p>
                    <p className="font-medium">{detailFollow.relation || '-'}</p>
                  </div>
                  {detailFollow.guardianReason && (
                    <div className="col-span-2">
                      <p className="text-orange-600 text-xs font-medium">监护人说明</p>
                      <p className="text-gray-700 bg-white rounded p-2 mt-1">{detailFollow.guardianReason}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 小队信息 */}
              <div className="bg-green-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-700 mb-3">关注的小队</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">小队名称</p>
                    <p className="font-medium text-green-600">{detailFollow.team?.name || '-'}</p>
                  </div>
                  {detailFollow.schoolName && (
                    <div>
                      <p className="text-gray-500 text-xs">所属学校</p>
                      <p className="font-medium">{detailFollow.schoolName}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 申请时间 */}
              <div className="text-sm text-gray-500 text-center">
                申请时间：{new Date(detailFollow.followedAt).toLocaleString()}
              </div>

              {/* 审核操作区 - 仅待审核状态显示 */}
              {detailFollow.status === 'pending' && (
                <div className="border-t pt-4 mt-4 space-y-3">
                  {/* 通过审核 */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h5 className="font-medium text-green-800 mb-2">通过审核</h5>
                    <p className="text-sm text-green-600 mb-3">确认以上信息无误后，点击按钮通过审核</p>
                    <Button
                      className="w-full bg-green-500 hover:bg-green-600"
                      onClick={() => handleReviewDirectly('approve')}
                      disabled={submitting}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      {submitting ? '处理中...' : '确认通过'}
                    </Button>
                  </div>

                  {/* 拒绝审核 */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                    <h5 className="font-medium text-red-800">拒绝审核</h5>
                    <div className="bg-amber-100 text-amber-800 text-xs rounded p-2">
                      如有疑问建议先电话沟通了解情况，确定要做拒绝处理则写清拒绝原因
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-gray-600">
                        拒绝原因 <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        placeholder="请填写拒绝原因，以便家长了解情况"
                        value={reviewRemark}
                        onChange={(e) => setReviewRemark(e.target.value)}
                        className="w-full h-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                      />
                    </div>
                    <Button
                      className="w-full bg-red-500 hover:bg-red-600"
                      onClick={() => handleReviewDirectly('reject')}
                      disabled={submitting || !reviewRemark.trim()}
                    >
                      <X className="w-4 h-4 mr-2" />
                      {submitting ? '处理中...' : '确认拒绝'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
