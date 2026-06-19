const fs = require('fs');
const path = require('path');

const BASE = 'c:\\Users\\李文渊\\Desktop\\our home\\projects\\src\\app\\api';

const files = [
  'submissions/[id]/review/route.ts',
  'volunteers/[id]/route.ts',
  'rewards/[id]/route.ts',
  'rewards/route.ts',
  'tools/[id]/route.ts',
  'tools/route.ts',
  'skills/[id]/route.ts',
  'skills/route.ts',
  'teams/route.ts',
  'tasks/[id]/tools/route.ts',
  'tasks/[id]/skills/route.ts',
  'tasks/route.ts',
  'submissions/route.ts',
  'parent/teams/route.ts',
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
  'volunteers/route.ts',
  'ai/data-analysis/route.ts',
];

let totalFixed = 0;

for (const file of files) {
  const fullPath = path.join(BASE, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP (not found): ${file}`);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  let modified = false;

  // Pattern 1: { error: 'xxx: ' + error.message }
  const p1 = /\{\s*error:\s*'([^']*)'\s*\+\s*error\.message\s*\}/g;
  if (p1.test(content)) {
    content = content.replace(p1, (match, prefix) => {
      return `{ error: '${prefix.trim()}' }`;
    });
    modified = true;
  }

  // Pattern 2: { error: `xxx ${error.message}` }
  const p2 = /\{\s*error:\s*`([^`]*)\$\{error\.message\}([^`]*)`\s*\}/g;
  if (p2.test(content)) {
    content = content.replace(p2, (match, before, after) => {
      return `{ error: '${(before + after).replace(/:\s*$/, '').trim()}' }`;
    });
    modified = true;
  }

  // Pattern 3: { error: 'xxx', details: error.message }
  const p3 = /\{\s*error:\s*'([^']*)',?\s*details:\s*error\.message\s*\}/g;
  if (p3.test(content)) {
    content = content.replace(p3, (match, errorMsg) => {
      return `{ error: '${errorMsg}' }`;
    });
    modified = true;
  }

  // Pattern 4: { error: 'xxx', details: error instanceof Error ? error.message : String(error) }
  const p4 = /\{\s*error:\s*'([^']*)',?\s*details:\s*error\s+instanceof\s+Error\s*\?\s*error\.message\s*:\s*String\(error\)\s*\}/g;
  if (p4.test(content)) {
    content = content.replace(p4, (match, errorMsg) => {
      return `{ error: '${errorMsg}' }`;
    });
    modified = true;
  }

  // Pattern 5: { success: false, error: `xxx ${error.message}` }
  const p5 = /\{\s*success:\s*false,\s*error:\s*`([^`]*)\$\{error\.message\}([^`]*)`\s*\}/g;
  if (p5.test(content)) {
    content = content.replace(p5, (match, before, after) => {
      return `{ success: false, error: '${(before + after).replace(/:\s*$/, '').trim()}' }`;
    });
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`FIXED: ${file}`);
    totalFixed++;
  } else {
    console.log(`NO CHANGE: ${file}`);
  }
}

console.log(`\nTotal fixed: ${totalFixed}`);
