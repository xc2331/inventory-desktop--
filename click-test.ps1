Add-Type -AssemblyName System.Windows.Forms
$code = @"
using System;
using System.Runtime.InteropServices;

public static class Win32 {
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetFocus(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int x, int y);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
Add-Type -TypeDefinition $code

$hwnd = [IntPtr]5380046
$rect = [Win32+RECT]::new()
$Win32::GetWindowRect($hwnd, [ref]$rect)
Write-Host "Rect: Left=$rect.Left Top=$rect.Top Right=$rect.Right Bottom=$rect.Bottom"

[Win32]::ShowWindow($hwnd, 9)
[Win32]::SetForegroundWindow($hwnd)
[Win32]::SetFocus($hwnd)
Start-Sleep -Seconds 2

$sidebarX = $rect.Left + 120
$sidebarY = $rect.Top + 620
Write-Host "Clicking at: $sidebarX,$sidebarY"
[Win32]::SetCursorPos($sidebarX, $sidebarY)
Start-Sleep -Milliseconds 300
[Win32]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 300
[Win32]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)

Start-Sleep -Seconds 3
$logPath = 'C:\Users\4070\AppData\Local\Temp\lingguang-render.log'
if (Test-Path $logPath) { Get-Content $logPath } else { Write-Host "No log file found" }