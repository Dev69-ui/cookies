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

const scriptDir = __dirname;

const screenshots = path.join(
    os.homedir(),
    'Pictures',
    'Screenshots'
);

const doneFile = path.join(
    os.tmpdir(),
    'cookies_done.flag'
);

const logFile = path.join(
    os.tmpdir(),
    'cookies_time.log'
);

fs.mkdirSync(screenshots, { recursive: true });

// ============================================================
// BASIC HELPERS
// ============================================================

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

function showMessage(text, title) {
    if (IS_WIN) {
        const script =
            `Add-Type -AssemblyName System.Windows.Forms; ` +
            `[System.Windows.Forms.MessageBox]::Show(` +
            `'${String(text).replace(/'/g, "''")}', ` +
            `'${String(title).replace(/'/g, "''")}', ` +
            `'OK', 'Information') | Out-Null`;

        return runPS(script, false);
    }

    if (IS_MAC) {
        const safe = String(text)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');

        runDetached(
            'osascript',
            [
                '-e',
                `display dialog "${safe}" with title "${String(title)
                    .replace(/"/g, '\\"')}" buttons {"OK"} default button "OK"`
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
            `Start-Process '${screenshots
                .replace(/'/g, "''")}'`
        );
    } else if (IS_MAC) {
        runDetached('open', [screenshots]);
    } else {
        runDetached('xdg-open', [screenshots]);
    }
}

// ============================================================
// WINDOWS BROWSER DETECTION
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
                stdio: [
                    'ignore',
                    'pipe',
                    'ignore'
                ]
            }
        );

        const m = out.match(/REG_SZ\s+(.*)/);

        return m ? m[1].trim() : null;

    } catch {
        return null;
    }
}

function getDefaultBrowserName() {
    const progId = regQuery(
        'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice',
        'ProgId'
    );

    if (progId) {
        if (progId.startsWith('Firefox')) return 'firefox';
        if (progId.startsWith('ChromeHTML')) return 'chrome';
        if (progId.startsWith('MSEdgeHTM')) return 'msedge';
        if (progId.startsWith('Brave')) return 'brave';
        if (progId.startsWith('Opera')) return 'opera';
    }

    const names = {
        chrome: 'chrome.exe',
        msedge: 'msedge.exe',
        firefox: 'firefox.exe',
        brave: 'brave.exe',
        opera: 'opera.exe'
    };

    for (const [name, exe] of Object.entries(names)) {
        if (exeExists(name, exe)) {
            return name;
        }
    }

    return null;
}

function exeExists(name, exeName) {
    const keys = [
        `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
        `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
        `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`
    ];

    for (const key of keys) {
        if (regQuery(key, '')) {
            return true;
        }
    }

    try {
        const cmd = execFileSync(
            'where.exe',
            [exeName],
            {
                encoding: 'utf8'
            }
        );

        const first = cmd.split(/\r?\n/)[0];

        if (first && fs.existsSync(first)) {
            return true;
        }

    } catch {}

    return false;
}

