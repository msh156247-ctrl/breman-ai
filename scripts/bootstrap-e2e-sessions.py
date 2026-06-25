from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import time
from urllib import request


def issue_token(api_base_url: str, admin_token: str, user_id: str) -> dict:
    payload = json.dumps(
        {"user_id": user_id, "role": "owner", "ttl_seconds": 7200}
    ).encode("utf-8")
    req = request.Request(
        f"{api_base_url.rstrip('/')}/api/auth/token",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Admin-Token": admin_token,
        },
    )
    with request.urlopen(req, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-base-url", default="http://127.0.0.1:8100")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    admin_token = os.getenv("BREMEN_ADMIN_TOKEN", "").strip()
    if not admin_token:
        raise SystemExit("BREMEN_ADMIN_TOKEN is required")

    account_a = issue_token(args.api_base_url, admin_token, f"qa-e2e-a-{args.run_id}")
    account_b = issue_token(args.api_base_url, admin_token, f"qa-e2e-b-{args.run_id}")
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {
                "run_id": args.run_id,
                "created_at": time.time(),
                "api_base_url": args.api_base_url,
                "accounts": {
                    "a": account_a,
                    "b": account_b,
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(json.dumps({"run_id": args.run_id, "output": str(output_path), "accounts": ["a", "b"]}))


if __name__ == "__main__":
    main()
