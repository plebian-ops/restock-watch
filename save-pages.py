# Saves every product page that passes through, exactly as the crawler received it.
import hashlib
import os
from mitmproxy import http

OUT = "/tmp/captured"


def response(flow: http.HTTPFlow):
    url = flow.request.pretty_url
    ctype = flow.response.headers.get("content-type", "") if flow.response else ""
    if "/products/" not in url or "text/html" not in ctype:
        return
    os.makedirs(OUT, exist_ok=True)
    name = hashlib.sha1(url.encode()).hexdigest()[:12]
    with open(f"{OUT}/{name}.html", "wb") as f:
        f.write(flow.response.content or b"")
    with open(f"{OUT}/{name}.txt", "w") as f:
        f.write(url + "\n" + str(flow.response.status_code) + "\n" + flow.request.headers.get("user-agent", "") + "\n")
