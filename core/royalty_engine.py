from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RoyaltyResult:
    provider_cost: float
    royalty_rate: float
    royalty_cost: float
    platform_fee: float
    total_cost: float


class RoyaltyEngine:
    def __init__(self, default_platform_fee_rate: float = 0.02):
        self.default_platform_fee_rate = default_platform_fee_rate

    def calculate(self, provider_cost: float, royalty_rate: float, platform_fee_rate: float | None = None) -> RoyaltyResult:
        fee_rate = self.default_platform_fee_rate if platform_fee_rate is None else platform_fee_rate
        royalty_cost = max(0.0, provider_cost * max(0.0, royalty_rate))
        platform_fee = max(0.0, provider_cost * max(0.0, fee_rate))
        total = provider_cost + royalty_cost + platform_fee
        return RoyaltyResult(
            provider_cost=round(provider_cost, 6),
            royalty_rate=round(royalty_rate, 6),
            royalty_cost=round(royalty_cost, 6),
            platform_fee=round(platform_fee, 6),
            total_cost=round(total, 6),
        )
