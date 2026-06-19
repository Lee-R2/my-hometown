const fs = require('fs');
const path = require('path');

const BASE = 'c:\\Users\\李文渊\\Desktop\\our home\\projects\\src\\app\\api';

const adminFiles = [
  'restore-data/route.ts',
  'diagnostics/db/route.ts',
  'test/accounts/route.ts',
  'test/user-query/route.ts',
  'init-users/route.ts',
  'init-teams/route.ts',
  'migrate/password/route.ts',
  'migrate/all-passwords/route.ts',
  'migrate/account-status/route.ts',
  'migrate/security/route.ts',
  'migrate/tools/route.ts',
];

let totalFixed = 0;

for (const file of adminFiles) {
  const fullPath = path.join(BASE, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP (not found): ${file}`);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  let original = content;

  // Replace: details: error instanceof Error ? error.message : String(error)
  content = content.replace(
    /details:\s*error\s+instanceof\s+Error\s*\?\s*error\.message\s*:\s*String\(error\)/g,
    "details: '操作失败，请查看服务器日志'"
  );

  // Replace: error: error instanceof Error ? error.message : String(error)
  content = content.replace(
    /error:\s*error\s+instanceof\s+Error\s*\?\s*error\.message\s*:\s*String\(error\)/g,
    "error: '操作失败'"
  );

  // Replace: message: error.message
  content = content.replace(
    /message:\s*error\.message/g,
    "message: '操作失败'"
  );

  // Replace template strings: `${user.username}: ${error instanceof Error ? error.message : String(error)}`
  content = content.replace(
    /`\$\{([^}]+)\}:\s*\$\{error\s+instanceof\s+Error\s*\?\s*error\.message\s*:\s*String\(error\)\}`/g,
    "`${$1}: 操作失败`"
  );

  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`FIXED: ${file}`);
    totalFixed++;
  } else {
    console.log(`NO CHANGE: ${file}`);
  }
}

console.log(`\nTotal fixed: ${totalFixed}`);
