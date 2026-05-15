from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
import json
from pathlib import Path
import shutil
from typing import Any, Dict, Iterator, List, Optional, Tuple

from sqlalchemy import Float, Index, Integer, String, Text, create_engine, desc, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


def _default_db_url() -> str:
    db_path = Path(__file__).resolve().parents[1] / "runtime" / "bremen.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path.as_posix()}"


def get_db_file_path() -> str:
    if DB_URL.startswith("sqlite:///"):
        return DB_URL.replace("sqlite:///", "", 1)
    return ""


DB_URL = _default_db_url()
ENGINE = create_engine(DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=ENGINE, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class KeyRegistry(Base):
    __tablename__ = "key_registry"

    provider: Mapped[str] = mapped_column(String(64), primary_key=True)
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    masked: Mapped[str] = mapped_column(String(255), nullable=False)
    updated_at: Mapped[float] = mapped_column(Float, nullable=False)


class KeyHistory(Base):
    __tablename__ = "key_history"
    __table_args__ = (
        Index("ix_key_history_provider", "provider"),
        Index("ix_key_history_actor", "actor"),
        Index("ix_key_history_action", "action"),
        Index("ix_key_history_timestamp", "timestamp"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[float] = mapped_column(Float, nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    actor: Mapped[str] = mapped_column(String(128), nullable=False)
    ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    masked: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


# Phase-1 schema placeholders for core runtime entities.
class MemberEntity(Base):
    __tablename__ = "members"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[str] = mapped_column(String(128), nullable=False)


class TeamEntity(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(128), nullable=False)


class ChannelEntity(Base):
    __tablename__ = "channels"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_team_id: Mapped[str] = mapped_column(String(64), nullable=False)
    target_team_id: Mapped[str] = mapped_column(String(64), nullable=False)
    topic: Mapped[str] = mapped_column(String(255), nullable=False)


class ContractEntity(Base):
    __tablename__ = "contracts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_team_id: Mapped[str] = mapped_column(String(64), nullable=False)
    target_team_id: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class LedgerEntity(Base):
    __tablename__ = "ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)
    total_cost: Mapped[float] = mapped_column(Float, nullable=False)


# Stage-2 persistent stores (JSON payload based, migration-safe).
class MemberStore(Base):
    __tablename__ = "member_store"

    member_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False)


class TeamStore(Base):
    __tablename__ = "team_store"

    team_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False)


class ChannelStore(Base):
    __tablename__ = "channel_store"

    channel_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False)


class ContractStore(Base):
    __tablename__ = "contract_store"
    __table_args__ = (
        Index("ix_contract_store_pair_key", "pair_key"),
        Index("ix_contract_store_src_tgt_active", "source_team_id", "target_team_id", "active"),
    )

    contract_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    pair_key: Mapped[str] = mapped_column(String(128), nullable=False)
    source_team_id: Mapped[str] = mapped_column(String(64), nullable=False)
    target_team_id: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    payload: Mapped[str] = mapped_column(Text, nullable=False)


class LedgerStore(Base):
    __tablename__ = "ledger_store"
    __table_args__ = (
        Index("ix_ledger_store_created_at", "created_at"),
        Index("ix_ledger_store_receiver_team", "receiver_team_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)
    kind: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    receiver_team_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    provider_cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    royalty_cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    platform_fee: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False)


class MissionOwnerStore(Base):
    __tablename__ = "mission_owner_store"
    __table_args__ = (Index("ix_mission_owner_owner_id", "owner_id"),)

    mission_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)


def init_db() -> None:
    Base.metadata.create_all(bind=ENGINE)
    _apply_sqlite_migrations()


def _apply_sqlite_migrations() -> None:
    # Lightweight migration path without Alembic.
    with _session_scope() as session:
        _ensure_column(session, "ledger_store", "kind", "TEXT")
        _ensure_column(session, "ledger_store", "receiver_team_id", "TEXT")
        _ensure_column(session, "ledger_store", "provider_cost", "REAL")
        _ensure_column(session, "ledger_store", "royalty_cost", "REAL")
        _ensure_column(session, "ledger_store", "platform_fee", "REAL")
        _ensure_column(session, "ledger_store", "total_cost", "REAL")


def _ensure_column(session: Session, table_name: str, column_name: str, sql_type: str) -> None:
    rows = session.execute(text(f"PRAGMA table_info({table_name})")).all()
    existing = {str(r[1]) for r in rows}
    if column_name not in existing:
        session.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {sql_type}"))


@contextmanager
def _session_scope() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def is_provider_key_registered(provider: str) -> bool:
    with _session_scope() as session:
        row = session.get(KeyRegistry, provider)
        return bool(row and row.api_key.strip())


def upsert_provider_key(provider: str, api_key: str, masked: str, updated_at: float) -> None:
    with _session_scope() as session:
        row = session.get(KeyRegistry, provider)
        if row is None:
            row = KeyRegistry(provider=provider, api_key=api_key, masked=masked, updated_at=updated_at)
            session.add(row)
        else:
            row.api_key = api_key
            row.masked = masked
            row.updated_at = updated_at


def delete_provider_key(provider: str) -> Optional[Dict[str, Any]]:
    with _session_scope() as session:
        row = session.get(KeyRegistry, provider)
        if row is None:
            return None
        payload = {"provider": row.provider, "masked": row.masked, "updated_at": row.updated_at}
        session.delete(row)
        return payload


def list_key_status(providers: Dict[str, str]) -> List[Dict[str, Any]]:
    with _session_scope() as session:
        all_rows = {row.provider: row for row in session.query(KeyRegistry).all()}
    result: List[Dict[str, Any]] = []
    for provider, env_name in providers.items():
        row = all_rows.get(provider)
        result.append(
            {
                "provider": provider,
                "env_name": env_name,
                "registered": row is not None,
                "masked": row.masked if row else None,
                "updated_at": row.updated_at if row else None,
            }
        )
    return result


def list_registered_keys() -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = session.query(KeyRegistry).all()
        return [{"provider": r.provider, "api_key": r.api_key, "masked": r.masked, "updated_at": r.updated_at} for r in rows]


def append_key_history(
    timestamp: float,
    provider: str,
    action: str,
    actor: str,
    ip: Optional[str],
    user_agent: Optional[str],
    masked: Optional[str],
) -> None:
    with _session_scope() as session:
        session.add(
            KeyHistory(
                timestamp=timestamp,
                provider=provider,
                action=action,
                actor=actor,
                ip=ip,
                user_agent=user_agent,
                masked=masked,
            )
        )


def list_key_history(
    limit: int,
    offset: int,
    provider: Optional[str],
    actor: Optional[str],
    action: Optional[str],
) -> Tuple[List[Dict[str, Any]], int]:
    with _session_scope() as session:
        query = session.query(KeyHistory)
        if provider:
            query = query.filter(KeyHistory.provider == provider.strip().lower())
        if actor:
            query = query.filter(KeyHistory.actor == actor.strip().lower())
        if action:
            query = query.filter(KeyHistory.action == action.strip().lower())

        total = query.count()
        rows = query.order_by(desc(KeyHistory.id)).offset(offset).limit(limit).all()

    payload = [
        {
            "timestamp": r.timestamp,
            "provider": r.provider,
            "action": r.action,
            "actor": r.actor,
            "ip": r.ip,
            "user_agent": r.user_agent,
            "masked": r.masked,
        }
        for r in rows
    ]
    return payload, total


def _dumps(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _loads(payload: str) -> Dict[str, Any]:
    return json.loads(payload)


def create_member_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    member_id = str(profile["id"])
    with _session_scope() as session:
        row = MemberStore(member_id=member_id, payload=_dumps(profile))
        session.merge(row)
    return profile


def get_member_profile(member_id: str) -> Optional[Dict[str, Any]]:
    with _session_scope() as session:
        row = session.get(MemberStore, member_id)
        return _loads(row.payload) if row else None


def list_member_records() -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = session.query(MemberStore).all()
        return [_loads(r.payload) for r in rows]


def create_team_record(team: Dict[str, Any]) -> Dict[str, Any]:
    team_id = str(team["id"])
    with _session_scope() as session:
        session.merge(TeamStore(team_id=team_id, payload=_dumps(team)))
    return team


def update_team_record(team: Dict[str, Any]) -> Dict[str, Any]:
    return create_team_record(team)


def get_team_record(team_id: str) -> Optional[Dict[str, Any]]:
    with _session_scope() as session:
        row = session.get(TeamStore, team_id)
        return _loads(row.payload) if row else None


def list_team_records() -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = session.query(TeamStore).all()
        return [_loads(r.payload) for r in rows]


def create_channel_record(channel: Dict[str, Any]) -> Dict[str, Any]:
    channel_id = str(channel["id"])
    with _session_scope() as session:
        session.merge(ChannelStore(channel_id=channel_id, payload=_dumps(channel)))
    return channel


def update_channel_record(channel: Dict[str, Any]) -> Dict[str, Any]:
    return create_channel_record(channel)


def get_channel_record(channel_id: str) -> Optional[Dict[str, Any]]:
    with _session_scope() as session:
        row = session.get(ChannelStore, channel_id)
        return _loads(row.payload) if row else None


def list_channel_records() -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = session.query(ChannelStore).all()
        return [_loads(r.payload) for r in rows]


def create_contract_record(contract: Dict[str, Any]) -> Dict[str, Any]:
    with _session_scope() as session:
        session.merge(
            ContractStore(
                contract_id=str(contract["id"]),
                pair_key=str(contract.get("pair_key", "")),
                source_team_id=str(contract.get("source_team_id", "")),
                target_team_id=str(contract.get("target_team_id", "")),
                version=int(contract.get("version", 1)),
                active=1 if bool(contract.get("active", True)) else 0,
                payload=_dumps(contract),
            )
        )
    return contract


def update_contract_record(contract: Dict[str, Any]) -> Dict[str, Any]:
    return create_contract_record(contract)


def get_contract_record(contract_id: str) -> Optional[Dict[str, Any]]:
    with _session_scope() as session:
        row = session.get(ContractStore, contract_id)
        return _loads(row.payload) if row else None


def list_contract_records() -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = session.query(ContractStore).all()
        return [_loads(r.payload) for r in rows]


def list_contract_history_by_pair(pair_key: str) -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = (
            session.query(ContractStore)
            .filter(ContractStore.pair_key == pair_key)
            .order_by(ContractStore.version.asc())
            .all()
        )
        return [_loads(r.payload) for r in rows]


def get_active_contract_record(source_team_id: str, target_team_id: str) -> Optional[Dict[str, Any]]:
    with _session_scope() as session:
        row = (
            session.query(ContractStore)
            .filter(
                ContractStore.source_team_id == source_team_id,
                ContractStore.target_team_id == target_team_id,
                ContractStore.active == 1,
            )
            .order_by(ContractStore.version.desc())
            .first()
        )
        return _loads(row.payload) if row else None


def deactivate_active_contracts(pair_key: str, exclude_contract_id: Optional[str] = None, deactivated_at: Optional[float] = None) -> None:
    with _session_scope() as session:
        rows = session.query(ContractStore).filter(ContractStore.pair_key == pair_key, ContractStore.active == 1).all()
        for row in rows:
            if exclude_contract_id and row.contract_id == exclude_contract_id:
                continue
            payload = _loads(row.payload)
            payload["active"] = False
            payload["deactivated_at"] = deactivated_at
            row.active = 0
            row.payload = _dumps(payload)


def append_ledger_record(row: Dict[str, Any]) -> Dict[str, Any]:
    receiver_team_id = str(row.get("team_id") or row.get("source_team_id") or "")
    with _session_scope() as session:
        session.add(
            LedgerStore(
                created_at=float(row.get("created_at", 0.0)),
                kind=(str(row.get("kind")) if row.get("kind") is not None else None),
                receiver_team_id=(receiver_team_id if receiver_team_id else None),
                provider_cost=float(row.get("provider_cost", 0.0)),
                royalty_cost=float(row.get("royalty_cost", 0.0)),
                platform_fee=float(row.get("platform_fee", 0.0)),
                total_cost=float(row.get("total_cost", 0.0)),
                payload=_dumps(row),
            )
        )
    return row


def list_ledger_records() -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = session.query(LedgerStore).order_by(LedgerStore.id.asc()).all()
        return [_loads(r.payload) for r in rows]


def upsert_mission_owner(mission_id: str, owner_id: str, created_at: float) -> Dict[str, Any]:
    with _session_scope() as session:
        session.merge(
            MissionOwnerStore(
                mission_id=str(mission_id),
                owner_id=str(owner_id),
                created_at=float(created_at),
            )
        )
    return {"mission_id": str(mission_id), "owner_id": str(owner_id), "created_at": float(created_at)}


def get_mission_owner(mission_id: str) -> Optional[str]:
    with _session_scope() as session:
        row = session.get(MissionOwnerStore, str(mission_id))
        return row.owner_id if row else None


def list_mission_owner_records() -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = session.query(MissionOwnerStore).all()
        return [{"mission_id": r.mission_id, "owner_id": r.owner_id, "created_at": r.created_at} for r in rows]


def aggregate_settlements(cycle: str, team_id: Optional[str]) -> List[Dict[str, Any]]:
    if cycle not in {"daily", "weekly", "monthly"}:
        return []
    period_expr = {
        "daily": "strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))",
        "weekly": "strftime('%Y-W%W', datetime(created_at, 'unixepoch'))",
        "monthly": "strftime('%Y-%m', datetime(created_at, 'unixepoch'))",
    }[cycle]

    sql = f"""
    SELECT
      {period_expr} AS period,
      COALESCE(receiver_team_id, json_extract(payload, '$.team_id'), json_extract(payload, '$.source_team_id'), '') AS receiver_team_id,
      ROUND(COALESCE(SUM(COALESCE(provider_cost, json_extract(payload, '$.provider_cost'), 0)), 0), 6) AS provider_cost,
      ROUND(COALESCE(SUM(COALESCE(royalty_cost, json_extract(payload, '$.royalty_cost'), 0)), 0), 6) AS royalty_cost,
      ROUND(COALESCE(SUM(COALESCE(platform_fee, json_extract(payload, '$.platform_fee'), 0)), 0), 6) AS platform_fee,
      ROUND(COALESCE(SUM(COALESCE(total_cost, json_extract(payload, '$.total_cost'), 0)), 0), 6) AS total_cost,
      COUNT(*) AS entries
    FROM ledger_store
    WHERE (
      :team_id IS NULL
      OR COALESCE(receiver_team_id, json_extract(payload, '$.team_id'), json_extract(payload, '$.source_team_id'), '') = :team_id
    )
    GROUP BY period, receiver_team_id
    ORDER BY period, receiver_team_id
    """
    with _session_scope() as session:
        rows = session.execute(text(sql), {"team_id": team_id}).all()
    return [
        {
            "cycle": cycle,
            "period": str(r[0]),
            "receiver_team_id": str(r[1]),
            "provider_cost": float(r[2]),
            "royalty_cost": float(r[3]),
            "platform_fee": float(r[4]),
            "total_cost": float(r[5]),
            "entries": int(r[6]),
        }
        for r in rows
    ]


def backup_database(label: Optional[str] = None) -> Dict[str, Any]:
    source = Path(get_db_file_path())
    if not source.exists():
        raise FileNotFoundError(f"DB not found: {source}")
    backup_dir = source.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    suffix = f"-{label}" if label else ""
    target = backup_dir / f"bremen-{stamp}{suffix}.db"
    shutil.copy2(source, target)
    return {"source": str(source), "backup": str(target), "size_bytes": target.stat().st_size}


def run_integrity_checks() -> Dict[str, Any]:
    members = list_member_records()
    teams = list_team_records()
    channels = list_channel_records()
    contracts = list_contract_records()
    ledger = list_ledger_records()

    member_ids = {str(m.get("id")) for m in members}
    team_ids = {str(t.get("id")) for t in teams}

    orphan_team_members: List[Dict[str, str]] = []
    for t in teams:
        tid = str(t.get("id"))
        for row in t.get("members", []):
            mid = str(row.get("member_id"))
            if mid and mid not in member_ids:
                orphan_team_members.append({"team_id": tid, "member_id": mid})

    orphan_channels: List[Dict[str, str]] = []
    for c in channels:
        cid = str(c.get("id"))
        src = str(c.get("source_team_id"))
        dst = str(c.get("target_team_id"))
        if src not in team_ids or dst not in team_ids:
            orphan_channels.append({"channel_id": cid, "source_team_id": src, "target_team_id": dst})

    orphan_contracts: List[Dict[str, str]] = []
    for c in contracts:
        cid = str(c.get("id"))
        src = str(c.get("source_team_id"))
        dst = str(c.get("target_team_id"))
        if src not in team_ids or dst not in team_ids:
            orphan_contracts.append({"contract_id": cid, "source_team_id": src, "target_team_id": dst})

    orphan_ledger_receivers: List[Dict[str, str]] = []
    for row in ledger:
        receiver = str(row.get("team_id") or row.get("source_team_id") or "")
        if receiver and receiver not in team_ids:
            orphan_ledger_receivers.append({"receiver_team_id": receiver, "kind": str(row.get("kind", ""))})

    issues = {
        "orphan_team_members": orphan_team_members,
        "orphan_channels": orphan_channels,
        "orphan_contracts": orphan_contracts,
        "orphan_ledger_receivers": orphan_ledger_receivers,
    }
    issue_count = sum(len(v) for v in issues.values())
    return {
        "ok": issue_count == 0,
        "issue_count": issue_count,
        "counts": {
            "members": len(members),
            "teams": len(teams),
            "channels": len(channels),
            "contracts": len(contracts),
            "ledger_rows": len(ledger),
        },
        "issues": issues,
    }
