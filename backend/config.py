from __future__ import annotations

import os

SERVICE_NAME = "turtle-trading-dashboard"


class CredentialsMissing(RuntimeError):
    """Raised when the required Kiwoom credentials are not configured."""


def get_credentials() -> tuple[str, str]:
    """Read credentials from environment first, then the OS credential store.

    On Windows, keyring normally uses Windows Credential Manager. Values are
    never returned to the browser or written to application logs.
    """
    app_key = os.environ.get("KIWOOM_APP_KEY", "").strip()
    app_secret = os.environ.get("KIWOOM_APP_SECRET", "").strip()

    if not app_key or not app_secret:
        try:
            import keyring

            app_key = app_key or (keyring.get_password(SERVICE_NAME, "KIWOOM_APP_KEY") or "").strip()
            app_secret = app_secret or (keyring.get_password(SERVICE_NAME, "KIWOOM_APP_SECRET") or "").strip()
        except Exception:
            # The caller receives only a generic missing-credentials status.
            pass

    if not app_key or not app_secret:
        raise CredentialsMissing(
            "키움 App Key/Secret이 설정되지 않았습니다. "
            "python -m backend.setup_credentials 명령으로 먼저 등록하세요."
        )
    return app_key, app_secret


def credentials_status() -> dict[str, bool]:
    try:
        key, secret = get_credentials()
        return {"appKeyConfigured": bool(key), "appSecretConfigured": bool(secret)}
    except CredentialsMissing:
        return {"appKeyConfigured": False, "appSecretConfigured": False}
