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
    
    // ===== Pattern 1: catch block with status: 500 =====
    // Old: catch (error) {
    //   console.error('Error:', error);
    //   return NextResponse.json({ error: 'xxx失败' }, { status: 500 });
    // }
    // New: catch (error) {
    //   console.error('xxx失败:', error);
    //   return catchErrorResponse(error, 'xxx失败');
    // }
    
    // Match: return NextResponse.json({ error: 'xxx' }, { status: 500 });
    // where xxx is a Chinese error message
    const status500Pattern = /return NextResponse\.json\(\s*\{\s*error:\s*['"]([^'"]+)['"]\s*\},\s*\{\s*status:\s*500\s*\}\s*\);/g;
    content = content.replace(status500Pattern, (match, errorMsg) => {
        replacements++;
        return `return catchErrorResponse(error, '${errorMsg}');`;
    });
    
    // ===== Pattern 2: Supabase error with status: 400 =====
    // Old: if (error) { return NextResponse.json({ error: 'xxx失败' }, { status: 400 }); }
    // New: if (error) { return supabaseErrorResponse(error, 'xxx失败'); }
    const supabase400Pattern = /return NextResponse\.json\(\s*\{\s*error:\s*['"]([^'"]+)['"]\s*\},\s*\{\s*status:\s*400\s*\}\s*\);/g;
    content = content.replace(supabase400Pattern, (match, errorMsg) => {
        replacements++;
        return `return supabaseErrorResponse(error, '${errorMsg}');`;
    });
    
    // ===== Pattern 3: Supabase error with status: 404 =====
    const status404Pattern = /return NextResponse\.json\(\s*\{\s*error:\s*['"]([^'"]+)['"]\s*\},\s*\{\s*status:\s*404\s*\}\s*\);/g;
    content = content.replace(status404Pattern, (match, errorMsg) => {
        replacements++;
        return `return ApiErrors.notFound('${errorMsg}');`;
    });
    
    // ===== Pattern 4: Validation error with status: 400 =====
    // These are typically input validation errors (not Supabase errors)
    // Pattern: return NextResponse.json({ error: 'xxx' }, { status: 400 });
    // where it's NOT preceded by "if (error)" (Supabase error check)
    // We already handled the Supabase case above, so remaining 400s are validation errors
    
    // ===== Add import if we made replacements =====
    if (replacements > 0) {
        // Check what functions we need to import
        const needsCatchError = content.includes('catchErrorResponse');
        const needsSupabaseError = content.includes('supabaseErrorResponse');
        const needsApiErrors = content.includes('ApiErrors.');
        
        const imports = [];
        if (needsCatchError) imports.push('catchErrorResponse');
        if (needsSupabaseError) imports.push('supabaseErrorResponse');
        if (needsApiErrors) imports.push('ApiErrors');
        
        if (imports.length > 0) {
            const importLine = `import { ${imports.join(', ')} } from '@/lib/api-error';`;
            
            // Check if import already exists
            if (!content.includes("@/lib/api-error")) {
                // Add after the last import line
                const importRegex = /^import .+;$/gm;
                let lastImportIndex = 0;
                let match;
                while ((match = importRegex.exec(content)) !== null) {
                    lastImportIndex = match.index + match[0].length;
                }
                if (lastImportIndex > 0) {
                    content = content.slice(0, lastImportIndex) + '\n' + importLine + content.slice(lastImportIndex);
                } else {
                    content = importLine + '\n' + content;
                }
            } else {
                // Update existing import
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
        console.log(`MODIFIED (${replacements} replacements): ${relPath}`);
    }
});

console.log(`\nTotal: ${totalModified} files modified, ${totalReplacements} replacements`);
