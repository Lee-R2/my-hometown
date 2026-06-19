/**
 * 全局共享常量
 */

// ========== 点赞相关 ==========
/** 每个赞转化的积分（被点赞者获得） */
export const LIKE_POINTS = 5;
/** 点赞者获得的积分 */
export const LIKER_POINTS = 1;
/** 同一阶段内最多可点赞的数量 */
export const MAX_LIKES_PER_STAGE = 3;
/** 合成爱心宝石所需的碎片数 */
export const FRAGMENTS_PER_GEM = 10;

// ========== 奖励类型配置 ==========
export const REWARD_TYPE_CONFIG: Record<string, { 
  label: string; 
  color: string; 
  bgColor: string; 
  borderColor: string 
}> = {
  badge: { label: '徽章', color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  gem: { label: '宝石', color: 'text-purple-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
  skill_card: { label: '隐藏技能卡', color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
  tool_card: { label: '隐藏工具卡', color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
  achievement: { label: '成就', color: 'text-yellow-600', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
  certificate: { label: '证书', color: 'text-pink-600', bgColor: 'bg-pink-50', borderColor: 'border-pink-200' },
  heart_fragment: { label: '爱心宝石碎片', color: 'text-red-500', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
  heart_gem: { label: '爱心宝石', color: 'text-pink-500', bgColor: 'bg-pink-50', borderColor: 'border-pink-200' },
};

/** 获取奖励类型配置 */
export function getRewardTypeConfig(type: string) {
  return REWARD_TYPE_CONFIG[type] || { 
    label: type, 
    color: 'text-gray-600', 
    bgColor: 'bg-gray-50', 
    borderColor: 'border-gray-200' 
  };
}

// ========== 奖励类型标签 ==========
export const REWARD_TYPE_LABELS: Record<string, string> = {
  badge: '徽章',
  gem: '宝石',
  skill_card: '隐藏技能卡',
  tool_card: '隐藏工具卡',
  achievement: '成就',
  certificate: '证书',
  heart_fragment: '爱心宝石碎片',
  heart_gem: '爱心宝石',
};

// ========== 产出审核状态配置 ==========
export const SUBMISSION_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  approved: { label: '已通过', color: 'bg-green-100 text-green-700 border-green-200' },
  rejected: { label: '已退回', color: 'bg-red-100 text-red-700 border-red-200' },
  overdue: { label: '超时未提交', color: 'bg-orange-100 text-orange-700 border-orange-200' },
};

// ========== 产出评价等级配置 ==========
export const SUBMISSION_RATING_CONFIG: Record<string, { label: string; color: string }> = {
  excellent: { label: '优秀', color: 'text-purple-600 bg-purple-50' },
  approved: { label: '合格', color: 'text-green-600 bg-green-50' },
  rejected: { label: '不合格', color: 'text-red-600 bg-red-50' },
};

// ========== 小队状态配置 ==========
export const TEAM_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: '进行中', color: 'bg-green-100 text-green-700' },
  completed: { label: '已完成', color: 'bg-blue-100 text-blue-700' },
  paused: { label: '已暂停', color: 'bg-yellow-100 text-yellow-700' },
};
