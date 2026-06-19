const fs = require('fs');
const path = require('path');

const filePath = path.join('C:\\Users\\李文渊\\Desktop\\our home\\projects', 'src/app/api/admin/feedback/route.ts');
const content = fs.readFileSync(filePath, 'utf-8');

// Find line 29 and print char codes
const lines = content.split('\n');
const line29 = lines[28]; // 0-indexed
console.log('Line 29:', JSON.stringify(line29));
console.log('Char codes:');
for (let i = 0; i < line29.length; i++) {
    const code = line29.charCodeAt(i);
    if (code > 127 || code === 63) { // non-ASCII or '?'
        console.log(`  pos ${i}: U+${code.toString(16).padStart(4, '0')} '${line29[i]}'`);
    }
}

// Also check the migrate/tools file
const filePath2 = path.join('C:\\Users\\李文渊\\Desktop\\our home\\projects', 'src/app/api/migrate/tools/route.ts');
const content2 = fs.readFileSync(filePath2, 'utf-8');
const lines2 = content2.split('\n');
console.log('\nMigrate tools line 6:', JSON.stringify(lines2[5]));
console.log('Char codes:');
for (let i = 0; i < lines2[5].length; i++) {
    const code = lines2[5].charCodeAt(i);
    if (code > 127 || code === 63) {
        console.log(`  pos ${i}: U+${code.toString(16).padStart(4, '0')} '${lines2[5][i]}'`);
    }
}

// Also check line 14
console.log('\nMigrate tools line 14:', JSON.stringify(lines2[13]));
for (let i = 0; i < lines2[13].length; i++) {
    const code = lines2[13].charCodeAt(i);
    if (code > 127 || code === 63) {
        console.log(`  pos ${i}: U+${code.toString(16).padStart(4, '0')} '${lines2[13][i]}'`);
    }
}
