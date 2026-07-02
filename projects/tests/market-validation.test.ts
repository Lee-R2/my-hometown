import { describe, it, expect } from 'vitest';
import {
  validateCreateListing,
  validateCreateOffer,
  isToolRewardType,
  isSkillRewardType,
  rewardTypeToItemType,
} from '../src/lib/market-validation';
import { CreateListingInput, CreateOfferInput } from '../src/lib/market-types';

describe('validateCreateListing', () => {
  const validSell: CreateListingInput = {
    listingType: 'sell',
    itemType: 'tool',
    itemRef: 'reward-1',
    itemName: '隐藏工具卡',
    quantity: 2,
    price: 50,
    scope: 'theme',
    themeId: 'theme-1',
  };

  it('合法出售挂单通过校验', () => {
    const r = validateCreateListing(validSell);
    expect(r.valid).toBe(true);
  });

  it('出售缺 itemRef 失败', () => {
    const r = validateCreateListing({ ...validSell, itemRef: undefined });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('itemRef');
  });

  it('出售缺 price 失败', () => {
    const r = validateCreateListing({ ...validSell, price: undefined });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('price');
  });

  it('兑换挂单缺 barterFor 失败', () => {
    const r = validateCreateListing({
      ...validSell,
      listingType: 'barter',
      price: undefined,
      barterFor: undefined,
    });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('barterFor');
  });

  it('兑换挂单缺 itemRef 失败', () => {
    const r = validateCreateListing({
      ...validSell,
      listingType: 'barter',
      price: undefined,
      itemRef: undefined,
      barterFor: { itemType: 'skill' },
    });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('itemRef');
  });

  it('scope=theme 缺 themeId 失败', () => {
    const r = validateCreateListing({ ...validSell, themeId: undefined });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('themeId');
  });

  it('scope=school 缺 schoolId 失败', () => {
    const r = validateCreateListing({ ...validSell, scope: 'school', themeId: undefined, schoolId: undefined });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('schoolId');
  });

  it('数量为0失败', () => {
    const r = validateCreateListing({ ...validSell, quantity: 0 });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('quantity');
  });

  it('非法 listingType 失败', () => {
    const r = validateCreateListing({ ...validSell, listingType: 'invalid' as any });
    expect(r.valid).toBe(false);
  });
});

describe('validateCreateOffer', () => {
  it('对求购单报价失败', () => {
    const r = validateCreateOffer({ offerType: 'price', offerPrice: 10 }, 'buy');
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('listingType');
  });

  it('合法议价通过', () => {
    const r = validateCreateOffer({ offerType: 'price', offerPrice: 40 }, 'sell');
    expect(r.valid).toBe(true);
  });

  it('议价缺积分失败', () => {
    const r = validateCreateOffer({ offerType: 'price' }, 'sell');
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('offerPrice');
  });

  it('兑换响应数量非1失败', () => {
    const r = validateCreateOffer({
      offerType: 'barter',
      offerItemType: 'skill',
      offerItemRef: 'r1',
      offerItemName: '隐语术',
      offerQuantity: 2,
    }, 'barter');
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('offerQuantity');
  });

  it('合法兑换响应通过', () => {
    const r = validateCreateOffer({
      offerType: 'barter',
      offerItemType: 'skill',
      offerItemRef: 'r1',
      offerItemName: '隐语术',
      offerQuantity: 1,
    }, 'barter');
    expect(r.valid).toBe(true);
  });
});

describe('rewardTypeToItemType', () => {
  it('badge -> tool', () => {
    expect(rewardTypeToItemType('badge')).toBe('tool');
  });
  it('hidden_tool -> tool', () => {
    expect(rewardTypeToItemType('hidden_tool')).toBe('tool');
  });
  it('skill_card -> skill', () => {
    expect(rewardTypeToItemType('skill_card')).toBe('skill');
  });
  it('hidden_skill -> skill', () => {
    expect(rewardTypeToItemType('hidden_skill')).toBe('skill');
  });
  it('未知类型 -> null', () => {
    expect(rewardTypeToItemType('unknown')).toBeNull();
  });
});
