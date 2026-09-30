# ============================================================
# SCRIPT TEST TONG HOP API BACKEND + CHECK RISKS FRONTEND
# ============================================================
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"
$API_URL = "http://localhost:5000/api/v1"

function Request-API {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Token = $null,
        $Body = $null,
        [hashtable]$ExtraHeaders = @{}
    )

    $headers = @{}
    foreach ($key in $ExtraHeaders.Keys) {
        $headers[$key] = $ExtraHeaders[$key]
    }

    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }

    $jsonBody = if ($Body) { ConvertTo-Json -InputObject $Body -Depth 8 -Compress } else { $null }

    try {
        $res = Invoke-WebRequest -Uri "$API_URL$Endpoint" -Method $Method -Headers $headers -Body $jsonBody -ContentType "application/json" -UseBasicParsing
        return @{ Status = [int]$res.StatusCode; Data = $res.Content }
    }
    catch [System.Net.WebException] {
        $res = $_.Exception.Response
        if ($res) {
            try {
                $reader = New-Object System.IO.StreamReader($res.GetResponseStream())
                $body = $reader.ReadToEnd()
            }
            catch {
                $body = $_.Exception.Message
            }
            return @{ Status = [int]$res.StatusCode; Data = $body }
        }
        return @{ Status = 500; Data = $_.Exception.Message }
    }
    catch {
        return @{ Status = 500; Data = $_.Exception.Message }
    }
}

function Assert-Test {
    param(
        [string]$Title,
        [int]$ActualStatus,
        [int]$ExpectedStatus
    )

    if ($ActualStatus -eq $ExpectedStatus) {
        Write-Host " [PASS $ActualStatus] $Title" -ForegroundColor Green
    }
    else {
        Write-Host " [FAIL $ActualStatus - expected $ExpectedStatus] $Title" -ForegroundColor Red
    }
}

function Get-LoginToken {
    param(
        [string]$Email,
        [string]$Password
    )

    $loginRes = Request-API -Method "POST" -Endpoint "/auth/login" -Body @{ email = $Email; password = $Password }
    if ($loginRes.Status -eq 200) {
        try {
            $payload = ConvertFrom-Json -InputObject $loginRes.Data
            return @{ Status = 200; Token = $payload.token; User = $payload.user }
        }
        catch {
            return @{ Status = 500; Token = $null; User = $null; Error = $loginRes.Data }
        }
    }

    return @{ Status = $loginRes.Status; Token = $null; User = $null; Error = $loginRes.Data }
}

function Write-ApiSummary {
    param(
        [string]$Title,
        [hashtable]$Result
    )

    Write-Host "`n--- $Title ---" -ForegroundColor Cyan
    Write-Host "Status: $($Result.Status)"
    if ($Result.Data) {
        Write-Host "Data: $($Result.Data)"
    }
}

function Check-FrontendRisks {
    Write-Host "`n=== KIEM TRA RUI RO TIEM AN FRONTEND ===" -ForegroundColor Yellow

    $risks = @(
        "- FE đang hardcode baseURL = http://localhost:5000/api/v1 trong [frontend/src/services/api.ts]; nếu backend đổi port hoặc deploy khác môi trường => FE fail toàn bộ.",
        "- localStorage.getItem('wms_token') được đọc trực tiếp mà không có guard cho môi trường SSR/non-browser; nếu FE render ở server hoặc test ngoài browser có thể nổ exception.",
        "- Interceptor gắn Bearer Token nhưng không xử lý 401/403 bằng redirect logout hay refresh token; user sẽ bị treo ở màn hình không có lỗi rõ ràng.",
        "- Không có timeout/ retry/ fallback cho network error; khi backend chậm hoặc mất kết nối, UI sẽ bị trạng thái treo hoặc màn hình trắng nếu chưa có error boundary.",
        "- Nếu API trả về { success: false } mà UI chỉ đọc .data hoặc .items mà không kiểm tra mã lỗi, frontend có thể hiển thị dữ liệu sai hoặc crash khi null.",
        "- Route auth/role guard phụ thuộc vào token; nếu refresh token không đúng hoặc token hết hạn, mọi request sẽ bị reject mà không có UX rõ ràng."
    )

    foreach ($risk in $risks) {
        Write-Host $risk -ForegroundColor DarkYellow
    }
}

Write-Host "`n=== BAT DAU KIEM THU BACKEND API TOAN DIEN ===" -ForegroundColor Cyan

# 1. HEALTH CHECK
Write-Host "`n[1] Kiem tra health endpoint..." -ForegroundColor Yellow
$health = Request-API -Method "GET" -Endpoint "/health"
Assert-Test -Title "GET /health" -ActualStatus $health.Status -ExpectedStatus 200
Write-ApiSummary -Title "Health Result" -Result $health

# 2. LOGIN + TOKEN
Write-Host "`n[2] Lay token admin & staff..." -ForegroundColor Yellow
$staffLogin = Get-LoginToken -Email "cuong_hn@wms.com" -Password "123456"
$adminLogin = Get-LoginToken -Email "admin@wms.com" -Password "123456"

$staffToken = $staffLogin.Token
$adminToken = $adminLogin.Token

if (-not $staffToken) {
    Write-Host " Loi: Khong the dang nhap STAFF!" -ForegroundColor Red
    Write-Host " Chi tiet: $($staffLogin.Error)" -ForegroundColor DarkYellow
    Write-Host " Goi y: Kiem tra backend dang chay tren $API_URL" -ForegroundColor Gray
}

if (-not $adminToken) {
    Write-Host " Loi: Khong the dang nhap ADMIN!" -ForegroundColor Red
    Write-Host " Chi tiet: $($adminLogin.Error)" -ForegroundColor DarkYellow
    Write-Host " Goi y: Kiem tra backend dang chay tren $API_URL" -ForegroundColor Gray
}

