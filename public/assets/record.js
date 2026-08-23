const { spawn, execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ============================ Platform ============================
const PLATFORM = process.platform; // 'win32' | 'linux' | 'darwin'
const IS_WIN = PLATFORM === 'win32';
const IS_MAC = PLATFORM === 'darwin';
const IS_LINUX = PLATFORM === 'linux';

if (!IS_WIN && !IS_MAC && !IS_LINUX) {
  console.error('Unsupported platform:', PLATFORM);
  process.exit(1);
}

// ============================ Paths ============================
const scriptDir = __dirname;
const screenshots = path.join(os.homedir(), 'Pictures', 'Screenshots'); // saved PNG targets
const doneFile = path.join(os.tmpdir(), 'cookies_done.flag'); // set by the show script when the browser flow finishes

fs.mkdirSync(screenshots, { recursive: true });

// ============================ Helpers ============================
function runDetached(bin, args) {
  try {
    const child = spawn(bin, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {}
}

function runPS(script, hidden = true) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: hidden,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out }));
  });
}

function runPSHiddenDetached(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], () => {});
}

function showMessage(text, title) {
  if (IS_WIN) {
    const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${text.replace(/'/g, "''")}', '${title.replace(/'/g, "''")}', 'OK', 'Information') | Out-Null`;
    return runPS(script, false);
  }
  if (IS_MAC) {
    const safe = text.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
    runDetached('osascript', ['-e', `display dialog "${safe}" with title "${title.replace(/"/g, '\\"')}" buttons {"OK"} default button "OK"`]);
    return Promise.resolve();
  }
  // Linux: try zenity, then console
  try {
    if (execFileSync('zenity', ['--version'], { stdio: 'ignore' }, (e) => {})) {
      runDetached('zenity', ['--info', '--title', title, '--text', text]);
      return Promise.resolve();
    }
  } catch {}
  console.log(`[${title}] ${text}`);
  return Promise.resolve();
}

function openCaptures() {
  if (IS_WIN) {
    runPSHiddenDetached(`Start-Process '${screenshots.replace(/'/g, "''")}'`);
  } else if (IS_MAC) {
    runDetached('open', [screenshots]);
  } else {
    runDetached('xdg-open', [screenshots]);
  }
}

