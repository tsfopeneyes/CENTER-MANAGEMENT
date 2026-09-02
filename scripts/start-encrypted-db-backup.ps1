# Run interactively in the user's terminal. No transcript, password arguments,
# clipboard access, database writes, deployment, or system policy changes.
#Requires -Version 7.0
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$backupWorkspace = Split-Path -Parent $PSScriptRoot
$backupCertificate = 'C:\Users\Jin\Downloads\prod-ca-2021.crt'
$backupNode = (Get-Command node -ErrorAction Stop).Source
$backupScript = Join-Path $PSScriptRoot 'encrypted-db-backup.mjs'
foreach ($backupRequired in @($backupCertificate, $backupScript,
    (Join-Path $backupWorkspace 'scratch/backup-tools-17.11/unpacked/pgsql/bin/pg_dump.exe'),
    (Join-Path $backupWorkspace 'scratch/backup-tools-17.11/unpacked/pgsql/bin/pg_dumpall.exe'),
    (Join-Path $backupWorkspace 'scratch/backup-tools-17.11/unpacked/pgsql/bin/pg_restore.exe'),
    (Join-Path $backupWorkspace 'scratch/backup-tools-17.11/unpacked/pgsql/bin/psql.exe'),
    (Join-Path $backupWorkspace 'scratch/backup-age-1.3.2/unpacked/age/age.exe'),
    (Join-Path $backupWorkspace 'scratch/backup-age-1.3.2/unpacked/age/age-keygen.exe'))) {
    if (-not (Test-Path -LiteralPath $backupRequired -PathType Leaf)) { throw '필요한 백업 도구 또는 인증서가 없습니다.' }
}
$backupCert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem([IO.File]::ReadAllText($backupCertificate))
if ($backupCert.NotAfter -le (Get-Date)) { throw '인증서 유효기간을 확인해주세요.' }
if ($CheckOnly) { Write-Output 'PASS: backup tools and certificate are present. No password requested, files exported, or database connection made.'; return }

Write-Host 'SCI 센터 암호화 백업 준비 (읽기 전용 트랜잭션 확인)'
Write-Host '회원·기록·권한을 수정하거나 사이트를 배포하지 않습니다.'
Write-Host '백업은 이 PC의 AppData\Local\SCI-Center-Backups에 암호화해 저장합니다.'
Write-Host 'DB 비밀번호와 별도로 백업 암호를 정해 비밀번호 관리 앱에 보관해야 합니다.'
Write-Host '비밀번호는 채팅에 보내지 마세요. 이 창은 입력 내용을 기록하지 않습니다.'
if ((Read-Host '암호화 백업 저장과 별도 암호 보관을 준비하셨으면 진행 입력') -cne '진행') { return }
$backupSecurePassword = Read-Host '방금 변경한 DB 비밀번호' -AsSecureString
$backupBstr = [IntPtr]::Zero
$backupPlainPassword = $null
$backupPayload = $null
try {
    $backupBase = Join-Path $env:LOCALAPPDATA 'SCI-Center-Backups'
    if ((Test-Path -LiteralPath $backupBase) -and ((Get-Item -LiteralPath $backupBase).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw '백업 경로는 연결 폴더가 아니어야 합니다.' }
    $backupDestination = Join-Path $backupBase ('backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $backupDestination | Out-Null
    # Restrict only this newly created run directory; never change parent/user ACLs.
    $backupAcl = [System.Security.AccessControl.DirectorySecurity]::new()
    $backupAcl.SetAccessRuleProtection($true, $false)
    $backupOwner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $backupAcl.SetOwner($backupOwner)
    foreach ($backupPrincipal in @($backupOwner, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $backupRule = [System.Security.AccessControl.FileSystemAccessRule]::new($backupPrincipal,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',
            [System.Security.AccessControl.PropagationFlags]::None,
            [System.Security.AccessControl.AccessControlType]::Allow)
        $backupAcl.AddAccessRule($backupRule)
    }
    Set-Acl -LiteralPath $backupDestination -AclObject $backupAcl
    $backupBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($backupSecurePassword)
    $backupPlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($backupBstr)
    $backupPayload = @{ password=$backupPlainPassword; certificate=$backupCertificate; destination=$backupDestination } | ConvertTo-Json -Compress
    $backupStart = [Diagnostics.ProcessStartInfo]::new()
    $backupStart.FileName = $backupNode
    $backupStart.ArgumentList.Add($backupScript)
    $backupStart.UseShellExecute = $false
    $backupStart.RedirectStandardInput = $true
    $backupStart.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
    $backupStart.WorkingDirectory = $backupWorkspace
    $backupProcess = [Diagnostics.Process]::Start($backupStart)
    $backupProcess.StandardInput.Write($backupPayload)
    $backupProcess.StandardInput.Close()
    $backupPayload = $null; $backupPlainPassword = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($backupBstr); $backupBstr = [IntPtr]::Zero
    $backupSecurePassword.Dispose()
    $backupProcess.WaitForExit()
    if ($backupProcess.ExitCode -ne 0) { Write-Host '중단되었습니다. 이 사본으로 운영 전환을 진행하지 마세요.' }
} catch {
    Write-Host '백업을 완료하지 못했습니다. 비밀번호를 공유하지 말고 준비 단계 오류라고 알려주세요.'
} finally {
    if ($backupBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($backupBstr) }
    $backupSecurePassword.Dispose()
    $backupPayload = $null; $backupPlainPassword = $null
}
Read-Host '내용을 확인한 뒤 Enter를 누르면 창을 닫습니다' | Out-Null
