/**
 * 根据原始年级和关注时间，计算当前年级
 * 每过一个9月1日，年级自动+1，最高六年级
 */
export function calculateCurrentGrade(originalGrade: string | null, followedAt: string | null): string {
  if (!originalGrade) return originalGrade || '';
  
  const gradeMap: Record<string, number> = {
    '一年级': 1, '二年级': 2, '三年级': 3,
    '四年级': 4, '五年级': 5, '六年级': 6,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
  };
  
  const numberMap: Record<number, string> = {
    1: '一年级', 2: '二年级', 3: '三年级',
    4: '四年级', 5: '五年级', 6: '六年级',
  };
  
  const baseGrade = gradeMap[originalGrade];
  if (!baseGrade) return originalGrade; // 无法识别的年级格式原样返回
  
  if (!followedAt) return originalGrade;
  
  const followDate = new Date(followedAt);
  const now = new Date();
  
  // 计算从关注时间到当前经过了多少个9月1日
  let sep1Count = 0;
  for (let year = followDate.getFullYear(); year <= now.getFullYear(); year++) {
    const sep1 = new Date(year, 8, 1); // 9月1日 (month是0-indexed)
    // 必须在关注日期之后（不含当天），且在当前日期之前（含当天）
    if (sep1 > followDate && sep1 <= now) {
      sep1Count++;
    }
  }
  
  const currentGrade = Math.min(baseGrade + sep1Count, 6);
  return numberMap[currentGrade];
}
