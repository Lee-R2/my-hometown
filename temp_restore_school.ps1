$schoolBody = @{ name = "阳光希望小学" } | ConvertTo-Json -Compress
$headers = @{
    apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0"
    Authorization = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0"
    "Content-Type" = "application/json"
    Prefer = "return=representation"
}
try {
    $r = Invoke-RestMethod -Uri "https://emfluysvhghloklrmcxi.supabase.co/rest/v1/schools" -Method POST -Headers $headers -Body $schoolBody
    Write-Output "Restored school: $($r.id) $($r.name)"
    $newSchoolId = $r.id
} catch {
    Write-Output "Error: $($_.Exception.Message)"
}

Start-Sleep -Seconds 2

$volBody = @{ school_id = $newSchoolId } | ConvertTo-Json -Compress
try {
    Invoke-RestMethod -Uri "https://emfluysvhghloklrmcxi.supabase.co/rest/v1/users?id=eq.581bede2-4a6e-40c0-ad99-c72c62bde617" -Method PATCH -Headers $headers -Body $volBody
    Write-Output "Updated volunteer1 school_id"
} catch { Write-Output "Error updating volunteer1" }

try {
    Invoke-RestMethod -Uri "https://emfluysvhghloklrmcxi.supabase.co/rest/v1/users?id=eq.38d8acb3-f8ec-4bf5-bac3-b542fc1c6531" -Method PATCH -Headers $headers -Body $volBody
    Write-Output "Updated teacher1 school_id"
} catch { Write-Output "Error updating teacher1" }

$teamBody = @{ school_id = $newSchoolId } | ConvertTo-Json -Compress
try {
    Invoke-RestMethod -Uri "https://emfluysvhghloklrmcxi.supabase.co/rest/v1/teams?id=eq.6bdf09f2-2e14-4cf2-a4ed-81a59374d181" -Method PATCH -Headers $headers -Body $teamBody
    Write-Output "Updated YG01 school_id"
} catch { Write-Output "Error updating YG01" }

try {
    Invoke-RestMethod -Uri "https://emfluysvhghloklrmcxi.supabase.co/rest/v1/teams?id=eq.e12f7274-060f-4a94-95f1-75f99f747786" -Method PATCH -Headers $headers -Body $teamBody
    Write-Output "Updated YG02 school_id"
} catch { Write-Output "Error updating YG02" }

Write-Output "New school ID: $newSchoolId"
