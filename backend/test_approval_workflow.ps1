$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"
$API_URL = "http://localhost:5000/api/v1"
$script:FailedTests = 0
$testPrefix = "W$(Get-Date -Format 'MMddHHmmss')"

$nodes = @(
    @{ Code = "HN01"; Email = "cuong_hn@wms.com" },
    @{ Code = "DN01"; Email = "truongkho_dn@wms.com" },
    @{ Code = "HCM01"; Email = "staff_hcm@wms.com" }
)

function Request-Api {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Token = $null,
        $Body = $null
    )

    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }

    try {
        $jsonBody = if ($null -ne $Body) { ConvertTo-Json $Body -Depth 8 -Compress } else { $null }
        $response = Invoke-WebRequest -Uri "$API_URL$Endpoint" -Method $Method -Headers $headers -Body $jsonBody -ContentType "application/json" -UseBasicParsing
        return @{ Status = [int]$response.StatusCode; Data = $response.Content }
    } catch [System.Net.WebException] {
        $response = $_.Exception.Response
        if ($response) {
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            return @{ Status = [int]$response.StatusCode; Data = $reader.ReadToEnd() }
        }
        return @{ Status = 500; Data = $_.Exception.Message }
    }
}

function Assert-Test {
    param([string]$Title, [bool]$Condition, [string]$Details = "")
    if ($Condition) {
        Write-Host "[PASS] $Title" -ForegroundColor Green
    } else {
        $script:FailedTests++
        Write-Host "[FAIL] $Title $Details" -ForegroundColor Red
    }
}

function Get-StockQuantity {
    param([string]$Token, [string]$Node, [string]$Product)
    $response = Request-Api -Method "GET" -Endpoint "/dashboard/summary?ma_kho=$Node" -Token $Token
    if ($response.Status -ne 200) { return $null }
    $data = ($response.Data | ConvertFrom-Json)
    $items = if ($data.stocks) { $data.stocks } else { @() }
    $item = $items | Where-Object { $_.ma_sp -eq $Product } | Select-Object -First 1
    if ($null -eq $item) { return 0 }
    return [int]$item.so_luong
}

Write-Host "=== KIEM TRA WORKFLOW STAFF TAO PHIEU - MANAGER DUYET ===" -ForegroundColor Cyan

$adminLogin = Request-Api -Method "POST" -Endpoint "/auth/login" -Body @{ email = "admin@wms.com"; password = "123456"; ma_kho = "HN01" }
Assert-Test -Title "Admin login" -Condition ($adminLogin.Status -eq 200)
if ($adminLogin.Status -ne 200) { exit 1 }
$adminToken = ($adminLogin.Data | ConvertFrom-Json).token

foreach ($node in $nodes) {
    $staffLogin = Request-Api -Method "POST" -Endpoint "/auth/login" -Body @{ email = $node.Email; password = "123456"; ma_kho = $node.Code }
    Assert-Test -Title "$($node.Code) staff/manager login" -Condition ($staffLogin.Status -eq 200)
    if ($staffLogin.Status -ne 200) { continue }
    $staffToken = ($staffLogin.Data | ConvertFrom-Json).token

    $masterResponse = Request-Api -Method "GET" -Endpoint "/master-data?ma_kho=$($node.Code)" -Token $staffToken
    Assert-Test -Title "$($node.Code) master data" -Condition ($masterResponse.Status -eq 200)
    if ($masterResponse.Status -ne 200) { continue }
    $master = $masterResponse.Data | ConvertFrom-Json
    $data = if ($master.data) { $master.data } else { $master }
    $product = $data.san_pham[0]
    $supplier = $data.nha_cung_cap[0]
    $customer = $data.khach_hang[0]
    $before = Get-StockQuantity -Token $staffToken -Node $node.Code -Product $product.ma_sp

    $import = Request-Api -Method "POST" -Endpoint "/inventory/import" -Token $staffToken -Body @{
        ma_kho = $node.Code; ma_ncc = $supplier.ma_ncc
        items = @(@{ ma_sp = $product.ma_sp; so_luong = 1; don_gia = [double]$product.gia_nhap })
    }
    Assert-Test -Title "$($node.Code) staff tao phieu nhap" -Condition ($import.Status -eq 201)
    $importData = $import.Data | ConvertFrom-Json
    $importId = $importData.ma_phieu_nhap
    $pending = Get-StockQuantity -Token $staffToken -Node $node.Code -Product $product.ma_sp
    Assert-Test -Title "$($node.Code) ton kho chua doi khi cho duyet" -Condition ($pending -eq $before) -Details "before=$before pending=$pending"

    $approveImport = Request-Api -Method "POST" -Endpoint "/inventory/import/$importId/approve?ma_kho=$($node.Code)" -Token $adminToken
    Assert-Test -Title "$($node.Code) admin duyet nhap" -Condition ($approveImport.Status -eq 200)
    $afterImport = Get-StockQuantity -Token $staffToken -Node $node.Code -Product $product.ma_sp
    Assert-Test -Title "$($node.Code) ton kho tang sau duyet nhap" -Condition ($afterImport -eq ($before + 1)) -Details "before=$before after=$afterImport"

    $export = Request-Api -Method "POST" -Endpoint "/inventory/export" -Token $staffToken -Body @{
        ma_kho = $node.Code; ma_kh = $customer.ma_kh
        items = @(@{ ma_sp = $product.ma_sp; so_luong = 1; don_gia = [double]$product.gia_ban })
    }
    Assert-Test -Title "$($node.Code) staff tao phieu xuat" -Condition ($export.Status -eq 201)
    $exportData = $export.Data | ConvertFrom-Json
    $exportId = $exportData.ma_phieu_xuat
    $pendingExport = Get-StockQuantity -Token $staffToken -Node $node.Code -Product $product.ma_sp
    Assert-Test -Title "$($node.Code) ton kho chua doi khi cho duyet xuat" -Condition ($pendingExport -eq $afterImport) -Details "afterImport=$afterImport pending=$pendingExport"

    $approveExport = Request-Api -Method "POST" -Endpoint "/inventory/export/$exportId/approve?ma_kho=$($node.Code)" -Token $adminToken
    Assert-Test -Title "$($node.Code) admin duyet xuat" -Condition ($approveExport.Status -eq 200)
    $afterExport = Get-StockQuantity -Token $staffToken -Node $node.Code -Product $product.ma_sp
    Assert-Test -Title "$($node.Code) ton kho giam sau duyet xuat" -Condition ($afterExport -eq $before) -Details "before=$before after=$afterExport"
}

Write-Host "`n=== KET QUA ===" -ForegroundColor Cyan
if ($script:FailedTests -gt 0) {
    Write-Host "So test that bai: $script:FailedTests" -ForegroundColor Red
    exit 1
}
Write-Host "Workflow approval da hoat dong tren HN, DN va HCM." -ForegroundColor Green
exit 0
