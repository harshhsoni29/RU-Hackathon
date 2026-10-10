#!/usr/bin/env bash
# Starts the betting API (port 8000) and the game (port 5173) together.
# Ctrl+C stops both. Usage: ./start.sh   (from Git Bash, macOS or Linux)

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v python3 >/dev/null 2>&1 && python3 --version >/dev/null 2>&1; then PY=python3
elif command -v python >/dev/null 2>&1; then PY=python
else echo "Python 3.10+ is required but was not found." >&2; exit 1; fi

# Install the API's dependencies only if they are missing.
if ! "$PY" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  echo "Installing backend requirements..."
  "$PY" -m pip install -r "$ROOT/backend/requirements.txt" || exit 1
fi

for port in 8000 5173; do
  if "$PY" -c "import socket,sys; s=socket.socket(); s.settimeout(0.5); sys.exit(0 if s.connect_ex(('127.0.0.1', $port))==0 else 1)"; then
    echo "Port $port is already in use. Stop whatever is using it and try again." >&2
    exit 1
  fi
done

PIDS=()
cleanup() {
  trap - INT TERM EXIT
  echo; echo "Shutting down..."
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null; done
  wait 2>/dev/null
}
trap cleanup INT TERM EXIT

(cd "$ROOT/backend" && exec "$PY" -m uvicorn main:app --port 8000) & PIDS+=($!)
(cd "$ROOT/fly-poker" && exec "$PY" -m http.server 5173 --bind 127.0.0.1) & PIDS+=($!)

URL="http://127.0.0.1:5173/"
sleep 2
echo
echo "Fly Poker is running at $URL   (API docs: http://127.0.0.1:8000/docs)"
echo "Press Ctrl+C to stop."

# Open the browser if we can.
if   command -v start    >/dev/null 2>&1; then start "" "$URL" >/dev/null 2>&1
elif command -v open     >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
fi

# Exit (and clean up) as soon as either server dies.
while kill -0 "${PIDS[0]}" 2>/dev/null && kill -0 "${PIDS[1]}" 2>/dev/null; do sleep 1; done