if ($staffToken -and $adminToken) {
    Write-Host " Dang nhap thanh cong! Da cap token cho STAFF & ADMIN." -ForegroundColor Gray
}

# 3. SECURITY TESTS
Write-Host "`n[3] Kiem tra bao mat + RBAC + Branch Guard..." -ForegroundColor Yellow

# Test 3.1 No token
$t1 = Request-API -Method "GET" -Endpoint "/dashboard/summary"
Assert-Test -Title "No token -> GET /dashboard/summary" -ActualStatus $t1.Status -ExpectedStatus 401

# Test 3.2 Staff cannot transfer
if ($staffToken) {
    $t2 = Request-API -Method "POST" -Endpoint "/transfer" -Token $staffToken -Body @{
        ma_phieu_dc = "DC_TEST_01"; kho_xuat = "HN01"; kho_nhap = "DN01"; items = @(@{ ma_sp = "SP01"; so_luong = 1 })
    }
    Assert-Test -Title "Staff cannot create transfer" -ActualStatus $t2.Status -ExpectedStatus 403
}
else {
    Write-Host " [SKIP] Staff cannot create transfer (no staff token)" -ForegroundColor DarkGray
}

# Test 3.3 Staff cannot read audit logs
if ($staffToken) {
    $t3 = Request-API -Method "GET" -Endpoint "/audit/logs" -Token $staffToken
    Assert-Test -Title "Staff cannot read audit logs" -ActualStatus $t3.Status -ExpectedStatus 403
}
else {
    Write-Host " [SKIP] Staff cannot read audit logs (no staff token)" -ForegroundColor DarkGray
}

# Test 3.4 Staff branch mismatch block
if ($staffToken) {
    $t4 = Request-API -Method "POST" -Endpoint "/inventory/import" -Token $staffToken -Body @{
        ma_kho = "HCM01"; ma_ncc = "NCC001"; items = @(@{ ma_sp = "SP01"; so_luong = 5; don_gia = 100 })
    }
    Assert-Test -Title "Staff branch mismatch blocked" -ActualStatus $t4.Status -ExpectedStatus 403
}
else {
    Write-Host " [SKIP] Staff branch mismatch blocked (no staff token)" -ForegroundColor DarkGray
}

# Test 3.5 Admin can access audit logs
if ($adminToken) {
    $t5 = Request-API -Method "GET" -Endpoint "/audit/logs" -Token $adminToken
    Assert-Test -Title "Admin can read audit logs" -ActualStatus $t5.Status -ExpectedStatus 200
}
else {
    Write-Host " [SKIP] Admin can read audit logs (no admin token)" -ForegroundColor DarkGray
}

# 4. CRUD/MAIN FUNCTIONAL API SMOKE TESTS
Write-Host "`n[4] Kiem tra smoke test cac API chinh..." -ForegroundColor Yellow

if ($staffToken) {
    $dashboard = Request-API -Method "GET" -Endpoint "/dashboard/summary" -Token $staffToken -ExtraHeaders @{ "x-test" = "dashboard" }
    Assert-Test -Title "GET /dashboard/summary" -ActualStatus $dashboard.Status -ExpectedStatus 200
    Write-ApiSummary -Title "Dashboard Summary" -Result $dashboard

    $alerts = Request-API -Method "GET" -Endpoint "/alerts/low-stock" -Token $staffToken
    Assert-Test -Title "GET /alerts/low-stock" -ActualStatus $alerts.Status -ExpectedStatus 200
    Write-ApiSummary -Title "Alerts" -Result $alerts

    $master = Request-API -Method "GET" -Endpoint "/master-data" -Token $staffToken
    Assert-Test -Title "GET /master-data" -ActualStatus $master.Status -ExpectedStatus 200
    Write-ApiSummary -Title "Master Data" -Result $master
}
else {
    Write-Host " [SKIP] Functional smoke tests (no staff token)" -ForegroundColor DarkGray
}

# 5. IMPORT / EXPORT TESTS (sample payload)
Write-Host "`n[5] Kiem tra API Nhap/Xuat kho voi payload mau..." -ForegroundColor Yellow

$validImportPayload = @{
    ma_kho = "HN01";
    ma_ncc = "NCC001";
    items = @(
        @{ ma_sp = "SP01"; so_luong = 5; don_gia = 100 }
    )
}

if ($staffToken) {
    $importRes = Request-API -Method "POST" -Endpoint "/inventory/import" -Token $staffToken -Body $validImportPayload
    Assert-Test -Title "POST /inventory/import (valid branch)" -ActualStatus $importRes.Status -ExpectedStatus 201
    Write-ApiSummary -Title "Import Result" -Result $importRes
}
else {
    Write-Host " [SKIP] POST /inventory/import (no staff token)" -ForegroundColor DarkGray
}

$validExportPayload = @{
    ma_kho = "HN01";
    ma_kh = "KH001";
    items = @(
        @{ ma_sp = "SP01"; so_luong = 2 }
    )
}

if ($staffToken) {
    $exportRes = Request-API -Method "POST" -Endpoint "/inventory/export" -Token $staffToken -Body $validExportPayload
    Assert-Test -Title "POST /inventory/export (valid branch)" -ActualStatus $exportRes.Status -ExpectedStatus 201
    Write-ApiSummary -Title "Export Result" -Result $exportRes
}
else {
    Write-Host " [SKIP] POST /inventory/export (no staff token)" -ForegroundColor DarkGray
}

# 6. FRONTEND RISK CHECK
Check-FrontendRisks

Write-Host "`n=== HOAN THANH KIEM THU API BACKEND ===" -ForegroundColor Cyan
