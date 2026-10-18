#!/bin/bash
# Double-click to launch DeltaVision on macOS.
cd "$(dirname "$0")"
exec python3 launch.py "$@"
