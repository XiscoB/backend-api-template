#!/bin/bash
#
# Internal Admin Console CLI Helper (Bash wrapper)
#
# Convenient wrapper for the admin-cli.js script on Unix systems.
# Forwards all arguments to the Node.js CLI.
#
# Usage:
#   ./admin.sh tables
#   ./admin.sh query profiles --limit 10
#   ./admin.sh get profiles abc-123
#   ./admin.sh update notifications abc-123 '{"isRead": true}'
#   ./admin.sh health
#
# Requires:
#   - Node.js installed
#   - ADMIN_JWT environment variable set
#   - Backend running with ADMIN_CONSOLE_ENABLED=true

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_SCRIPT="$SCRIPT_DIR/admin-cli.js"

if [ ! -f "$CLI_SCRIPT" ]; then
    echo "❌ Error: admin-cli.js not found at: $CLI_SCRIPT" >&2
    exit 1
fi

# Check for ADMIN_JWT
if [ -z "$ADMIN_JWT" ]; then
    echo "❌ Error: ADMIN_JWT environment variable is required" >&2
    echo "" >&2
    echo "Set it with a valid admin JWT token:" >&2
    echo "  export ADMIN_JWT=\"your-jwt-token\"" >&2
    echo "" >&2
    exit 1
fi

# Forward all arguments to the Node.js script
node "$CLI_SCRIPT" "$@"