function getBrowserExe(name) {
    const exeName = `${name}.exe`;

    const keys = [
        `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
        `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
        `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`
    ];

    for (const key of keys) {
        const p = regQuery(key, '');

        if (p && fs.existsSync(p)) {
            return p;
        }
    }

    try {
        const cmd = execFileSync(
            'where.exe',
            [exeName],
            {
                encoding: 'utf8'
            }
        );

        const first = cmd.split(/\r?\n/)[0];

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
        'chromium-browser',
        'chromium-stable'
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
    for (const b of names) {
        try {
            const p = execFileSync(
                'which',
                [b],
                {
                    encoding: 'utf8',
                    stdio: [
                        'ignore',
                        'pipe',
                        'ignore'
                    ]
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
                encoding: 'utf8'
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
    return findBin(
        LINUX_BIN[name] || []
    );
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
    for (const name of [
        'chrome',
        'firefox',
        'msedge',
        'brave',
        'opera'
    ]) {
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

function getDevToolsFlag(name) {
    return name === 'firefox'
        ? '-devtools'
        : '--auto-open-devtools-for-tabs';
}

function launchBrowser(name, exe, site) {
    const url = site.url;
    const flagArg = getDevToolsFlag(name);

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
                    flagArg,
                    ...extra,
                    url
                ]
            );
        } else {
            runPSHiddenDetached(
                `Start-Process '${url.replace(/'/g, "''")}'`
            );
        }

    } else if (IS_MAC) {

        if (exe) {
            runDetached(
                'open',
                [
                    '-a',
                    exe,
                    '--args',
                    flagArg,
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

    } else {

        if (exe) {
            runDetached(
                exe,
                [
                    flagArg,
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
}

// ============================================================
// SCREENSHOT
// ============================================================

function takeScreenshot(outPath) {

    if (IS_WIN) {

        const script =
            `Add-Type -AssemblyName System.Windows.Forms; ` +
            `Add-Type -AssemblyName System.Drawing; ` +
            `$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ` +
            `$bmp = New-Object System.Drawing.Bitmap($b.Width,$b.Height); ` +
            `$g = [System.Drawing.Graphics]::FromImage($bmp); ` +
            `$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); ` +
            `$bmp.Save('${outPath.replace(/'/g, "''")}',[System.Drawing.Imaging.ImageFormat]::Png); ` +
            `$g.Dispose(); ` +
            `$bmp.Dispose()`;

        return runPS(script)
            .then(() => fs.existsSync(outPath));
    }

    if (fs.existsSync('/usr/bin/screencapture')) {
        runDetached(
            '/usr/bin/screencapture',
            ['-x', outPath]
        );

        return Promise.resolve(true);
    }

    if (fs.existsSync('/usr/bin/scrot')) {
        runDetached(
            '/usr/bin/scrot',
            ['-z', outPath]
        );

        return Promise.resolve(true);
    }

    if (fs.existsSync('/usr/bin/gnome-screenshot')) {
        runDetached(
            '/usr/bin/gnome-screenshot',
            ['-f', outPath]
        );

        return Promise.resolve(true);
    }

    return Promise.resolve(false);
}

// ============================================================
// CLOSE BROWSER
// ============================================================

function closeBrowser(name) {

    if (IS_WIN) {

        const exeName = `${name}.exe`;

        const ps =
            `Get-Process '${exeName}','${name}' ` +
            `-ErrorAction SilentlyContinue | ` +
            `Stop-Process -Force ` +
            `-ErrorAction SilentlyContinue; ` +

            `for ($i=0; $i -lt 30; $i++) { ` +
            `  $left = Get-Process '${exeName}','${name}' ` +
            `  -ErrorAction SilentlyContinue; ` +
            `  if (-not $left) { break }; ` +
            `  $left | Stop-Process -Force ` +
            `  -ErrorAction SilentlyContinue; ` +
            `  Start-Sleep -Milliseconds 100 ` +
            `}; ` +

            `Get-Process '${exeName}','${name}' ` +
            `-ErrorAction SilentlyContinue | ` +
            `Stop-Process -Force ` +
            `-ErrorAction SilentlyContinue`;

        return Promise.race([
            runPS(ps),
            new Promise(resolve =>
                setTimeout(
                    () => resolve({
                        code: -1,
                        out: 'close-timeout'
                    }),
                    5000
                )
            )
        ]);

    }

    if (IS_MAC) {
        runDetached(
            'pkill',
            [
                '-f',
                MAC_PROCESS[name] || name
            ]
        );

        return Promise.resolve();
    }

    runDetached(
        'pkill',
        [
            '-f',
            LINUX_WINDOW_CLASS[name] || name
        ]
    );

    return Promise.resolve();
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

$names = @(
    'chrome',
    'msedge',
    'firefox',
    'brave',
    'opera'
)

if ($browserName) {
    $names = @($browserName)
}

# ============================================================
# LOGGING
# ============================================================

$logFile = "$env:TEMP\\\\cookies_time.log"

function Log-Step {
    param([string]$label)

    try {
        Add-Content `
            -LiteralPath $logFile `
            -Value (
                (Get-Date -Format 'HH:mm:ss.fff') +
                ' ' +
                $label
            )
    } catch {}
}

# ============================================================
# WINDOWS API
# ============================================================

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class WinApiMain {

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(
        IntPtr hWnd
    );

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(
        IntPtr hWnd,
        int nCmdShow
    );

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
        out uint lpdwProcessId
    );

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(
        IntPtr hWnd
    );
}

public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
}
'@

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public static class WinApiEnum {

    public delegate bool EnumWindowsProc(
        IntPtr hWnd,
        IntPtr lParam
    );

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(
        EnumWindowsProc callback,
        IntPtr lParam
    );

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(
        IntPtr hWnd,
        out uint processId
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
        StringBuilder text,
        int max
    );

    [DllImport("user32.dll")]
    public static extern bool PostMessage(
        IntPtr hWnd,
        uint msg,
        IntPtr wParam,
        IntPtr lParam
    );

    private static List<IntPtr> _windows;
    private static uint _pid;

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
            pid == _pid &&
            IsWindowVisible(hWnd)
        ) {
            _windows.Add(hWnd);
        }

        return true;
    }

    public static List<IntPtr> GetProcessWindows(
        uint pid
    ) {

        _windows = new List<IntPtr>();
        _pid = pid;

        EnumWindows(
            new EnumWindowsProc(Callback),
            IntPtr.Zero
        );

        return _windows;
    }

    public static string GetTitle(
        IntPtr hWnd
    ) {

        int len = GetWindowTextLength(hWnd);

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
'@

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class MouseClicker {

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(
        int X,
        int Y
    );

    [DllImport("user32.dll")]
    public static extern void mouse_event(
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
# WINDOW LOCKING
# ============================================================

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class WinLock {

    [DllImport("user32.dll")]
    public static extern int GetWindowLong(
        IntPtr hWnd,
        int nIndex
    );

    [DllImport("user32.dll")]
    public static extern int SetWindowLong(
        IntPtr hWnd,
        int nIndex,
        int value
    );

    public const int GWL_STYLE = -16;
    public const int WS_SYSMENU = 0x00080000;

    public static void Lock(
        IntPtr hWnd
    ) {

        if (hWnd == IntPtr.Zero) {
            return;
        }

        int style =
            GetWindowLong(
                hWnd,
                GWL_STYLE
            );

        SetWindowLong(
            hWnd,
            GWL_STYLE,
            style & ~WS_SYSMENU
        );
    }
}
'@

# ============================================================
# HELPERS
# ============================================================

function Get-WindowElementByHwnd {
    param(
        [IntPtr]$hwnd
    )

    if ($hwnd -eq [IntPtr]::Zero) {
        return $null
    }

    $root =
        [System.Windows.Automation.AutomationElement]::RootElement

    $target =
        $hwnd.ToInt64()

    $all =
        $root.FindAll(
            [System.Windows.Automation.TreeScope]::Children,
            [System.Windows.Automation.Condition]::TrueCondition
        )

    foreach ($e in $all) {

        try {

            if (
                $e.Current.NativeWindowHandle -eq
                $target
            ) {
                return $e
            }

        } catch {}
    }

    return $null
}

function Maximize-Window {
    param(
        [IntPtr]$hWnd
    )

    if ($hWnd -eq [IntPtr]::Zero) {
        return
    }

    [WinApiMain]::ShowWindow(
        $hWnd,
        3
    ) | Out-Null

    $screen =
        [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

    [WinApiMain]::SetWindowPos(
        $hWnd,
        [IntPtr]::Zero,
        $screen.Left,
        $screen.Top,
        $screen.Width,
        $screen.Height,
        0x0040
    ) | Out-Null
}

function Invoke-MouseClick {
    param(
        [System.Windows.Automation.AutomationElement]$Element
    )

    if (-not $Element) {
        return $false
    }

    try {

        $r =
            $Element.Current.BoundingRectangle

        if (
            $r.Width -le 0 -or
            $r.Height -le 0
        ) {
            return $false
        }

        [MouseClicker]::Click(
            [int]($r.X + $r.Width / 2),
            [int]($r.Y + $r.Height / 2)
        )

        return $true

    } catch {

        return $false
    }
}

function Invoke-Element {
    param(
        [System.Windows.Automation.AutomationElement]$Element
    )

    if (-not $Element) {
        return $false
    }

    try {

        $Element.GetCurrentPattern(
            [System.Windows.Automation.InvokePattern]::Pattern
        ).Invoke()

        return $true

    } catch {

        try {

            $Element.GetCurrentPattern(
                [System.Windows.Automation.SelectionItemPattern]::Pattern
            ).Select()

            return $true

        } catch {

            return Invoke-MouseClick $Element
        }
    }
}

# ============================================================
# FIND DEVTOOLS WINDOW
# ============================================================

function Get-DevToolsWindowHandle {

    param(
        [int]$procId,
        [IntPtr]$mainHwnd
    )

    $windows =
        [WinApiEnum]::GetProcessWindows(
            [uint32]$procId
        )

    foreach ($w in $windows) {

        if ($w -eq $mainHwnd) {
            continue
        }

        try {

            $title =
                [WinApiEnum]::GetTitle($w)

            if (
                $title -match 'DevTools' -or
                $title -match 'Developer Tools'
            ) {
                return $w
            }

        } catch {}
    }

    foreach ($w in $windows) {

        if ($w -eq $mainHwnd) {
            continue
        }

        return $w
    }

    return [IntPtr]::Zero
}

# ============================================================
# DISMISS ACCIDENTAL PDF / PRINT DIALOG
#
# This is only a safety net.
# The new script does NOT use Ctrl+Shift+P.
# ============================================================

function Dismiss-PrintDialog {

    try {

        $windows =
            [WinApiEnum]::GetProcessWindows(
                [uint32]$proc.Id
            )

        foreach ($w in $windows) {

            try {

                $title =
                    [WinApiEnum]::GetTitle($w)

                if (
                    $title -match '(?i)network\\.pdf' -or
                    $title -match '(?i)Save Print Output As' -or
                    $title -match '(?i)Print'
                ) {

                    Log-Step "possible-print-dialog=$title"

                    [WinApiEnum]::PostMessage(
                        $w,
                        0x0010,
                        [IntPtr]::Zero,
                        [IntPtr]::Zero
                    ) | Out-Null
                }

            } catch {}
        }

    } catch {}
}

# ============================================================
# TEST DEVTOOLS
# ============================================================

function Test-DevToolsOpen {

    param(
        [int]$ProcId
    )

    try {

        $root =
            [System.Windows.Automation.AutomationElement]::RootElement

        $cond =
            New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
                $ProcId
            )

        $els =
            $root.FindAll(
                [System.Windows.Automation.TreeScope]::Children,
                $cond
            )

        foreach ($el in $els) {

            $all =
                $el.FindAll(
                    [System.Windows.Automation.TreeScope]::Descendants,
                    [System.Windows.Automation.Condition]::TrueCondition
                )

            foreach ($e in $all) {

                try {

                    $n = $e.Current.Name

                    if (
                        $n -eq 'Network' -or
                        $n -eq 'Elements' -or
                        $n -eq 'Console' -or
                        $n -eq 'Sources' -or
                        $n -eq 'Application'
                    ) {
                        return $true
                    }

                } catch {}
            }
        }

    } catch {}

    return $false
}

# ============================================================
# OPEN DEVTOOLS
# ============================================================

function Invoke-OpenDevToolsButton {

    $root =
        [System.Windows.Automation.AutomationElement]::RootElement

    $all =
        $root.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )

    foreach ($e in $all) {

        try {

            if (
                $e.Current.ControlType -eq
                [System.Windows.Automation.ControlType]::Button
            ) {

                if (
                    $e.Current.Name -match
                    '(?i)Open DevTools'
                ) {

                    return Invoke-Element $e
                }
            }

        } catch {}
    }

    return $false
}

# ============================================================
# UNDOCK DEVTOOLS
#
# IMPORTANT:
# There is NO Ctrl+Shift+P fallback here.
# ============================================================

function Try-UndockDevTools {

    param(
        [System.Windows.Automation.AutomationElement]$WindowElement
    )

    if (-not $WindowElement) {
        return $false
    }

    try {

        $all =
            $WindowElement.FindAll(
                [System.Windows.Automation.TreeScope]::Descendants,
                [System.Windows.Automation.Condition]::TrueCondition
            )

        # Find the DevTools three-dot menu.
        foreach ($e in $all) {

            try {

                if (
                    $e.Current.ControlType -eq
                    [System.Windows.Automation.ControlType]::Button
                ) {

                    $name = $e.Current.Name

                    if (
                        $name -match
                        '(?i)Customize and control DevTools'
                    ) {

                        Log-Step 'devtools-menu'

                        if (
                            Invoke-Element $e
                        ) {

                            Start-Sleep -Milliseconds 500

                            $root =
                                [System.Windows.Automation.AutomationElement]::RootElement

                            $menuNames = @(
                                'Undock into separate window',
                                'Separate window',
                                'Undock'
                            )

                            foreach ($menuName in $menuNames) {

                                $cond =
                                    New-Object System.Windows.Automation.PropertyCondition(
                                        [System.Windows.Automation.AutomationElement]::NameProperty,
                                        $menuName,
                                        [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase
                                    )

                                $menuItem =
                                    $root.FindFirst(
                                        [System.Windows.Automation.TreeScope]::Descendants,
                                        $cond
                                    )

                                if ($menuItem) {

                                    Log-Step "undock-menu=$menuName"

                                    if (
                                        Invoke-Element $menuItem
                                    ) {
                                        Start-Sleep -Milliseconds 800
                                        return $true
                                    }
                                }
                            }
                        }

                        break
                    }
                }

            } catch {}
        }

    } catch {}

    return $false
}

# ============================================================
# FIND PANEL
# ============================================================

function Invoke-Panel {

    param(
        [string]$PanelName,
        [System.Windows.Automation.AutomationElement]$WindowEl
    )

    if (-not $WindowEl) {
        return $false
    }

    $types = @(
        [System.Windows.Automation.ControlType]::TabItem,
        [System.Windows.Automation.ControlType]::Button,
        [System.Windows.Automation.ControlType]::ListItem
    )

    foreach ($type in $types) {

        try {

            $cond =
                New-Object System.Windows.Automation.AndCondition(

                    (
                        New-Object System.Windows.Automation.PropertyCondition(
                            [System.Windows.Automation.AutomationElement]::NameProperty,
                            $PanelName,
                            [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase
                        )
                    ),

                    (
                        New-Object System.Windows.Automation.PropertyCondition(
                            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                            $type
                        )
                    )
                )

            $el =
                $WindowEl.FindFirst(
                    [System.Windows.Automation.TreeScope]::Descendants,
                    $cond
                )

            if ($el) {

                if (Invoke-Element $el) {
                    return $true
                }
            }

        } catch {}
    }

    return $false
}

# ============================================================
# RELOAD
# ============================================================

function Invoke-ReloadPage {

    Log-Step 'reload'

    try {

        $wsh.AppActivate(
            $proc.Id
        ) | Out-Null

        Start-Sleep -Milliseconds 100

        [WinApiMain]::SetForegroundWindow(
            $target
        ) | Out-Null

        Start-Sleep -Milliseconds 100

        # F5 is safe here.
        [System.Windows.Forms.SendKeys]::SendWait(
            '{F5}'
        )

    } catch {}
}

# ============================================================
# FIND REQUEST ROW
# ============================================================

function Select-NetworkRow {

    param(
        [string]$RowName,
        [string]$RowName2,
        [System.Windows.Automation.AutomationElement]$WindowEl
    )

    if (-not $WindowEl) {
        return $false
    }

    foreach ($name in @(
        $RowName,
        $RowName2
    )) {

        if (-not $name) {
            continue
        }

        try {

            $cond =
                New-Object System.Windows.Automation.AndCondition(

                    (
                        New-Object System.Windows.Automation.PropertyCondition(
                            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                            [System.Windows.Automation.ControlType]::DataItem
                        )
                    ),

                    (
                        New-Object System.Windows.Automation.PropertyCondition(
                            [System.Windows.Automation.AutomationElement]::NameProperty,
                            $name,
                            [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase
                        )
                    )
                )

            $row =
                $WindowEl.FindFirst(
                    [System.Windows.Automation.TreeScope]::Descendants,
                    $cond
                )

            if ($row) {

                Log-Step "request-found=$name"

                if (Invoke-Element $row) {
                    return $true
                }
            }

        } catch {}
    }

    return $false
}

# ============================================================
# REFRESH UI AUTOMATION TREE
# ============================================================

function Refresh-DevToolsElement {

    if ($devHwnd -ne [IntPtr]::Zero) {

        try {

            $fresh =
                Get-WindowElementByHwnd $devHwnd

            if ($fresh) {
                return $fresh
            }

        } catch {}
    }

    return $devEl
}

# ============================================================
# HEADERS TAB
# ============================================================

function Select-HeadersTab {

    param(
        [System.Windows.Automation.AutomationElement]$WindowEl
    )

    if (-not $WindowEl) {
        return $false
    }

    $all =
        $WindowEl.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )

    foreach ($e in $all) {

        try {

            if (
                $e.Current.Name -ieq 'Headers'
            ) {

                Log-Step 'headers-element-found'

                if (
                    Invoke-Element $e
                ) {
                    return $true
                }
            }

        } catch {}
    }

    return $false
}

# ============================================================
# REQUEST HEADERS
# ============================================================

function Find-RequestHeaders {

    param(
        [System.Windows.Automation.AutomationElement]$WindowEl
    )

    if (-not $WindowEl) {
        return $null
    }

    try {

        $all =
            $WindowEl.FindAll(
                [System.Windows.Automation.TreeScope]::Descendants,
                [System.Windows.Automation.Condition]::TrueCondition
            )

        foreach ($e in $all) {

            try {

                $name =
                    [string]$e.Current.Name

                if (
                    $name -match
                    '^(?i)Request headers?(?:\\s*\\(.*\\))?$'
                ) {
                    return $e
                }

            } catch {}
        }

    } catch {}

    return $null
}

function Expand-RequestHeaders {

    param(
        [System.Windows.Automation.AutomationElement]$WindowEl
    )

    $req =
        Find-RequestHeaders $WindowEl

    if (-not $req) {
        return $false
    }

    Log-Step 'request-headers-found'

    try {

        $pattern =
            $req.GetCurrentPattern(
                [System.Windows.Automation.ExpandCollapsePattern]::Pattern
            )

        $state =
            $pattern.Current.ExpandCollapseState

        if (
            $state -eq
            [System.Windows.Automation.ExpandCollapseState]::Collapsed
        ) {

            Log-Step 'request-headers-collapsed'

            $pattern.Expand()

            Start-Sleep -Milliseconds 500

            return $true
        }

        Log-Step 'request-headers-already-expanded'

        return $true

    } catch {}

    # Some Chromium versions expose the header as
    # a normal clickable element instead.
    try {

        if (Invoke-Element $req) {

            Start-Sleep -Milliseconds 500

            return $true
        }

    } catch {}

    return $false
}

# ============================================================
# SCROLL REQUEST HEADERS INTO VIEW
# ============================================================

function Scroll-RequestHeadersIntoView {

    param(
        [System.Windows.Automation.AutomationElement]$WindowEl
    )

    if (-not $WindowEl) {
        return $false
    }

    for (
        $attempt = 0;
        $attempt -lt 8;
        $attempt++
    ) {

        $req =
            Find-RequestHeaders $WindowEl

        if (-not $req) {
            return $false
        }

        try {

            $r =
                $req.Current.BoundingRectangle

            $screen =
                [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

            if (
                $r.Top -ge $screen.Top -and
                $r.Bottom -le $screen.Bottom
            ) {

                Log-Step 'request-headers-visible'

                return $true
            }

        } catch {}

        try {

            $scroll =
                $req.GetCurrentPattern(
                    [System.Windows.Automation.ScrollItemPattern]::Pattern
                )

            $scroll.ScrollIntoView()

            Start-Sleep -Milliseconds 350

            continue

        } catch {}

        try {

            [WinApiMain]::SetForegroundWindow(
                $target
            ) | Out-Null

            if ($attempt -lt 5) {

                [System.Windows.Forms.SendKeys]::SendWait(
                    '{PGDN}'
                )

            } else {

                [System.Windows.Forms.SendKeys]::SendWait(
                    '{PGUP}'
                )
            }

            Start-Sleep -Milliseconds 350

        } catch {

            break
        }
    }

    return $true
}

# ============================================================
# FIND BROWSER PROCESS
# ============================================================

Log-Step 'start'

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

    Log-Step 'no-proc'

    exit
}

$mainHwnd =
    $proc.MainWindowHandle

# ============================================================
# FOCUS BROWSER
# ============================================================

$wsh =
    New-Object -ComObject WScript.Shell

$wsh.AppActivate(
    $proc.Id
) | Out-Null

Start-Sleep -Milliseconds 200

[WinApiMain]::SetForegroundWindow(
    $mainHwnd
) | Out-Null

Maximize-Window $mainHwnd

Log-Step 'browser-focused'

# ============================================================
# OPEN DEVTOOLS
# ============================================================

for (
    $i = 0;
    $i -lt 6;
    $i++
) {

    if (
        Test-DevToolsOpen $proc.Id
    ) {
        break
    }

    $wsh.AppActivate(
        $proc.Id
    ) | Out-Null

    Start-Sleep -Milliseconds 100

    if (
        Invoke-OpenDevToolsButton
    ) {

        Start-Sleep -Milliseconds 700

        continue
    }

    # F12 is safe.
    [System.Windows.Forms.SendKeys]::SendWait(
        '{F12}'
    )

    Start-Sleep -Milliseconds 700
}

Log-Step 'devtools-open'

# ============================================================
# FIND INITIAL DEVTOOLS ELEMENT
# ============================================================

$root =
    [System.Windows.Automation.AutomationElement]::RootElement

$procCond =
    New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
        $proc.Id
    )

$windowElements =
    $root.FindAll(
        [System.Windows.Automation.TreeScope]::Children,
        $procCond
    )

$winEl = $null

foreach ($candidate in $windowElements) {

    try {

        $title =
            [WinApiEnum]::GetTitle(
                [IntPtr]$candidate.Current.NativeWindowHandle
            )

        if (
            $title -match 'DevTools' -or
            $title -match 'Developer Tools'
        ) {

            $winEl = $candidate

            break
        }

    } catch {}
}

if (-not $winEl -and $windowElements.Count -gt 0) {
    $winEl = $windowElements[0]
}

# ============================================================
# TRY TO UNDOCK
#
# NO Ctrl+Shift+P.
# ============================================================

$undocked = $false

if ($browserName -ne 'firefox') {

    try {

        $undocked =
            Try-UndockDevTools $winEl

    } catch {

        $undocked = $false
    }
}

if ($undocked) {

    Log-Step 'undocked'

    Start-Sleep -Milliseconds 1000

} else {

    Log-Step 'undock-skipped'

    # This is intentional.
    # We continue with docked DevTools instead of using
    # Ctrl+Shift+P and risking the PDF/print dialog.
}

# ============================================================
# FIND DEVTOOLS WINDOW AGAIN
# ============================================================

$fgHwnd =
    [WinApiMain]::GetForegroundWindow()

$fgPid = 0

[WinApiMain]::GetWindowThreadProcessId(
    $fgHwnd,
    [ref]$fgPid
) | Out-Null

$devHwnd =
    [IntPtr]::Zero

if (
    $fgPid -eq $proc.Id -and
    $fgHwnd -ne $mainHwnd
) {

    $devHwnd = $fgHwnd
}

if (
    $devHwnd -eq [IntPtr]::Zero
) {

    $devHwnd =
        Get-DevToolsWindowHandle `
        $proc.Id `
        $mainHwnd
}

$devEl = $null

if (
    $devHwnd -ne [IntPtr]::Zero
) {

    [WinApiMain]::SetForegroundWindow(
        $devHwnd
    ) | Out-Null

    Start-Sleep -Milliseconds 150

    Maximize-Window $devHwnd

    $devEl =
        Get-WindowElementByHwnd $devHwnd

    $target =
        $devHwnd

} else {

    # Docked DevTools.
    $target =
        $mainHwnd

    $devEl =
        Get-WindowElementByHwnd $mainHwnd

    Maximize-Window $mainHwnd
}

Log-Step 'devtools-ready'

# ============================================================
# DISMISS ANY ACCIDENTAL PDF DIALOG
# ============================================================

Dismiss-PrintDialog

# ============================================================
# OPEN NETWORK
#
# PRIMARY METHOD:
# UI AUTOMATION CLICK
#
# FALLBACK:
# Ctrl+Shift+E
#
# NEVER Ctrl+Shift+P
# ============================================================

$networkShown = $false

for (
    $attempt = 0;
    $attempt -lt 4;
    $attempt++
) {

    Dismiss-PrintDialog

    $devEl =
        Refresh-DevToolsElement

    if ($devEl) {

        if (
            Invoke-Panel `
                'Network' `
                $devEl
        ) {

            $networkShown = $true

            break
        }
    }

    Start-Sleep -Milliseconds 300
}

if (-not $networkShown) {

    Log-Step 'network-ui-click-failed'

    try {

        $wsh.AppActivate(
            $proc.Id
        ) | Out-Null

        [WinApiMain]::SetForegroundWindow(
            $target
        ) | Out-Null

        Start-Sleep -Milliseconds 150

        # Chromium Network shortcut.
        # IMPORTANT: this is Ctrl+Shift+E, NOT Ctrl+Shift+P.
        if (
            $browserName -ne 'firefox'
        ) {

            [System.Windows.Forms.SendKeys]::SendWait(
                '^+e'
            )

        } else {

            [System.Windows.Forms.SendKeys]::SendWait(
                '^+e'
            )
        }

        Start-Sleep -Milliseconds 700

        $networkShown = $true

    } catch {}
}

Dismiss-PrintDialog

Log-Step "network=$networkShown"

# ============================================================
# WAIT FOR NETWORK PANEL
# ============================================================

Start-Sleep -Milliseconds 800

# ============================================================
# RELOAD PAGE
# ============================================================

Invoke-ReloadPage

Start-Sleep -Milliseconds 1500

# ============================================================
# SELECT REQUEST
# ============================================================

$rowClicked = $false

$rowName =
    if ($browserName -eq 'firefox') {
        '/' + $rowTail
    } else {
        $rowTail
    }

# Try several times because Network requests can appear
# slightly after the page has finished painting.

for (
    $attempt = 0;
    $attempt -lt 10;
    $attempt++
) {

    Dismiss-PrintDialog

    $devEl =
        Refresh-DevToolsElement

    if ($devEl) {

        $rowClicked =
            Select-NetworkRow `
                $rowName `
                $rowTail `
                $devEl
    }

    if ($rowClicked) {
        break
    }

    Start-Sleep -Milliseconds 500
}

# If the row still isn't found, reload exactly once.

if (-not $rowClicked) {

    Log-Step 'request-not-found-first-pass'

    Invoke-ReloadPage

    Start-Sleep -Milliseconds 1800

    for (
        $attempt = 0;
        $attempt -lt 8;
        $attempt++
    ) {

        Dismiss-PrintDialog

        $devEl =
            Refresh-DevToolsElement

        if ($devEl) {

            $rowClicked =
                Select-NetworkRow `
                    $rowName `
                    $rowTail `
                    $devEl
        }

        if ($rowClicked) {
            break
        }

        Start-Sleep -Milliseconds 400
    }
}

Log-Step "row-clicked=$rowClicked"

# ============================================================
# OPEN HEADERS
# ============================================================

if ($rowClicked) {

    Start-Sleep -Milliseconds 600

    Dismiss-PrintDialog

    $devEl =
        Refresh-DevToolsElement

    $headersClicked = $false

    if ($devEl) {

        $headersClicked =
            Select-HeadersTab $devEl
    }

    if (-not $headersClicked) {

        Start-Sleep -Milliseconds 400

        $devEl =
            Refresh-DevToolsElement

        if ($devEl) {

            $headersClicked =
                Select-HeadersTab $devEl
        }
    }

    Log-Step "headers=$headersClicked"

    Start-Sleep -Milliseconds 500

    # ========================================================
    # REQUEST HEADERS
    # ========================================================

    $devEl =
        Refresh-DevToolsElement

    $requestExpanded = $false

    if ($devEl) {

        $requestExpanded =
            Expand-RequestHeaders $devEl
    }

    Log-Step "request-expanded=$requestExpanded"

    Start-Sleep -Milliseconds 500

    # ========================================================
    # SCROLL REQUEST HEADERS INTO VIEW
    # ========================================================

    $devEl =
        Refresh-DevToolsElement

    if ($devEl) {

        Scroll-RequestHeadersIntoView `
            $devEl |
            Out-Null
    }

    Start-Sleep -Milliseconds 400
}

# ============================================================
# FINAL WINDOW FOCUS
# ============================================================

Dismiss-PrintDialog

[WinApiMain]::SetForegroundWindow(
    $target
) | Out-Null

Start-Sleep -Milliseconds 150

Maximize-Window $target

Start-Sleep -Milliseconds 600

Log-Step 'ui-ready'

# ============================================================
# SCREENSHOT
# ============================================================

if ($shotPath) {

    try {

        $b =
            [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

        $bmp =
            New-Object System.Drawing.Bitmap(
                $b.Width,
                $b.Height
            )

        $g =
            [System.Drawing.Graphics]::FromImage(
                $bmp
            )

        try {

            $g.CopyFromScreen(
                $b.Location,
                [System.Drawing.Point]::Empty,
                $b.Size
            )

            $bmp.Save(
                $shotPath,
                [System.Drawing.Imaging.ImageFormat]::Png
            )

        } finally {

            $g.Dispose()
            $bmp.Dispose()
        }

        Log-Step "screenshot-saved=$shotPath"

    } catch {

        Log-Step "screenshot-error=$($_.Exception.Message)"
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

Log-Step 'done'

exit 0
`;
}

// ============================================================
// OPEN BROWSER + START AUTOMATION
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

        process.exit(1);
    }

    launchBrowser(
        name,
        exe,
        site
    );

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

            setTimeout(
                () => {
                    try {
                        fs.unlinkSync(ps1);
                    } catch {}
                },
                120000
            );

        }

    }, 800);

    return name;
}

// ============================================================
// BROWSER COMMAND LINE
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

        // ====================================================
        // WAIT FOR SCREENSHOT / DONE FLAG
        //
        // Hard maximum: 45 seconds.
        // This prevents the script from hanging forever.
        // ====================================================

        let waited = 0;

        while (
            !fs.existsSync(outPath) &&
            !fs.existsSync(doneFile) &&
            waited < 45
        ) {

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        300
                    )
            );

            waited += 0.3;
        }

        const ok =
            fs.existsSync(outPath);

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

        console.log(
            `${username}: screenshot=${ok}`
        );

        // ====================================================
        // CLOSE BROWSER
        // ====================================================

        await closeBrowser(
            browserName
        );

        // Give Windows a tiny amount of time to
        // release the browser process before starting
        // the next site.
        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    500
                )
        );
    }

    // ========================================================
    // RESULT
    // ========================================================

    const saved =
        results.filter(
            r => r.ok
        );

    const silent =
        process.env.COOKIES_SILENT === '1';

    if (
        saved.length > 0
    ) {

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

// ============================================================
// START
// ============================================================

main().catch(err => {

    console.error(err);

    try {
        fs.writeFileSync(
            path.join(
                os.tmpdir(),
                'cookies_error.log'
            ),
            String(err.stack || err)
        );
    } catch {}
});
