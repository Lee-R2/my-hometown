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

const files = walk(apiDir);

files.forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    if (content.includes('status: 500') && !content.includes('ApiError')) {
        console.log('Processing:', filePath);
        
        const oldCatchRegex = /catch \(error\)\s*\{\s*console\.error\(\s*['"]Error:\s*['"],\s*error\s*\);\s*return NextResponse\.json\(\s*\{\s*success:\s*false,\s*message:\s*['"]Internal Server Error['"],\s*status:\s*500\s*\},\s*\{\s*status:\s*500\s*\}\s*\);\s*\}/gs;
        
        const newCatch = `catch (error) {
    console.error('Error:', error);
    return handleApiError(error);
}`;
        
        content = content.replace(oldCatchRegex, newCatch);
        
        if (content.includes('import {') && content.includes('from "next/js"')) {
            content = content.replace(/(import \{[^}]+\} from "next\/js")/, '$1\nimport { handleApiError } from "@/utils/api-error";');
        }
        
        fs.writeFileSync(filePath, content, 'utf-8');
    }
});

console.log('Done!');