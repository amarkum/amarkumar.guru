#!/bin/sh
# Stamp every asset URL in index.html with the current time so browsers refetch after a deploy.
cd "$(dirname "$0")" && python3 - <<'PY'
import re, time
p='index.html'; s=open(p).read(); v=time.strftime('%Y%m%d%H%M')
s=re.sub(r'((?:href|src|poster)="assets/[^"?]+)\?v=\d+"', r'\1"', s)
s=re.sub(r'((?:href|src|poster)="assets/[^"?]+)"', rf'\1?v={v}"', s)
open(p,'w').write(s); print('stamped', v)
PY
