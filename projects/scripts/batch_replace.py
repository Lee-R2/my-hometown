import os
import re

api_dir = r'C:\Users\李文渊\Desktop\our home\projects\src\app\api'

for root, dirs, files in os.walk(api_dir):
    for file in files:
        if file.endswith('.ts'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            if 'status: 500' in content and 'ApiError' not in content:
                print(f'Processing: {filepath}')
                
                old_catch = r'catch \(error\)\s*\{\s*console\.error\(\s*[\'"]Error:\s*[\'"],\s*error\s*\);\s*return NextResponse\.json\(\s*\{\s*success:\s*false,\s*message:\s*[\'"]Internal Server Error[\'"],\s*status:\s*500\s*\},\s*\{\s*status:\s*500\s*\}\s*\);\s*\}'
                new_catch = '''catch (error) {
    console.error('Error:', error);
    return handleApiError(error);
}'''
                
                content = re.sub(old_catch, new_catch, content, flags=re.DOTALL)
                
                if 'import {' in content and 'from "next/js"' in content:
                    content = re.sub(r'(import \{[^}]+\} from "next/js")', r'\1\nimport { handleApiError } from "@/utils/api-error";', content)
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)

print('Done!')