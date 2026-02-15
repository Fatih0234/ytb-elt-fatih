import os


def getenv_required(key: str) -> str:
    v = os.getenv(key)
    if not v:
        raise RuntimeError(f"missing required env var: {key}")
    return v


def database_url() -> str:
    # Prefer explicit DATABASE_URL. Fall back to composing from existing env vars used by docker-compose.
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    user = getenv_required("ELT_DATABASE_USERNAME")
    pwd = getenv_required("ELT_DATABASE_PASSWORD")
    host = os.getenv("POSTGRES_CONN_HOST", "postgres")
    port = os.getenv("POSTGRES_CONN_PORT", "5432")
    db = getenv_required("ELT_DATABASE_NAME")
    return f"postgresql://{user}:{pwd}@{host}:{port}/{db}"


def youtube_api_key() -> str:
    # Shared with Airflow env var names
    return os.getenv("YOUTUBE_API_KEY") or os.getenv("API_KEY") or ""


def migrations_dir() -> str:
    return os.getenv("MIGRATIONS_DIR", "/app/migrations")


def app_port() -> int:
    try:
        return int(os.getenv("APP_PORT", "8001"))
    except ValueError:
        return 8001

