$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot

$importLine = "import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from '@/lib/ai-config';"
$importLineLib = "import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from './ai-config';"
$importLineDeep = "import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from '../../ai-config';"

$apiKey3 = "apiKey: process.env.COZE_WORKLOAD_IDENTITY_API_KEY || process.env.AGENT_LAXIANG_ZHUSHOU_API_KEY || process.env.AGENT_YINSHE_BOSHI_API_KEY || '',"
$apiKey2 = "apiKey: process.env.COZE_WORKLOAD_IDENTITY_API_KEY || process.env.AGENT_LAXIANG_ZHUSHOU_API_KEY || '',"
$baseUrlLine = "baseUrl: process.env.COZE_INTEGRATION_BASE_URL || process.env.COZE_BASE_URL || 'https://api.coze.cn',"
$modelBaseUrlLine = "modelBaseUrl: process.env.COZE_INTEGRATION_MODEL_BASE_URL || process.env.COZE_MODEL_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',"

function Update-File($relativePath, $importAnchor, $importLine, $use2EnvFallback) {
    $path = Join-Path $base $relativePath
    $content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

    # Detect line ending
    if ($content.Contains("`r`n")) {
        $le = "`r`n"
    } else {
        $le = "`n"
    }

    # Add import after anchor
    if ($content.Contains($importAnchor)) {
        $content = $content.Replace($importAnchor, $importAnchor + $le + $importLine)
    } else {
        Write-Host "WARNING: Import anchor not found in $relativePath"
    }

    # Replace apiKey line
    if ($use2EnvFallback) {
        if ($content.Contains($apiKey2)) {
            $content = $content.Replace($apiKey2, "apiKey: AI_API_KEY,")
        } else {
            Write-Host "WARNING: apiKey2 pattern not found in $relativePath"
        }
    } else {
        if ($content.Contains($apiKey3)) {
            $content = $content.Replace($apiKey3, "apiKey: AI_API_KEY,")
        } else {
            Write-Host "WARNING: apiKey3 pattern not found in $relativePath"
        }
    }

    # Replace baseUrl line
    if ($content.Contains($baseUrlLine)) {
        $content = $content.Replace($baseUrlLine, "baseUrl: AI_BASE_URL,")
    } else {
        Write-Host "WARNING: baseUrl pattern not found in $relativePath"
    }

    # Replace modelBaseUrl line
    if ($content.Contains($modelBaseUrlLine)) {
        $content = $content.Replace($modelBaseUrlLine, "modelBaseUrl: AI_MODEL_BASE_URL,")
    } else {
        Write-Host "WARNING: modelBaseUrl pattern not found in $relativePath"
    }

    [System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
    Write-Host "OK: $relativePath"
}

# 1. assistant/route.ts
Update-File "src\app\api\ai\assistant\route.ts" "import { LAXIANG_SHAREABLE_TYPES } from '@/lib/agent-scope';" $importLine $false

# 2. admin/assistant/route.ts (2-env fallback)
Update-File "src\app\api\admin\assistant\route.ts" "import { ApiErrors } from '@/lib/api-error';" $importLine $true

# 3. yinhe-video/route.ts
Update-File "src\app\api\ai\yinhe-video\route.ts" "import { ApiErrors } from '@/lib/api-error';" $importLine $false

# 4. yinhe-image/route.ts
Update-File "src\app\api\ai\yinhe-image\route.ts" "import { ApiErrors } from '@/lib/api-error';" $importLine $false

# 5. fetch-url/route.ts
Update-File "src\app\api\fetch-url\route.ts" "import { ApiErrors } from '@/lib/api-error';" $importLine $false

# 6. tts/route.ts
Update-File "src\app\api\ai\tts\route.ts" "import { ApiErrors } from '@/lib/api-error';" $importLine $false

# 7. review-submission/route.ts
Update-File "src\app\api\ai\review-submission\route.ts" "import { ApiErrors } from '@/lib/api-error';" $importLine $false

# 8. chat/route.ts
Update-File "src\app\api\ai\chat\route.ts" "import { checkRateLimit, getClientIP } from '@/lib/rate-limit';" $importLine $false

# 9. asr/route.ts
Update-File "src\app\api\ai\asr\route.ts" "import { ApiErrors } from '@/lib/api-error';" $importLine $false

# 10. admin/assistant/voice/route.ts
Update-File "src\app\api\admin\assistant\voice\route.ts" "import { ApiErrors } from '@/lib/api-error';" $importLine $false

# 11. content-moderation.ts (relative path ./ai-config)
Update-File "src\lib\content-moderation.ts" "import { LLMClient, Config } from 'coze-coding-dev-sdk';" $importLineLib $false

# 12. knowledge-internalizer.ts (relative path ../../ai-config)
Update-File "src\lib\skills\inkwell-reader\knowledge-internalizer.ts" "import { getSupabaseClient } from '@/storage/database/supabase-client';" $importLineDeep $false

Write-Host "`nAll files processed."
