$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"
$API_URL = "http://localhost:5000/api/v1"
$script:FailedTests = 0
$transferPrefix = "T$(Get-Date -Format 'MMddHHmmss')"

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
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            return @{ Status = [int]$response.StatusCode; Data = $reader.ReadToEnd() }
        }

        return @{ Status = 500; Data = $_.Exception.Message }
    }
}

function Assert-Test {
    param(
        [string]$Title,
        [int]$Actual,
        [int]$Expected
    )

    if ($Actual -eq $Expected) {
        Write-Host "[PASS] $Title ($Actual)" -ForegroundColor Green
    } else {
        $script:FailedTests++
        Write-Host "[FAIL] $Title ($Actual, expected $Expected)" -ForegroundColor Red
    }
}

Write-Host "=== KIEM TRA DIEU CHUYEN XUYEN NODE ===" -ForegroundColor Cyan

$adminLogin = Request-Api -Method "POST" -Endpoint "/auth/login" -Body @{
    email = "admin@wms.com"
    password = "123456"
    ma_kho = "HN01"
}
Assert-Test -Title "Admin login" -Actual $adminLogin.Status -Expected 200

if ($adminLogin.Status -eq 200) {
    $adminToken = ($adminLogin.Data | ConvertFrom-Json).token
    $routes = @(
        @{ From = "HN01"; To = "DN01"; Code = "$transferPrefix`_HN_DN" },
        @{ From = "DN01"; To = "HCM01"; Code = "$transferPrefix`_DN_HCM" },
        @{ From = "HCM01"; To = "HN01"; Code = "$transferPrefix`_HCM_HN" }
    )

    foreach ($route in $routes) {
        $transfer = Request-Api -Method "POST" -Endpoint "/transfer" -Token $adminToken -Body @{
            ma_phieu_dc = $route.Code
            kho_xuat = $route.From
            kho_nhap = $route.To
            items = @(@{
                ma_sp = "SP_TV_OLED_55"
                so_luong = 1
            })
        }

        Assert-Test -Title "Create transfer $($route.From) -> $($route.To)" -Actual $transfer.Status -Expected 202
        if ($transfer.Status -eq 202) {
            $approve = Request-Api -Method "POST" -Endpoint "/transfer/$($route.Code)/approve?ma_kho=$($route.From)" -Token $adminToken
            Assert-Test -Title "Approve transfer $($route.From) -> $($route.To)" -Actual $approve.Status -Expected 200
        } else {
            Write-Host "  Response: $($transfer.Data)" -ForegroundColor DarkYellow
        }
    }
}

$staffLogin = Request-Api -Method "POST" -Endpoint "/auth/login" -Body @{
    email = "cuong_hn@wms.com"
    password = "123456"
    ma_kho = "HN01"
}
Assert-Test -Title "Staff HN login" -Actual $staffLogin.Status -Expected 200

if ($staffLogin.Status -eq 200) {
    $staffToken = ($staffLogin.Data | ConvertFrom-Json).token
    $staffTransfer = Request-Api -Method "POST" -Endpoint "/transfer" -Token $staffToken -Body @{
        ma_phieu_dc = "$transferPrefix`_STAFF_BLOCKED"
        kho_xuat = "HN01"
        kho_nhap = "DN01"
        items = @(@{
            ma_sp = "SP_TV_OLED_55"
            so_luong = 1
        })
    }

    Assert-Test -Title "Staff cannot create transfer" -Actual $staffTransfer.Status -Expected 403
}

Write-Host "`n=== KET QUA ===" -ForegroundColor Cyan
if ($script:FailedTests -gt 0) {
    Write-Host "So test that bai: $script:FailedTests" -ForegroundColor Red
    exit 1
}

Write-Host "Dieu chuyen HN -> DN -> HCM -> HN hoat dong." -ForegroundColor Green
exit 0
