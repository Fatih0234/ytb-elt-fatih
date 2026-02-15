import pytest

from app.youtube import parse_channel_input


def test_parse_channel_url_channel_id():
    out = parse_channel_input("https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA")
    assert out["channel_id"] == "UCX6OQ3DkcsbYNE6H8uQQuVA"


def test_parse_channel_id_uc():
    out = parse_channel_input("UCX6OQ3DkcsbYNE6H8uQQuVA")
    assert out["channel_id"] == "UCX6OQ3DkcsbYNE6H8uQQuVA"


@pytest.mark.parametrize("raw", ["@MrBeast", "youtube.com/@veritasium", " https://youtube.com/@LinusTechTips "])
def test_parse_handle(raw):
    out = parse_channel_input(raw)
    assert "handle" in out
    assert out["handle"]


def test_parse_query_fallback():
    out = parse_channel_input("some channel name")
    assert out == {"query": "some channel name"}

