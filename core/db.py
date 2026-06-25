from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sqlite3
from typing import Any, Dict, Iterator, List, Optional, Tuple

from sqlalchemy import Float, Index, Integer, String, Text, create_engine, desc, event, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


KEY_ENCRYPTION_SECRET_ENV = "BREMEN_KEY_ENCRYPTION_SECRET"
LEGACY_JWT_SECRET_ENV = "BREMEN_JWT_SECRET"
DEFAULT_DEV_KEY_ENCRYPTION_SECRET = "bremen-dev-key-encryption-secret-change-me"
ENCRYPTED_KEY_PREFIX = "enc:v1:"


def _default_db_url() -> str:
    configured_path = os.getenv("BREMEN_DB_PATH", "").strip()
    configured_runtime_dir = os.getenv("BREMEN_RUNTIME_DIR", "").strip()
    if configured_path:
        db_path = Path(configured_path).expanduser()
    elif configured_runtime_dir:
        db_path = Path(configured_runtime_dir).expanduser() / "bremen.db"
    else:
        db_path = Path(__file__).resolve().parents[1] / "runtime" / "bremen.db"
    if not db_path.is_absolute():
        db_path = (Path(__file__).resolve().parents[1] / db_path).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path.as_posix()}"


def get_db_file_path() -> str:
    if DB_URL.startswith("sqlite:///"):
        return DB_URL.replace("sqlite:///", "", 1)
    return ""


DB_URL = _default_db_url()
ENGINE = create_engine(DB_URL, connect_args={"check_same_thread": False, "timeout": 30})


@event.listens_for(ENGINE, "connect")
def _configure_sqlite_connection(dbapi_connection: Any, _connection_record: Any) -> None:
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()
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


# Persistent stores use JSON payloads so fields can evolve without destructive migrations.
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


class MissionStore(Base):
    __tablename__ = "mission_store"
    __table_args__ = (
        Index("ix_mission_store_owner_id", "owner_id"),
        Index("ix_mission_store_status", "status"),
        Index("ix_mission_store_created_at", "created_at"),
    )

    mission_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)


class WorkspaceSettingsStore(Base):
    __tablename__ = "workspace_settings_store"

    user_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    updated_at: Mapped[float] = mapped_column(Float, nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)


class MemoryStore(Base):
    __tablename__ = "memory_store"
    __table_args__ = (
        Index("ix_memory_store_scope_bucket", "scope", "scope_id"),
        Index("ix_memory_store_updated_at", "updated_at"),
    )

    scope: Mapped[str] = mapped_column(String(32), primary_key=True)
    scope_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    classification: Mapped[str] = mapped_column(String(32), nullable=False)
    updated_at: Mapped[float] = mapped_column(Float, nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)


def init_db() -> None:
    Base.metadata.create_all(bind=ENGINE)
    _apply_sqlite_migrations()


def check_database_health() -> bool:
    try:
        with _session_scope() as session:
            return int(session.execute(text("SELECT 1")).scalar_one()) == 1
    except Exception:
        return False


def _apply_sqlite_migrations() -> None:
    # Lightweight migration path without Alembic.
    with _session_scope() as session:
        _ensure_column(session, "ledger_store", "kind", "TEXT")
        _ensure_column(session, "ledger_store", "receiver_team_id", "TEXT")
        _ensure_column(session, "ledger_store", "provider_cost", "REAL")
        _ensure_column(session, "ledger_store", "royalty_cost", "REAL")
        _ensure_column(session, "ledger_store", "platform_fee", "REAL")
        _ensure_column(session, "ledger_store", "total_cost", "REAL")
        session.execute(text("CREATE INDEX IF NOT EXISTS ix_ledger_store_created_at ON ledger_store(created_at)"))
        session.execute(text("CREATE INDEX IF NOT EXISTS ix_ledger_store_receiver_team ON ledger_store(receiver_team_id)"))
        session.execute(text("CREATE INDEX IF NOT EXISTS ix_mission_store_owner_id ON mission_store(owner_id)"))
        session.execute(text("CREATE INDEX IF NOT EXISTS ix_mission_store_status ON mission_store(status)"))
        session.execute(text("CREATE INDEX IF NOT EXISTS ix_mission_store_created_at ON mission_store(created_at)"))


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
    return bool(get_provider_key(provider))


def get_provider_key(provider: str) -> str | None:
    with _session_scope() as session:
        row = session.get(KeyRegistry, str(provider).strip().lower())
        if not row or not row.api_key.strip():
            return None
        try:
            value = decrypt_provider_key(row.api_key).strip()
        except ValueError:
            return None
        return value or None


