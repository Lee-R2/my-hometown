const { execSync } = require('child_process');

try {
    const output = execSync('npx tsc --noEmit 2>&1', {
        cwd: 'C:\\Users\\李文渊\\Desktop\\our home\\projects',
        encoding: 'utf-8',
        timeout: 120000
    });
} catch (e) {
    const output = e.stdout || e.message;
    const lines = output.split('\n').filter(l => l.includes('api-client'));
    lines.forEach(l => console.log(l));
}
