const fs = require('fs');
const path = require('path');

const projectDir = 'C:\\Users\\李文渊\\Desktop\\our home\\projects';
const apiDir = path.join(projectDir, 'src', 'app', 'api');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(filePath));
        } else if (file === 'route.ts') {
            results.push(filePath);
        }
    });
    return results;
}

const authPatterns = [
    'requireAdmin',
    'requireTeam',
    'requireAnyAuth',
    'requireAdminOrVolunteer',
    'requireVolunteer',
    'requireParent',
];

const files = walk(apiDir);
const noAuthFiles = [];

files.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf-8');
    const hasAuth = authPatterns.some(p => content.includes(p));
    const hasHandler = /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)/.test(content);
    
    if (hasHandler && !hasAuth) {
        const methods = [];
        if (/export\s+async\s+function\s+GET/.test(content)) methods.push('GET');
        if (/export\s+async\s+function\s+POST/.test(content)) methods.push('POST');
        if (/export\s+async\s+function\s+PUT/.test(content)) methods.push('PUT');
        if (/export\s+async\s+function\s+DELETE/.test(content)) methods.push('DELETE');
        if (/export\s+async\s+function\s+PATCH/.test(content)) methods.push('PATCH');
        
        const relPath = path.relative(projectDir, filePath);
        noAuthFiles.push({ path: relPath, methods });
    }
});

console.log(`API routes without authentication (${noAuthFiles.length}):`);
noAuthFiles.forEach(f => console.log(`  ${f.methods.join(', ')}: ${f.path}`));
