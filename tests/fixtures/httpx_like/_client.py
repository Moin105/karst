"""Fixture used by tests/test_chunker.py and tests/test_graph_builder.py.

A trimmed-down httpx client. Decorated methods (@property, @x.setter,
@contextmanager) sit between plain ones, which is the shape that made the
chunker drop Client.request and duplicate Client.stream as
Client.stream.stream on httpx itself. The call chain
get -> request -> build_request -> _merge_url is what impact analysis on
_merge_url must walk back up.
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass


@dataclass
class Timeout:
    connect: float = 5.0

    def as_dict(self) -> dict:
        return {"connect": self.connect}


class BaseClient:
    def __init__(self, base_url: str = "") -> None:
        self._base_url = base_url
        self._timeout = Timeout()

    @property
    def timeout(self) -> Timeout:
        return self._timeout

    @timeout.setter
    def timeout(self, timeout: Timeout) -> None:
        self._timeout = timeout

    @property
    def base_url(self) -> str:
        return self._base_url

    def build_request(self, method: str, url: str) -> tuple[str, str]:
        return (method, self._merge_url(url))

    def _merge_url(self, url: str) -> str:
        return self._base_url + url


class Client(BaseClient):
    @property
    def is_closed(self) -> bool:
        return False

    def _transport_for_url(self, url: str) -> str:
        return url

    def request(self, method: str, url: str) -> tuple[str, str]:
        request = self.build_request(method, url)
        return self.send(request)

    @contextmanager
    def stream(self, method: str, url: str):
        request = self.build_request(method, url)
        yield self.send(request)

    def send(self, request: tuple[str, str]) -> tuple[str, str]:
        return request

    def get(self, url: str) -> tuple[str, str]:
        return self.request("GET", url)

    def post(self, url: str) -> tuple[str, str]:
        return self.request("POST", url)
