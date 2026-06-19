const fs = require('fs');
const path = require('path');

const BASE = 'c:\\Users\\李文渊\\Desktop\\our home\\projects\\src\\app\\api';

const FILES = [
  { path: 'ai/assistant/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'ai/chat/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'ai/asr/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'ai/tts/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'ai/upload-image/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'ai/context/route.ts', auth: 'requireAnyAuth', methods: ['GET'] },
  { path: 'ai/review-submission/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'ai/create-theme/route.ts', auth: 'requireAdmin', methods: ['POST', 'GET'] },
  { path: 'ai/memory/user/route.ts', auth: 'requireAnyAuth', methods: ['GET', 'POST'] },
  { path: 'ai/memory/distill/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'ai/inkwell/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'ai/entrocamp/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'ai/reflection/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'ai/safe-query/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'ai/data-analysis/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'ai/laxiang-report/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'ai/laxiang-data/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'ai/yinhe-video/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'ai/yinhe-image/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'ai/yinhe-data/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'ai/reminders/route.ts', auth: 'requireAnyAuth', methods: ['GET', 'POST'] },
  { path: 'ai/agent-communication/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'ai/migrate-sessions/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'ai/daily-sync/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'upload/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'upload/submission/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'parent/team-detail/route.ts', auth: 'requireParent', methods: ['GET'] },
  { path: 'parent/teams/route.ts', auth: 'requireParent', methods: ['GET'] },
  { path: 'submissions/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET'] },
  { path: 'submissions/[id]/like/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'submissions/[id]/review/route.ts', auth: 'requireAdminOrVolunteer', methods: ['POST'] },
  { path: 'messages/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'POST'] },
  { path: 'messages/[id]/read/route.ts', auth: 'requireAdminOrVolunteer', methods: ['POST'] },
  { path: 'notifications/send/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'volunteer/send-message/route.ts', auth: 'requireAdminOrVolunteer', methods: ['POST'] },
  { path: 'report/[id]/route.ts', auth: 'requireAdmin', methods: ['GET'] },
  { path: 'fetch-url/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'sync/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'permissions/route.ts', auth: 'requireAdmin', methods: ['GET'] },
  { path: 'docs/features-export/route.ts', auth: 'requireAdmin', methods: ['GET'] },
  { path: 'agents/sessions/route.ts', auth: 'requireAdmin', methods: ['GET'] },
  { path: 'agents/sessions/[sessionId]/route.ts', auth: 'requireAdmin', methods: ['GET', 'DELETE'] },
  { path: 'agents/memory/route.ts', auth: 'requireAdmin', methods: ['GET', 'POST'] },
  { path: 'agents/memory/[id]/route.ts', auth: 'requireAdmin', methods: ['DELETE'] },
  { path: 'agents/search/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'agents/context/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'agents/conversations/route.ts', auth: 'requireAdmin', methods: ['GET'] },
  { path: 'migrate/security/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'migrate/account-status/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'migrate/all-passwords/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'migrate/password/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'migrate/tools/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'init-teams/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'init-users/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'init-test-data/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'test/user-query/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'test/accounts/route.ts', auth: 'requireAdmin', methods: ['GET'] },
  { path: 'diagnostics/db/route.ts', auth: 'requireAdmin', methods: ['GET'] },
  { path: 'restore-data/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'password/route.ts', auth: 'requireAnyAuth', methods: ['POST'] },
  { path: 'tasks/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'POST'] },
  { path: 'tasks/[id]/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'PUT', 'DELETE'] },
  { path: 'tasks/[id]/skills/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'POST'] },
  { path: 'tasks/[id]/tools/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'POST'] },
  { path: 'tasks/[id]/tools/select/route.ts', auth: 'requireAdminOrVolunteer', methods: ['POST'] },
  { path: 'tasks/[id]/tools/[toolId]/route.ts', auth: 'requireAdminOrVolunteer', methods: ['DELETE'] },
  { path: 'tasks/[id]/rewards/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'POST'] },
  { path: 'themes/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'POST'] },
  { path: 'themes/[id]/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'PUT', 'DELETE'] },
  { path: 'themes/[id]/auto-configure-final/route.ts', auth: 'requireAdmin', methods: ['POST'] },
  { path: 'themes/select/route.ts', auth: 'requireTeam', methods: ['POST'] },
  { path: 'teams/route.ts', auth: 'requireAdmin', methods: ['GET', 'POST'] },
  { path: 'teams/[id]/route.ts', auth: 'requireAdmin', methods: ['GET', 'PUT', 'DELETE'] },
  { path: 'teams/[id]/members/route.ts', auth: 'requireAdmin', methods: ['GET', 'POST'] },
  { path: 'teams/[id]/members/[memberId]/route.ts', auth: 'requireAdmin', methods: ['PUT', 'DELETE'] },
  { path: 'skills/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'POST'] },
  { path: 'skills/[id]/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'PUT', 'DELETE'] },
  { path: 'tools/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'POST'] },
  { path: 'tools/[id]/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'PUT', 'DELETE'] },
  { path: 'rewards/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'POST'] },
  { path: 'rewards/[id]/route.ts', auth: 'requireAdminOrVolunteer', methods: ['GET', 'PUT', 'DELETE'] },
];

const PUBLIC_FILES = [
  'health/route.ts',
  'schools/route.ts',
  'schools/[id]/route.ts',
  'schools/[id]/teachers/route.ts',
  'schools/regions/route.ts',
  'volunteers/route.ts',
  'volunteers/[id]/route.ts',
  'parent/search/route.ts',
  'parent/schools/route.ts',
];

const SKIP_AUTH_FILES = [
  'ai/test-sse/route.ts',
];

function processFile(filePath, authFn, methods) {
  const fullPath = path.join(BASE, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP (not found): ${filePath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  let modified = false;

  if (authFn) {
    const needsAuthError = true;
    const needsSafeError = content.includes('error.message') || content.includes('error: any') || content.includes('catch (error)');

    const imports = [];
    imports.push(authFn);
    imports.push('authError');
    if (needsSafeError) imports.push('safeError');

    const importLine = `import { ${imports.join(', ')} } from '@/lib/api-auth';`;

    if (!content.includes("from '@/lib/api-auth'")) {
      const firstImportMatch = content.match(/^import /m);
      if (firstImportMatch) {
        const insertPos = content.indexOf(firstImportMatch[0]);
        content = content.slice(0, insertPos) + importLine + '\n' + content.slice(insertPos);
        modified = true;
      }
    }

    for (const method of methods) {
      const methodRegex = new RegExp(
        `export\\s+async\\s+function\\s+${method}\\s*\\(\\s*request\\s*:\\s*NextRequest[^)]*\\)\\s*\\{`,
        'm'
      );
      const match = content.match(methodRegex);
      if (match) {
        const matchEnd = content.indexOf(match[0]) + match[0].length;
        const afterMatch = content.slice(matchEnd, matchEnd + 200);

        if (!afterMatch.includes('requireAdmin') && !afterMatch.includes('requireAnyAuth') && !afterMatch.includes('requireTeam') && !afterMatch.includes('requireParent') && !afterMatch.includes('requireAdminOrVolunteer')) {
          const authCheck = `\n  const auth = ${authFn}(request);\n  if (!auth.authenticated) return authError(auth);\n`;
          content = content.slice(0, matchEnd) + authCheck + content.slice(matchEnd);
          modified = true;
        }
      }
    }

    if (needsSafeError) {
      content = content.replace(
        /return NextResponse\.json\(\s*\{\s*error:\s*error\.message\s*\|\|\s*['"]([^'"]+)['"]\s*\}(?:\s*,\s*\{\s*status:\s*(\d+)\s*\})?\s*\)/g,
        (match, defaultMsg, statusCode) => {
          return `return safeError(error)`;
        }
      );

      content = content.replace(
        /return NextResponse\.json\(\s*\{\s*(?:success:\s*false,\s*)?error:\s*error\.message\s*\|\|\s*['"]([^'"]+)['"]\s*\}(?:\s*,\s*\{\s*status:\s*(\d+)\s*\})?\s*\)/g,
        (match, defaultMsg, statusCode) => {
          return `return safeError(error)`;
        }
      );

      content = content.replace(
        /return NextResponse\.json\(\s*\{\s*error:\s*error\.message\s*\}(?:\s*,\s*\{\s*status:\s*(\d+)\s*\})?\s*\)/g,
        (match, statusCode) => {
          return `return safeError(error)`;
        }
      );

      content = content.replace(
        /return NextResponse\.json\(\s*\{\s*success:\s*false,\s*error:\s*error\.message\s*\|\|\s*['"]([^'"]+)['"]\s*\}(?:\s*,\s*\{\s*status:\s*(\d+)\s*\})?\s*\)/g,
        (match, defaultMsg, statusCode) => {
          return `return safeError(error)`;
        }
      );

      content = content.replace(
        /return NextResponse\.json\(\s*\{\s*success:\s*false,\s*error:\s*error\.message\s*\}(?:\s*,\s*\{\s*status:\s*(\d+)\s*\})?\s*\)/g,
        (match, statusCode) => {
          return `return safeError(error)`;
        }
      );

      content = content.replace(
        /\{\s*error:\s*`([^`]*?)\$\{error\.message\}([^`]*?)`\s*\}/g,
        (match, before, after) => {
          return `{ error: '服务器内部错误，请稍后重试' }`;
        }
      );

      content = content.replace(
        /\{\s*error:\s*['"][^'"]*error\.message[^'"]*['"]\s*\}/g,
        `{ error: '服务器内部错误，请稍后重试' }`
      );

      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`DONE: ${filePath}`);
  } else {
    console.log(`NO CHANGE: ${filePath}`);
  }
}

function processPublicFile(filePath) {
  const fullPath = path.join(BASE, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP (not found): ${filePath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  let modified = false;

  const needsSafeError = content.includes('error.message') || content.includes('error: any');
  if (needsSafeError) {
    const imports = ['safeError'];
    const importLine = `import { ${imports.join(', ')} } from '@/lib/api-auth';`;

    if (!content.includes("from '@/lib/api-auth'")) {
      const firstImportMatch = content.match(/^import /m);
      if (firstImportMatch) {
        const insertPos = content.indexOf(firstImportMatch[0]);
        content = content.slice(0, insertPos) + importLine + '\n' + content.slice(insertPos);
        modified = true;
      }
    }

    content = content.replace(
      /return NextResponse\.json\(\s*\{\s*error:\s*error\.message\s*\|\|\s*['"]([^'"]+)['"]\s*\}(?:\s*,\s*\{\s*status:\s*(\d+)\s*\})?\s*\)/g,
      (match, defaultMsg, statusCode) => {
        return `return safeError(error)`;
      }
    );

    content = content.replace(
      /return NextResponse\.json\(\s*\{\s*error:\s*error\.message\s*\}(?:\s*,\s*\{\s*status:\s*(\d+)\s*\})?\s*\)/g,
      (match, statusCode) => {
        return `return safeError(error)`;
      }
    );

    content = content.replace(
      /return NextResponse\.json\(\s*\{\s*success:\s*false,\s*error:\s*error\.message\s*\|\|\s*['"]([^'"]+)['"]\s*\}(?:\s*,\s*\{\s*status:\s*(\d+)\s*\})?\s*\)/g,
      (match, defaultMsg, statusCode) => {
        return `return safeError(error)`;
      }
    );

    content = content.replace(
      /return NextResponse\.json\(\s*\{\s*success:\s*false,\s*error:\s*error\.message\s*\}(?:\s*,\s*\{\s*status:\s*(\d+)\s*\})?\s*\)/g,
      (match, statusCode) => {
        return `return safeError(error)`;
      }
    );

    content = content.replace(
      /\{\s*error:\s*`([^`]*?)\$\{error\.message\}([^`]*?)`\s*\}/g,
      (match, before, after) => {
        return `{ error: '服务器内部错误，请稍后重试' }`;
      }
    );

    content = content.replace(
      /\{\s*error:\s*['"][^'"]*error\.message[^'"]*['"]\s*\}/g,
      `{ error: '服务器内部错误，请稍后重试' }`
    );

    modified = true;
  }

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`DONE (public): ${filePath}`);
  } else {
    console.log(`NO CHANGE (public): ${filePath}`);
  }
}

console.log('Processing auth-protected files...');
for (const file of FILES) {
  processFile(file.path, file.auth, file.methods);
}

console.log('\nProcessing public files...');
for (const file of PUBLIC_FILES) {
  processPublicFile(file);
}

console.log('\nDone!');
