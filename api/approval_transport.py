from __future__ import annotations

from email.message import EmailMessage
import ipaddress
import json
import socket
import smtplib
import ssl
from typing import Any, Dict
from urllib import request as urllib_request
from urllib.parse import urlparse


def post_json_webhook(
    url: str,
    payload: Dict[str, Any],
    token: str = "",
    *,
    allow_private: bool = False,
) -> Dict[str, Any]:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("webhook_url_invalid")
    if not allow_private:
        try:
            addresses = {
                item[4][0]
                for item in socket.getaddrinfo(
                    parsed.hostname,
                    parsed.port or (443 if parsed.scheme == "https" else 80),
                    type=socket.SOCK_STREAM,
                )
            }
        except OSError as exc:
            raise ValueError("webhook_host_unresolvable") from exc
        for address in addresses:
            ip = ipaddress.ip_address(address)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or ip.is_unspecified
            ):
                raise ValueError("webhook_private_address_blocked")

    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib_request.Request(url, data=data, headers=headers, method="POST")

    class NoRedirectHandler(urllib_request.HTTPRedirectHandler):
        def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
            return None

    opener = urllib_request.build_opener(NoRedirectHandler())
    with opener.open(req, timeout=8) as response:
        status_code = int(getattr(response, "status", 0) or response.getcode())
        if status_code >= 400:
            raise RuntimeError(f"webhook_http_{status_code}")
        return {"status_code": status_code}


def send_smtp_approval_email(
    notification: Dict[str, Any],
    payload: Dict[str, Any],
    *,
    host: str,
    port: int,
    use_ssl: bool,
    username: str,
    password: str,
    sender: str,
    smtp_module=smtplib,
) -> None:
    target = str(notification.get("target") or "").strip()
    if not target or "@" not in target:
        raise ValueError("email_target_required")
    if not host:
        raise ValueError("smtp_not_configured")

    message = EmailMessage()
    message["Subject"] = f"[Bremen] 승인 요청 · {payload['mission_id']}"
    message["From"] = sender
    message["To"] = target
    message.set_content(
        "\n".join(
            [
                "Bremen 승인 요청이 도착했습니다.",
                f"Mission: {payload['mission_id']}",
                f"Task: {payload.get('task_id') or '-'}",
                f"Gate: {payload.get('gate_stage') or 'before_run'}",
                f"승인/옵스룸: {payload['ops_url']}",
            ]
        )
    )
    if use_ssl:
        with smtp_module.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=8) as smtp:
            if username:
                smtp.login(username, password)
            smtp.send_message(message)
        return
    with smtp_module.SMTP(host, port, timeout=8) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        if username:
            smtp.login(username, password)
        smtp.send_message(message)
