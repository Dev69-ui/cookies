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
    console.error('This record.js requires Windows.');
    process.exit(1);
}


// ============================================================
// CONFIG
// ============================================================

const SCREENSHOT_DIR = path.join(
    os.homedir(),
    'Pictures',
    'Screenshots'
);

fs.mkdirSync(
    SCREENSHOT_DIR,
    {
        recursive: true
    }
);


// ============================================================
// SITES
// ============================================================

const SITES = [
    {
        name: 'instagram',
        url: 'https://www.instagram.com/instagram/?__a=1',
        requestName: 'instagram/?__a=1'
    },

    {
        name: 'facebook',
        url: 'https://www.facebook.com/facebook/?__a=1',
        requestName: 'facebook/?__a=1'
    }
];


// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}


function getRegistryValue(
    key,
    value
) {

    try {

        const output = execFileSync(
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

        const lines = output
            .split(/\r?\n/)
            .map(x => x.trim())
            .filter(Boolean);

        for (const line of lines) {

            if (
                line
                    .toLowerCase()
                    .startsWith(value.toLowerCase())
            ) {

                const parts = line.split(/\s{2,}/);

                if (parts.length >= 3) {
                    return parts.slice(2).join(' ').trim();
                }
            }
        }

    } catch {}

    return null;
}


// ============================================================
// DETECT BROWSER
// ============================================================

function detectBrowser() {

    const forced =
        process.argv.find(
            arg =>
                [
                    '--chrome',
                    '--msedge',
                    '--edge',
                    '--brave',
                    '--opera'
                ].includes(arg)
        );

    if (forced) {

        if (forced === '--edge') {
            return 'msedge';
        }

        return forced.substring(2);
    }


    const progId = getRegistryValue(
        'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice',
        'ProgId'
    );


    if (progId) {

        if (/MSEdgeHTM/i.test(progId)) {
            return 'msedge';
        }

        if (/ChromeHTML/i.test(progId)) {
            return 'chrome';
        }

        if (/BraveHTML/i.test(progId)) {
            return 'brave';
        }

        if (/Opera/i.test(progId)) {
            return 'opera';
        }
    }


    return 'msedge';
}


// ============================================================
// FIND BROWSER EXE
// ============================================================

function findBrowserExecutable(
    browser
) {

    const exe =
        browser + '.exe';


    const appPaths = [

        `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`,

        `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`,

        `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`

    ];


    for (const key of appPaths) {

        const value =
            getRegistryValue(
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
                .map(x => x.trim())
                .find(Boolean);

        if (
            first &&
            fs.existsSync(first)
        ) {

            return first;
        }

    } catch {}


    const common = {

        chrome: [
            path.join(
                process.env.PROGRAMFILES || '',
                'Google',
                'Chrome',
                'Application',
                'chrome.exe'
            ),

            path.join(
                process.env.LOCALAPPDATA || '',
                'Google',
                'Chrome',
                'Application',
                'chrome.exe'
            )
        ],

        msedge: [
            path.join(
                process.env.PROGRAMFILES || '',
                'Microsoft',
                'Edge',
                'Application',
                'msedge.exe'
            ),

            path.join(
                process.env['PROGRAMFILES(X86)'] || '',
                'Microsoft',
                'Edge',
                'Application',
                'msedge.exe'
            ),

            path.join(
                process.env.LOCALAPPDATA || '',
                'Microsoft',
                'Edge',
                'Application',
                'msedge.exe'
            )
        ],

        brave: [
            path.join(
                process.env.PROGRAMFILES || '',
                'BraveSoftware',
                'Brave-Browser',
                'Application',
                'brave.exe'
            ),

            path.join(
                process.env.LOCALAPPDATA || '',
                'BraveSoftware',
                'Brave-Browser',
                'Application',
                'brave.exe'
            )
        ]

    };


    const candidates =
        common[browser] || [];


    for (
        const candidate
        of candidates
    ) {

        if (
            fs.existsSync(candidate)
        ) {

            return candidate;
        }
    }


    return null;
}


// ============================================================
// OPEN BROWSER
// ============================================================

function openBrowser(
    executable,
    url
) {

    try {

        const child =
            spawn(
                executable,
                [
                    '--no-first-run',
                    '--disable-default-apps',
                    url
                ],
                {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: false
                }
            );

        child.unref();

        return true;

    } catch (error) {

        console.error(
            'Browser launch failed:',
            error.message
        );

        return false;
    }
}


// ============================================================
// POWERSELL SCRIPT
//
// IMPORTANT:
// This function returns a normal string.
//
// It is NOT passed through -EncodedCommand.
//
// It will be piped through stdin.
// Therefore there is no ENAMETOOLONG.
// ============================================================

function buildPowerShellScript(
    browser,
    requestName,
    screenshotPath
) {

    const browserSafe =
        browser.replace(
            /'/g,
            "''"
        );

    const requestSafe =
        requestName.replace(
            /'/g,
            "''"
        );

    const screenshotSafe =
        screenshotPath.replace(
            /'/g,
            "''"
        );


    return `
$ErrorActionPreference = 'SilentlyContinue'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes


Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public static class RecorderNative
{
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(
        IntPtr hWnd,
        StringBuilder text,
        int max
    );

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(
        IntPtr hWnd,
        out uint processId
    );

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(
        EnumWindowsProc callback,
        IntPtr lParam
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

    public delegate bool EnumWindowsProc(
        IntPtr hWnd,
        IntPtr lParam
    );

    private static List<IntPtr> windows =
        new List<IntPtr>();

    private static bool Callback(
        IntPtr hWnd,
        IntPtr lParam
    )
    {
        if (
            IsWindowVisible(hWnd) &&
            GetWindowTextLength(hWnd) > 0
        )
        {
            windows.Add(hWnd);
        }

        return true;
    }

    public static List<IntPtr> GetVisibleWindows()
    {
        windows =
            new List<IntPtr>();

        EnumWindows(
            new EnumWindowsProc(Callback),
            IntPtr.Zero
        );

        return windows;
    }

    public static string Title(
        IntPtr hWnd
    )
    {
        int len =
            GetWindowTextLength(hWnd);

        if (len <= 0)
            return "";

        StringBuilder sb =
            new StringBuilder(len + 1);

        GetWindowText(
            hWnd,
            sb,
            sb.Capacity
        );

        return sb.ToString();
    }

    public static void Click(
        int x,
        int y
    )
    {
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

    public static void Wheel(
        int amount
    )
    {
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
    )
    {
        var bounds =
            System.Windows.Forms.Screen
                .PrimaryScreen
                .Bounds;

        using (
            var bmp =
                new System.Drawing.Bitmap(
                    bounds.Width,
                    bounds.Height
                )
        )
        {
            using (
                var g =
                    System.Drawing.Graphics
                        .FromImage(bmp)
            )
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
'@


$browserName = '$browserSafe'
$requestName = '$requestSafe'
$screenshot = '$screenshotSafe'


# ============================================================
# FIND BROWSER PROCESS
# ============================================================

$browserProcess = $null

for (
    $attempt = 0;
    $attempt -lt 50 -and -not $browserProcess;
    $attempt++
)
{
    $browserProcess =
        Get-Process $browserName `
            -ErrorAction SilentlyContinue |
        Where-Object {
            $_.MainWindowHandle -ne 0
        } |
        Select-Object -First 1

    if (-not $browserProcess)
    {
        Start-Sleep -Milliseconds 300
    }
}


if (-not $browserProcess)
{
    exit 10
}


$browserHwnd =
    $browserProcess.MainWindowHandle


# ============================================================
# FOCUS BROWSER
# ============================================================

[RecorderNative]::ShowWindow(
    $browserHwnd,
    3
) | Out-Null

[RecorderNative]::SetForegroundWindow(
    $browserHwnd
) | Out-Null

Start-Sleep -Milliseconds 700


$wsh =
    New-Object -ComObject WScript.Shell


$wsh.AppActivate(
    $browserProcess.Id
) | Out-Null


# ============================================================
# OPEN DEVTOOLS
# ============================================================

$wsh.SendKeys('{F12}')

Start-Sleep -Milliseconds 1800


# ============================================================
# TRY TO UNDOCK DEVTOOLS
# ============================================================

$wsh.SendKeys('^+d')

Start-Sleep -Milliseconds 1000


# ============================================================
# FIND DEVTOOLS WINDOW
#
# IMPORTANT:
# Do NOT restrict this to the browser PID.
#
# Undocked Chrome/Edge DevTools can have a different process.
# ============================================================

$devToolsHwnd =
    [IntPtr]::Zero


for (
    $attempt = 0;
    $attempt -lt 40 -and
    $devToolsHwnd -eq [IntPtr]::Zero;
    $attempt++
)
{
    $windows =
        [RecorderNative]::GetVisibleWindows()

    foreach (
        $window
        in $windows
    )
    {
        $title =
            [RecorderNative]::Title(
                $window
            )

        if (
            $title -match 'DevTools'
        )
        {
            $devToolsHwnd =
                $window

            break
        }
    }

    if (
        $devToolsHwnd -eq [IntPtr]::Zero
    )
    {
        Start-Sleep -Milliseconds 300
    }
}


if (
    $devToolsHwnd -eq [IntPtr]::Zero
)
{
    exit 11
}


# ============================================================
# MAXIMIZE DEVTOOLS
# ============================================================

[RecorderNative]::ShowWindow(
    $devToolsHwnd,
    3
) | Out-Null

[RecorderNative]::SetForegroundWindow(
    $devToolsHwnd
) | Out-Null

Start-Sleep -Milliseconds 800


# ============================================================
# UI AUTOMATION ROOT
# ============================================================

$root =
    [System.Windows.Automation.AutomationElement]::RootElement


# ============================================================
# FIND DEVTOOLS AUTOMATION WINDOW
# ============================================================

$devElement = $null


$children =
    $root.FindAll(
        [System.Windows.Automation.TreeScope]::Children,
        [System.Windows.Automation.Condition]::TrueCondition
    )


foreach (
    $window
    in $children
)
{
    try
    {
        $title =
            [string]$window.Current.Name

        if (
            $title -match 'DevTools'
        )
        {
            $devElement =
                $window

            break
        }
    }
    catch {}
}


if (-not $devElement)
{
    exit 12
}


# ============================================================
# CLICK BY NAME
# ============================================================

function Find-Name
{
    param(
        [System.Windows.Automation.AutomationElement]$Root,
        [string]$Name
    )

    try
    {
        $condition =
            New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::NameProperty,
                $Name,
                [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase
            )

        return $Root.FindFirst(
            [System.Windows.Automation.TreeScope]::Descendants,
            $condition
        )
    }
    catch
    {
        return $null
    }
}


function Click-Element
{
    param(
        [System.Windows.Automation.AutomationElement]$Element
    )

    if (-not $Element)
    {
        return $false
    }


    try
    {
        $pattern =
            $Element.GetCurrentPattern(
                [System.Windows.Automation.InvokePattern]::Pattern
            )

        $pattern.Invoke()

        return $true
    }
    catch {}


    try
    {
        $pattern =
            $Element.GetCurrentPattern(
                [System.Windows.Automation.SelectionItemPattern]::Pattern
            )

        $pattern.Select()

        return $true
    }
    catch {}


    try
    {
        $rect =
            $Element.Current.BoundingRectangle

        if (
            $rect.Width -gt 0 -and
            $rect.Height -gt 0
        )
        {
            [RecorderNative]::Click(
                [int]($rect.X + $rect.Width / 2),
                [int]($rect.Y + $rect.Height / 2)
            )

            return $true
        }
    }
    catch {}


    return $false
}


# ============================================================
# NETWORK TAB
# ============================================================

$network =
    Find-Name $devElement 'Network'


if ($network)
{
    Click-Element $network | Out-Null
}


Start-Sleep -Milliseconds 800


# ============================================================
# RELOAD PAGE
# ============================================================

[RecorderNative]::SetForegroundWindow(
    $browserHwnd
) | Out-Null

$wsh.AppActivate(
    $browserProcess.Id
) | Out-Null

$wsh.SendKeys('{F5}')


Start-Sleep -Milliseconds 3500


# ============================================================
# BACK TO DEVTOOLS
# ============================================================

[RecorderNative]::SetForegroundWindow(
    $devToolsHwnd
) | Out-Null

Start-Sleep -Milliseconds 700


# ============================================================
# REFRESH DEVTOOLS AUTOMATION ELEMENT
# ============================================================

$children =
    $root.FindAll(
        [System.Windows.Automation.TreeScope]::Children,
        [System.Windows.Automation.Condition]::TrueCondition
    )


$devElement = $null


foreach (
    $window
    in $children
)
{
    try
    {
        $title =
            [string]$window.Current.Name

        if (
            $title -match 'DevTools'
        )
        {
            $devElement =
                $window

            break
        }
    }
    catch {}
}


# ============================================================
# FIND REQUEST ROW
# ============================================================

function Find-Request
{
    param(
        [System.Windows.Automation.AutomationElement]$Root,
        [string]$Search
    )


    $items =
        $Root.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            (New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::DataItem
            ))
        )


    foreach (
        $item
        in $items
    )
    {
        try
        {
            $name =
                [string]$item.Current.Name

            if (
                $name -like ('*' + $Search + '*')
            )
            {
                return $item
            }
        }
        catch {}
    }


    return $null
}


