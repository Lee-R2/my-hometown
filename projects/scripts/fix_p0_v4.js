const fs = require('fs');
const path = require('path');

const projectDir = 'C:\\Users\\李文渊\\Desktop\\our home\\projects';

const corruptedFiles = [
    'src/app/api/admin/feedback/route.ts',
    'src/app/api/admin/follows/route.ts',
    'src/app/api/admin/notifications/route.ts',
    'src/app/api/admin/overdue-tasks/route.ts',
    'src/app/api/admin/pretest/questions/route.ts',
    'src/app/api/admin/tasks/hints/route.ts',
    'src/app/api/ai/create-theme/route.ts',
    'src/app/api/ai/data-analysis/route.ts',
    'src/app/api/ai/entrocamp/route.ts',
    'src/app/api/ai/memory/user/route.ts',
    'src/app/api/ai/review-submission/route.ts',
    'src/app/api/ai/yinhe-image/route.ts',
    'src/app/api/ai/yinhe-video/route.ts',
    'src/app/api/auth/team-change-password/route.ts',
    'src/app/api/diagnostics/db/route.ts',
    'src/app/api/init-teams/route.ts',
    'src/app/api/init-test-data/route.ts',
    'src/app/api/init-users/route.ts',
    'src/app/api/migrate/account-status/route.ts',
    'src/app/api/migrate/all-passwords/route.ts',
    'src/app/api/migrate/password/route.ts',
    'src/app/api/migrate/security/route.ts',
    'src/app/api/migrate/tools/route.ts',
    'src/app/api/restore-data/route.ts',
    'src/app/api/rewards/route.ts',
    'src/app/api/schools/regions/route.ts',
    'src/app/api/skills/route.ts',
    'src/app/api/sync/route.ts',
    'src/app/api/team/borrow/overdue/route.ts',
    'src/app/api/team/borrow/repay/route.ts',
    'src/app/api/team/final-task-feedback/route.ts',
    'src/app/api/test/accounts/route.ts',
    'src/app/api/test/user-query/route.ts',
    'src/app/api/volunteer/send-message/route.ts',
];

// The corruption pattern is: Chinese char + \uFFFD + ? (U+003F)
// This is a UTF-8 double-byte corruption where the last byte of a Chinese char was lost
// and replaced with \uFFFD?, then the next line was appended on the same line

// Chinese char completions based on context
const charCompletions = {
    '反': '馈',  // 反馈
    '配': '置',  // 配置
    '模': '块',  // 模块
    '统': '计',  // 统计
    '迁': '移',  // 迁移
    '调': '用',  // 调用
    '角': '色',  // 角色
    '保': '存',  // 保存
    '领': '用',  // 领用
};

let fixedCount = 0;
let totalFixes = 0;

corruptedFiles.forEach(relPath => {
    const filePath = path.join(projectDir, relPath);
    if (!fs.existsSync(filePath)) {
        console.log('NOT FOUND:', relPath);
        return;
    }
    
    let content = fs.readFileSync(filePath, 'utf-8');
    let originalContent = content;
    let fileFixCount = 0;
    
    // Fix 1: Chinese char + \uFFFD? + whitespace + code on same line
    // Pattern: "中文\uFFFD?      code" → "中文完整\n      code"
    const pattern1 = /([\u4e00-\u9fff])\uFFFD\?\s{2,}(\w)/g;
    content = content.replace(pattern1, (match, ch, nextCode) => {
        fileFixCount++;
        const completion = charCompletions[ch] || '';
        return ch + completion + '\n      ' + nextCode;
    });
    
    // Fix 2: Chinese char + \uFFFD? + space + * (in JSDoc)
    const pattern2 = /([\u4e00-\u9fff])\uFFFD\?\s+\*/g;
    content = content.replace(pattern2, (match, ch) => {
        fileFixCount++;
        const completion = charCompletions[ch] || '';
        return ch + completion + '\n *';
    });
    
    // Fix 3: Chinese char + \uFFFD? + space + - (in comments)
    const pattern3 = /([\u4e00-\u9fff])\uFFFD\?\s+-/g;
    content = content.replace(pattern3, (match, ch) => {
        fileFixCount++;
        const completion = charCompletions[ch] || '';
        return ch + completion + '\n -';
    });
    
    // Fix 4: Chinese char + \uFFFD? before closing quote or comma in strings
    const pattern4 = /([\u4e00-\u9fff])\uFFFD\?(['",}])/g;
    content = content.replace(pattern4, (match, ch, punct) => {
        fileFixCount++;
        const completion = charCompletions[ch] || '';
        return ch + completion + punct;
    });
    
    // Fix 5: Chinese char + \uFFFD? at end of line (before newline)
    const pattern5 = /([\u4e00-\u9fff])\uFFFD\?\s*\n/g;
    content = content.replace(pattern5, (match, ch) => {
        fileFixCount++;
        const completion = charCompletions[ch] || '';
        return ch + completion + '\n';
    });
    
    // Fix 6: Standalone \uFFFD? (not preceded by Chinese char)
    const pattern6 = /\uFFFD\?/g;
    content = content.replace(pattern6, '');
    
    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf-8');
        fixedCount++;
        totalFixes += fileFixCount;
        console.log(`FIXED (${fileFixCount} fixes): ${relPath}`);
    } else {
        console.log('OK:', relPath);
    }
});

console.log(`\nFixed ${fixedCount} files with ${totalFixes} total fixes`);
