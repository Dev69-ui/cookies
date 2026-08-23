const { spawn, execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ============================ Platform ============================

const PLATFORM = process.platform;

const IS_WIN = PLATFORM === 'win32';
const IS_MAC = PLATFORM === 'darwin';
const IS_LINUX = PLATFORM === 'linux';

if (!IS_WIN && !IS_MAC && !IS_LINUX) {
    console.error('Unsupported platform:', PLATFORM);
    process.exit(1);
}

// ============================ Paths ============================

const screenshots = path.join(
    os.homedir(),
    'Pictures',
    'Screenshots'
);

fs.mkdirSync(screenshots, {
    recursive: true
});

// ============================ Helpers ============================

function runDetached(bin, args) {
    try {
        const child = spawn(
            bin,
            args,
            {
                detached: true,
                stdio: 'ignore'
            }
        );

        child.unref();
    } catch {}
}

function runPS(script, hidden = true) {

    return new Promise((resolve, reject) => {

        const child = spawn(
            'powershell.exe',
            [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                '-'
            ],
            {
                windowsHide: hidden,
                stdio: [
                    'pipe',
                    'pipe',
                    'pipe'
                ]
            }
        );

        let out = '';
        let err = '';

        child.stdout.on(
            'data',
            d => out += d.toString()
        );

        child.stderr.on(
            'data',
            d => err += d.toString()
        );

        child.on(
            'error',
            reject
        );

        child.on(
            'close',
            code => resolve({
                code,
                out,
                err
            })
        );

        child.stdin.write(script);
        child.stdin.end();
    });
}

function showMessage(text, title) {

    if (IS_WIN) {

        const script =
            `Add-Type -AssemblyName System.Windows.Forms; ` +
            `[System.Windows.Forms.MessageBox]::Show(` +
            `'${text.replace(/'/g, "''")}', ` +
            `'${title.replace(/'/g, "''")}', ` +
            `'OK', 'Information') | Out-Null`;

        return runPS(
            script,
            false
        );
    }

    if (IS_MAC) {

        const safe =
            text
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"');

        runDetached(
            'osascript',
            [
                '-e',
                `display dialog "${safe}" with title "${title.replace(/"/g, '\\"')}" buttons {"OK"} default button "OK"`
            ]
        );

        return Promise.resolve();
    }

    try {

        execFileSync(
            'zenity',
            ['--version'],
            {
                stdio: 'ignore'
            }
        );

        runDetached(
            'zenity',
            [
                '--info',
                '--title',
                title,
                '--text',
                text
            ]
        );

        return Promise.resolve();

    } catch {}

    console.log(
        `[${title}] ${text}`
    );

    return Promise.resolve();
}

function openCaptures() {

    if (IS_WIN) {

        runDetached(
            'explorer.exe',
            [screenshots]
        );

    } else if (IS_MAC) {

        runDetached(
            'open',
            [screenshots]
        );

    } else {

        runDetached(
            'xdg-open',
            [screenshots]
        );
    }
}

// ============================ Windows browser detection ============================

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

        const out =
            execFileSync(
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

        const m =
            out.match(/REG_SZ\s+(.*)/);

        return m
            ? m[1].trim()
            : null;

    } catch {

        return null;
    }
}

function getDefaultBrowserName() {

    const progId =
        regQuery(
            'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice',
            'ProgId'
        );

    if (progId) {

        if (progId.startsWith('Firefox'))
            return 'firefox';

        if (progId.startsWith('ChromeHTML'))
            return 'chrome';

        if (progId.startsWith('MSEdgeHTM'))
            return 'msedge';

        if (progId.startsWith('Brave'))
            return 'brave';

        if (progId.startsWith('Opera'))
            return 'opera';
    }

    const names = {

        chrome: {
            exe: 'chrome.exe'
        },

        msedge: {
            exe: 'msedge.exe'
        },

        firefox: {
            exe: 'firefox.exe'
        },

        brave: {
            exe: 'brave.exe'
        },

        opera: {
            exe: 'opera.exe'
        }
    };

    for (
        const [name, cfg]
        of Object.entries(names)
    ) {

        if (
            exeExists(
                name,
                cfg.exe
            )
        ) {
            return name;
        }
    }

    return null;
}

