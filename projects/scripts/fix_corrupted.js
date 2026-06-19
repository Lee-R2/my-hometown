const fs = require('fs');
const path = require('path');

const apiDir = 'C:\\Users\\李文渊\\Desktop\\our home\\projects\\src\\app\\api';

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(filePath));
        } else if (file.endsWith('.ts')) {
            results.push(filePath);
        }
    });
    return results;
}

// Check if file content looks corrupted
function isCorrupted(content) {
    // Binary content
    if (content.includes('\0')) return true;
    // Truncated Chinese comments (common pattern from the batch replace bug)
    // The bug truncated lines like: "// 获取单个角色的权限配置" → "// 获取单个角色的权限配?      const"
    const truncatedPattern = /[\u4e00-\u9fff]\?\s{2,}\w/;
    if (truncatedPattern.test(content)) return true;
    // Unterminated string literals (string ending with ? followed by code)
    const unterminatedString = /['"][^'"]*[\u4e00-\u9fff]\?\s*[},]/;
    if (unterminatedString.test(content)) return true;
    return false;
}

// Fix corrupted content
function fixContent(content) {
    // Fix truncated Chinese comments: "配?      const" → "配置\n      const"
    content = content.replace(/([\u4e00-\u9fff])\?\s{2,}(\w)/g, '$1\n      $2');
    // Fix truncated Chinese strings: "配?' }" → "配'"
    // Actually these are truncated like: '权限配置已保?,' → need to restore the Chinese char
    // This is harder - we'll flag these for manual review
    return content;
}

const files = walk(apiDir);
let corruptedCount = 0;
let fixedCount = 0;

files.forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    if (isCorrupted(content)) {
        corruptedCount++;
        console.log('CORRUPTED:', filePath);
        
        const fixed = fixContent(content);
        if (fixed !== content) {
            fs.writeFileSync(filePath, fixed, 'utf-8');
            fixedCount++;
            console.log('  -> FIXED');
        } else {
            console.log('  -> NEEDS MANUAL FIX');
        }
    }
});

console.log(`\nTotal corrupted: ${corruptedCount}, Auto-fixed: ${fixedCount}`);
