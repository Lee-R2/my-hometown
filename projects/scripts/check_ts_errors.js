const { execSync } = require('child_process');
const path = require('path');

try {
    const output = execSync('npx tsc --noEmit 2>&1', {
        cwd: 'C:\\Users\\李文渊\\Desktop\\our home\\projects',
        encoding: 'utf-8',
        timeout: 120000
    });
    console.log('No errors!');
    console.log(output);
} catch (e) {
    const output = e.stdout || e.message;
    // Extract unique file paths with errors
    const fileSet = new Set();
    const lines = output.split('\n');
    for (const line of lines) {
        const match = line.match(/^(src\/[^\s(]+)\(\d+,\d+\)/);
        if (match) {
            fileSet.add(match[1]);
        }
    }
    
    const files = Array.from(fileSet).sort();
    console.log(`Files with TS errors (${files.length}):`);
    files.forEach(f => console.log(f));
    
    // Count errors per file
    const errorCount = {};
    for (const line of lines) {
        const match = line.match(/^(src\/[^\s(]+)\(\d+,\d+\).*error TS/);
        if (match) {
            errorCount[match[1]] = (errorCount[match[1]] || 0) + 1;
        }
    }
    console.log('\nError count per file:');
    Object.entries(errorCount).sort((a,b) => b[1] - a[1]).forEach(([f, c]) => console.log(`  ${c}: ${f}`));
}
