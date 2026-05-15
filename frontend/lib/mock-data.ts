import { Agent, TeamTemplate } from "../types";

export const MOCK_AGENTS: Agent[] = [
  {
    id: "agent-001",
    name: "풀스택 코드 작성봇",
    description: "요구사항을 받아 FastAPI 백엔드와 Next.js 프론트엔드 코드를 동시에 설계하고 작성합니다.",
    category: "개발",
    required_api: "openai",
    creator: "devmaster_kim",
    creator_avatar: "👨‍💻",
    rating: 4.9,
    usage_count: 2143,
    royalty_per_use: 0.02,
    tags: ["FastAPI", "Next.js", "Python", "TypeScript"],
    is_featured: true,
    input_type: "text",
    output_type: "code",
    model_name: "GPT-4o",
    model_version: "2024-05",
    updated_at: "2026-05-12",
    capabilities: ["FastAPI", "SQL schema generation", "React refactor", "Test generation"],
    avg_latency_ms: 2340,
    success_rate: 98.2,
    fail_rate: 1.8,
    reuse_rate: 72.4,
    avg_cost: 0.021
  },
  {
    id: "agent-002",
    name: "깐깐한 코드 리뷰어",
    description: "보안 취약점, 성능 이슈, 코드 스타일을 꼼꼼히 검토합니다.",
    category: "검토",
    required_api: "anthropic",
    creator: "review_master",
    creator_avatar: "🔍",
    rating: 4.8,
    usage_count: 1567,
    royalty_per_use: 0.015,
    tags: ["코드리뷰", "보안", "성능", "OWASP"],
    input_type: "code",
    output_type: "text",
    model_name: "Claude 3.5 Sonnet",
    model_version: "2024-10",
    updated_at: "2026-05-10",
    capabilities: ["Security audit", "Performance review", "Architecture review"],
    avg_latency_ms: 3120,
    success_rate: 96.7,
    fail_rate: 3.3,
    reuse_rate: 68.1,
    avg_cost: 0.018
  },
  {
    id: "agent-003",
    name: "감성 카피라이터",
    description: "브랜드 톤앤매너에 맞는 감성적인 카피를 작성합니다.",
    category: "글쓰기",
    required_api: "anthropic",
    creator: "copy_queen",
    creator_avatar: "✍️",
    rating: 4.9,
    usage_count: 1823,
    royalty_per_use: 0.01,
    tags: ["카피라이팅", "SNS", "브랜딩"],
    is_featured: true,
    input_type: "text",
    output_type: "text",
    model_name: "Claude 3 Haiku",
    model_version: "2024-08",
    updated_at: "2026-05-07",
    capabilities: ["Copy writing", "Tone conversion", "SNS draft"],
    avg_latency_ms: 980,
    success_rate: 97.5,
    fail_rate: 2.5,
    reuse_rate: 75.8,
    avg_cost: 0.01
  },
  {
    id: "agent-004",
    name: "UI 목업 생성기",
    description: "텍스트 설명만으로 고품질 UI 목업 이미지를 생성합니다.",
    category: "이미지",
    required_api: "stability",
    creator: "design_wizard",
    creator_avatar: "🎨",
    rating: 4.7,
    usage_count: 892,
    royalty_per_use: 0.04,
    tags: ["UI/UX", "목업", "디자인"],
    input_type: "text",
    output_type: "image",
    model_name: "Stable Diffusion XL",
    model_version: "1.0",
    updated_at: "2026-05-08",
    capabilities: ["UI mockup", "Illustration", "Style transfer"],
    avg_latency_ms: 4210,
    success_rate: 94.2,
    fail_rate: 5.8,
    reuse_rate: 61.3,
    avg_cost: 0.039
  },
  {
    id: "agent-005",
    name: "데이터 분석 봇",
    description: "CSV, JSON 데이터를 받아 인사이트를 추출하고 시각화 코드를 생성합니다.",
    category: "데이터",
    required_api: "openai",
    creator: "data_scientist_lee",
    creator_avatar: "📊",
    rating: 4.8,
    usage_count: 1234,
    royalty_per_use: 0.025,
    tags: ["데이터분석", "Python", "pandas"],
    input_type: "text",
    output_type: "code",
    model_name: "GPT-4o-mini",
    model_version: "2024-07",
    updated_at: "2026-05-11",
    capabilities: ["Pandas analysis", "Chart code", "KPI summary"],
    avg_latency_ms: 1870,
    success_rate: 97.9,
    fail_rate: 2.1,
    reuse_rate: 70.2,
    avg_cost: 0.019
  }
];

