$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDE2MzMsImV4cCI6MjA5NTM3NzYzM30.koOSCdfPNnY9msW1xWVOHMwFUXNU85Bl3VSlQIpw-H4"
$serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0"
$baseUrl = "https://emfluysvhghloklrmcxi.supabase.co/rest/v1"

function Make-AnonHeaders {
    param($extraHeaders = @{})
    $h = @{ apikey = $anonKey; Authorization = "Bearer $anonKey" }
    foreach ($key in $extraHeaders.Keys) { $h[$key] = $extraHeaders[$key] }
    return $h
}

function Test-Read {
    param($Label, $Headers, $Table, $ExpectedCount = -1)
    try {
        $r = Invoke-RestMethod -Uri "$baseUrl/${Table}?select=id&limit=100" -Headers $Headers -TimeoutSec 10
        $count = if ($r -is [array]) { $r.Count } else { 1 }
        if ($ExpectedCount -ge 0) {
            $status = if ($count -eq $ExpectedCount) { "PASS" } else { "FAIL" }
            Write-Output "  $status | ${Label} -> ${Table} got=$count expected=$ExpectedCount"
        } else {
            Write-Output "  INFO | ${Label} -> ${Table} count=$count"
        }
        return $count
    } catch {
        Write-Output "  FAIL | ${Label} -> ${Table} ERROR"
        return -1
    }
}

Write-Output "============================================================"
Write-Output "PART 1 - anon key WITHOUT headers (ALL should be 0)"
Write-Output "============================================================"
$anon = Make-AnonHeaders
Test-Read -Label "anon" -Headers $anon -Table "schools" -ExpectedCount 0
Test-Read -Label "anon" -Headers $anon -Table "users" -ExpectedCount 0
Test-Read -Label "anon" -Headers $anon -Table "teams" -ExpectedCount 0
Test-Read -Label "anon" -Headers $anon -Table "task_themes" -ExpectedCount 0
Test-Read -Label "anon" -Headers $anon -Table "tasks" -ExpectedCount 0
Test-Read -Label "anon" -Headers $anon -Table "task_submissions" -ExpectedCount 0
Test-Read -Label "anon" -Headers $anon -Table "messages" -ExpectedCount 0
Test-Read -Label "anon" -Headers $anon -Table "blackboard_posts" -ExpectedCount 0
Test-Read -Label "anon" -Headers $anon -Table "parent_accounts" -ExpectedCount 0
Test-Read -Label "anon" -Headers $anon -Table "user_sessions" -ExpectedCount 0
Test-Read -Label "anon" -Headers $anon -Table "request_logs" -ExpectedCount 0
Test-Read -Label "anon" -Headers $anon -Table "security_events" -ExpectedCount 0

Write-Output ""
Write-Output "============================================================"
Write-Output "PART 2 - admin role (should see ALL data)"
Write-Output "============================================================"
$admin = Make-AnonHeaders @{ "x-app-role" = "super_admin"; "x-app-user-id" = "admin-test" }
Test-Read -Label "admin" -Headers $admin -Table "schools" -ExpectedCount 2
Test-Read -Label "admin" -Headers $admin -Table "users" -ExpectedCount 5
Test-Read -Label "admin" -Headers $admin -Table "teams" -ExpectedCount 3
Test-Read -Label "admin" -Headers $admin -Table "task_themes" -ExpectedCount 6
Test-Read -Label "admin" -Headers $admin -Table "tasks" -ExpectedCount 18

Write-Output ""
Write-Output "============================================================"
Write-Output "PART 3 - teacher1 (school1 only)"
Write-Output "============================================================"
$teacher1 = Make-AnonHeaders @{
    "x-app-role" = "teacher"
    "x-app-user-id" = "38d8acb3-f8ec-4bf5-bac3-b542fc1c6531"
    "x-app-school-id" = "b1873e17-b42b-4028-874d-fbeccab69444"
}
Test-Read -Label "teacher1" -Headers $teacher1 -Table "schools" -ExpectedCount 1
Test-Read -Label "teacher1" -Headers $teacher1 -Table "teams" -ExpectedCount 2
Test-Read -Label "teacher1" -Headers $teacher1 -Table "users" -ExpectedCount 3

