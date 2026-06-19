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

files.forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf-8');
    let originalContent = content;
    
    // Fix: supabaseErrorResponse(error, ...) was incorrectly used for 
    // non-Supabase error variables. The issue is that in patterns like:
    //   const { data, error } = await client.from(...)...;
    //   if (error) { return supabaseErrorResponse(error, 'xxx'); }
    // This is CORRECT - error is the Supabase error variable.
    //
    // But in patterns like:
    //   if (!body.name) { return supabaseErrorResponse(error, 'xxx'); }
    // This is WRONG - error is not defined in this scope.
    //
    // The fix: replace supabaseErrorResponse(error, ...) with ApiErrors.validation(...)
    // when it's NOT inside an "if (error)" block (i.e., it's a validation check)

    // Pattern: if (error) { ... supabaseErrorResponse(error, ...) ... } - KEEP as is
    // Pattern: supabaseErrorResponse(error, ...) NOT inside if (error) - CHANGE to ApiErrors.validation
    
    // Strategy: Find all supabaseErrorResponse calls that are NOT preceded by "if (error)"
    // We need to check line by line
    const lines = content.split('\n');
    let inIfErrorBlock = false;
    let braceDepth = 0;
    let ifErrorBraceDepth = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Detect "if (error)" blocks
        if (/if\s*\(\s*error\s*\)/.test(line) && !/if\s*\(\s*!error\s*\)/.test(line)) {
            inIfErrorBlock = true;
            ifErrorBraceDepth = braceDepth;
        }
        
        // Track brace depth
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        braceDepth += opens - closes;
        
        // Check if we've exited the if (error) block
        if (inIfErrorBlock && braceDepth <= ifErrorBraceDepth) {
            inIfErrorBlock = false;
        }
        
        // If we find supabaseErrorResponse(error, ...) outside an if (error) block,
        // it's a validation error, not a Supabase error
        if (!inIfErrorBlock && /supabaseErrorResponse\(error,/.test(line)) {
            lines[i] = line.replace(/supabaseErrorResponse\(error,\s*['"]([^'"]+)['"]\s*\)/g, "ApiErrors.validation('$1')");
        }
    }
    
    content = lines.join('\n');
    
    // Also fix: catchErrorResponse(error, ...) used outside catch blocks
    // This happens when the script replaced status: 500 in non-catch contexts
    // We need to check if 'error' is actually the catch parameter
    // For now, let's check for the specific error: "Cannot find name 'error'"
    // This means catchErrorResponse is used where 'error' is not in scope
    
    // Re-read lines after previous fix
    const lines2 = content.split('\n');
    let inCatchBlock = false;
    let catchBraceDepth = 0;
    
    for (let i = 0; i < lines2.length; i++) {
        const line = lines2[i];
        
        // Detect catch blocks
        if (/catch\s*\(\s*(\w+)\s*\)/.test(line)) {
            inCatchBlock = true;
            catchBraceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        } else if (inCatchBlock) {
            const opens = (line.match(/\{/g) || []).length;
            const closes = (line.match(/\}/g) || []).length;
            catchBraceDepth += opens - closes;
            if (catchBraceDepth <= 0) {
                inCatchBlock = false;
            }
        }
        
        // If catchErrorResponse is used outside a catch block and references 'error',
        // it's wrong. Replace with ApiErrors.validation or a direct error response
        if (!inCatchBlock && /catchErrorResponse\(error,/.test(line)) {
            lines2[i] = line.replace(/catchErrorResponse\(error,\s*['"]([^'"]+)['"]\s*\)/g, "ApiErrors.validation('$1')");
        }
    }
    
    content = lines2.join('\n');
    
    // Update imports if needed
    if (content !== originalContent) {
        // Check if we need to add ApiErrors import
        if (content.includes('ApiErrors.') && !content.includes('ApiErrors') && !content.includes("@/lib/api-error")) {
            // Need to add import
        }
        
        // Make sure ApiErrors is in the import if used
        if (content.includes('ApiErrors.') && content.includes("@/lib/api-error")) {
            const existingImportRegex = /import \{([^}]+)\} from ['"]@\/lib\/api-error['"];?/;
            const existingMatch = content.match(existingImportRegex);
            if (existingMatch && !existingMatch[1].includes('ApiErrors')) {
                const existingImports = existingMatch[1].split(',').map(s => s.trim()).filter(Boolean);
                existingImports.push('ApiErrors');
                content = content.replace(
                    existingImportRegex,
                    `import { ${existingImports.join(', ')} } from '@/lib/api-error';`
                );
            }
        }
        
        // Remove unused supabaseErrorResponse import if no longer used
        if (!content.includes('supabaseErrorResponse(') && content.includes('supabaseErrorResponse')) {
            const existingImportRegex = /import \{([^}]+)\} from ['"]@\/lib\/api-error['"];?/;
            const existingMatch = content.match(existingImportRegex);
            if (existingMatch) {
                const existingImports = existingMatch[1].split(',').map(s => s.trim()).filter(s => s !== 'supabaseErrorResponse');
                if (existingImports.length > 0) {
                    content = content.replace(
                        existingImportRegex,
                        `import { ${existingImports.join(', ')} } from '@/lib/api-error';`
                    );
                } else {
                    // Remove the entire import line
                    content = content.replace(/import \{[^}]*\} from ['"]@\/lib\/api-error['"];?\n?/g, '');
                }
            }
        }
        
        // Remove unused catchErrorResponse import if no longer used
        if (!content.includes('catchErrorResponse(') && content.includes('catchErrorResponse')) {
            const existingImportRegex = /import \{([^}]+)\} from ['"]@\/lib\/api-error['"];?/;
            const existingMatch = content.match(existingImportRegex);
            if (existingMatch) {
                const existingImports = existingMatch[1].split(',').map(s => s.trim()).filter(s => s !== 'catchErrorResponse');
                if (existingImports.length > 0) {
                    content = content.replace(
                        existingImportRegex,
                        `import { ${existingImports.join(', ')} } from '@/lib/api-error';`
                    );
                } else {
                    content = content.replace(/import \{[^}]*\} from ['"]@\/lib\/api-error['"];?\n?/g, '');
                }
            }
        }
        
        fs.writeFileSync(filePath, content, 'utf-8');
        totalModified++;
        const relPath = path.relative(projectDir, filePath);
        console.log(`FIXED: ${relPath}`);
    }
});

console.log(`\nTotal: ${totalModified} files fixed`);