def upsert_provider_key(provider: str, api_key: str, masked: str, updated_at: float) -> None:
    stored_key = encrypt_provider_key(api_key)
    with _session_scope() as session:
        row = session.get(KeyRegistry, provider)
        if row is None:
            row = KeyRegistry(provider=provider, api_key=stored_key, masked=masked, updated_at=updated_at)
            session.add(row)
        else:
            row.api_key = stored_key
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
        registered = False
        if row is not None:
            try:
                registered = bool(decrypt_provider_key(row.api_key).strip())
            except ValueError:
                registered = False
        result.append(
            {
                "provider": provider,
                "env_name": env_name,
                "registered": registered,
                "masked": row.masked if registered and row else None,
                "updated_at": row.updated_at if registered and row else None,
            }
        )
    return result


def list_registered_keys() -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = session.query(KeyRegistry).all()
        result: List[Dict[str, Any]] = []
        for row in rows:
            try:
                api_key = decrypt_provider_key(row.api_key)
            except ValueError:
                api_key = ""
            result.append(
                {
                    "provider": row.provider,
                    "api_key": api_key,
                    "masked": row.masked,
                    "updated_at": row.updated_at,
                }
            )
        return result


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
            query = query.filter(KeyHistory.actor == actor.strip())
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
    return json.dumps(payload, ensure_ascii=False, default=str)


def _loads(payload: str) -> Dict[str, Any]:
    try:
        parsed = json.loads(payload)
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _key_encryption_secret() -> bytes:
    raw = (
        os.getenv(KEY_ENCRYPTION_SECRET_ENV)
        or os.getenv(LEGACY_JWT_SECRET_ENV)
        or DEFAULT_DEV_KEY_ENCRYPTION_SECRET
    )
    return hashlib.sha256(raw.encode("utf-8")).digest()


def _derive_key_stream(secret: bytes, nonce: bytes, size: int) -> bytes:
    chunks: List[bytes] = []
    counter = 0
    while sum(len(chunk) for chunk in chunks) < size:
        counter_bytes = counter.to_bytes(4, "big")
        chunks.append(hmac.new(secret, nonce + counter_bytes, hashlib.sha256).digest())
        counter += 1
    return b"".join(chunks)[:size]


def encrypt_provider_key(raw_key: str) -> str:
    plaintext = raw_key.encode("utf-8")
    nonce = secrets.token_bytes(16)
    secret = _key_encryption_secret()
    stream = _derive_key_stream(secret, nonce, len(plaintext))
    ciphertext = bytes(a ^ b for a, b in zip(plaintext, stream))
    tag = hmac.new(secret, nonce + ciphertext, hashlib.sha256).digest()
    envelope = base64.urlsafe_b64encode(nonce + tag + ciphertext).decode("ascii")
    return f"{ENCRYPTED_KEY_PREFIX}{envelope}"


def decrypt_provider_key(stored_key: str) -> str:
    if not stored_key.startswith(ENCRYPTED_KEY_PREFIX):
        return stored_key
    encoded = stored_key[len(ENCRYPTED_KEY_PREFIX) :]
    try:
        raw = base64.urlsafe_b64decode(encoded.encode("ascii"))
    except Exception as exc:
        raise ValueError("provider_key_invalid_envelope") from exc
    if len(raw) < 48:
        raise ValueError("provider_key_invalid_envelope")
    nonce = raw[:16]
    tag = raw[16:48]
    ciphertext = raw[48:]
    secret = _key_encryption_secret()
    expected_tag = hmac.new(secret, nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected_tag):
        raise ValueError("provider_key_decryption_failed")
    stream = _derive_key_stream(secret, nonce, len(ciphertext))
    plaintext = bytes(a ^ b for a, b in zip(ciphertext, stream))
    return plaintext.decode("utf-8")


def create_member_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    member_id = str(profile["id"])
    with _session_scope() as session:
        row = MemberStore(member_id=member_id, payload=_dumps(profile))
        session.merge(row)
    return profile


def get_member_profile(member_id: str) -> Optional[Dict[str, Any]]:
    with _session_scope() as session:
        row = session.get(MemberStore, member_id)
        parsed = _loads(row.payload) if row else {}
        return parsed or None


def list_member_records() -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = session.query(MemberStore).all()
        return [parsed for row in rows if (parsed := _loads(row.payload))]


