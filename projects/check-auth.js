const fs = require('fs');
const path = require('path');

const BASE = 'c:\\Users\\李文渊\\Desktop\\our home\\projects\\src\\app\\api';

function findFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath));
    } else if (entry.name === 'route.ts') {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = findFiles(BASE);
const issues = [];

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const hasImport = content.includes("from '@/lib/api-auth'");
  const hasAuthCheck = content.includes('const auth = require');
  
  const relPath = path.relative(BASE, file).replace(/\\/g, '/');
  
  if (hasImport && !hasAuthCheck) {
    issues.push(`HAS IMPORT BUT NO AUTH CHECK: ${relPath}`);
  }
  
  if (!hasImport && !hasAuthCheck) {
    const hasExport = content.includes('export async function');
    if (hasExport) {
      issues.push(`NO IMPORT, NO AUTH CHECK: ${relPath}`);
    }
  }
}

console.log('Issues found:');
issues.forEach(i => console.log(i));
console.log(`\nTotal issues: ${issues.length}`);
