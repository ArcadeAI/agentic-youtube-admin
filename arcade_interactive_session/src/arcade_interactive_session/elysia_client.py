"""HTTP client for calling back to the Elysia server."""

import httpx


class ElysiaClient:
    """Authenticated HTTP client for the Elysia server's interactive API."""

    def __init__(self, base_url: str, token: str):
        self.client = httpx.AsyncClient(
            base_url=base_url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    async def get(self, path: str, params: dict | None = None) -> dict:
        response = await self.client.get(path, params=params)
        response.raise_for_status()
        return response.json()

    async def post(self, path: str, json: dict | None = None) -> dict:
        response = await self.client.post(path, json=json)
        response.raise_for_status()
        return response.json()

    async def patch(self, path: str, json: dict | None = None) -> dict:
        response = await self.client.patch(path, json=json)
        response.raise_for_status()
        return response.json()

    async def delete(self, path: str) -> dict:
        response = await self.client.delete(path)
        response.raise_for_status()
        return response.json()

    async def close(self):
        await self.client.aclose()