function exeExists(
    name,
    exeName
) {

    for (
        const key
        of [
            `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
            `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
            `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`
        ]
    ) {

        if (
            regQuery(
                key,
                ''
            )
        ) {
            return true;
        }
    }

    return false;
}

function getBrowserExe(name) {

    const exeName =
        `${name}.exe`;

    for (
        const key
        of [
            `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
            `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
            `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`
        ]
    ) {

        const p =
            regQuery(
                key,
                ''
            );

        if (
            p &&
            fs.existsSync(p)
        ) {
            return p;
        }
    }

    try {

        const cmd =
            execFileSync(
                'where.exe',
                [exeName],
                {
                    encoding: 'utf8'
                }
            );

        const first =
            cmd.split(/\r?\n/)[0];

        if (
            first &&
            fs.existsSync(first)
        ) {
            return first;
        }

    } catch {}

    return null;
}

// ============================ Linux browser detection ============================

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

    for (
        const b
        of names
    ) {

        try {

            const p =
                execFileSync(
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

            if (
                p &&
                fs.existsSync(p)
            ) {
                return p;
            }

        } catch {}
    }

    return null;
}

function getDefaultBrowserNameLinux() {

    try {

        const out =
            execFileSync(
                'xdg-settings',
                [
                    'get',
                    'default-web-browser'
                ],
                {
                    encoding: 'utf8',
                    stdio: [
                        'ignore',
                        'pipe',
                        'ignore'
                    ]
                }
            );

        const s =
            out.trim();

        if (/edg/i.test(s))
            return 'msedge';

        if (/chrom/i.test(s))
            return 'chrome';

        if (/firefox/i.test(s))
            return 'firefox';

        if (/brave/i.test(s))
            return 'brave';

        if (/opera/i.test(s))
            return 'opera';

    } catch {}

    for (
        const [name, bins]
        of Object.entries(LINUX_BIN)
    ) {

        if (
            findBin(bins)
        ) {
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

// ============================ Mac browser detection ============================

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

    const app =
        MAC_APPS[name];

    if (!app)
        return null;

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
        const name
        of [
            'chrome',
            'firefox',
            'msedge',
            'brave',
            'opera'
        ]
    ) {

        if (
            getBrowserExeMac(name)
        ) {
            return name;
        }
    }

    return null;
}

// ============================ Sites ============================

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

    const m =
        site.url.match(
            /\.com\/([^/?]+)/
        );

    return m
        ? m[1]
        : site.rowTail.split('/')[0];
}

// ============================ Launch browser ============================

function getDevToolsFlag(name) {

    return name === 'firefox'
        ? '-devtools'
        : '--auto-open-devtools-for-tabs';
}

