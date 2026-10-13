from __future__ import annotations

from getpass import getpass

from backend.config import SERVICE_NAME


def main() -> None:
    try:
        import keyring
    except ImportError as exc:
        raise SystemExit("먼저 requirements-local.txt 의존성을 설치해 주세요.") from exc

    print("키움증권 운영용 API 자격 증명을 로컬 운영체제 자격 증명 저장소에 등록합니다.")
    print("입력값은 화면에 표시되지 않으며 GitHub에 업로드되지 않습니다.")
    app_key = getpass("App Key: ").strip()
    app_secret = getpass("App Secret: ").strip()

    if not app_key or not app_secret:
        raise SystemExit("App Key와 App Secret을 모두 입력해야 합니다.")

    keyring.set_password(SERVICE_NAME, "KIWOOM_APP_KEY", app_key)
    keyring.set_password(SERVICE_NAME, "KIWOOM_APP_SECRET", app_secret)
    print("등록을 완료했습니다. 키 값은 출력하지 않았습니다.")


if __name__ == "__main__":
    main()
