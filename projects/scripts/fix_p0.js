const fs = require('fs');
const path = require('path');

const projectDir = 'C:\\Users\\李文渊\\Desktop\\our home\\projects';

// List of files with TS errors from the batch replace script
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

// The batch replace script replaced this pattern:
// catch (error) {
//     console.error('Error:', error);
//     return NextResponse.json({ success: false, message: 'Internal Server Error', status: 500 }, { status: 500 });
// }
// WITH:
// catch (error) {
//     console.error('Error:', error);
//     return handleApiError(error);
// }
// AND added: import { handleApiError } from "@/utils/api-error";

// But it also corrupted files by merging lines. The key issues are:
// 1. The import from @/utils/api-error doesn't exist - should be @/lib/api-error
// 2. Some files had their content mangled (lines merged, Chinese chars truncated)

// Strategy: For each corrupted file, we need to:
// 1. Fix the import path from @/utils/api-error to @/lib/api-error
// 2. Fix handleApiError usage - it should use catchErrorResponse from @/lib/api-error instead
//    since handleApiError doesn't exist in @/lib/api-error
// 3. Fix any mangled content (truncated Chinese, merged lines)

let fixedCount = 0;

corruptedFiles.forEach(relPath => {
    const filePath = path.join(projectDir, relPath);
    
    if (!fs.existsSync(filePath)) {
        console.log('NOT FOUND:', relPath);
        return;
    }
    
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;
    
    // Fix 1: Replace @/utils/api-error import with @/lib/api-error
    if (content.includes('@/utils/api-error')) {
        content = content.replace(/from ["']@\/utils\/api-error["']/g, 'from "@/lib/api-error"');
        modified = true;
    }
    
    // Fix 2: handleApiError doesn't exist in @/lib/api-error. 
    // The correct function is catchErrorResponse(error) or handleApiError needs to be added.
    // Let's check what's available in api-error.ts
    // Available: catchErrorResponse, supabaseErrorResponse, ApiErrors, errorResponse, classifyError, classifySupabaseError
    // handleApiError is NOT exported. We need to either:
    // a) Add handleApiError to @/lib/api-error, or
    // b) Replace handleApiError(error) with catchErrorResponse(error, '操作失败')
    
    // Let's go with option (a) - add handleApiError as a simple wrapper
    
    if (content.includes('handleApiError(error)')) {
        // Replace with catchErrorResponse which is the correct function
        content = content.replace(/return handleApiError\(error\);/g, "return catchErrorResponse(error, '操作失败');");
        // Also update the import to include catchErrorResponse
        content = content.replace(
            /import \{ handleApiError \} from ["']@\/lib\/api-error["'];/g,
            "import { catchErrorResponse } from '@/lib/api-error';"
        );
        modified = true;
    }
    
    // Fix 3: Fix mangled content - lines where Chinese text was truncated and merged with code
    // Pattern: "中文?      code" or "中文?    code" - the ? is a truncation marker
    // This happens when the regex ate newlines between a comment and the next line
    content = content.replace(/([\u4e00-\u9fff])\?\s{2,}(\w)/g, '$1\n      $2');
    
    // Fix 4: Fix truncated Chinese strings in quotes
    // Pattern: '中文?,' or "中文?," - the Chinese char before ? was truncated
    // We can't restore the original char, but we can at least fix the syntax
    // by removing the ? and letting the string close properly
    
    if (modified || content !== fs.readFileSync(filePath, 'utf-8')) {
        fs.writeFileSync(filePath, content, 'utf-8');
        fixedCount++;
        console.log('FIXED:', relPath);
    }
});

console.log(`\nFixed ${fixedCount} files`);