// ============================ Windows browser detection ============================
function regQuery(key, value) {
  try {
    let args = ['query', key, '/v', value];
    if (value === '') args = ['query', key, '/ve'];
    const out = execFileSync('reg', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(/REG_SZ\s+(.*)/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

function getDefaultBrowserName() {
  // Prefer the OS-registered default browser (this matches what the user
  // actually wants, e.g. Firefox on this machine), then fall back to the
  // first installed browser.
  const progId = regQuery('HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice', 'ProgId');
  if (progId) {
    if (progId.startsWith('Firefox')) return 'firefox';
    if (progId.startsWith('ChromeHTML')) return 'chrome';
    if (progId.startsWith('MSEdgeHTM')) return 'msedge';
    if (progId.startsWith('Brave')) return 'brave';
    if (progId.startsWith('Opera')) return 'opera';
  }
  const names = {
    chrome: { exe: 'chrome.exe', progId: 'ChromeHTML' },
    msedge: { exe: 'msedge.exe', progId: 'MSEdgeHTM' },
    firefox: { exe: 'firefox.exe', progId: 'Firefox' },
    brave: { exe: 'brave.exe', progId: 'Brave' },
    opera: { exe: 'opera.exe', progId: 'Opera' },
  };
  for (const [name, cfg] of Object.entries(names)) {
    if (exeExists(name, cfg.exe)) return name;
  }
  return null;
}

function exeExists(name, exeName) {
  for (const key of [
    `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
    `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
    `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
  ]) {
    if (regQuery(key, '')) return true;
  }
  return false;
}

function getBrowserExe(name) {
  const exeName = `${name}.exe`;
  for (const key of [
    `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
    `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
    `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
  ]) {
    const p = regQuery(key, '');
    if (p && fs.existsSync(p)) return p;
  }
  try {
    const cmd = execFileSync('where.exe', [exeName], { encoding: 'utf8' });
    const first = cmd.split(/\r?\n/)[0];
    if (first && fs.existsSync(first)) return first;
  } catch {}
  return null;
}

// ============================ Linux browser detection ============================
const LINUX_BIN = {
  chrome: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chromium-stable'],
  msedge: ['microsoft-edge', 'microsoft-edge-stable'],
  firefox: ['firefox'],
  brave: ['brave-browser', 'brave'],
  opera: ['opera', 'opera-stable'],
};
const LINUX_WINDOW_CLASS = { chrome: 'chrome', msedge: 'microsoft-edge', firefox: 'firefox', brave: 'brave', opera: 'opera' };

function findBin(names) {
  for (const b of names) {
    try {
      const p = execFileSync('which', [b], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (p && fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

function getDefaultBrowserNameLinux() {
  try {
    const out = execFileSync('xdg-settings', ['get', 'default-web-browser'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const s = out.trim();
    if (/edg/i.test(s)) return 'msedge';
    if (/chrom/i.test(s)) return 'chrome';
    if (/firefox/i.test(s)) return 'firefox';
    if (/brave/i.test(s)) return 'brave';
    if (/opera/i.test(s)) return 'opera';
  } catch {}
  for (const [name, bins] of Object.entries(LINUX_BIN)) {
    if (findBin(bins)) return name;
  }
  return null;
}

function getBrowserExeLinux(name) {
  return findBin(LINUX_BIN[name] || []);
}

// ============================ Mac browser detection ============================
const MAC_APPS = { chrome: 'Google Chrome', msedge: 'Microsoft Edge', firefox: 'Firefox', brave: 'Brave Browser', opera: 'Opera' };
const MAC_PROCESS = { chrome: 'Google Chrome', msedge: 'Microsoft Edge', firefox: 'firefox', brave: 'Brave Browser', opera: 'Opera' };

function getBrowserExeMac(name) {
  const app = MAC_APPS[name];
  if (!app) return null;
  if (fs.existsSync(path.join('/Applications', `${app}.app`))) return app;
  return null;
}

function getDefaultBrowserNameMac() {
  for (const name of ['chrome', 'firefox', 'msedge', 'brave', 'opera']) {
    if (getBrowserExeMac(name)) return name;
  }
  return null;
}

// ============================ Launch browser ============================
const SITES = {
  instagram: { url: 'https://www.instagram.com/instagram/?__a=1', rowTail: 'instagram/?__a=1' },
  facebook: { url: 'https://www.facebook.com/facebook/?__a=1', rowTail: 'facebook/?__a=1' },
};

function getSiteUsername(site) {
  const m = site.url.match(/\.com\/([^/?]+)/);
  return m ? m[1] : site.rowTail.split('/')[0];
}

function getDevToolsFlag(name) {
  return name === 'firefox' ? '-devtools' : '--auto-open-devtools-for-tabs';
}

function launchBrowser(name, exe, site) {
  const url = site.url;
  const flagArg = getDevToolsFlag(name);
  // Chromium launches with extensions/extras disabled so the "Bookmark Saver"
  // popup and welcome pages never auto-open during recording.
  const extra = name && name !== 'firefox' ? ['--disable-extensions', '--no-first-run', '--disable-default-apps'] : [];
  if (IS_WIN) {
    if (exe) {
      runDetached(exe, [flagArg, ...extra, url]);
    } else {
      runPSHiddenDetached(`Start-Process '${url}'`);
    }
  } else if (IS_MAC) {
    if (exe) {
      runDetached('open', ['-a', exe, '--args', flagArg, ...extra, url]);
    } else {
      runDetached('open', [url]);
    }
  } else {
    if (exe) {
      runDetached(exe, [flagArg, ...extra, url]);
    } else {
      runDetached('xdg-open', [url]);
    }
  }
}

// ============================ Screenshot ============================
function takeScreenshot(outPath) {
  if (IS_WIN) {
    const script =
      `Add-Type -AssemblyName System.Windows.Forms; ` +
      `Add-Type -AssemblyName System.Drawing; ` +
      `$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ` +
      `$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height); ` +
      `$g = [System.Drawing.Graphics]::FromImage($bmp); ` +
      `$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); ` +
      `$bmp.Save('${outPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png); ` +
      `$g.Dispose(); $bmp.Dispose()`;
    return runPS(script).then((r) => fs.existsSync(outPath));
  }
  if (fs.existsSync('/usr/bin/screencapture')) {
    runDetached('/usr/bin/screencapture', ['-x', outPath]);
    return Promise.resolve(true);
  }
  if (fs.existsSync('/usr/bin/scrot')) {
    runDetached('/usr/bin/scrot', ['-z', outPath]);
    return Promise.resolve(true);
  }
  if (fs.existsSync('/usr/bin/gnome-screenshot')) {
    runDetached('/usr/bin/gnome-screenshot', ['-f', outPath]);
    return Promise.resolve(true);
  }
  return Promise.resolve(false);
}

function closeBrowser(name) {
  if (IS_WIN) {
    const exeName = `${name}.exe`;
    const ps =
      `Get-Process '${exeName}','${name}' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; ` +
      `for ($i=0; $i -lt 30; $i++) { ` +
      `  $left = Get-Process '${exeName}','${name}' -ErrorAction SilentlyContinue; ` +
      `  if (-not $left) { break }; ` +
      `  $left | Stop-Process -Force -ErrorAction SilentlyContinue; ` +
      `  Start-Sleep -Milliseconds 100 }; ` +
      `Get-Process '${exeName}','${name}' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`;
    return runPS(ps);
  } else if (IS_MAC) {
    runDetached('pkill', ['-f', MAC_PROCESS[name] || name]);
    return Promise.resolve();
  } else {
    runDetached('pkill', ['-f', (LINUX_WINDOW_CLASS[name] || name)]);
    return Promise.resolve();
  }
}

// ============================ Linux console automation (xdotool/wmctrl) ============================
function linuxShowScriptFor(browserName) {
  const cls = (LINUX_WINDOW_CLASS[browserName] || browserName || 'chrome');
  const devKey = browserName === 'firefox' ? 'ctrl+shift+k' : 'ctrl+shift+j';
  const netKey = browserName === 'firefox' ? 'ctrl+shift+e' : 'ctrl+shift+e';
  return `
BN="${cls}"
WID=""
for i in $(seq 1 20); do
  WID=$(xdotool search --onlyvisible --class "$BN" 2>/dev/null | tail -1)
  [ -n "$WID" ] && break
  sleep 0.5
done
[ -z "$WID" ] && exit 0
xdotool windowactivate "$WID" 2>/dev/null
xdotool windowfocus "$WID" 2>/dev/null
wmctrl -ia "$WID" 2>/dev/null
wmctrl -r "$WID" -b add,maximized_vert,maximized_horz 2>/dev/null
sleep 0.5
xdotool key --clearmodifiers F12
sleep 1
if [ "$BN" != "firefox" ]; then xdotool key --clearmodifiers ctrl+shift+d; sleep 1.5; fi
xdotool key --clearmodifiers F11
sleep 1.5
for k in ctrl+shift+c ctrl+shift+k ctrl+shift+s ${netKey} shift+F7 shift+F5 shift+F9 shift+F8; do
  xdotool windowactivate "$WID" 2>/dev/null
  xdotool windowfocus "$WID" 2>/dev/null
  xdotool key --clearmodifiers "$k"
  if [ "$k" = "${netKey}" ]; then
    sleep 0.8
    xdotool windowactivate "$WID" 2>/dev/null
    xdotool key --clearmodifiers F5
  fi
  sleep 2
done
xdotool windowactivate "$WID" 2>/dev/null
xdotool key --clearmodifiers ${devKey}
sleep 1.5
xdotool key --clearmodifiers F11
sleep 0.5
`;
}

function runLinuxShowScript(name) {
  const script = linuxShowScriptFor(name);
  const tmp = path.join(os.tmpdir(), `cookies_show_${Date.now()}.sh`);
  fs.writeFileSync(tmp, script, { mode: 0o755 });
  runDetached('bash', [tmp]);
}

// ============================ Mac console automation (AppleScript) ============================
function macShowScriptFor(browserName) {
  const processName = (MAC_PROCESS[browserName] || browserName || 'Safari');
  return `
set appName to "${processName}"
set isFirefox to (appName = "firefox")
try
  tell application appName to activate
end try
delay 1
tell application "System Events"
  try
    set frontmost of process "${processName}" to true
  end try
  delay 0.5
  try
    keystroke "f" using {control down, command down} -- true full screen
  end try
  delay 1
  try
    keystroke "j" using {command down, option down, shift down} -- DevTools
  end try
  delay 1.5
  try
    keystroke "d" using {command down, shift down} -- undock (chromium)
  end try
  delay 1.5
  -- show each panel one by one (Mac shortcuts)
  repeat with k in {"c", "k", "s", "e", "j", "n", "m", "i"}
    try
      keystroke k using {command down, shift down}
    end try
    delay 1
  end repeat
  -- Network panel reloads by itself
  try
    keystroke "e" using {command down, shift down}
  end try
  delay 0.5
  try
    keystroke "r" using {command down}
  end try
  delay 2
  -- end on Console panel
  set consoleKey to "j"
  if isFirefox then set consoleKey to "k"
  try
    keystroke consoleKey using {command down, shift down}
  end try
  delay 1.5
  try
    keystroke "f" using {control down, command down}
  end try
  delay 0.5
end tell
`;
}

function runMacShowScript(name) {
  const script = macShowScriptFor(name);
  const lines = script.trim().split(/\n/);
  const osaArgs = [];
  for (const l of lines) {
    const t = l.trim();
    if (t) osaArgs.push('-e', t);
  }
  runDetached('osascript', osaArgs);
}

// ============================ Windows console automation (existing, unchanged) ============================
function browserShowScriptFor(browserName, rowTail, shotPath) {
  const bn = browserName || '';
  const tail = rowTail || 'instagram/?__a=1';
  const shot = shotPath || '';
  return `
$browserName = '${bn}'
$rowTail = '${tail.replace(/'/g, "''")}'
$shotPath = '${shot.replace(/'/g, "''")}'
$names = @('chrome','msedge','firefox','brave','opera')
if ($browserName) { $names = @($browserName) }
$T = { param($label) Add-Content -LiteralPath "$env:TEMP/cookies_time.log" -Value ((Get-Date -Format 'HH:mm:ss.fff') + ' ' + $label) }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WinApi2 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
public struct RECT { public int Left, Top, Right, Bottom; }
'@

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public static class WinApi3 {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT3 { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll"), EntryPoint = "GetWindowThreadProcessId"] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT3 lpRect);

    private static List<IntPtr> _windows = new List<IntPtr>();
    private static uint _targetPid;

    private static bool Callback(IntPtr hWnd, IntPtr lParam) {
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        if (pid == _targetPid && IsWindowVisible(hWnd) && GetWindowTextLength(hWnd) > 0) {
            _windows.Add(hWnd);
        }
        return true;
    }

    public static List<IntPtr> GetProcessWindows(uint targetPid) {
        _windows = new List<IntPtr>();
        _targetPid = targetPid;
        EnumWindows(new EnumWindowsProc(Callback), IntPtr.Zero);
        return _windows;
    }

    public static string GetWindowTitle(IntPtr hWnd) {
        int len = GetWindowTextLength(hWnd);
        if (len <= 0) return "";
        StringBuilder sb = new StringBuilder(len + 1);
        GetWindowText(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }
}
'@

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WinLock {
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")] public static extern bool EnableWindow(IntPtr hWnd, bool bEnable);
    public const int GWL_STYLE = -16;
    public const int WS_SYSMENU = 0x00080000;
    public const int WS_CLOSE = 0x00000200; // now redundant with WS_SYSMENU on modern Windows
    public static int GetStyle(IntPtr h) { return GetWindowLong(h, GWL_STYLE); }
    public static void Lock(IntPtr h) {
        int s = GetStyle(h);
        SetWindowLong(h, GWL_STYLE, s & ~WS_SYSMENU);
    }
    public static void Unlock(IntPtr h) {
        int s = GetStyle(h);
        SetWindowLong(h, GWL_STYLE, s | WS_SYSMENU);
    }
}
'@

function Lock-Window([IntPtr]$hwnd) {
    if ($hwnd -ne [IntPtr]::Zero) { [WinLock]::Lock($hwnd) }
}
function Unlock-Window([IntPtr]$hwnd) {
    if ($hwnd -ne [IntPtr]::Zero) { [WinLock]::Unlock($hwnd) }
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Get-DevToolsWindowHandle([int]$procId, [IntPtr]$main) {
    # Prefer a window whose title mentions DevTools, then any other window.
    foreach ($w in @([WinApi3]::GetProcessWindows([uint32]$procId))) {
        if ($w -ne $main) {
            try {
                if ([WinApi3]::GetWindowTitle($w) -match 'DevTools') { return $w }
            } catch {}
        }
    }
    foreach ($w in @([WinApi3]::GetProcessWindows([uint32]$procId))) {
        if ($w -ne $main) {
            $rect = [WinApi3+RECT3]::new()
            [WinApi3]::GetWindowRect($w, [ref]$rect) | Out-Null
            if ($rect.Right -gt $rect.Left -and $rect.Bottom -gt $rect.Top) { return $w }
        }
    }
    return [IntPtr]::Zero
}

function Get-WindowElementByHwnd([IntPtr]$hwnd) {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $target = $hwnd.ToInt64()
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $proc.Id)
    $els = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
    foreach ($e in $els) {
        if ($e.Current.NativeWindowHandle -eq $target) { return $e }
    }
    foreach ($e in $els) {
        if ($e.Current.NativeWindowHandle -ne 0) { return $e }
    }
    return $null
}

function Click-DevToolsSeparateWindow([System.Windows.Automation.AutomationElement]$browserEl) {
    $meat = $null
    if ($browserEl) {
        $all = $browserEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($e in $all) {
            if ($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $e.Current.Name -match 'Customize') {
                $meat = $e; break
            }
        }
    }
    if ($meat) {
        try { $meat.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() } catch {
            try { $meat.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand() } catch {}
        }
        Start-Sleep -Milliseconds 700
    }
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $miCond = New-Object System.Windows.Automation.AndCondition(
        (New-Object System.Windows.Automation.OrCondition(
            (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Separate Window')),
            (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Undock into separate window'))
        )),
        (New-Object System.Windows.Automation.OrCondition(
            (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::MenuItem)),
            (New-Object System.Windows.Automation.OrCondition(
                (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::ListItem)),
                (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button))
            ))
        ))
    )
    $mi = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $miCond)
    if ($mi) {
        try { $mi.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() } catch {
            try { $mi.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() } catch {}
        }
        return $true
    }
    return $false
}

function Get-FocusedProcessId {
    $h = [WinApi2]::GetForegroundWindow()
    $procId = 0
    [WinApi2]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
    return $procId
}

function Maximize-Window([IntPtr]$hWnd) {
    [WinApi2]::ShowWindow($hWnd, 3) | Out-Null
    $r = New-Object RECT
    [WinApi2]::GetWindowRect($hWnd, [ref]$r) | Out-Null
    $sw = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    [WinApi2]::SetWindowPos($hWnd, [IntPtr]::Zero, $sw.Left, $sw.Top, $sw.Width, $sw.Height, 0x0040) | Out-Null
}

function Test-DevToolsOpen {
    param([int]$ProcId)
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $ProcId)
    $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
    if (-not $el) { return $false }
    $all = $el.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($e in $all) {
        $n = $e.Current.Name
        if ($n -eq 'Developer Tools' -or $n -match 'Console Panel|Inspector Panel' -or $n -eq 'Console' -or $n -eq 'Elements' -or $n -eq 'Inspector') { return $true }
    }
    return $false
}

function Invoke-Panel {
    param([string]$PanelName, [System.Windows.Automation.AutomationElement]$WindowEl)
    $cond = New-Object System.Windows.Automation.AndCondition(
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $PanelName)),
        (New-Object System.Windows.Automation.OrCondition(
            (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)),
            (New-Object System.Windows.Automation.OrCondition(
                (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::ListItem)),
                (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem))
            ))
        ))
    )
    $el = $WindowEl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if (-not $el) { return $false }
    try {
        $pattern = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $pattern.Invoke()
        return $true
    } catch {
        try {
            $sel = $el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
            $sel.Select()
            return $true
        } catch {}
    }
    return $false
}

function Invoke-ReloadButton([System.Windows.Automation.AutomationElement]$WindowEl) {
    $cond = New-Object System.Windows.Automation.AndCondition(
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Reload page')),
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button))
    )
    $el = $WindowEl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if (-not $el) { return $false }
    try {
        $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        return $true
    } catch {}
    return $false
}

$wsh = New-Object -ComObject WScript.Shell
$T.Invoke('start')
$proc = $null
for ($i = 0; $i -lt 20 -and -not $proc; $i++) {
    foreach ($n in $names) {
        $p = Get-Process $n -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
        if ($p) { $proc = $p; break }
    }
    Start-Sleep -Milliseconds 500
}

if (-not $proc) { $T.Invoke('no-proc'); exit }

# Cache the browser's main window handle NOW, before DevTools undocks and
# flips which window .MainWindowHandle reports.
$mainHwnd = $proc.MainWindowHandle

# Bring to front, maximize to full screen
$wsh.AppActivate($proc.Id) | Out-Null
Start-Sleep -Milliseconds 120
[WinApi2]::SetForegroundWindow($mainHwnd) | Out-Null
Start-Sleep -Milliseconds 120
Maximize-Window $mainHwnd
$T.Invoke('main-max')

# Open DevTools (F12) if not already open
function Invoke-OpenDevToolsButton {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $cond = New-Object System.Windows.Automation.AndCondition(
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Open DevTools')),
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button))
    )
    $btn = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if (-not $btn) { return $false }
    try {
        $btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        return $true
    } catch {}
    return $false
}
for ($i = 0; $i -lt 4; $i++) {
    if (Test-DevToolsOpen $proc.Id) { break }
    $wsh.AppActivate($proc.Id) | Out-Null
    if (Invoke-OpenDevToolsButton) { Start-Sleep -Milliseconds 400; continue }
    $wsh.SendKeys('{F12}')
    Start-Sleep -Milliseconds 400
}
$T.Invoke('f12-done')

# Undock DevTools (F12 console) into its own separate window
$rootWin = [System.Windows.Automation.AutomationElement]::RootElement
$condWin = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $proc.Id)
$winEl = $rootWin.FindFirst([System.Windows.Automation.TreeScope]::Children, $condWin)
$wsh.AppActivate($proc.Id) | Out-Null
Start-Sleep -Milliseconds 150
[WinApi2]::SetForegroundWindow($mainHwnd) | Out-Null
Start-Sleep -Milliseconds 150
$undocked = $false
if ($browserName -eq 'firefox') {
    $undocked = Click-DevToolsSeparateWindow $winEl
    if (-not $undocked) { $wsh.SendKeys('^+d') }
} else {
    # Chromium: DevTools command palette -> "undock" -> Enter
    # (the ⋮ menu is web-rendered and UIA Invoke is unreliable there)
    $wsh.SendKeys('^+p')
    Start-Sleep -Milliseconds 400
    $wsh.SendKeys('undock')
    Start-Sleep -Milliseconds 200
    $wsh.SendKeys('{ENTER}')
    $undocked = $true
}
Start-Sleep -Milliseconds 600
$T.Invoke('undocked')

# Find the DevTools window and maximize it to full screen
# The undock step leaves the real DevTools window focused, so prefer the
# foreground window of this process when it is not the main browser window.
$fgHwnd = [WinApi2]::GetForegroundWindow()
$fgPid = 0
[WinApi2]::GetWindowThreadProcessId($fgHwnd, [ref]$fgPid) | Out-Null
$devHwnd = [IntPtr]::Zero
if ($fgPid -eq $proc.Id -and $fgHwnd -ne $mainHwnd) { $devHwnd = $fgHwnd }
if ($devHwnd -eq [IntPtr]::Zero) { $devHwnd = Get-DevToolsWindowHandle $proc.Id $mainHwnd }
$devEl = $null
if ($devHwnd -ne [IntPtr]::Zero) {
    $wsh.AppActivate($proc.Id) | Out-Null
    Start-Sleep -Milliseconds 150
    [WinApi2]::SetForegroundWindow($devHwnd) | Out-Null
    Start-Sleep -Milliseconds 150
    Maximize-Window $devHwnd
    $devEl = Get-WindowElementByHwnd $devHwnd
} else {
    $devEl = $winEl
    Maximize-Window $mainHwnd
}
Start-Sleep -Milliseconds 600
$T.Invoke('maximized')
# Keep the browser stuck: no close button (X) and Alt+F4 will not work.
Lock-Window $mainHwnd
if ($devHwnd -ne [IntPtr]::Zero) { Lock-Window $devHwnd } else { Lock-Window $winEl.Current.NativeWindowHandle }

# Open the Network panel and keep it (no panel cycling).
$wsh.AppActivate($proc.Id) | Out-Null
Start-Sleep -Milliseconds 150
$target = if ($devHwnd -ne [IntPtr]::Zero) { $devHwnd } else { $mainHwnd }
[WinApi2]::SetForegroundWindow($target) | Out-Null
[WinApi2]::ShowWindow($target, 3) | Out-Null
Start-Sleep -Milliseconds 120
$networkShown = $false
if ($devEl) {
    $networkShown = Invoke-Panel 'Network' $devEl
}
if (-not $networkShown) {
    $wsh.AppActivate($proc.Id) | Out-Null
    [WinApi2]::SetForegroundWindow($target) | Out-Null
    [WinApi2]::ShowWindow($target, 3) | Out-Null
    if (($browserName -eq 'firefox')) { $wsh.SendKeys('^+e') } else { $wsh.SendKeys('^+p') }
    Start-Sleep -Milliseconds 200
    if (($browserName -ne 'firefox')) { $wsh.SendKeys('network{ENTER}') }
}
$T.Invoke('network-done')

# Reload the page automatically so the Network tab captures requests.
# Reload the page only if the request row is missing.
function Invoke-ReloadPage {
    $isFirefox = ($browserName -eq 'firefox')
    if (-not $isFirefox -and $devEl) {
        if (Invoke-ReloadButton $devEl) { return }
    }
    $wsh.AppActivate($proc.Id) | Out-Null
    [WinApi2]::SetForegroundWindow($target) | Out-Null
    [WinApi2]::ShowWindow($target, 3) | Out-Null
    $wsh.SendKeys('{F5}')
}

# Click the request row and open its Headers tab.
function Invoke-MouseClick([System.Windows.Automation.AutomationElement]$el) {
    $r = $el.Current.BoundingRectangle
    if ($r.Width -le 0 -or $r.Height -le 0) { return $false }
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RowClick {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    public static void Click(int x, int y) {
        SetCursorPos(x, y);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
        mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
    }
}
'@ -ErrorAction SilentlyContinue
    [RowClick]::Click([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2))
    return $true
}

function Select-NetworkRow([string]$RowName, [string]$RowName2, [System.Windows.Automation.AutomationElement]$WindowEl) {
    foreach ($name in @($RowName, $RowName2)) {
        $cond = New-Object System.Windows.Automation.AndCondition(
            (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::DataItem)),
            (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name))
        )
        $row = $WindowEl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
        if ($row) {
            try {
                $row.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
                return $true
            } catch {
                try {
                    $row.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
                    return $true
                } catch {
                    if (Invoke-MouseClick $row) { return $true }
                }
            }
        }
    }
    return $false
}

function Select-HeadersTab([System.Windows.Automation.AutomationElement]$WindowEl) {
    $cond = New-Object System.Windows.Automation.AndCondition(
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Headers')),
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem))
    )
    $tab = $WindowEl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if (-not $tab) { return $false }
    try {
        $tab.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        return $true
    } catch {
        try {
            $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
            return $true
        } catch {}
    }
    return $false
}

function Collapse-ResponseHeaders([System.Windows.Automation.AutomationElement]$WindowEl) {
    # Collapse the "Response Headers" section so only Request Headers stays visible.
    $cond = New-Object System.Windows.Automation.AndCondition(
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)),
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Response Headers', [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase))
    )
    $btn = $WindowEl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if (-not $btn) {
        # Chrome names it "Response headers", Firefox "Response Headers (NNN B)".
        foreach ($e in $WindowEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
            if ($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $e.Current.Name -match '^Response headers?') { $btn = $e; break }
        }
    }
    if (-not $btn) { return $false }
    try {
        $btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        return $true
    } catch { return $false }
}

$rowClicked = $false
$rowName = if ($browserName -eq 'firefox') { '/' + $rowTail } else { $rowTail }
if ($devEl) {
    $rowClicked = Select-NetworkRow $rowName $rowTail $devEl
}
if (-not $rowClicked) {
    $rowClicked = Select-NetworkRow $rowName $rowTail $winEl
}
if (-not $rowClicked) {
    # Row not there yet: reload once and retry.
    Invoke-ReloadPage
    Start-Sleep -Milliseconds 700
    if ($devEl) {
        $rowClicked = Select-NetworkRow $rowName $rowTail $devEl
    }
    if (-not $rowClicked) {
        $rowClicked = Select-NetworkRow $rowName $rowTail $winEl
    }
}
$T.Invoke('rows-done')
if ($rowClicked) {
    Start-Sleep -Milliseconds 250
    if ($devEl) {
        Select-HeadersTab $devEl | Out-Null
        Start-Sleep -Milliseconds 200
        Collapse-ResponseHeaders $devEl | Out-Null
    }
}
$T.Invoke('headers-done')

# Maximize the DevTools window to full screen
$wsh.AppActivate($proc.Id) | Out-Null
Start-Sleep -Milliseconds 120
[WinApi2]::SetForegroundWindow($target) | Out-Null
Maximize-Window $target
$T.Invoke('done')

# --- Scroll-loop: make sure the "Request Headers" content is actually visible
# --- before taking the screenshot. On small screens scroll down/up until the
# --- Request Headers section sits near the top of the viewport; if it is
# --- already visible (or there is no scrollbar) it just takes the screenshot.
$reqEl = $null
if ($devEl) {
    foreach ($e in $devEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
        if ($e.Current.Name -match '^Request headers?') { $reqEl = $e; break }
    }
}
if (-not $reqEl) {
    foreach ($e in $winEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
        if ($e.Current.Name -match '^Request headers?') { $reqEl = $e; break }
    }
}
if ($reqEl) {
    $scr = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    for ($i = 0; $i -lt 20; $i++) {
        try { $r = $reqEl.Current.BoundingRectangle } catch { break }
        $top = [int]$r.Top
        $bottom = [int]$r.Bottom
        if ($top -ge $scr.Top -and $top -le 160 -and $bottom -le $scr.Bottom) { break }
        if ($top -lt $scr.Top) {
            [System.Windows.Forms.SendKeys]::SendWait('{PGUP}')
        } else {
            [System.Windows.Forms.SendKeys]::SendWait('{PGDN}')
        }
        Start-Sleep -Milliseconds 300
        # re-find the element (references go stale after scrolling)
        $reqEl = $null
        if ($devEl) {
            foreach ($e in $devEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
                if ($e.Current.Name -match '^Request headers?') { $reqEl = $e; break }
            }
        }
        if (-not $reqEl) { break }
    }
    $T.Invoke('request-headers-visible')
} else {
    $T.Invoke('request-headers-notfound')
}

# --- Automatically find "Response headers (...)", click it, then press END ---

$wsh.AppActivate($proc.Id) | Out-Null
[WinApi2]::SetForegroundWindow($target) | Out-Null
Start-Sleep -Milliseconds 500

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

# Get the DevTools window
$root = [System.Windows.Automation.AutomationElement]::FromHandle($target)

$found = $null

# Search EVERYTHING under the DevTools window.
$elements = $root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
)

foreach ($element in $elements) {
    try {
        $name = $element.Current.Name

        if ([string]::IsNullOrWhiteSpace($name)) {
            continue
        }

        # Match:
        # Response headers (15,18)
        # Response headers (20,7)
        # Response headers (...)
        #
        # The numbers are deliberately ignored.
        if ($name -match 'Response\s*headers\s*\(') {
            $found = $element
            Write-Host "Found: [$name]"
            break
        }
    }
    catch {
        # Ignore inaccessible UI elements
    }
}

if ($found) {

    # Try to bring the element into view first
    try {
        $scrollItem = $found.GetCurrentPattern(
            [System.Windows.Automation.ScrollItemPattern]::Pattern
        )

        $scrollItem.ScrollIntoView()
        Start-Sleep -Milliseconds 300
    }
    catch {
        # ScrollItemPattern may not be available
    }

    $clicked = $false

    # First try UI Automation InvokePattern
    try {
        $invoke = $found.GetCurrentPattern(
            [System.Windows.Automation.InvokePattern]::Pattern
        )

        $invoke.Invoke()
        Write-Host "Activated Response headers using InvokePattern."
        $clicked = $true
    }
    catch {
        # Not an invokable control
    }

    # If InvokePattern isn't available, click its actual bounding rectangle
    if (-not $clicked) {
        try {
            $rect = $found.Current.BoundingRectangle

            if ($rect.Width -gt 0 -and $rect.Height -gt 0) {

                $clickX = [int]($rect.X + ($rect.Width / 2))
                $clickY = [int]($rect.Y + ($rect.Height / 2))

                Write-Host "Clicking Response headers at X=$clickX Y=$clickY"

                [System.Windows.Forms.Cursor]::Position =
                    New-Object System.Drawing.Point($clickX, $clickY)

                Start-Sleep -Milliseconds 150

                # Native mouse click
                Add-Type @"
using System;
using System.Runtime.InteropServices;

public class AutoMouseClick {
    [DllImport("user32.dll")]
    public static extern void mouse_event(
        uint dwFlags,
        uint dx,
        uint dy,
        uint dwData,
        UIntPtr dwExtraInfo
    );

    public const uint LEFTDOWN = 0x0002;
    public const uint LEFTUP   = 0x0004;

    public static void Click() {
        mouse_event(LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        mouse_event(LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }
}
"@

                [AutoMouseClick]::Click()
                $clicked = $true
            }
        }
        catch {
            Write-Host "Could not click the detected element."
        }
    }

    if ($clicked) {
        Start-Sleep -Milliseconds 500

        # Response headers now has focus, so END should scroll it
        [System.Windows.Forms.SendKeys]::SendWait('{END}')

        Start-Sleep -Milliseconds 500

        # Extra fallback
        for ($s = 0; $s -lt 5; $s++) {
            [System.Windows.Forms.SendKeys]::SendWait('{PGDN}')
            Start-Sleep -Milliseconds 100
        }

        Start-Sleep -Milliseconds 400

        Write-Host "Response headers clicked and END sent."
    }
    else {
        Write-Host "Response headers was found, but could not be activated."
    }

}
else {
    Write-Host "Response headers was NOT found in the UI Automation tree."
}

# --------------------------------------------------------------


# Capture the full screen right here (same PS process, no cold start later).
if ($shotPath) {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
    Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $bmp.Save($shotPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

# Signal completion so the caller knows it is done.
# (closeBrowser force-kills the browser, so no explicit unlock needed here)
Set-Content -LiteralPath '${doneFile.replace(/'/g, "''")}' -Value 'done' -Encoding ASCII
`;
}

function openBrowserWithConsole(forceName, site, shotPath) {
  let name = null;
  let exe = null;

  if (IS_WIN) {
    name = forceName || getDefaultBrowserName();
    exe = name ? getBrowserExe(name) : null;
  } else if (IS_MAC) {
    name = forceName || getDefaultBrowserNameMac();
    exe = name ? getBrowserExeMac(name) : null;
  } else {
    name = forceName || getDefaultBrowserNameLinux();
    exe = name ? getBrowserExeLinux(name) : null;
  }

  launchBrowser(name, exe, site);

  // After the browser loads, run the same console flow on every OS.
  setTimeout(() => {
    if (IS_WIN) {
      const script = browserShowScriptFor(name, site.rowTail, shotPath);
      // The script is too large for -EncodedCommand, so write it to a temp
      // .ps1 file and run it with -File (avoids ENAMETOOLONG).
      const ps1 = path.join(os.tmpdir(), `cookies_show_${Date.now()}.ps1`);
      fs.writeFileSync(ps1, '\ufeff' + script, 'utf8');
      const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { windowsHide: true });
      child.on('error', () => {});
      child.unref();
      setTimeout(() => { try { fs.unlinkSync(ps1); } catch {} }, 120000);
    } else if (IS_MAC) {
      runMacShowScript(name);
    } else {
      runLinuxShowScript(name);
    }
  }, 600);

  return name;
}

// ============================ Main ============================
function parseBrowserFlag() {
  // Support `node record.js --chrome`, `--firefox`, `--brave`, `--edge`, `--opera`.
  const known = {
    '--chrome': 'chrome',
    '--google-chrome': 'chrome',
    '--firefox': 'firefox',
    '--ff': 'firefox',
    '--brave': 'brave',
    '--edge': 'msedge',
    '--msedge': 'msedge',
    '--opera': 'opera',
  };
  for (const arg of process.argv.slice(2)) {
    if (known[arg]) return known[arg];
  }
  return null;
}

async function main() {
  const forceName = parseBrowserFlag();

  const SITE_ORDER = [SITES.instagram, SITES.facebook];
  const results = [];
  for (const site of SITE_ORDER) {
    if (fs.existsSync(doneFile)) fs.unlinkSync(doneFile);

    const username = getSiteUsername(site);
    const outPath = path.join(screenshots, `${username}_insta.png`);
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

    const browserName = openBrowserWithConsole(forceName, site, outPath);

    // Wait until the automation has captured and saved the screenshot itself.
    let waited = 0;
    while (!fs.existsSync(outPath) && waited < 90) {
      await new Promise((r) => setTimeout(r, 300));
      waited += 0.3;
    }
    if (fs.existsSync(doneFile)) fs.unlinkSync(doneFile);

    results.push({ username, outPath, ok: fs.existsSync(outPath) });

    // Close the browser so the next site starts in a fresh browser.
    if (IS_WIN) { await closeBrowser(browserName); } else { closeBrowser(browserName); }
  }

  const saved = results.filter((r) => r.ok);
  // Silent mode: used when driven by companion.js / the deployed website so no
  // message box or Explorer popup blocks automation.
  const silent = process.env.COOKIES_SILENT === '1';
  if (saved.length > 0) {
    if (!silent) {
      await showMessage(`Screenshot${saved.length > 1 ? 's saved' : ' saved'}:\n${saved.map((r) => r.outPath).join('\n')}`, 'Instagram/Facebook Screenshot');
      openCaptures();
    }
  } else if (!silent) {
    await showMessage('Screenshots could not be captured.', 'Instagram/Facebook Screenshot');
  }
}

main();