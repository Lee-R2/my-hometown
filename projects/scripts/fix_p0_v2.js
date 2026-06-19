const fs = require('fs');
const path = require('path');

const projectDir = 'C:\\Users\\李文渊\\Desktop\\our home\\projects';

// Files with TS errors from batch replace corruption
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

// Common Chinese truncation patterns and their likely completions
const truncationFixes = {
    '配?': '配置',
    '配�?': '配置',
    '模?': '模块',
    '模�?': '模块',
    '统?': '统计',
    '统�?': '统计',
    '反?': '反馈',
    '反�?': '反馈',
    '表?': '表',
    '表�?': '表',
    '量?': '量',
    '量�?': '量',
    '调?': '调用',
    '调�?': '调用',
    '数?': '数据',
    '数�?': '数据',
    '角?': '角色',
    '角�?': '角色',
    '保?': '保存',
    '保�?': '保存',
    '�?': '',  // standalone garbage
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
    
    // Fix 1: Truncated Chinese in comments - pattern: "中文?      code" or "中文?    code"
    // The ? is where a Chinese char was truncated, and the next line's code was appended
    // We need to: a) restore the Chinese char, b) add a newline
    const truncatedLinePattern = /([\u4e00-\u9fff])\?\s{2,}(\w)/g;
    content = content.replace(truncatedLinePattern, (match, chineseChar, nextCode) => {
        fileFixCount++;
        // Try to find the right completion
        const partial = chineseChar + '?';
        for (const [truncated, fixed] of Object.entries(truncationFixes)) {
            if (partial === truncated) {
                return fixed + '\n      ' + nextCode;
            }
        }
        // Default: just add newline after the Chinese char
        return chineseChar + '\n      ' + nextCode;
    });
    
    // Fix 2: Truncated Chinese in strings - pattern: '中文?,' or "中文?,"
    // These are in string literals where the last Chinese char was truncated
    const truncatedStringPattern = /([\u4e00-\u9fff])\?,/g;
    content = content.replace(truncatedStringPattern, (match, chineseChar) => {
        fileFixCount++;
        const partial = chineseChar + '?';
        for (const [truncated, fixed] of Object.entries(truncationFixes)) {
            if (partial === truncated) {
                return fixed + ',';
            }
        }
        return chineseChar + ',';
    });
    
    // Fix 3: Truncated Chinese before closing quote - pattern: '中文?' or "中文?"
    const truncatedQuotePattern = /([\u4e00-\u9fff])\?['"]/g;
    content = content.replace(truncatedQuotePattern, (match, chineseChar) => {
        fileFixCount++;
        const partial = chineseChar + '?';
        for (const [truncated, fixed] of Object.entries(truncationFixes)) {
            if (partial === truncated) {
                return fixed + match[match.length - 1];
            }
        }
        return chineseChar + match[match.length - 1];
    });
    
    // Fix 4: Standalone ? at end of Chinese line (before newline)
    const standaloneQPattern = /([\u4e00-\u9fff])\?\n/g;
    content = content.replace(standaloneQPattern, (match, chineseChar) => {
        fileFixCount++;
        const partial = chineseChar + '?';
        for (const [truncated, fixed] of Object.entries(truncationFixes)) {
            if (partial === truncated) {
                return fixed + '\n';
            }
        }
        return chineseChar + '\n';
    });
    
    // Fix 5: Replace @/utils/api-error with @/lib/api-error (if any)
    if (content.includes('@/utils/api-error')) {
        content = content.replace(/from ["']@\/utils\/api-error["']/g, "from '@/lib/api-error'");
        fileFixCount++;
    }
    
    // Fix 6: Replace handleApiError with catchErrorResponse
    if (content.includes('handleApiError')) {
        content = content.replace(/return handleApiError\(error\);/g, "return catchErrorResponse(error, '操作失败');");
        content = content.replace(/import \{ handleApiError \} from/g, "import { catchErrorResponse } from");
        fileFixCount++;
    }
    
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
