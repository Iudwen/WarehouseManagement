$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"
$API_URL = "http://localhost:5000/api/v1"
$script:FailedTests = 0

$nodes = @(
    @{ Code = "HN01"; Email = "cuong_hn@wms.com"; Role = "STAFF" },
    @{ Code = "DN01"; Email = "truongkho_dn@wms.com"; Role = "MANAGER" },
    @{ Code = "HCM01"; Email = "staff_hcm@wms.com"; Role = "STAFF" }
)

function Request-Api {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Token = $null,
        $Body = $null
    )

    $headers = @{}
    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }

    try {
        $jsonBody = if ($null -ne $Body) {
            ConvertTo-Json -InputObject $Body -Depth 8 -Compress
        } else {
            $null
        }

        $response = Invoke-WebRequest `
            -Uri "$API_URL$Endpoint" `
            -Method $Method `
            -Headers $headers `
            -Body $jsonBody `
            -ContentType "application/json" `
            -UseBasicParsing

        return @{ Status = [int]$response.StatusCode; Data = $response.Content }
    }
    catch [System.Net.WebException] {
        $response = $_.Exception.Response
        if ($response) {
            return @{ Status = [int]$response.StatusCode; Data = $null }
        }

        return @{ Status = 500; Data = $_.Exception.Message }
    }
}

function Assert-NodeTest {
    param(
        [string]$Node,
        [string]$Check,
        [int]$Actual,
        [int]$Expected = 200
    )

    if ($Actual -eq $Expected) {
        Write-Host "[PASS] $Node - $Check ($Actual)" -ForegroundColor Green
    } else {
        $script:FailedTests++
        Write-Host "[FAIL] $Node - $Check ($Actual, expected $Expected)" -ForegroundColor Red
    }
}

Write-Host "=== KIEM TRA READINESS HN / DN / HCM ===" -ForegroundColor Cyan

$health = try {
    Invoke-WebRequest -Uri "http://localhost:5000/health" -UseBasicParsing
} catch {
    $null
}

if ($health) {
    Write-Host "[PASS] Backend health (200)" -ForegroundColor Green
} else {
    $script:FailedTests++
    Write-Host "[FAIL] Backend health" -ForegroundColor Red
}

foreach ($node in $nodes) {
    $login = Request-Api -Method "POST" -Endpoint "/auth/login" -Body @{
        email = $node.Email
        password = "123456"
        ma_kho = $node.Code
    }

    Assert-NodeTest -Node $node.Code -Check "login $($node.Role)" -Actual $login.Status
    if ($login.Status -ne 200) {
        continue
    }

    $loginData = $login.Data | ConvertFrom-Json
    $token = $loginData.token
    $user = $loginData.user

    if ($user.ma_kho -eq $node.Code -and $user.vai_tro -eq $node.Role) {
        Write-Host "[PASS] $($node.Code) - token payload" -ForegroundColor Green
    } else {
        $script:FailedTests++
        Write-Host "[FAIL] $($node.Code) - token payload" -ForegroundColor Red
    }

    $dashboard = Request-Api -Method "GET" -Endpoint "/dashboard/summary?ma_kho=$($node.Code)" -Token $token
    Assert-NodeTest -Node $node.Code -Check "dashboard" -Actual $dashboard.Status

    $masterData = Request-Api -Method "GET" -Endpoint "/master-data?ma_kho=$($node.Code)" -Token $token
    Assert-NodeTest -Node $node.Code -Check "master-data" -Actual $masterData.Status

    $alerts = Request-Api -Method "GET" -Endpoint "/alerts/low-stock?ma_kho=$($node.Code)" -Token $token
    Assert-NodeTest -Node $node.Code -Check "alerts" -Actual $alerts.Status
}

Write-Host "`n=== KET QUA ===" -ForegroundColor Cyan
if ($script:FailedTests -gt 0) {
    Write-Host "So test that bai: $script:FailedTests" -ForegroundColor Red
    exit 1
}

Write-Host "HN, DN va HCM deu san sang o muc API co ban." -ForegroundColor Green
exit 0
