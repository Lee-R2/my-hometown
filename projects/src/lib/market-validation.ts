import {
  CreateListingInput,
  CreateOfferInput,
  ListingType,
  ItemType,
  Scope,
  ValidationFailure,
  ValidationResult,
} from './market-types';

function fail(field: string, message: string): ValidationFailure & { valid: false } {
  return { valid: false, field, message };
}

function ok(): ValidationResult {
  return { valid: true };
}

/**
 * 校验创建挂单输入
 */
export function validateCreateListing(input: CreateListingInput): ValidationResult {
  // listingType
  if (!['sell', 'buy', 'barter'].includes(input.listingType)) {
    return fail('listingType', '挂单类型必须是 sell / buy / barter');
  }

  // itemType
  if (!['tool', 'skill', 'work'].includes(input.itemType)) {
    return fail('itemType', '物品类型必须是 tool / skill / work');
  }

  // itemName
  if (!input.itemName || input.itemName.trim().length === 0) {
    return fail('itemName', '物品名称不能为空');
  }
  if (input.itemName.length > 200) {
    return fail('itemName', '物品名称不能超过200字');
  }

  // quantity
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return fail('quantity', '数量必须是正整数');
  }

  // 出售/求购：itemRef 对 sell 必填（需关联 user_reward 或 submission）；buy 可选
  if (input.listingType === 'sell' && !input.itemRef) {
    return fail('itemRef', '出售挂单必须关联物品ID');
  }

  // price 规则
  if (input.listingType === 'sell' || input.listingType === 'buy') {
    if (input.price === undefined || input.price === null) {
      return fail('price', '出售/求购必须填写积分价格');
    }
    if (!Number.isInteger(input.price) || input.price < 0) {
      return fail('price', '积分价格必须是非负整数');
    }
  }

  // barter 规则
  if (input.listingType === 'barter') {
    if (input.listingType === 'barter' && !input.itemRef) {
      return fail('itemRef', '兑换挂单必须关联自己用于交换的物品');
    }
    if (!input.barterFor || !input.barterFor.itemType) {
      return fail('barterFor', '兑换挂单必须填写期望交换的物品类型');
    }
    if (!['tool', 'skill', 'work'].includes(input.barterFor.itemType)) {
      return fail('barterFor.itemType', '期望物品类型必须是 tool / skill / work');
    }
  }

  // scope
  if (!['theme', 'school'].includes(input.scope)) {
    return fail('scope', '范围必须是 theme / school');
  }
  if (input.scope === 'theme' && !input.themeId) {
    return fail('themeId', 'scope=theme 时必须填写 themeId');
  }
  if (input.scope === 'school' && !input.schoolId) {
    return fail('schoolId', 'scope=school 时必须填写 schoolId');
  }

  return ok();
}

/**
 * 校验创建报价输入
 */
export function validateCreateOffer(
  input: CreateOfferInput,
  listingType: ListingType
): ValidationResult {
  if (listingType === 'buy') {
    return fail('listingType', '求购单不接受报价，请直接购买推荐商品');
  }

  if (input.offerType === 'price') {
    if (input.offerPrice === undefined || input.offerPrice === null) {
      return fail('offerPrice', '议价必须填写报价积分');
    }
    if (!Number.isInteger(input.offerPrice) || input.offerPrice < 0) {
      return fail('offerPrice', '议价积分必须是非负整数');
    }
  } else if (input.offerType === 'barter') {
    if (!input.offerItemType || !['tool', 'skill', 'work'].includes(input.offerItemType)) {
      return fail('offerItemType', '兑换响应必须填写有效物品类型');
    }
    if (!input.offerItemRef) {
      return fail('offerItemRef', '兑换响应必须关联自己的物品');
    }
    if (!input.offerItemName || input.offerItemName.trim().length === 0) {
      return fail('offerItemName', '兑换响应物品名不能为空');
    }
    if (input.offerQuantity !== undefined && input.offerQuantity !== 1) {
      return fail('offerQuantity', '兑换响应物品数量必须为1（单件交换）');
    }
  } else {
    return fail('offerType', '报价类型必须是 price / barter');
  }

  return ok();
}

/**
 * 判断 reward.type 是否属于工具类
 */
export function isToolRewardType(rewardType: string): boolean {
  return ['badge', 'gem', 'tool_card', 'hidden_tool'].includes(rewardType);
}

/**
 * 判断 reward.type 是否属于技能类
 */
export function isSkillRewardType(rewardType: string): boolean {
  return ['skill_card', 'hidden_skill'].includes(rewardType);
}

/**
 * 根据 reward.type 推断市集 itemType
 */
export function rewardTypeToItemType(rewardType: string): ItemType | null {
  if (isToolRewardType(rewardType)) return 'tool';
  if (isSkillRewardType(rewardType)) return 'skill';
  return null;
}
