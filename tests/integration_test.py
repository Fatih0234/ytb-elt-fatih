import os
import requests
import pytest
import psycopg2


def test_youtube_api_response(airflow_variable):
    # This hits the real YouTube API (network + quota). Keep it opt-in.
    if os.getenv("RUN_YT_INTEGRATION_TESTS") != "1":
        pytest.skip("Set RUN_YT_INTEGRATION_TESTS=1 to run YouTube API integration test")

    # Prefer the v0 app/pipeline key. Fall back to legacy env names.
    api_key = airflow_variable("youtube_api_key") or airflow_variable("api_key")
    if not api_key:
        pytest.skip("Missing YOUTUBE_API_KEY/API_KEY for integration test")

    # Use a stable default handle unless explicitly provided.
    channel_handle = airflow_variable("channel_handle") or "MrBeast"

    url = (
        "https://www.googleapis.com/youtube/v3/channels"
        f"?part=contentDetails&forHandle={channel_handle}&key={api_key}"
    )

    try:
        response = requests.get(url, timeout=20)
        assert response.status_code == 200
    except requests.RequestException as e:
        pytest.fail(f"Request to YouTube API failed: {e}")


def test_real_postgres_connection(real_postgres_connection):
    cursor = None

    try:
        cursor = real_postgres_connection.cursor()
        cursor.execute("SELECT 1;")
        result = cursor.fetchone()

        assert result[0] == 1

    except psycopg2.Error as e:
        pytest.fail(f"Database query failed: {e}")

    finally:
        if cursor is not None:
            cursor.close()