function launchBrowser(
    name,
    exe,
    site
) {

    const url =
        site.url;

    const flagArg =
        getDevToolsFlag(name);

    const extra =
        name &&
        name !== 'firefox'
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

            runDetached(
                'cmd.exe',
                [
                    '/c',
                    'start',
                    '',
                    url
                ]
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

// ============================ Close browser ============================

function closeBrowser(name) {

    if (IS_WIN) {

        const exeName =
            `${name}.exe`;

        const ps = `
Get-Process '${exeName}','${name}' -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
`;

        return Promise.race([

            runPS(ps),

            new Promise(
                resolve =>
                    setTimeout(
                        () =>
                            resolve({
                                code: -1,
                                out: 'timeout'
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
            LINUX_WINDOW_CLASS[name] || name
        ]
    );

    return Promise.resolve();
}

// ============================ Linux automation ============================

function linuxShowScriptFor(
    browserName
) {

    const cls =
        LINUX_WINDOW_CLASS[
            browserName
        ] ||
        browserName ||
        'chrome';

    const devKey =
        browserName === 'firefox'
            ? 'ctrl+shift+k'
            : 'ctrl+shift+j';

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

if [ "$BN" != "firefox" ]; then
    xdotool key --clearmodifiers ctrl+shift+d
    sleep 1.5
fi

xdotool key --clearmodifiers F11

sleep 1.5

xdotool key --clearmodifiers ctrl+shift+e

sleep 1

xdotool key --clearmodifiers F5

sleep 3

xdotool key --clearmodifiers ${devKey}

sleep 1

xdotool key --clearmodifiers F11
`;
}

function runLinuxShowScript(name) {

    const script =
        linuxShowScriptFor(name);

    const child =
        spawn(
            'bash',
            ['-s'],
            {
                detached: true,
                stdio: [
                    'pipe',
                    'ignore',
                    'ignore'
                ]
            }
        );

    child.stdin.write(script);
    child.stdin.end();

    child.unref();
}

// ============================ Mac automation ============================

function macShowScriptFor(
    browserName
) {

    const processName =
        MAC_PROCESS[
            browserName
        ] ||
        browserName ||
        'Safari';

    return `
set appName to "${processName}"

tell application appName
    activate
end tell

delay 1

tell application "System Events"

    try
        set frontmost of process "${processName}" to true
    end try

    delay 0.5

    try
        keystroke "f" using {control down, command down}
    end try

    delay 1

    try
        keystroke "j" using {command down, option down, shift down}
    end try

    delay 1.5

    try
        keystroke "d" using {command down, shift down}
    end try

    delay 1.5

    try
        keystroke "e" using {command down, shift down}
    end try

    delay 1

    try
        keystroke "r" using {command down}
    end try

    delay 2

end tell
`;
}

function runMacShowScript(name) {

    const script =
        macShowScriptFor(name);

    const lines =
        script
            .trim()
            .split(/\n/);

    const args = [];

    for (
        const line
        of lines
    ) {

        const t =
            line.trim();

        if (t) {
            args.push(
                '-e',
                t
            );
        }
    }

    runDetached(
        'osascript',
        args
    );
}

// ============================ Windows automation ============================

function browserShowScriptFor(
    browserName,
    rowTail,
    shotPath
) {

    const bn =
        browserName || '';

    const tail =
        rowTail ||
        'instagram/?__a=1';

    const shot =
        shotPath || '';

    return `
$browserName = '${bn}'
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

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

# ============================ Win32 ============================

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public static class BrowserWin32 {

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

    [DllImport("user32.dll",
        CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(
        IntPtr hWnd,
        StringBuilder text,
        int max
    );

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

    public static void Move(
        int x,
        int y
    ) {

        SetCursorPos(
            x,
            y
        );
    }

    public static void Wheel(
        int amount
    ) {

        mouse_event(
            0x0800,
            0,
            0,
            unchecked((uint)amount),
            UIntPtr.Zero
        );
    }

    public static void Screenshot(
        string file
    ) {

        var bounds =
            System.Windows.Forms.Screen.PrimaryScreen.Bounds;

        using (
            var bmp =
                new System.Drawing.Bitmap(
                    bounds.Width,
                    bounds.Height
                )
        {

            using (
                var g =
                    System.Drawing.Graphics.FromImage(bmp)
            {

                g.CopyFromScreen(
                    bounds.Location,
                    System.Drawing.Point.Empty,
                    bounds.Size
                );
            }

            bmp.Save(
                file,
                System.Drawing.Imaging.ImageFormat.Png
            );
        }
    }
}

public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
}

public static class BrowserWindows {

    public delegate bool EnumWindowsProc(
        IntPtr hWnd,
        IntPtr lParam
    );

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT2 {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(
        EnumWindowsProc callback,
        IntPtr param
    );

    private static List<IntPtr> windows =
        new List<IntPtr>();

    private static uint pid;

    private static bool Callback(
        IntPtr hWnd,
        IntPtr lParam
    ) {

        uint p;

        BrowserWin32.GetWindowThreadProcessId(
            hWnd,
            out p
        );

        if (
            p == pid &&
            BrowserWin32.IsWindowVisible(hWnd) &&
            BrowserWin32.GetWindowTextLength(hWnd) > 0
        ) {

            windows.Add(hWnd);
        }

        return true;
    }

    public static List<IntPtr> GetWindows(
        uint processId
    ) {

        windows =
            new List<IntPtr>();

        pid =
            processId;

        EnumWindows(
            new EnumWindowsProc(Callback),
            IntPtr.Zero
        );

        return windows;
    }

    public static string Title(
        IntPtr hwnd
    ) {

        int len =
            BrowserWin32.GetWindowTextLength(hwnd);

        if (len <= 0)
            return "";

        StringBuilder sb =
            new StringBuilder(
                len + 1
            );

        BrowserWin32.GetWindowText(
            hwnd,
            sb,
            sb.Capacity
        );

        return sb.ToString();
    }
}
'@

# ============================ Helpers ============================

$wsh =
    New-Object -ComObject WScript.Shell

function Maximize-Window(
    [IntPtr]$hwnd
) {

    if (
        $hwnd -eq [IntPtr]::Zero
    ) {
        return
    }

    [BrowserWin32]::ShowWindow(
        $hwnd,
        3
    ) | Out-Null

    $screen =
        [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

    [BrowserWin32]::SetWindowPos(
        $hwnd,
        [IntPtr]::Zero,
        $screen.Left,
        $screen.Top,
        $screen.Width,
        $screen.Height,
        0x0040
    ) | Out-Null
}

function Get-WindowElement(
    [IntPtr]$hwnd
) {

    $root =
        [System.Windows.Automation.AutomationElement]::RootElement

    $condition =
        New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
            $proc.Id
        )

    $windows =
        $root.FindAll(
            [System.Windows.Automation.TreeScope]::Children,
            $condition
        )

    foreach (
        $w in $windows
    ) {

        if (
            $w.Current.NativeWindowHandle -eq
            $hwnd.ToInt64()
        ) {

            return $w
        }
    }

    return $null
}

function Find-DevToolsWindow {

    foreach (
        $w
        in @(
            [BrowserWindows]::GetWindows(
                [uint32]$proc.Id
            )
        )
    ) {

        if (
            $w -ne $mainHwnd
        ) {

            $title =
                [BrowserWindows]::Title($w)

            if (
                $title -match 'DevTools'
            ) {

                return $w
            }
        }
    }

    foreach (
        $w
        in @(
            [BrowserWindows]::GetWindows(
                [uint32]$proc.Id
            )
        )
    ) {

        if (
            $w -ne $mainHwnd
        ) {

            return $w
        }
    }

    return [IntPtr]::Zero
}

function MouseClick(
    [System.Windows.Automation.AutomationElement]$element
) {

    if (-not $element) {
        return $false
    }

    try {

        $r =
            $element.Current.BoundingRectangle

        if (
            $r.Width -le 0 -or
            $r.Height -le 0
        ) {

            return $false
        }

        [BrowserWin32]::Click(
            [int]($r.X + $r.Width / 2),
            [int]($r.Y + $r.Height / 2)
        )

        return $true

    } catch {

        return $false
    }
}

function Invoke-Element(
    [System.Windows.Automation.AutomationElement]$element
) {

    if (-not $element) {
        return $false
    }

    try {

        $element.GetCurrentPattern(
            [System.Windows.Automation.InvokePattern]::Pattern
        ).Invoke()

        return $true

    } catch {

        try {

            $element.GetCurrentPattern(
                [System.Windows.Automation.SelectionItemPattern]::Pattern
            ).Select()

            return $true

        } catch {

            return MouseClick $element
        }
    }
}

# ============================ Find browser ============================

$proc = $null

for (
    $i = 0;
    $i -lt 30 -and -not $proc;
    $i++
) {

    foreach (
        $name
        in $names
    ) {

        $p =
            Get-Process $name `
                -ErrorAction SilentlyContinue |
            Where-Object {
                $_.MainWindowHandle -ne 0
            } |
            Select-Object -First 1

        if ($p) {

            $proc =
                $p

            break
        }
    }

    Start-Sleep -Milliseconds 400
}

if (-not $proc) {
    exit
}

# Save browser window before DevTools changes it.
$mainHwnd =
    $proc.MainWindowHandle

$wsh.AppActivate(
    $proc.Id
) | Out-Null

[BrowserWin32]::SetForegroundWindow(
    $mainHwnd
) | Out-Null

Start-Sleep -Milliseconds 150

Maximize-Window $mainHwnd

# ============================ Open DevTools ============================

$wsh.SendKeys(
    '{F12}'
)

Start-Sleep -Milliseconds 1000

# ============================ Undock DevTools ============================

$wsh.SendKeys(
    '^+d'
)

Start-Sleep -Milliseconds 1000

# ============================ Locate DevTools ============================

$devHwnd =
    Find-DevToolsWindow

if (
    $devHwnd -ne [IntPtr]::Zero
) {

    $wsh.AppActivate(
        $proc.Id
    ) | Out-Null

    [BrowserWin32]::SetForegroundWindow(
        $devHwnd
    ) | Out-Null

    Start-Sleep -Milliseconds 200

    Maximize-Window $devHwnd
}

$devEl =
    Get-WindowElement $devHwnd

if (-not $devEl) {

    $devEl =
        Get-WindowElement $mainHwnd
}

# ============================ Network panel ============================

function Open-Network {

    if (-not $devEl) {
        return $false
    }

    $condition =
        New-Object System.Windows.Automation.AndCondition(

            (
                New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::NameProperty,
                    'Network'
                )
            ),

            (
                New-Object System.Windows.Automation.OrCondition(

                    (
                        New-Object System.Windows.Automation.PropertyCondition(
                            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                            [System.Windows.Automation.ControlType]::TabItem
                        )
                    ),

                    (
                        New-Object System.Windows.Automation.OrCondition(

                            (
                                New-Object System.Windows.Automation.PropertyCondition(
                                    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                                    [System.Windows.Automation.ControlType]::Button
                                )
                            ),

                            (
                                New-Object System.Windows.Automation.PropertyCondition(
                                    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                                    [System.Windows.Automation.ControlType]::ListItem
                                )
                            )
                        )
                    )
                )
            )
        )

    $network =
        $devEl.FindFirst(
            [System.Windows.Automation.TreeScope]::Descendants,
            $condition
        )

    if ($network) {

        return Invoke-Element $network
    }

    return $false
}

if (-not (Open-Network)) {

    $wsh.AppActivate(
        $proc.Id
    ) | Out-Null

    [BrowserWin32]::SetForegroundWindow(
        $devHwnd
    ) | Out-Null

    # Network shortcut.
    $wsh.SendKeys(
        '^+e'
    )

    Start-Sleep -Milliseconds 800
}

# ============================ Reload page ============================

$wsh.AppActivate(
    $proc.Id
) | Out-Null

[BrowserWin32]::SetForegroundWindow(
    $mainHwnd
) | Out-Null

Start-Sleep -Milliseconds 200

$wsh.SendKeys(
    '{F5}'
)

Start-Sleep -Milliseconds 2500

# Refresh DevTools automation tree.
$devEl =
    Get-WindowElement $devHwnd

# ============================ Select request row ============================

function Find-NetworkRow {

    if (-not $devEl) {
        return $null
    }

    $namesToTry =
        @(
            $rowTail,
            "/$rowTail",
            "https://www.instagram.com/$rowTail",
            "https://www.facebook.com/$rowTail"
        )

    foreach (
        $wanted
        in $namesToTry
    ) {

        $condition =
            New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::NameProperty,
                $wanted
            )

        $elements =
            $devEl.FindAll(
                [System.Windows.Automation.TreeScope]::Descendants,
                $condition
            )

        foreach (
            $element
            in $elements
        ) {

            try {

                if (
                    $element.Current.ControlType -eq
                    [System.Windows.Automation.ControlType]::DataItem
                ) {

                    return $element
                }

            } catch {}
        }
    }

    # Fallback: find DataItem containing the row URL.
    $items =
        $devEl.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            (
                New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                    [System.Windows.Automation.ControlType]::DataItem
                )
            )
        )

    foreach (
        $item
        in $items
    ) {

        try {

            $n =
                [string]$item.Current.Name

            if (
                $n -like "*$rowTail*"
            ) {

                return $item
            }

        } catch {}
    }

    return $null
}

$row =
    Find-NetworkRow

if ($row) {

    Invoke-Element $row |
        Out-Null

    Start-Sleep -Milliseconds 700
}

# Refresh because selecting a request changes the DevTools DOM.
$devEl =
    Get-WindowElement $devHwnd

# ============================ Headers ============================

function Find-HeadersTab {

    if (-not $devEl) {
        return $null
    }

    $condition =
        New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty,
            'Headers',
            [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase
        )

    $elements =
        $devEl.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            $condition
        )

    foreach (
        $element
        in $elements
    ) {

        try {

            $type =
                $element.Current.ControlType

            if (
                $type -eq
                [System.Windows.Automation.ControlType]::TabItem -or

                $type -eq
                [System.Windows.Automation.ControlType]::Button -or

                $type -eq
                [System.Windows.Automation.ControlType]::ListItem
            ) {

                return $element
            }

        } catch {}
    }

    return $null
}

$headersTab =
    Find-HeadersTab

if ($headersTab) {

    Invoke-Element $headersTab |
        Out-Null

    Start-Sleep -Milliseconds 500
}

# Refresh after changing to Headers.
$devEl =
    Get-WindowElement $devHwnd

# ============================ REQUEST HEADERS ONLY ============================

function Find-RequestHeaders {

    if (-not $devEl) {
        return $null
    }

    $all =
        $devEl.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )

    foreach (
        $element
        in $all
    ) {

        try {

            $name =
                [string]$element.Current.Name

            # ONLY Request Headers.
            #
            # Deliberately excludes:
            # - Response Headers
            # - General
            # - Payload
            # - Preview
            # - Response
            # - Query String Parameters

            if (
                $name -match
                '^Request headers?(?:\\s*\\(.*\\))?$'
            ) {

                return $element
            }

        } catch {}
    }

    return $null
}

function Expand-RequestHeaders {

    $requestHeaders =
        Find-RequestHeaders

    if (-not $requestHeaders) {
        return $false
    }

    # First try ExpandCollapsePattern.
    try {

        $pattern =
            $requestHeaders.GetCurrentPattern(
                [System.Windows.Automation.ExpandCollapsePattern]::Pattern
            )

        $state =
            $pattern.Current.ExpandCollapseState

        if (
            $state -eq
            [System.Windows.Automation.ExpandCollapseState]::Collapsed
        ) {

            $pattern.Expand()

            Start-Sleep -Milliseconds 500

            return $true
        }

        if (
            $state -eq
            [System.Windows.Automation.ExpandCollapseState]::Expanded
        ) {

            return $true
        }

    } catch {}

    # If Chromium doesn't expose ExpandCollapsePattern,
    # click ONLY Request Headers.
    try {

        if (
            Invoke-Element $requestHeaders
        ) {

            Start-Sleep -Milliseconds 500

            return $true
        }

    } catch {}

    return $false
}

Expand-RequestHeaders |
    Out-Null

Start-Sleep -Milliseconds 600

# ============================ Scroll Request Headers ============================

function Scroll-ToRequestHeaders {

    for (
        $attempt = 0;
        $attempt -lt 15;
        $attempt++
    ) {

        $devEl =
            Get-WindowElement $devHwnd

        if (-not $devEl) {
            continue
        }

        $requestHeaders =
            Find-RequestHeaders

        if (-not $requestHeaders) {
            continue
        }

        try {

            $r =
                $requestHeaders.Current.BoundingRectangle

            $screen =
                [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea

            # Already visible.
            if (
                $r.Top -ge
                ($screen.Top + 120) -and

                $r.Top -le
                ($screen.Top + 350)
            ) {

                return $true
            }

            $x =
                [int](
                    $r.X +
                    ($r.Width / 2)
                )

            $y =
                [int](
                    $r.Y +
                    15
                )

            if (
                $x -lt
                $screen.Left + 5
            ) {
                $x =
                    $screen.Left + 5
            }

            if (
                $x -gt
                $screen.Right - 5
            ) {
                $x =
                    $screen.Right - 5
            }

            if (
                $y -lt
                $screen.Top + 5
            ) {
                $y =
                    $screen.Top + 5
            }

            if (
                $y -gt
                $screen.Bottom - 5
            ) {
                $y =
                    $screen.Bottom - 5
            }

            # Put the cursor INSIDE Request Headers.
            [BrowserWin32]::Move(
                $x,
                $y
            )

            if (
                $r.Top -gt
                ($screen.Top + 350)
            ) {

                # Request Headers is below the visible area.
                [BrowserWin32]::Wheel(
                    -600
                )

            } elseif (
                $r.Top -lt
                ($screen.Top + 100)
            ) {

                # Request Headers is above the desired position.
                [BrowserWin32]::Wheel(
                    450
                )
            }

            Start-Sleep -Milliseconds 350

        } catch {

            return $false
        }
    }

    return $false
}

Scroll-ToRequestHeaders |
    Out-Null

Start-Sleep -Milliseconds 500

# Refresh once more and make sure Request Headers remains the selected target.
$devEl =
    Get-WindowElement $devHwnd

# ============================ Final screenshot ============================

if ($shotPath) {

    try {

        [BrowserWin32]::Screenshot(
            $shotPath
        )

    } catch {

        # Fallback using PowerShell GDI.
        try {

            Add-Type -AssemblyName System.Drawing

            $bounds =
                [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

            $bitmap =
                New-Object System.Drawing.Bitmap(
                    $bounds.Width,
                    $bounds.Height
                )

            $graphics =
                [System.Drawing.Graphics]::FromImage(
                    $bitmap
                )

            $graphics.CopyFromScreen(
                $bounds.Location,
                [System.Drawing.Point]::Empty,
                $bounds.Size
            )

            $bitmap.Save(
                $shotPath,
                [System.Drawing.Imaging.ImageFormat]::Png
            )

            $graphics.Dispose()
            $bitmap.Dispose()

        } catch {}
    }
}

exit
`;
}

// ============================ Start Windows automation ============================

function runWindowsAutomation(
    name,
    site,
    shotPath
) {

    const script =
        browserShowScriptFor(
            name,
            site.rowTail,
            shotPath
        );

    /*
     * IMPORTANT:
     *
     * Do NOT create a temporary .ps1 file.
     * Do NOT create a temp completion flag.
     *
     * PowerShell receives the script directly through stdin.
     */

    const child =
        spawn(
            'powershell.exe',
            [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                '-'
            ],
            {
                windowsHide: true,
                stdio: [
                    'pipe',
                    'ignore',
                    'ignore'
                ]
            }
        );

    child.stdin.write(script);
    child.stdin.end();

    child.unref();
}

// ============================ Browser launcher ============================

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
            'No supported browser found.'
        );

        return null;
    }

    launchBrowser(
        name,
        exe,
        site
    );

    /*
     * Browser needs a moment to start.
     * This is only a delay — no temp file is created.
     */

    setTimeout(
        () => {

            if (IS_WIN) {

                runWindowsAutomation(
                    name,
                    site,
                    shotPath
                );

            } else if (IS_MAC) {

                runMacShowScript(
                    name
                );

            } else {

                runLinuxShowScript(
                    name
                );
            }

        },
        800
    );

    return name;
}

// ============================ Browser flag ============================

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
        const arg
        of process.argv.slice(2)
    ) {

        if (
            known[arg]
        ) {

            return known[arg];
        }
    }

    return null;
}

// ============================ Main ============================

async function main() {

    const forceName =
        parseBrowserFlag();

    const SITE_ORDER = [
        SITES.instagram,
        SITES.facebook
    ];

    const results = [];

    for (
        const site
        of SITE_ORDER
    ) {

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

        const browserName =
            openBrowserWithConsole(
                forceName,
                site,
                outPath
            );

        if (!browserName) {
            continue;
        }

        /*
         * No done flag.
         *
         * We simply wait until the actual PNG exists.
         */
        let waited = 0;

        while (
            !fs.existsSync(outPath) &&
            waited < 60
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

        results.push({
            username,
            outPath,
            ok
        });

        /*
         * Give Windows a moment before closing the browser.
         * Screenshot is already on disk at this point.
         */

        if (IS_WIN) {

            await closeBrowser(
                browserName
            );

        } else {

            closeBrowser(
                browserName
            );
        }
    }

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
                } saved:\n` +
                saved
                    .map(r => r.outPath)
                    .join('\n'),
                'Screenshot'
            );

            openCaptures();
        }

    } else {

        if (!silent) {

            await showMessage(
                'Screenshot could not be captured.',
                'Screenshot'
            );
        }
    }
}

main();
