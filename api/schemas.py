from __future__ import annotations

from typing import Any, Dict, List

from pydantic import BaseModel, Field, model_validator


class MissionRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=20_000)
    budget: float = Field(default=5.0, gt=0, allow_inf_nan=False)
    use_mock: bool = True
    workflow_id: str | None = Field(default=None, max_length=64)
    workflow_label: str = Field(default="", max_length=255)
    workflow_graph: Dict[str, Any] | None = None
    auto_mode: bool = True

    # Legacy aliases remain accepted while clients migrate to workflow_*.
    team_id: str | None = Field(
        default=None,
        max_length=64,
        exclude=True,
        json_schema_extra={"deprecated": True},
    )
    team_label: str = Field(
        default="",
        max_length=255,
        exclude=True,
        json_schema_extra={"deprecated": True},
    )
    team_graph: Dict[str, Any] | None = Field(
        default=None,
        exclude=True,
        json_schema_extra={"deprecated": True},
    )

    @model_validator(mode="after")
    def normalize_legacy_workflow_aliases(self) -> "MissionRequest":
        if self.workflow_id is None:
            self.workflow_id = self.team_id
        if not self.workflow_label:
            self.workflow_label = self.team_label
        if self.workflow_graph is None:
            self.workflow_graph = self.team_graph
        return self


class MemberCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    provider: str = Field(min_length=1, max_length=64)
    model: str = Field(min_length=1, max_length=128)
    version: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=4000)
    domain: str = Field(default="general", min_length=1, max_length=128)
    capabilities: List[str] = Field(default_factory=list, max_length=100)
    royalty_rate: float = Field(default=0.0, ge=0, allow_inf_nan=False)


class PolicyCheckRequest(BaseModel):
    budget: float = Field(default=5.0, ge=0, allow_inf_nan=False)
    use_mock: bool = True
    role: str | None = Field(default=None, max_length=64)
    spent: float = Field(default=0.0, ge=0, allow_inf_nan=False)
    external_publish: bool = False


class MemoryPutRequest(BaseModel):
    scope: str = Field(min_length=1, max_length=32)
    scope_id: str = Field(min_length=1, max_length=128)
    key: str = Field(min_length=1, max_length=255)
    value: Any
    classification: str = Field(default="internal", min_length=1, max_length=32)


class MemoryTransferRequest(BaseModel):
    source_scope: str = Field(min_length=1, max_length=32)
    source_scope_id: str = Field(min_length=1, max_length=128)
    target_scope: str = Field(min_length=1, max_length=32)
    target_scope_id: str = Field(min_length=1, max_length=128)
    allow_external: bool = False


class TeamCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    domain: str = Field(default="general", min_length=1, max_length=128)
    policy_set: str = Field(default="default", min_length=1, max_length=128)
    description: str = Field(default="", max_length=4000)


class TeamMemberAddRequest(BaseModel):
    member_id: str = Field(min_length=1, max_length=64)
    role_type: str = Field(default="executor", min_length=1, max_length=32)


class ChannelCreateRequest(BaseModel):
    source_team_id: str = Field(min_length=1, max_length=64)
    target_team_id: str = Field(min_length=1, max_length=64)
    topic: str = Field(min_length=1, max_length=255)


class ChannelPublishRequest(BaseModel):
    from_team_id: str = Field(min_length=1, max_length=64)
    to_team_id: str = Field(min_length=1, max_length=64)
    sender_member_id: str = Field(min_length=1, max_length=64)
    content: Dict[str, Any]
    allow_external: bool = False
    provider_cost: float = Field(default=0.0, ge=0, allow_inf_nan=False)


class RoyaltySimulateRequest(BaseModel):
    member_id: str = Field(min_length=1, max_length=64)
    provider_cost: float = Field(ge=0, allow_inf_nan=False)
    platform_fee_rate: float | None = Field(default=None, ge=0, allow_inf_nan=False)


class TeamRoyaltyContractRequest(BaseModel):
    source_team_id: str = Field(min_length=1, max_length=64)
    target_team_id: str = Field(min_length=1, max_length=64)
    royalty_rate: float = Field(ge=0, allow_inf_nan=False)
    platform_fee_rate: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    description: str = Field(default="", max_length=4000)
    active: bool = True


class ContractActiveUpdateRequest(BaseModel):
    active: bool


class ApiKeyRegisterRequest(BaseModel):
    provider: str = Field(min_length=1, max_length=64)
    api_key: str = Field(min_length=1, max_length=8192)


class AuthTokenRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    role: str = Field(default="member", min_length=1, max_length=32)
    ttl_seconds: int = Field(default=3600, ge=60, le=60 * 60 * 24)


class WorkspaceSettingsRequest(BaseModel):
    hired_agents: List[Dict[str, Any]] = Field(default_factory=list, max_length=250)
    library_agents: List[Dict[str, Any]] = Field(default_factory=list, max_length=250)
    project_units: List[Dict[str, Any]] = Field(default_factory=list, max_length=120)
    member_folders: List[Dict[str, Any]] = Field(default_factory=list, max_length=80)
    agent_folder_ids: Dict[str, str] = Field(default_factory=dict)
    nodes: List[Dict[str, Any]] = Field(default_factory=list, max_length=500)
    edges: List[Dict[str, Any]] = Field(default_factory=list, max_length=1000)
    node_execution_states: Dict[str, str] = Field(default_factory=dict)
    artifact_versions: List[Dict[str, Any]] = Field(default_factory=list, max_length=1000)
    loop_regions: List[Dict[str, Any]] = Field(default_factory=list, max_length=200)
    approval_channel_settings: Dict[str, Any] | None = None
    client_version: str = Field(default="workspace_settings_v4", max_length=64)


class ApprovalChannelSettingsRequest(BaseModel):
    approval_channel_settings: Dict[str, Any] = Field(default_factory=dict)


class ApprovalNotificationRetryRequest(BaseModel):
    channels: List[str] | None = Field(default=None, max_length=16)
    notification_ids: List[str] | None = Field(default=None, max_length=100)
