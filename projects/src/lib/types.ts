/**
 * 全局共享类型定义
 */

// ========== 点赞统计 ==========
export interface LikesStats {
  /** 获得的点赞数 */
  received: number;
  /** 送出的点赞数 */
  given: number;
  /** 点赞转化积分 */
  pointsFromLikes: number;
}

// ========== 爱心宝石统计 ==========
export interface HeartGemsStats {
  /** 宝石碎片数量 */
  fragments: number;
  /** 宝石数量 */
  gems: number;
  /** 累计送出点赞数 */
  totalSentLikes: number;
  /** 合成宝石所需碎片数 */
  fragmentsPerGem: number;
}

// ========== 激励统计 ==========
export interface RewardStats {
  /** 总数 */
  total: number;
  /** 各类型数量 */
  byType: Record<string, number>;
  /** 总积分 */
  totalPoints: number;
}

// ========== 奖励信息 ==========
export interface RewardInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  type: string;
  image_url?: string | null;
  conditions?: Array<{ type: string; value: string | number; description: string }> | null;
  condition_logic?: 'and' | 'or' | null;
}

// ========== 用户奖励记录 ==========
export interface UserReward {
  id: string;
  earned_at: string;
  task_id: string;
  reward_id: string;
  rewards: RewardInfo | null;
}

// ========== 分组奖励 ==========
export type GroupedRewards = Record<string, UserReward[]>;
