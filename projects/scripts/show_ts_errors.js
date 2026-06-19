const { execSync } = require('child_process');
const path = require('path');

try {
    const output = execSync('npx tsc --noEmit 2>&1', {
        cwd: 'C:\\Users\\李文渊\\Desktop\\our home\\projects',
        encoding: 'utf-8',
        timeout: 120000
    });
    console.log('No errors!');
} catch (e) {
    const output = e.stdout || e.message;
    const lines = output.split('\n').filter(l => l.includes('error TS'));
    
    // Show first 30 errors with context
    console.log(`Total TS errors: ${lines.length}`);
    console.log('\nFirst 30 errors:');
    lines.slice(0, 30).forEach(l => console.log(l));
}
