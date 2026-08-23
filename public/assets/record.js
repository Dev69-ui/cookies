'use strict';

const {
    spawn,
    execFileSync
} = require('child_process');

const fs = require('fs');
const os = require('os');
const path = require('path');


// ============================================================
// WINDOWS ONLY
// ============================================================

if (process.platform !== 'win32') {
    console.error('This version of record.js is for Windows only.');
    process.exit(1);
}


// ============================================================
// PATHS
// ============================================================

const screenshots =
    path.join(
        os.homedir(),
        'Pictures',
        'Screenshots'
    );

fs.mkdirSync(
    screenshots,
    {
        recursive: true
    }
);


// ============================================================
// BASIC HELPERS
// ============================================================

function sleep(ms) {
    return new Promise(
        resolve => setTimeout(resolve, ms)
    );
}


function runDetached(
    executable,
    args
) {
    try {

        const child =
            spawn(
                executable,
                args,
                {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true
                }
            );

        child.unref();

    } catch {}
}


// ============================================================
// RUN POWERSHELL
//
// IMPORTANT:
// PowerShell is sent through -EncodedCommand.
// There are NO PowerShell backticks in this JS file.
// There are also NO temporary .ps1 files.
// ============================================================

function runPowerShell(
    script,
    hidden = true
) {

    return new Promise(
        (resolve, reject) => {

            const encoded =
                Buffer
                    .from(
                        script,
                        'utf16le'
                    )
                    .toString('base64');

            const child =
                spawn(
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
                        stdio: [
                            'ignore',
                            'pipe',
                            'pipe'
                        ]
                    }
                );

            let stdout = '';
            let stderr = '';

            child.stdout.on(
                'data',
                data => {
                    stdout +=
                        data.toString();
                }
            );

            child.stderr.on(
                'data',
                data => {
                    stderr +=
                        data.toString();
                }
            );

            child.on(
                'error',
                reject
            );

            child.on(
                'close',
                code => {

                    resolve({
                        code,
                        stdout,
                        stderr
                    });

                }
            );
        }
    );
}


// ============================================================
// DEFAULT BROWSER
// ============================================================

