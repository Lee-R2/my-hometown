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
        } else if (file.endsWith('.ts')) {
            results.push(filePath);
        }
    });
    return results;
}

const files = walk(apiDir);
let totalModified = 0;
let totalReplacements = 0;

files.forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf-8');
    let originalContent = content;
    let replacements = 0;
    
    // Pattern: Multi-line NextResponse.json with status: 500
    // NextResponse.json(
    //   { success: false, error: 'xxx' } or { error: 'xxx' },
    //   { status: 500 }
    // );
    const multiLine500 = /NextResponse\.json\(\s*\{\s*(success:\s*false,\s*)?error:\s*['"]([^'"]+)['"]\s*\},\s*\{\s*status:\s*500\s*\}\s*\);/gs;
    content = content.replace(multiLine500, (match, successPrefix, errorMsg) => {
        replacements++;
        return `catchErrorResponse(error, '${errorMsg}');`;
    });
    
    // Pattern: Multi-line NextResponse.json with status: 400 (Supabase errors)
    const multiLine400 = /NextResponse\.json\(\s*\{\s*(success:\s*false,\s*)?error:\s*['"]([^'"]+)['"]\s*\},\s*\{\s*status:\s*400\s*\}\s*\);/gs;
    content = content.replace(multiLine400, (match, successPrefix, errorMsg) => {
        replacements++;
        return `supabaseErrorResponse(error, '${errorMsg}');`;
    });
    
    // Pattern: Multi-line NextResponse.json with status: 404
    const multiLine404 = /NextResponse\.json\(\s*\{\s*(success:\s*false,\s*)?error:\s*['"]([^'"]+)['"]\s*\},\s*\{\s*status:\s*404\s*\}\s*\);/gs;
    content = content.replace(multiLine404, (match, successPrefix, errorMsg) => {
        replacements++;
        return `ApiErrors.notFound('${errorMsg}');`;
    });
    
    // Pattern: Multi-line NextResponse.json with status: 403
    const multiLine403 = /NextResponse\.json\(\s*\{\s*(success:\s*false,\s*)?error:\s*['"]([^'"]+)['"]\s*\},\s*\{\s*status:\s*403\s*\}\s*\);/gs;
    content = content.replace(multiLine403, (match, successPrefix, errorMsg) => {
        replacements++;
        return `ApiErrors.forbidden('${errorMsg}');`;
    });
    
    // Pattern: { success: false, error: e.message } with status: 500
    const errorMsgVar = /NextResponse\.json\(\s*\{\s*success:\s*false,\s*error:\s*(\w+(?:\.\w+)*)\s*\},\s*\{\s*status:\s*500\s*\}\s*\);/gs;
    content = content.replace(errorMsgVar, (match, errorVar) => {
        replacements++;
        return `catchErrorResponse(error, '操作失败');`;
    });
    
    // Add import if needed
    if (replacements > 0) {
        const needsCatchError = content.includes('catchErrorResponse');
        const needsSupabaseError = content.includes('supabaseErrorResponse');
        const needsApiErrors = content.includes('ApiErrors.');
        
        const imports = [];
        if (needsCatchError) imports.push('catchErrorResponse');
        if (needsSupabaseError) imports.push('supabaseErrorResponse');
        if (needsApiErrors) imports.push('ApiErrors');
        
        if (imports.length > 0) {
            const importLine = `import { ${imports.join(', ')} } from '@/lib/api-error';`;
            
            if (!content.includes("@/lib/api-error")) {
                const importRegex = /^import .+;$/gm;
                let lastImportIndex = 0;
                let m;
                while ((m = importRegex.exec(content)) !== null) {
                    lastImportIndex = m.index + m[0].length;
                }
                if (lastImportIndex > 0) {
                    content = content.slice(0, lastImportIndex) + '\n' + importLine + content.slice(lastImportIndex);
                }
            } else {
                const existingImportRegex = /import \{([^}]+)\} from ['"]@\/lib\/api-error['"];?/;
                const existingMatch = content.match(existingImportRegex);
                if (existingMatch) {
                    const existingImports = existingMatch[1].split(',').map(s => s.trim()).filter(Boolean);
                    const newImports = [...new Set([...existingImports, ...imports])];
                    content = content.replace(
                        existingImportRegex,
                        `import { ${newImports.join(', ')} } from '@/lib/api-error';`
                    );
                }
            }
        }
    }
    
    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf-8');
        totalModified++;
        totalReplacements += replacements;
        const relPath = path.relative(projectDir, filePath);
        console.log(`MODIFIED (${replacements}): ${relPath}`);
    }
});

console.log(`\nTotal: ${totalModified} files, ${totalReplacements} replacements`);
