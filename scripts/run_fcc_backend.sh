#!/bin/zsh
set -a
if [ -f "/Users/nathanhanamaikai/Projects/financial-command-center/backend/.env" ]; then
  source "/Users/nathanhanamaikai/Projects/financial-command-center/backend/.env"
fi
set +a
cd "/Users/nathanhanamaikai/Projects/financial-command-center/backend"
exec ./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