$request =
    $null


for (
    $attempt = 0;
    $attempt -lt 30 -and -not $request;
    $attempt++
)
{
    $request =
        Find-Request `
            $devElement `
            $requestName

    if (-not $request)
    {
        Start-Sleep -Milliseconds 400
    }
}


if ($request)
{
    Click-Element $request | Out-Null

    Start-Sleep -Milliseconds 800
}


# ============================================================
# HEADERS TAB
# ============================================================

$headers =
    Find-Name $devElement 'Headers'


if ($headers)
{
    Click-Element $headers | Out-Null
}


Start-Sleep -Milliseconds 800


# ============================================================
# FIND RESPONSE HEADERS
# ============================================================

function Find-TextElement
{
    param(
        [System.Windows.Automation.AutomationElement]$Root,
        [string]$Regex
    )


    $all =
        $Root.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )


    foreach (
        $element
        in $all
    )
    {
        try
        {
            $name =
                [string]$element.Current.Name

            if (
                $name -match $Regex
            )
            {
                return $element
            }
        }
        catch {}
    }


    return $null
}


$responseHeaders =
    Find-TextElement `
        $devElement `
        '^Response Headers?$'


# ============================================================
# COLLAPSE RESPONSE HEADERS
# ============================================================

if ($responseHeaders)
{
    try
    {
        $expand =
            $responseHeaders.GetCurrentPattern(
                [System.Windows.Automation.ExpandCollapsePattern]::Pattern
            )


        if (
            $expand.Current.ExpandCollapseState -eq
            [System.Windows.Automation.ExpandCollapseState]::Expanded
        )
        {
            $expand.Collapse()
        }
    }
    catch
    {
        Click-Element $responseHeaders | Out-Null
    }
}


