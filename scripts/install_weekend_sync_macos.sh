#!/bin/zsh
set -e

AGENT_PATH="$HOME/Library/LaunchAgents/com.hyperdrive.fcc.plist"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$AGENT_PATH" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.hyperdrive.fcc</string>
  <key>ProgramArguments</key>
  <array><string>/Users/nathanhanamaikai/Projects/financial-command-center/scripts/run_fcc_backend.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/private/tmp/fcc-backend.log</string>
  <key>StandardErrorPath</key><string>/private/tmp/fcc-backend-error.log</string>
</dict>
</plist>
PLIST

chmod 600 "$AGENT_PATH"
launchctl bootout "gui/$(id -u)" "$AGENT_PATH" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AGENT_PATH"
echo "FCC login agent installed. The backend will check for a weekend Teller sync whenever you log in."