Write-Output ""
Write-Output "============================================================"
Write-Output "PART 4 - volunteer1 (assigned teams)"
Write-Output "============================================================"
$vol1 = Make-AnonHeaders @{
    "x-app-role" = "volunteer"
    "x-app-user-id" = "581bede2-4a6e-40c0-ad99-c72c62bde617"
    "x-app-school-id" = "b1873e17-b42b-4028-874d-fbeccab69444"
}
Test-Read -Label "vol1" -Headers $vol1 -Table "schools" -ExpectedCount 1
Test-Read -Label "vol1" -Headers $vol1 -Table "teams" -ExpectedCount 2
Test-Read -Label "vol1" -Headers $vol1 -Table "users" -ExpectedCount 3

Write-Output ""
Write-Output "============================================================"
Write-Output "PART 5 - team YG01 (own team only)"
Write-Output "============================================================"
$team1 = Make-AnonHeaders @{
    "x-app-role" = "team"
    "x-app-user-id" = "6bdf09f2-2e14-4cf2-a4ed-81a59374d181"
    "x-app-school-id" = "b1873e17-b42b-4028-874d-fbeccab69444"
    "x-app-team-id" = "6bdf09f2-2e14-4cf2-a4ed-81a59374d181"
}
Test-Read -Label "team-YG01" -Headers $team1 -Table "schools" -ExpectedCount 1
Test-Read -Label "team-YG01" -Headers $team1 -Table "teams" -ExpectedCount 1
Test-Read -Label "team-YG01" -Headers $team1 -Table "users" -ExpectedCount 1

Write-Output ""
Write-Output "============================================================"
Write-Output "PART 6 - Write permission tests"
Write-Output "============================================================"

Write-Output "--- 6a anon INSERT schools (should FAIL) ---"
$anonw = Make-AnonHeaders
$anonw["Content-Type"] = "application/json"
try {
    Invoke-RestMethod -Uri "$baseUrl/schools" -Method POST -Headers $anonw -Body '{"name":"hack-school"}'
    Write-Output "  FAIL | anon INSERT schools - unexpected success"
} catch { Write-Output "  PASS | anon INSERT schools - blocked" }

Write-Output "--- 6b anon INSERT users (should FAIL) ---"
try {
    Invoke-RestMethod -Uri "$baseUrl/users" -Method POST -Headers $anonw -Body '{"username":"hack","password":"hack","name":"hack","role":"admin"}'
    Write-Output "  FAIL | anon INSERT users - unexpected success"
} catch { Write-Output "  PASS | anon INSERT users - blocked" }

Write-Output "--- 6c team INSERT submission for OTHER team (should FAIL) ---"
$team1w = Make-AnonHeaders @{
    "x-app-role" = "team"
    "x-app-user-id" = "6bdf09f2-2e14-4cf2-a4ed-81a59374d181"
    "x-app-school-id" = "b1873e17-b42b-4028-874d-fbeccab69444"
    "x-app-team-id" = "6bdf09f2-2e14-4cf2-a4ed-81a59374d181"
}
$team1w["Content-Type"] = "application/json"
try {
    Invoke-RestMethod -Uri "$baseUrl/task_submissions" -Method POST -Headers $team1w -Body '{"team_id":"0c282a93-4df4-4d14-a5d4-9d863d811e5b","task_id":"00000000-0000-0000-0000-000000000001","content":"hack"}'
    Write-Output "  FAIL | team INSERT other-team submission - unexpected success"
} catch { Write-Output "  PASS | team INSERT other-team submission - blocked" }