Start-Sleep -Milliseconds 500


# ============================================================
# FIND REQUEST HEADERS
# ============================================================

$requestHeaders =
    Find-TextElement `
        $devElement `
        '^Request Headers?$'


# ============================================================
# EXPAND REQUEST HEADERS
# ============================================================

if ($requestHeaders)
{
    try
    {
        $expand =
            $requestHeaders.GetCurrentPattern(
                [System.Windows.Automation.ExpandCollapsePattern]::Pattern
            )


        if (
            $expand.Current.ExpandCollapseState -eq
            [System.Windows.Automation.ExpandCollapseState]::Collapsed
        )
        {
            $expand.Expand()
        }
    }
    catch
    {
        Click-Element $requestHeaders | Out-Null
    }
}


Start-Sleep -Milliseconds 700


# ============================================================
# SCROLL REQUEST HEADERS INTO VIEW
# ============================================================

if ($requestHeaders)
{
    try
    {
        $scroll =
            $requestHeaders.GetCurrentPattern(
                [System.Windows.Automation.ScrollItemPattern]::Pattern
            )

        $scroll.ScrollIntoView()
    }
    catch {}
}


Start-Sleep -Milliseconds 500


# ============================================================
# EXTRA MANUAL SCROLL
#
# This is only a fallback if UIAutomation did not scroll
# the Request Headers section into view.
# ============================================================