export const MOCK_TEAMS: TeamTemplate[] = [
  {
    id: "team-001",
    name: "풀스택 개발팀",
    description: "기획부터 배포까지 자동화. 코드 작성 → 리뷰 → 테스트 → 문서화 전 과정을 AI가 처리합니다.",
    category: "개발",
    creator: "devmaster_kim",
    creator_avatar: "👨‍💻",
    agent_ids: ["agent-001", "agent-002"],
    workflow: ["기획", "설계", "개발", "리뷰", "테스트"],
    rating: 4.9,
    usage_count: 1247,
    royalty_per_execution: 0.05,
    tags: ["풀스택", "자동화", "CI/CD"],
    is_featured: true,
    estimated_time: "약 5-10분",
    estimated_cost: 0.08
  },
  {
    id: "team-002",
    name: "블로그 콘텐츠 자동화팀",
    description: "주제만 입력하면 SEO 최적화된 블로그 포스팅을 완성합니다.",
    category: "글쓰기",
    creator: "content_master",
    creator_avatar: "✍️",
    agent_ids: ["agent-003"],
    workflow: ["초안작성", "교정", "SEO최적화", "최종검토"],
    rating: 4.8,
    usage_count: 892,
    royalty_per_execution: 0.03,
    tags: ["블로그", "SEO", "콘텐츠마케팅"],
    is_featured: true,
    estimated_time: "약 3-5분",
    estimated_cost: 0.04
  }
];

export type MockMissionRunRecord = {
  id: string;
  goal: string;
  state: "queued" | "running" | "completed" | "failed" | "awaiting_approval" | "blocked";
  team_label: string;
  started_at: string;
  est_cost_usd: number;
  latency_sec: number;
  demo: boolean;
};

export const MOCK_MISSION_RUNS: MockMissionRunRecord[] = [
  {
    id: "demo-mission",
    goal: "데모: API 스펙 초안 + QA 피드백 루프",
    state: "running",
    team_label: "풀스택 개발팀 (fork)",
    started_at: "2026-05-15T04:12:00",
    est_cost_usd: 0.056,
    latency_sec: 42,
    demo: true
  },
  {
    id: "demo-approval-01",
    goal: "프로덕션 배포 승인 전 보안 점검",
    state: "awaiting_approval",
    team_label: "Release Ops",
    started_at: "2026-05-14T18:40:00",
    est_cost_usd: 0.031,
    latency_sec: 120,
    demo: true
  },
  {
    id: "run-7f2a",
    goal: "블로그 주제 → SEO 포스트 자동화",
    state: "completed",
    team_label: "블로그 콘텐츠 자동화팀",
    started_at: "2026-05-13T09:22:00",
    est_cost_usd: 0.041,
    latency_sec: 215,
    demo: false
  },
  {
    id: "run-3c91",
    goal: "Router: risk_score 분기 후 Security 팀 에스컬레이션",
    state: "blocked",
    team_label: "cross-team · team-001↔team-002",
    started_at: "2026-05-12T11:05:00",
    est_cost_usd: 0.089,
    latency_sec: 480,
    demo: false
  },
  {
    id: "run-9aa1",
    goal: "스키마 mismatch 재시도 2회 후 실패",
    state: "failed",
    team_label: "풀스택 개발팀",
    started_at: "2026-05-11T16:33:00",
    est_cost_usd: 0.072,
    latency_sec: 360,
    demo: false
  }
];

export type MockKeyStatus = {
  provider: string;
  registered: boolean;
  masked?: string | null;
};

export type MockSettlement = {
  period: string;
  receiver_team_id: string;
  royalty_cost: number;
  total_cost: number;
  entries: number;
};

export const MOCK_KEY_STATUSES: MockKeyStatus[] = [
  { provider: "openai", registered: true, masked: "sk-...A91K" },
  { provider: "anthropic", registered: false, masked: null },
  { provider: "stability", registered: true, masked: "sk-...9XZ2" },
  { provider: "google", registered: true, masked: "AIza...Q7M" }
];

export const MOCK_SETTLEMENTS: MockSettlement[] = [
  { period: "2026-W18", receiver_team_id: "team-001", royalty_cost: 12.42, total_cost: 45.1, entries: 481 },
  { period: "2026-W18", receiver_team_id: "team-002", royalty_cost: 8.14, total_cost: 27.8, entries: 337 },
  { period: "2026-W17", receiver_team_id: "team-001", royalty_cost: 10.31, total_cost: 39.0, entries: 412 },
  { period: "2026-W17", receiver_team_id: "team-002", royalty_cost: 7.02, total_cost: 24.5, entries: 298 },
  { period: "2026-W16", receiver_team_id: "team-001", royalty_cost: 9.88, total_cost: 36.2, entries: 390 },
  { period: "2026-W16", receiver_team_id: "team-002", royalty_cost: 6.67, total_cost: 22.9, entries: 271 }
];
