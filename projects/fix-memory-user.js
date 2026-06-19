const fs = require('fs');
const path = require('path');

const BASE = 'c:\\Users\\李文渊\\Desktop\\our home\\projects\\src\\app\\api';
const file = 'ai/memory/user/route.ts';
const fullPath = path.join(BASE, file);

let content = fs.readFileSync(fullPath, 'utf-8');

// Replace all: error instanceof Error ? error.message : 'xxx' -> 'xxx'
content = content.replace(
  /error\s+instanceof\s+Error\s*\?\s*error\.message\s*:\s*'([^']+)'/g,
  "'$1'"
);

fs.writeFileSync(fullPath, content, 'utf-8');
console.log('Fixed:', file);
