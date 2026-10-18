#!/bin/bash
# Launch DeltaVision on Linux.
cd "$(dirname "$0")"
exec python3 launch.py "$@"