if ($requestHeaders)
{
    try
    {
        $rect =
            $requestHeaders.Current.BoundingRectangle


        if (
            $rect.Width -gt 0 -and
            $rect.Height -gt 0
        )
        {
            [RecorderNative]::SetCursorPos(
                [int]($rect.X + 50),
                [int]($rect.Y + 20)
            )


            [RecorderNative]::Wheel(
                -500
            )


            Start-Sleep -Milliseconds 500
        }
    }
    catch {}
}


# ============================================================
# SECOND ATTEMPT TO FIND REQUEST HEADERS
# ============================================================

if (-not $requestHeaders)
{
    $requestHeaders =
        Find-TextElement `
            $devElement `
            '^Request Headers?$'
}


# ============================================================
# FINAL SCROLL
# ============================================================

if ($requestHeaders)
{
    try
    {
        $scroll =
            $requestHeaders.GetCurrentPattern(
                [System.Windows.Automation.ScrollItemPattern]::Pattern
            )

        $scroll.ScrollIntoView()
    }
    catch {}
}


Start-Sleep -Milliseconds 800


# ============================================================
# FINAL SCREENSHOT
#
# NO CTRL+P
# NO PRINT
# NO PDF
# ============================================================

[RecorderNative]::SetForegroundWindow(
    $devToolsHwnd
) | Out-Null


Start-Sleep -Milliseconds 300


try
{
    [RecorderNative]::Screenshot(
        $screenshot
    )
}
catch
{
    try
    {
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
            $screenshot,
            [System.Drawing.Imaging.ImageFormat]::Png
        )


        $graphics.Dispose()
        $bitmap.Dispose()
    }
    catch {}
}


