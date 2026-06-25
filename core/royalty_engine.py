from __future__ import annotations

from dataclasses import dataclass
import math


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
        def normalize(value: float, field: str) -> float:
            parsed = float(value)
            if not math.isfinite(parsed):
                raise ValueError(f"invalid_{field}:{value}")
            return max(0.0, parsed)

        normalized_provider_cost = normalize(provider_cost, "provider_cost")
        normalized_royalty_rate = normalize(royalty_rate, "royalty_rate")
        fee_rate = max(
            0.0,
            normalize(
                self.default_platform_fee_rate if platform_fee_rate is None else platform_fee_rate,
                "platform_fee_rate",
            ),
        )
        royalty_cost = normalized_provider_cost * normalized_royalty_rate
        platform_fee = normalized_provider_cost * fee_rate
        total = normalized_provider_cost + royalty_cost + platform_fee
        return RoyaltyResult(
            provider_cost=round(normalized_provider_cost, 6),
            royalty_rate=round(normalized_royalty_rate, 6),
            royalty_cost=round(royalty_cost, 6),
            platform_fee=round(platform_fee, 6),
            total_cost=round(total, 6),
        )