function registryValue(
    key,
    value
) {

    try {

        const output =
            execFileSync(
                'reg.exe',
                [
                    'query',
                    key,
                    '/v',
                    value
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

        const match =
            output.match(
                /REG_\w+\s+(.*)/
            );

        if (
            match &&
            match[1]
        ) {
            return match[1].trim();
        }

    } catch {}

    return null;
}


function getDefaultBrowser() {

    const progId =
        registryValue(
            'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice',
            'ProgId'
        );

    if (progId) {

        if (
            /ChromeHTML/i.test(progId)
        ) {
            return 'chrome';
        }

        if (
            /MSEdgeHTM/i.test(progId)
        ) {
            return 'msedge';
        }

        if (
            /Firefox/i.test(progId)
        ) {
            return 'firefox';
        }

        if (
            /Brave/i.test(progId)
        ) {
            return 'brave';
        }

        if (
            /Opera/i.test(progId)
        ) {
            return 'opera';
        }
    }

    return 'chrome';
}


function getBrowserExecutable(
    name
) {

    const exe =
        name + '.exe';

    const registryPaths = [

        `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`,

        `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`,

        `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`

    ];

    for (
        const key
        of registryPaths
    ) {

        const value =
            registryValue(
                key,
                ''
            );

        if (
            value &&
            fs.existsSync(value)
        ) {
            return value;
        }
    }

    try {

        const output =
            execFileSync(
                'where.exe',
                [exe],
                {
                    encoding: 'utf8',
                    stdio: [
                        'ignore',
                        'pipe',
                        'ignore'
                    ]
                }
            );

        const first =
            output
                .split(/\r?\n/)
                .find(Boolean);

        if (
            first &&
            fs.existsSync(first.trim())
        ) {
            return first.trim();
        }

    } catch {}

    return null;
}


// ============================================================
// SITES
// ============================================================

const SITES = [

    {
        name: 'instagram',
        url: 'https://www.instagram.com/instagram/?__a=1',
        rowTail: 'instagram/?__a=1'
    },

    {
        name: 'facebook',
        url: 'https://www.facebook.com/facebook/?__a=1',
        rowTail: 'facebook/?__a=1'
    }

];


// ============================================================
// BROWSER FLAGS
// ============================================================

function getBrowserArgument() {

    const args =
        process.argv.slice(2);

    const map = {

        '--chrome': 'chrome',
        '--google-chrome': 'chrome',

        '--edge': 'msedge',
        '--msedge': 'msedge',

        '--firefox': 'firefox',

        '--brave': 'brave',

        '--opera': 'opera'

    };

    for (
        const arg
        of args
    ) {

        if (
            map[arg]
        ) {
            return map[arg];
        }
    }

    return null;
}


// ============================================================
// OPEN BROWSER
// ============================================================

function openBrowser(
    browserName,
    url
) {

    const executable =
        getBrowserExecutable(
            browserName
        );

    if (!executable) {

        console.error(
            'Could not find browser:',
            browserName
        );

        return false;
    }

    const args = [

        '--disable-extensions',

        '--no-first-run',

        '--disable-default-apps',

        url

    ];

    try {

        const child =
            spawn(
                executable,
                args,
                {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: false
                }
            );

        child.unref();

        return true;

    } catch (
        error
    ) {

        console.error(
            'Browser launch failed:',
            error.message
        );

        return false;
    }
}


// ============================================================
// POWERSHELL AUTOMATION
// ============================================================

function makePowerShellScript(
    browserName,
    rowTail,
    screenshotPath
) {

    const safeBrowser =
        browserName
            .replace(/'/g, "''");

    const safeRow =
        rowTail
            .replace(/'/g, "''");

    const safeShot =
        screenshotPath
            .replace(/'/g, "''");


    /*
     * IMPORTANT:
     *
     * This is deliberately constructed with normal JS strings.
     *
     * There is NO JavaScript template literal containing PowerShell.
     *
     * Therefore PowerShell's ` character can never accidentally
     * terminate our JavaScript.
     */


    const lines = [

        "$ErrorActionPreference = 'SilentlyContinue'",

        "Add-Type -AssemblyName System.Windows.Forms",

        "Add-Type -AssemblyName System.Drawing",

        "Add-Type -AssemblyName UIAutomationClient",

        "Add-Type -AssemblyName UIAutomationTypes",


        // --------------------------------------------------------
        // Win32 API
        // --------------------------------------------------------

        "Add-Type -TypeDefinition @'",
        "using System;",
        "using System.Runtime.InteropServices;",
        "using System.Text;",
        "using System.Collections.Generic;",

        "public static class RecorderWin32",
        "{",

        "    [DllImport(\"user32.dll\")]",
        "    public static extern bool SetForegroundWindow(IntPtr hWnd);",

        "    [DllImport(\"user32.dll\")]",
        "    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);",

        "    [DllImport(\"user32.dll\")]",
        "    public static extern bool SetWindowPos(",
        "        IntPtr hWnd,",
        "        IntPtr hWndInsertAfter,",
        "        int X,",
        "        int Y,",
        "        int cx,",
        "        int cy,",
        "        uint uFlags",
        "    );",

        "    [DllImport(\"user32.dll\")]",
        "    public static extern uint GetWindowThreadProcessId(",
        "        IntPtr hWnd,",
        "        out uint processId",
        "    );",

        "    [DllImport(\"user32.dll\")]",
        "    public static extern bool IsWindowVisible(IntPtr hWnd);",

        "    [DllImport(\"user32.dll\")]",
        "    public static extern int GetWindowTextLength(IntPtr hWnd);",

        "    [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)]",
        "    public static extern int GetWindowText(",
        "        IntPtr hWnd,",
        "        StringBuilder text,",
        "        int max",
        "    );",

        "    [DllImport(\"user32.dll\")]",
        "    public static extern bool SetCursorPos(int X, int Y);",

        "    [DllImport(\"user32.dll\")]",
        "    public static extern void mouse_event(",
        "        uint flags,",
        "        uint dx,",
        "        uint dy,",
        "        uint data,",
        "        UIntPtr extra",
        "    );",

        "    public static void Click(int x, int y)",
        "    {",
        "        SetCursorPos(x, y);",
        "        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);",
        "        mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);",
        "    }",

        "    public static void Move(int x, int y)",
        "    {",
        "        SetCursorPos(x, y);",
        "    }",

        "    public static void Wheel(int amount)",
        "    {",
        "        mouse_event(0x0800, 0, 0, unchecked((uint)amount), UIntPtr.Zero);",
        "    }",

        "    public static void Screenshot(string file)",
        "    {",

        "        var bounds = System.Windows.Forms.Screen.PrimaryScreen.Bounds;",

        "        using (var bmp = new System.Drawing.Bitmap(bounds.Width, bounds.Height))",
        "        {",

        "            using (var g = System.Drawing.Graphics.FromImage(bmp))",
        "            {",

        "                g.CopyFromScreen(",
        "                    bounds.Location,",
        "                    System.Drawing.Point.Empty,",
        "                    bounds.Size",
        "                );",

        "            }",

        "            bmp.Save(",
        "                file,",
        "                System.Drawing.Imaging.ImageFormat.Png",
        "            );",

        "        }",

        "    }",

        "}",


        "public struct RecorderRect",
        "{",
        "    public int Left;",
        "    public int Top;",
        "    public int Right;",
        "    public int Bottom;",
        "}",


        "public static class RecorderWindows",
        "{",

        "    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);",

        "    private static List<IntPtr> result = new List<IntPtr>();",

        "    private static uint targetPid;",

        "    private static bool Callback(IntPtr hWnd, IntPtr lParam)",
        "    {",

        "        uint pid;",

        "        RecorderWin32.GetWindowThreadProcessId(hWnd, out pid);",

        "        if (pid == targetPid && RecorderWin32.IsWindowVisible(hWnd) && RecorderWin32.GetWindowTextLength(hWnd) > 0)",
        "        {",
        "            result.Add(hWnd);",
        "        }",

        "        return true;",
        "    }",

        "    [DllImport(\"user32.dll\")]",
        "    public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr param);",

        "    public static List<IntPtr> GetWindows(uint pid)",
        "    {",

        "        result = new List<IntPtr>();",

        "        targetPid = pid;",

        "        EnumWindows(new EnumWindowsProc(Callback), IntPtr.Zero);",

        "        return result;",

        "    }",

        "    public static string GetTitle(IntPtr hWnd)",
        "    {",

        "        int len = RecorderWin32.GetWindowTextLength(hWnd);",

        "        if (len <= 0) return \"\";",

        "        StringBuilder sb = new StringBuilder(len + 1);",

        "        RecorderWin32.GetWindowText(hWnd, sb, sb.Capacity);",
        "        return sb.ToString();",

        "    }",

        "}",

        "'@",


        // --------------------------------------------------------
        // Variables
        // --------------------------------------------------------

        "$browserName = '" +
            safeBrowser +
            "'",

        "$rowTail = '" +
            safeRow +
            "'",

        "$shotPath = '" +
            safeShot +
            "'",


        "$browserNames = @($browserName)",


        // --------------------------------------------------------
        // Find browser
        // --------------------------------------------------------

        "$proc = $null",

        "for ($i = 0; $i -lt 40 -and -not $proc; $i++)",
        "{",

        "    foreach ($browser in $browserNames)",
        "    {",

        "        $found = Get-Process $browser -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1",

        "        if ($found)",
        "        {",
        "            $proc = $found",
        "            break",
        "        }",

        "    }",

        "    if (-not $proc)",
        "    {",
        "        Start-Sleep -Milliseconds 300",
        "    }",

        "}",


        "if (-not $proc)",
        "{",
        "    exit",
        "}",


        "$browserHwnd = $proc.MainWindowHandle",

        "$wsh = New-Object -ComObject WScript.Shell",


        // --------------------------------------------------------
        // Focus browser
        // --------------------------------------------------------

        "$wsh.AppActivate($proc.Id) | Out-Null",

        "[RecorderWin32]::SetForegroundWindow($browserHwnd) | Out-Null",

        "[RecorderWin32]::ShowWindow($browserHwnd, 3) | Out-Null",

        "Start-Sleep -Milliseconds 500",


        // --------------------------------------------------------
        // Open DevTools
        // --------------------------------------------------------

        "$wsh.SendKeys('{F12}')",

        "Start-Sleep -Milliseconds 1500",


        // --------------------------------------------------------
        // Undock DevTools
        // --------------------------------------------------------

        "if ($browserName -ne 'firefox')",
        "{",
        "    $wsh.SendKeys('^+d')",
        "    Start-Sleep -Milliseconds 1000",
        "}",


        // --------------------------------------------------------
        // Find DevTools window
        // --------------------------------------------------------

        "$devHwnd = [IntPtr]::Zero",

        "for ($attempt = 0; $attempt -lt 30 -and $devHwnd -eq [IntPtr]::Zero; $attempt++)",
        "{",

        "    $windows = [RecorderWindows]::GetWindows([uint32]$proc.Id)",

        "    foreach ($window in $windows)",
        "    {",

        "        $title = [RecorderWindows]::GetTitle($window)",

        "        if ($window -ne $browserHwnd -and $title -match 'DevTools')",
        "        {",
        "            $devHwnd = $window",
        "            break",
        "        }",

        "    }",

        "    if ($devHwnd -eq [IntPtr]::Zero)",
        "    {",
        "        Start-Sleep -Milliseconds 300",
        "    }",

        "}",


        "if ($devHwnd -eq [IntPtr]::Zero)",
        "{",

        "    $windows = [RecorderWindows]::GetWindows([uint32]$proc.Id)",

        "    foreach ($window in $windows)",
        "    {",

        "        if ($window -ne $browserHwnd)",
        "        {",
        "            $devHwnd = $window",
        "            break",
        "        }",

        "    }",

        "}",


        "if ($devHwnd -eq [IntPtr]::Zero)",
        "{",
        "    exit",
        "}",


        // --------------------------------------------------------
        // Maximize DevTools
        // --------------------------------------------------------

        "[RecorderWin32]::SetForegroundWindow($devHwnd) | Out-Null",

        "[RecorderWin32]::ShowWindow($devHwnd, 3) | Out-Null",

        "Start-Sleep -Milliseconds 700",


        // --------------------------------------------------------
        // Get UI Automation element
        // --------------------------------------------------------

        "$root = [System.Windows.Automation.AutomationElement]::RootElement",

        "$windowCondition = New-Object System.Windows.Automation.PropertyCondition(",
        "    [System.Windows.Automation.AutomationElement]::ProcessIdProperty,",
        "    $proc.Id",
        ")",

        "$devWindows = $root.FindAll(",
        "    [System.Windows.Automation.TreeScope]::Children,",
        "    $windowCondition",
        ")",

        "$devEl = $null",

        "foreach ($w in $devWindows)",
        "{",

        "    try",
        "    {",

        "        if ($w.Current.NativeWindowHandle -eq $devHwnd.ToInt64())",
        "        {",
        "            $devEl = $w",
        "            break",
        "        }",

        "    }",
        "    catch {}",

        "}",


        "if (-not $devEl)",
        "{",
        "    exit",
        "}",


        // --------------------------------------------------------
        // Helper: find named element
        // --------------------------------------------------------

        "function Find-ByName",
        "{",

        "    param(",
        "        [System.Windows.Automation.AutomationElement]$rootElement,",
        "        [string]$name",
        "    )",

        "    $condition = New-Object System.Windows.Automation.PropertyCondition(",
        "        [System.Windows.Automation.AutomationElement]::NameProperty,",
        "        $name,",
        "        [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase",
        "    )",

        "    return $rootElement.FindFirst(",
        "        [System.Windows.Automation.TreeScope]::Descendants,",
        "        $condition",
        "    )",

        "}",


        // --------------------------------------------------------
        // Helper: click element
        // --------------------------------------------------------

        "function Click-Element",
        "{",

        "    param(",
        "        [System.Windows.Automation.AutomationElement]$element",
        "    )",

        "    if (-not $element)",
        "    {",
        "        return $false",
        "    }",

        "    try",
        "    {",

        "        $invoke = $element.GetCurrentPattern(",
        "            [System.Windows.Automation.InvokePattern]::Pattern",
        "        )",

        "        $invoke.Invoke()",

        "        return $true",

        "    }",
        "    catch {}",

        "    try",
        "    {",

        "        $select = $element.GetCurrentPattern(",
        "            [System.Windows.Automation.SelectionItemPattern]::Pattern",
        "        )",

        "        $select.Select()",

        "        return $true",

        "    }",
        "    catch {}",

        "    try",
        "    {",

        "        $rect = $element.Current.BoundingRectangle",

        "        if ($rect.Width -gt 0 -and $rect.Height -gt 0)",
        "        {",

        "            [RecorderWin32]::Click(",
        "                [int]($rect.X + $rect.Width / 2),",
        "                [int]($rect.Y + $rect.Height / 2)",
        "            )",

        "            return $true",
        "        }",

        "    }",
        "    catch {}",

        "    return $false",

        "}",


        // --------------------------------------------------------
        // Network panel
        // --------------------------------------------------------

        "$network = Find-ByName $devEl 'Network'",

        "if ($network)",
        "{",
        "    Click-Element $network | Out-Null",
        "}",

        "Start-Sleep -Milliseconds 700",


        // --------------------------------------------------------
        // Reload page
        // --------------------------------------------------------

        "[RecorderWin32]::SetForegroundWindow($browserHwnd) | Out-Null",

        "$wsh.AppActivate($proc.Id) | Out-Null",

        "$wsh.SendKeys('{F5}')",

        "Start-Sleep -Milliseconds 3000",


        // --------------------------------------------------------
        // Return to DevTools
        // --------------------------------------------------------

        "[RecorderWin32]::SetForegroundWindow($devHwnd) | Out-Null",

        "Start-Sleep -Milliseconds 700",


        // Refresh UIA tree
        "$devWindows = $root.FindAll(",
        "    [System.Windows.Automation.TreeScope]::Children,",
        "    $windowCondition",
        ")",

        "$devEl = $null",

        "foreach ($w in $devWindows)",
        "{",

        "    try",
        "    {",

        "        if ($w.Current.NativeWindowHandle -eq $devHwnd.ToInt64())",
        "        {",
        "            $devEl = $w",
        "            break",
        "        }",
        "    }",
        "    catch {}",

        "}",


        // --------------------------------------------------------
        // Find network request row
        // --------------------------------------------------------

        "function Find-RequestRow",
        "{",

        "    param(",
        "        [System.Windows.Automation.AutomationElement]$rootElement",
        "    )",

        "    $items = $rootElement.FindAll(",
        "        [System.Windows.Automation.TreeScope]::Descendants,",
        "        (New-Object System.Windows.Automation.PropertyCondition(",
        "            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,",
        "            [System.Windows.Automation.ControlType]::DataItem",
        "        ))",
        "    )",

        "    foreach ($item in $items)",
        "    {",

        "        try",
        "        {",

        "            $name = [string]$item.Current.Name",

        "            if ($name -like ('*' + $rowTail + '*'))",
        "            {",
        "                return $item",
        "            }",

        "        }",
        "        catch {}",

        "    }",

        "    return $null",

        "}",


        "$requestRow = $null",

        "for ($i = 0; $i -lt 20 -and -not $requestRow; $i++)",
        "{",

        "    $requestRow = Find-RequestRow $devEl",

        "    if (-not $requestRow)",
        "    {",
        "        Start-Sleep -Milliseconds 400",
        "    }",

        "}",


        "if ($requestRow)",
        "{",

        "    Click-Element $requestRow | Out-Null",

        "    Start-Sleep -Milliseconds 700",

        "}",


        // --------------------------------------------------------
        // Refresh UIA tree
        // --------------------------------------------------------

        "$devWindows = $root.FindAll(",
        "    [System.Windows.Automation.TreeScope]::Children,",
        "    $windowCondition",
        ")",

        "$devEl = $null",

        "foreach ($w in $devWindows)",
        "{",

        "    try",
        "    {",

        "        if ($w.Current.NativeWindowHandle -eq $devHwnd.ToInt64())",
        "        {",
        "            $devEl = $w",
        "            break",
        "        }",
        "    }",
        "    catch {}",

        "}",


        // --------------------------------------------------------
        // Headers tab
        // --------------------------------------------------------

        "$headers = Find-ByName $devEl 'Headers'",

        "if ($headers)",
        "{",

        "    Click-Element $headers | Out-Null",

        "    Start-Sleep -Milliseconds 600",

        "}",


        // --------------------------------------------------------
        // Refresh UIA again
        // --------------------------------------------------------

        "$devWindows = $root.FindAll(",
        "    [System.Windows.Automation.TreeScope]::Children,",
        "    $windowCondition",
        ")",

        "$devEl = $null",

        "foreach ($w in $devWindows)",
        "{",

        "    try",
        "    {",

        "        if ($w.Current.NativeWindowHandle -eq $devHwnd.ToInt64())",
        "        {",
        "            $devEl = $w",
        "            break",
        "        }",
        "    }",
        "    catch {}",

        "}",


        // ========================================================
        // RESPONSE HEADERS
        //
        // We do NOT want response header values.
        // Collapse the Response Headers section.
        // ========================================================

        "function Find-Section",
        "{",

        "    param(",
        "        [System.Windows.Automation.AutomationElement]$rootElement,",
        "        [string]$pattern",
        "    )",

        "    $all = $rootElement.FindAll(",
        "        [System.Windows.Automation.TreeScope]::Descendants,",
        "        [System.Windows.Automation.Condition]::TrueCondition",
        "    )",

        "    foreach ($e in $all)",
        "    {",

        "        try",
        "        {",

        "            $name = [string]$e.Current.Name",

        "            if ($name -match $pattern)",
        "            {",
        "                return $e",
        "            }",

        "        }",
        "        catch {}",

        "    }",

        "    return $null",

        "}",


        "$responseSection = Find-Section $devEl '^Response headers?'",


        "if ($responseSection)",
        "{",

        "    try",
        "    {",

        "        $expand = $responseSection.GetCurrentPattern(",
        "            [System.Windows.Automation.ExpandCollapsePattern]::Pattern",
        "        )",

        "        if ($expand.Current.ExpandCollapseState -eq [System.Windows.Automation.ExpandCollapseState]::Expanded)",
        "        {",
        "            $expand.Collapse()",
        "        }",

        "    }",
        "    catch",
        "    {",

        "        try",
        "        {",
        "            Click-Element $responseSection | Out-Null",
        "        }",
        "        catch {}",

        "    }",

        "    Start-Sleep -Milliseconds 500",

        "}",


        // ========================================================
        // REQUEST HEADERS
        //
        // THIS IS THE ONLY HEADER SECTION WE TARGET.
        // ========================================================

        "$requestHeaders = Find-Section $devEl '^Request headers?'",


        "if ($requestHeaders)",
        "{",

        "    try",
        "    {",

        "        $expand = $requestHeaders.GetCurrentPattern(",
        "            [System.Windows.Automation.ExpandCollapsePattern]::Pattern",
        "        )",

        "        if ($expand.Current.ExpandCollapseState -eq [System.Windows.Automation.ExpandCollapseState]::Collapsed)",
        "        {",

        "            $expand.Expand()",

        "            Start-Sleep -Milliseconds 700",

        "        }",

        "    }",
        "    catch",
        "    {",

        "        Click-Element $requestHeaders | Out-Null",

        "        Start-Sleep -Milliseconds 700",

        "    }",

        "}",


        // ========================================================
        // SCROLL REQUEST HEADERS INTO VIEW
        // ========================================================

        "if ($requestHeaders)",
        "{",

        "    try",
        "    {",

        "        $scroll = $requestHeaders.GetCurrentPattern(",
        "            [System.Windows.Automation.ScrollItemPattern]::Pattern",
        "        )",

        "        $scroll.ScrollIntoView()",

        "        Start-Sleep -Milliseconds 500",

        "    }",
        "    catch {}",

        "}",


        // --------------------------------------------------------
        // If ScrollItemPattern didn't move it enough,
        // use the mouse wheel while the cursor is over Request Headers.
        // --------------------------------------------------------

        "for ($i = 0; $i -lt 8; $i++)",
        "{",

        "    if (-not $requestHeaders)",
        "    {",
        "        break",
        "    }",

        "    try",
        "    {",

        "        $rect = $requestHeaders.Current.BoundingRectangle",

        "        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea",

        "        $targetY = $screen.Top + 250",

        "        if ($rect.Top -gt $targetY)",
        "        {",

        "            [RecorderWin32]::Move(",
        "                [int]($rect.X + 50),",
        "                [int]($rect.Y + 10)",
        "            )",

        "            [RecorderWin32]::Wheel(-500)",

        "            Start-Sleep -Milliseconds 300",

        "        }",
        "        elseif ($rect.Top -lt ($screen.Top + 120))",
        "        {",

        "            [RecorderWin32]::Move(",
        "                [int]($rect.X + 50),",
        "                [int]($rect.Y + 10)",
        "            )",

        "            [RecorderWin32]::Wheel(350)",

        "            Start-Sleep -Milliseconds 300",

        "        }",
        "        else",
        "        {",

        "            break",

        "        }",

        "    }",
        "    catch",
        "    {",
        "        break",
        "    }",

        "}",


        // ========================================================
        // FINAL FOCUS
        // ========================================================

        "[RecorderWin32]::SetForegroundWindow($devHwnd) | Out-Null",

        "Start-Sleep -Milliseconds 400",


        // ========================================================
        // SCREENSHOT
        //
        // Direct screen capture.
        // NO PRINT.
        // NO PDF.
        // NO Ctrl+P.
        // ========================================================

        "try",
        "{",

        "    [RecorderWin32]::Screenshot($shotPath)",

        "}",
        "catch",
        "{",

        "    try",
        "    {",

        "        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds",

        "        $bmp = New-Object System.Drawing.Bitmap(",
        "            $bounds.Width,",
        "            $bounds.Height",
        "        )",

        "        $graphics = [System.Drawing.Graphics]::FromImage($bmp)",

        "        $graphics.CopyFromScreen(",
        "            $bounds.Location,",
        "            [System.Drawing.Point]::Empty,",
        "            $bounds.Size",
        "        )",

        "        $bmp.Save(",
        "            $shotPath,",
        "            [System.Drawing.Imaging.ImageFormat]::Png",
        "        )",

        "        $graphics.Dispose()",

        "        $bmp.Dispose()",

        "    }",
        "    catch {}",

        "}",


        "exit"

    ];


    return lines.join('\n');
}


// ============================================================
// RUN WINDOWS AUTOMATION
// ============================================================

function runAutomation(
    browserName,
    site,
    screenshotPath
) {

    const script =
        makePowerShellScript(
            browserName,
            site.rowTail,
            screenshotPath
        );

    const encoded =
        Buffer
            .from(
                script,
                'utf16le'
            )
            .toString('base64');


    const child =
        spawn(
            'powershell.exe',
            [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-EncodedCommand',
                encoded
            ],
            {
                windowsHide: true,
                stdio: [
                    'ignore',
                    'pipe',
                    'pipe'
                ]
            }
        );


    child.stdout.on(
        'data',
        data => {

            const text =
                data.toString().trim();

            if (text) {
                console.log(
                    '[PS]',
                    text
                );
            }
        }
    );


    child.stderr.on(
        'data',
        data => {

            const text =
                data.toString().trim();

            if (text) {
                console.error(
                    '[PS]',
                    text
                );
            }
        }
    );


    return child;
}


// ============================================================
// CLOSE BROWSER
// ============================================================

async function closeBrowser(
    browserName
) {

    const ps = [

        "$names = @(" +
            "'" +
            browserName.replace(/'/g, "''") +
            ".exe'",
        ",",
        "'" +
            browserName.replace(/'/g, "''") +
            "'",
        ")",

        "foreach ($name in $names)",
        "{",

        "    Get-Process $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue",

        "}"

    ].join(' ');


    try {

        await runPowerShell(
            ps,
            true
        );

    } catch {}
}


// ============================================================
// OPEN SCREENSHOT FOLDER
// ============================================================

function openScreenshotFolder() {

    runDetached(
        'explorer.exe',
        [screenshots]
    );
}


// ============================================================
// MAIN
// ============================================================

async function main() {

    const forcedBrowser =
        getBrowserArgument();

    const browserName =
        forcedBrowser ||
        getDefaultBrowser();


    console.log(
        'Browser:',
        browserName
    );

    console.log(
        'Screenshots:',
        screenshots
    );


    const results = [];


    for (
        const site
        of SITES
    ) {

        console.log('');
        console.log(
            '========================================'
        );

        console.log(
            'Starting:',
            site.name
        );

        console.log(
            '========================================'
        );


        const screenshotPath =
            path.join(
                screenshots,
                `${site.name}_insta.png`
            );


        // Remove previous screenshot.
        try {

            if (
                fs.existsSync(
                    screenshotPath
                )
            ) {

                fs.unlinkSync(
                    screenshotPath
                );

            }

        } catch {}


        console.log(
            'Opening browser...'
        );


        const opened =
            openBrowser(
                browserName,
                site.url
            );


        if (!opened) {

            results.push({
                site: site.name,
                success: false
            });

            continue;
        }


        // --------------------------------------------------------
        // Give Chrome enough time to create its window.
        // --------------------------------------------------------

        await sleep(1500);


        console.log(
            'Starting DevTools automation...'
        );


        const automation =
            runAutomation(
                browserName,
                site,
                screenshotPath
            );


        // --------------------------------------------------------
        // Wait for ACTUAL screenshot.
        //
        // No done.flag.
        // No temp file.
        // No log file.
        // --------------------------------------------------------

        let elapsed = 0;

        while (
            !fs.existsSync(
                screenshotPath
            ) &&
            elapsed < 60
        ) {

            await sleep(300);

            elapsed += 0.3;

        }


        const success =
            fs.existsSync(
                screenshotPath
            );


        if (success) {

            console.log(
                'Screenshot captured:',
                screenshotPath
            );

        } else {

            console.log(
                'Screenshot was not captured.'
            );

        }


        results.push({

            site: site.name,

            success,

            screenshotPath

        });


        // --------------------------------------------------------
        // Stop PowerShell automation if it is still running.
        // --------------------------------------------------------

        try {

            if (
                automation &&
                !automation.killed
            ) {

                automation.kill();
            }

        } catch {}


        // --------------------------------------------------------
        // Close browser.
        // --------------------------------------------------------

        console.log(
            'Closing browser...'
        );

        await closeBrowser(
            browserName
        );


        await sleep(1000);

    }


    // ============================================================
    // RESULT
    // ============================================================

    console.log('');
    console.log(
        '========================================'
    );

    console.log(
        'Finished'
    );

    console.log(
        '========================================'
    );


    const successful =
        results.filter(
            item => item.success
        );


    for (
        const result
        of results
    ) {

        console.log(

            result.site +
            ': ' +
            (
                result.success
                    ? 'OK'
                    : 'FAILED'
            )

        );

    }


    if (
        successful.length > 0
    ) {

        console.log('');
        console.log(
            'Opening screenshot folder...'
        );

        openScreenshotFolder();

    } else {

        console.log('');
        console.log(
            'No screenshots were captured.'
        );

    }

}


// ============================================================
// START
// ============================================================

main().catch(
    error => {

        console.error(
            error
        );

        process.exit(1);

    }
);
