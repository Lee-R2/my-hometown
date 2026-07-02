// 云朵市集类型定义

export type ListingType = 'sell' | 'buy' | 'barter';
export type ItemType = 'tool' | 'skill' | 'work';
export type Scope = 'theme' | 'school';
export type ListingStatus = 'active' | 'sold_out' | 'cancelled' | 'traded';
export type OfferType = 'price' | 'barter';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'auto_expired';
export type TradeType = 'buy' | 'barter';
export type TradeStatus = 'completed' | 'disputed' | 'refunded';

// 工具类物品对应的 reward.type
export const TOOL_REWARD_TYPES = ['badge', 'gem', 'tool_card', 'hidden_tool'] as const;
// 技能类物品对应的 reward.type
export const SKILL_REWARD_TYPES = ['skill_card', 'hidden_skill'] as const;

export interface BarterFor {
  itemType: ItemType;
  itemName?: string;
}

export interface CreateListingInput {
  listingType: ListingType;
  itemType: ItemType;
  itemRef?: string;
  itemName: string;
  itemDescription?: string;
  itemImageUrl?: string;
  quantity: number;
  price?: number;
  barterFor?: BarterFor;
  scope: Scope;
  themeId?: string;
  schoolId?: string;
  expiresAt?: string;
}

export interface CreateOfferInput {
  offerType: OfferType;
  offerPrice?: number;
  offerItemType?: ItemType;
  offerItemRef?: string;
  offerItemName?: string;
  offerQuantity?: number;
}

export interface ValidationFailure {
  field: string;
  message: string;
}

export interface ValidationSuccess {
  valid: true;
}

export type ValidationResult = ValidationSuccess | (ValidationFailure & { valid: false });
