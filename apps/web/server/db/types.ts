import type { ColumnType } from "kysely";

type Instant = ColumnType<Date, Date | string, Date | string>;
type Digest = ColumnType<Buffer, Buffer, Buffer>;
type BigIntText = ColumnType<string, string | number, string | number>;

export interface Operators {
  id: string;
  singleton: boolean;
  login: string;
  password_algorithm: string;
  password_n: number;
  password_r: number;
  password_p: number;
  password_salt: Buffer;
  password_hash: Buffer;
  auth_version: BigIntText;
  created_at: Instant;
  password_changed_at: Instant;
}

export interface LoginThrottle {
  singleton: boolean;
  window_started_at: Instant;
  attempts: number;
}

export interface OperatorSessions {
  id: string;
  operator_id: string;
  secret_digest: Digest;
  auth_version: BigIntText;
  issued_at: Instant;
  last_seen_at: Instant;
  expires_at: Instant;
}

export interface Hosts {
  id: string;
  label: string;
  reported_hostname: string;
  os_id: string;
  os_version: string;
  architecture: string;
  enrolled_agent_version: string;
  created_at: Instant;
}

export interface Agents {
  id: string;
  host_id: string;
  current_generation: BigIntText;
  enrolled_at: Instant;
  revoked_at: Instant | null;
  heartbeat_interval_seconds: number;
  stale_after_seconds: number;
}

export interface AgentCredentials {
  id: string;
  agent_id: string;
  generation: BigIntText;
  secret_digest: Digest;
  created_at: Instant;
  revoked_at: Instant | null;
  last_sequence: BigIntText;
  last_fingerprint: Digest | null;
  accepted_at: Instant | null;
  sent_at: Instant | null;
  agent_version: string | null;
}

export interface EnrollmentTokens {
  id: string;
  secret_digest: Digest;
  issued_by: string;
  issuance_request_id: string;
  issuance_fingerprint: Digest;
  label: string;
  target_agent_id: string | null;
  expected_generation: BigIntText | null;
  issued_at: Instant;
  expires_at: Instant;
  revoked_at: Instant | null;
  consumed_at: Instant | null;
  consumed_request_id: string | null;
  consumed_fingerprint: Digest | null;
  consumed_credential_id: string | null;
}

export interface AuditEvents {
  id: string;
  occurred_at: Instant;
  action: string;
  actor_kind: string;
  operator_id: string | null;
  target_operator_id: string | null;
  agent_id: string | null;
  target_agent_id: string | null;
  host_id: string | null;
  token_id: string | null;
  correlation_id: string;
  from_generation: BigIntText | null;
  to_generation: BigIntText | null;
  revoked: boolean | null;
}

export interface Database {
  operators: Operators;
  login_throttle: LoginThrottle;
  operator_sessions: OperatorSessions;
  hosts: Hosts;
  agents: Agents;
  agent_credentials: AgentCredentials;
  enrollment_tokens: EnrollmentTokens;
  audit_events: AuditEvents;
}
