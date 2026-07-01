from __future__ import annotations

from typing import Any, Callable, Dict, Iterable, List


def matches_market_filters(row: Dict[str, Any], category: str | None, search: str | None) -> bool:
    normalized_category = (category or "").strip().lower()
    if normalized_category and normalized_category != "전체".lower():
        row_category = str(row.get("category") or row.get("domain") or "").strip().lower()
        if row_category != normalized_category:
            return False

    needle = (search or "").strip().lower()
    if needle:
        haystack_parts = [
            row.get("id", ""),
            row.get("name", ""),
            row.get("description", ""),
            row.get("domain", ""),
            row.get("category", ""),
            " ".join(str(x) for x in row.get("capabilities", []) if x is not None),
            " ".join(str(x) for x in row.get("tags", []) if x is not None),
        ]
        if needle not in " ".join(str(part).lower() for part in haystack_parts):
            return False
    return True


def decorate_member_for_market(
    profile: Dict[str, Any],
    *,
    runtime_supported_providers: Iterable[str],
    is_provider_key_registered: Callable[[str], bool],
) -> Dict[str, Any]:
    provider = str(profile.get("provider", "")).strip().lower()
    runtime_supported = provider in set(runtime_supported_providers)
    key_registered = provider == "mock" or is_provider_key_registered(provider)
    available = runtime_supported and key_registered
    return {
        **profile,
        "category": profile.get("category") or profile.get("domain", "general"),
        "is_ai": profile.get("is_ai", True),
        "published": profile.get("published", True),
        "available": available,
        "runtime_supported": runtime_supported,
        "availability_reason": (
            "available"
            if available
            else "runtime_provider_not_supported"
            if not runtime_supported
            else "provider_api_key_not_registered"
        ),
        "required_api": provider,
    }


def decorate_team_for_market(team: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **team,
        "category": team.get("category") or team.get("domain", "general"),
        "is_template": team.get("is_template", True),
        "published": team.get("published", True),
        "member_count": len(team.get("members", [])),
    }


def team_member_profiles(
    team: Dict[str, Any],
    *,
    get_member_profile: Callable[[str], Dict[str, Any] | None],
    runtime_supported_providers: Iterable[str],
    is_provider_key_registered: Callable[[str], bool],
) -> List[Dict[str, Any]]:
    profiles: List[Dict[str, Any]] = []
    for row in team.get("members", []):
        if not isinstance(row, dict):
            continue
        member_id = str(row.get("member_id", "")).strip()
        if not member_id:
            continue
        profile = get_member_profile(member_id)
        if profile is not None:
            profiles.append(
                decorate_member_for_market(
                    {**profile, "team_role_type": row.get("role_type")},
                    runtime_supported_providers=runtime_supported_providers,
                    is_provider_key_registered=is_provider_key_registered,
                )
            )
    return profiles