exit 0
`;
}


// ============================================================
// RUN POWERSHELL THROUGH STDIN
//
// THIS IS THE IMPORTANT FIX.
//
// Previously:
// powershell.exe -EncodedCommand HUGE_STRING
//
// Now:
// powershell.exe -Command -
// and the script is written to stdin.
//
// Therefore Windows never has to parse a giant command line.
// ============================================================

function runAutomation(
    browser,
    requestName,
    screenshotPath
) {

    const script =
        buildPowerShellScript(
            browser,
            requestName,
            screenshotPath
        );


    const child =
        spawn(
            'powershell.exe',
            [
                '-NoLogo',
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
                    'pipe',
                    'pipe'
                ]
            }
        );


    child.stdout.on(
        'data',
        data => {

            const text =
                data
                    .toString()
                    .trim();

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
                data
                    .toString()
                    .trim();

            if (text) {
                console.error(
                    '[PS]',
                    text
                );
            }
        }
    );


    child.on(
        'error',
        error => {

            console.error(
                '[PowerShell error]',
                error.message
            );

        }
    );


    child.stdin.write(
        script,
        'utf8'
    );

    child.stdin.end();


    return child;
}


// ============================================================
// CLOSE BROWSER
// ============================================================

async function closeBrowser(
    browser
) {

    const script = `
$ErrorActionPreference = 'SilentlyContinue'

Get-Process '${browser.replace(/'/g, "''")}' |
    Stop-Process -Force -ErrorAction SilentlyContinue
`;


    return new Promise(
        resolve => {

            const child =
                spawn(
                    'powershell.exe',
                    [
                        '-NoLogo',
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


            child.on(
                'close',
                resolve
            );


            child.stdin.write(
                script
            );

            child.stdin.end();

        }
    );
}


// ============================================================
// WAIT FOR SCREENSHOT
// ============================================================

async function waitForFile(
    file,
    timeoutMs
) {

    const start =
        Date.now();


    while (
        Date.now() - start <
        timeoutMs
    ) {

        try {

            if (
                fs.existsSync(file)
            ) {

                const stat =
                    fs.statSync(file);

                if (
                    stat.size > 1000
                ) {

                    return true;
                }
            }

        } catch {}


        await sleep(250);
    }


    return false;
}


// ============================================================
// MAIN
// ============================================================

async function main() {

    const browser =
        detectBrowser();


    console.log(
        'Browser:',
        browser
    );


    console.log(
        'Screenshots:',
        SCREENSHOT_DIR
    );


    const executable =
        findBrowserExecutable(
            browser
        );


    if (!executable) {

        console.error(
            'Browser executable not found:',
            browser
        );

        process.exit(1);
    }


    console.log(
        'Executable:',
        executable
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
                SCREENSHOT_DIR,
                `${site.name}_network.png`
            );


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
                executable,
                site.url
            );


        if (!opened) {

            console.error(
                'Could not open browser.'
            );

            results.push({
                site: site.name,
                success: false
            });

            continue;
        }


        await sleep(1800);


        console.log(
            'Starting DevTools automation...'
        );


        let automation;


        try {

            automation =
                runAutomation(
                    browser,
                    site.requestName,
                    screenshotPath
                );

        } catch (error) {

            console.error(
                'Automation failed:',
                error.message
            );

            results.push({
                site: site.name,
                success: false
            });

            continue;
        }


        console.log(
            'Waiting for screenshot...'
        );


        const success =
            await waitForFile(
                screenshotPath,
                60000
            );


        if (success) {

            console.log(
                'Screenshot captured:'
            );

            console.log(
                screenshotPath
            );

        } else {

            console.error(
                'Screenshot was not created.'
            );

        }


        results.push({

            site: site.name,

            success,

            screenshotPath

        });


        try {

            if (
                automation &&
                !automation.killed
            ) {

                automation.kill();

            }

        } catch {}


        console.log(
            'Closing browser...'
        );


        await closeBrowser(
            browser
        );


        await sleep(1000);
    }


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


    const successCount =
        results.filter(
            x => x.success
        ).length;


    if (
        successCount > 0
    ) {

        console.log('');
        console.log(
            'Screenshots saved to:'
        );

        console.log(
            SCREENSHOT_DIR
        );


        try {

            spawn(
                'explorer.exe',
                [
                    SCREENSHOT_DIR
                ],
                {
                    detached: true,
                    stdio: 'ignore'
                }
            ).unref();

        } catch {}

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
            'Fatal error:',
            error
        );

        process.exit(1);
    }
);