Write-Output "--- 6d volunteer UPDATE other user (should FAIL) ---"
$vol1w = Make-AnonHeaders @{
    "x-app-role" = "volunteer"
    "x-app-user-id" = "581bede2-4a6e-40c0-ad99-c72c62bde617"
    "x-app-school-id" = "b1873e17-b42b-4028-874d-fbeccab69444"
}
$vol1w["Content-Type"] = "application/json"
try {
    $r = Invoke-RestMethod -Uri "$baseUrl/users?id=eq.97bd8bf3-f339-45f2-80cb-da661113b6ef" -Method PATCH -Headers $vol1w -Body '{"name":"hack"}'
    if ($r.Count -eq 0) { Write-Output "  PASS | volunteer UPDATE other user - 0 rows (blocked)" }
    else { Write-Output "  FAIL | volunteer UPDATE other user - $($r.Count) rows updated" }
} catch { Write-Output "  PASS | volunteer UPDATE other user - blocked" }

Write-Output "--- 6e teacher DELETE schools (should FAIL) ---"
$teacher1w = Make-AnonHeaders @{
    "x-app-role" = "teacher"
    "x-app-user-id" = "38d8acb3-f8ec-4bf5-bac3-b542fc1c6531"
    "x-app-school-id" = "b1873e17-b42b-4028-874d-fbeccab69444"
}
try {
    Invoke-RestMethod -Uri "$baseUrl/schools?id=eq.b1873e17-b42b-4028-874d-fbeccab69444" -Method DELETE -Headers $teacher1w
    Write-Output "  FAIL | teacher DELETE schools - unexpected success"
} catch { Write-Output "  PASS | teacher DELETE schools - blocked" }

Write-Output "--- 6f team UPDATE other team (should FAIL) ---"
try {
    $r = Invoke-RestMethod -Uri "$baseUrl/teams?id=eq.0c282a93-4df4-4d14-a5d4-9d863d811e5b" -Method PATCH -Headers $team1w -Body '{"name":"hack"}'
    if ($r.Count -eq 0) { Write-Output "  PASS | team UPDATE other team - 0 rows (blocked)" }
    else { Write-Output "  FAIL | team UPDATE other team - $($r.Count) rows updated" }
} catch { Write-Output "  PASS | team UPDATE other team - blocked" }

Write-Output ""
Write-Output "============================================================"
Write-Output "PART 7 - App API (service_role bypasses RLS)"
Write-Output "============================================================"
try {
    $r = Invoke-RestMethod -Uri "http://localhost:5000/api/schools" -Method GET -TimeoutSec 5
    Write-Output "  PASS | GET /api/schools - $($r.schools.Count) schools"
} catch { Write-Output "  FAIL | GET /api/schools - $($_.Exception.Message)" }

try {
    $r = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" -Method POST -ContentType "application/json" -Body '{"username":"volunteer1","password":"123456"}' -SessionVariable vs
    Write-Output "  PASS | POST /api/auth/login - $($r.user.name)"
    $sc = ($vs.Cookies.GetCookies("http://localhost:5000") | Where-Object { $_.Name -eq "session" }).Value
    $r2 = Invoke-RestMethod -Uri "http://localhost:5000/api/volunteers" -Headers @{ Cookie = "session=$sc" }
    Write-Output "  PASS | GET /api/volunteers - $($r2.volunteers.Count) volunteers"
} catch { Write-Output "  FAIL | App API - $($_.Exception.Message)" }

try {
    $r = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/team-login" -Method POST -ContentType "application/json" -Body '{"code":"YG01","password":"yg123456"}'
    Write-Output "  PASS | POST /api/auth/team-login - $($r.team.name)"
} catch { Write-Output "  FAIL | team-login - $($_.Exception.Message)" }

Write-Output ""
Write-Output "============================================================"
Write-Output "VERIFICATION COMPLETE"
Write-Output "============================================================"