def upsert_workspace_settings(user_id: str, settings: Dict[str, Any], updated_at: float) -> Dict[str, Any]:
    payload = {**settings, "user_id": str(user_id), "updated_at": float(updated_at)}
    with _session_scope() as session:
        session.merge(
            WorkspaceSettingsStore(
                user_id=str(user_id),
                updated_at=float(updated_at),
                payload=_dumps(payload),
            )
        )
    return payload


def get_workspace_settings(user_id: str) -> Optional[Dict[str, Any]]:
    with _session_scope() as session:
        row = session.get(WorkspaceSettingsStore, str(user_id))
        parsed = _loads(row.payload) if row else {}
        return parsed or None


def upsert_memory_record(record: Dict[str, Any], updated_at: float) -> Dict[str, Any]:
    payload = {
        "scope": str(record.get("scope") or ""),
        "scope_id": str(record.get("scope_id") or ""),
        "key": str(record.get("key") or ""),
        "value": record.get("value"),
        "classification": str(record.get("classification") or "internal"),
        "updated_at": float(updated_at),
    }
    with _session_scope() as session:
        session.merge(
            MemoryStore(
                scope=payload["scope"],
                scope_id=payload["scope_id"],
                key=payload["key"],
                classification=payload["classification"],
                updated_at=payload["updated_at"],
                payload=_dumps(payload),
            )
        )
    return payload


def list_memory_records(scope: str, scope_id: str) -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = (
            session.query(MemoryStore)
            .filter(MemoryStore.scope == str(scope), MemoryStore.scope_id == str(scope_id))
            .order_by(MemoryStore.updated_at.asc(), MemoryStore.key.asc())
            .all()
        )
        return [parsed for row in rows if (parsed := _loads(row.payload))]


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
        parsed = _loads(row.payload) if row else {}
        return parsed or None


def list_team_records() -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = session.query(TeamStore).all()
        return [parsed for row in rows if (parsed := _loads(row.payload))]


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
        parsed = _loads(row.payload) if row else {}
        return parsed or None


def list_channel_records() -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = session.query(ChannelStore).all()
        return [parsed for row in rows if (parsed := _loads(row.payload))]


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
        parsed = _loads(row.payload) if row else {}
        return parsed or None


def list_contract_records() -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = session.query(ContractStore).all()
        return [parsed for row in rows if (parsed := _loads(row.payload))]


def list_contract_history_by_pair(pair_key: str) -> List[Dict[str, Any]]:
    with _session_scope() as session:
        rows = (
            session.query(ContractStore)
            .filter(ContractStore.pair_key == pair_key)
            .order_by(ContractStore.version.asc())
            .all()
        )
        return [parsed for row in rows if (parsed := _loads(row.payload))]


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
        parsed = _loads(row.payload) if row else {}
        return parsed or None


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
    receiver_team_id = str(
        row.get("receiver_team_id") or row.get("team_id") or row.get("source_team_id") or ""
    )
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
        return [parsed for row in rows if (parsed := _loads(row.payload))]


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


def _mission_created_at_epoch(mission: Dict[str, Any]) -> float:
    raw = str(mission.get("created_at") or "").strip()
    if raw:
        try:
            return datetime.fromisoformat(raw).timestamp()
        except ValueError:
            pass
    return datetime.now(timezone.utc).timestamp()


def upsert_mission_record(mission: Dict[str, Any], owner_id: str) -> Dict[str, Any]:
    mission_id = str(mission["id"])
    with _session_scope() as session:
        session.merge(
            MissionStore(
                mission_id=mission_id,
                owner_id=str(owner_id),
                status=str(mission.get("status", "unknown")),
                created_at=_mission_created_at_epoch(mission),
                payload=_dumps(mission),
            )
        )
    return mission


def get_mission_record(mission_id: str) -> Optional[Dict[str, Any]]:
    with _session_scope() as session:
        row = session.get(MissionStore, str(mission_id))
        parsed = _loads(row.payload) if row else {}
        return parsed or None


def list_mission_records(owner_id: Optional[str] = None) -> List[Dict[str, Any]]:
    with _session_scope() as session:
        query = session.query(MissionStore)
        if owner_id:
            query = query.filter(MissionStore.owner_id == owner_id)
        rows = query.order_by(MissionStore.created_at.desc()).all()
        return [parsed for row in rows if (parsed := _loads(row.payload))]


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
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    suffix = f"-{label}" if label else ""
    target = backup_dir / f"bremen-{stamp}{suffix}.db"
    with sqlite3.connect(source) as source_connection, sqlite3.connect(target) as target_connection:
        source_connection.backup(target_connection)
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
        receiver = str(row.get("receiver_team_id") or row.get("team_id") or row.get("source_team_id") or "")
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
