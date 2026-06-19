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

// Chinese truncation fixes - the \uFFFD char means a UTF-8 byte was lost
const truncationMap = {
    '反\uFFFD': '反馈',
    '配\uFFFD': '配置',
    '模\uFFFD': '模块',
    '统\uFFFD': '统计',
    '表\uFFFD': '表',
    '量\uFFFD': '量',
    '调\uFFFD': '调用',
    '数\uFFFD': '数据',
    '角\uFFFD': '角色',
    '保\uFFFD': '保存',
    '迁\uFFFD': '迁移',
    '�?': '',
};

let fixedCount = 0;

corruptedFiles.forEach(relPath => {
    const filePath = path.join(projectDir, relPath);
    if (!fs.existsSync(filePath)) {
        console.log('NOT FOUND:', relPath);
        return;
    }
    
    let content = fs.readFileSync(filePath, 'utf-8');
    let originalContent = content;
    let fileFixCount = 0;
    
    // Fix 1: Truncated Chinese + U+FFFD + whitespace + code on same line
    // Pattern: "中文\uFFFD      code" → "中文完整\n      code"
    const pattern1 = /([\u4e00-\u9fff])\uFFFD\s{2,}(\w)/g;
    content = content.replace(pattern1, (match, ch, nextCode) => {
        fileFixCount++;
        const partial = ch + '\uFFFD';
        for (const [truncated, fixed] of Object.entries(truncationMap)) {
            if (partial === truncated) return fixed + '\n      ' + nextCode;
        }
        return ch + '\n      ' + nextCode;
    });
    
    // Fix 2: Truncated Chinese + U+FFFD + space + * (in JSDoc comments)
    // Pattern: "中文\uFFFD * " → "中文完整\n * "
    const pattern2 = /([\u4e00-\u9fff])\uFFFD\s+\*/g;
    content = content.replace(pattern2, (match, ch) => {
        fileFixCount++;
        const partial = ch + '\uFFFD';
        for (const [truncated, fixed] of Object.entries(truncationMap)) {
            if (partial === truncated) return fixed + '\n *';
        }
        return ch + '\n *';
    });
    
    // Fix 3: Truncated Chinese + U+FFFD + space + - (in comments)
    const pattern3 = /([\u4e00-\u9fff])\uFFFD\s+-/g;
    content = content.replace(pattern3, (match, ch) => {
        fileFixCount++;
        const partial = ch + '\uFFFD';
        for (const [truncated, fixed] of Object.entries(truncationMap)) {
            if (partial === truncated) return fixed + '\n -';
        }
        return ch + '\n -';
    });
    
    // Fix 4: Truncated Chinese + U+FFFD before closing quote or comma in strings
    const pattern4 = /([\u4e00-\u9fff])\uFFFD(['",])/g;
    content = content.replace(pattern4, (match, ch, punct) => {
        fileFixCount++;
        const partial = ch + '\uFFFD';
        for (const [truncated, fixed] of Object.entries(truncationMap)) {
            if (partial === truncated) return fixed + punct;
        }
        return ch + punct;
    });
    
    // Fix 5: Standalone U+FFFD at end of line
    const pattern5 = /\uFFFD\n/g;
    content = content.replace(pattern5, '\n');
    
    // Fix 6: U+FFFD followed by whitespace and newline
    const pattern6 = /\uFFFD\s*\n/g;
    content = content.replace(pattern6, '\n');
    
    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf-8');
        fixedCount++;
        console.log(`FIXED (${fileFixCount} fixes): ${relPath}`);
    } else {
        console.log('OK:', relPath);
    }
});

console.log(`\nFixed ${fixedCount} files`);
