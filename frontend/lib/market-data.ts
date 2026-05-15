import { Agent, APIProvider, TeamTemplate } from "../types/market";

export const API_PROVIDER_INFO: Record<APIProvider, { label: string; color: string }> = {
  openai: { label: "OpenAI", color: "#10B981" },
  anthropic: { label: "Anthropic", color: "#F97316" },
  stability: { label: "Stability", color: "#8B5CF6" },
  google: { label: "Google", color: "#3B82F6" }
};

export const CATEGORIES = [
  { label: "전체" as const, emoji: "🌐" },
  { label: "개발" as const, emoji: "💻" },
  { label: "글쓰기" as const, emoji: "✍️" },
  { label: "이미지" as const, emoji: "🎨" },
  { label: "데이터" as const, emoji: "📊" },
  { label: "검토" as const, emoji: "🔍" },
  { label: "번역" as const, emoji: "🌏" },
  { label: "기획" as const, emoji: "📋" }
];

export const MOCK_AGENTS: Agent[] = [
  {
    id: "agent-001",
    name: "풀스택 코드 작성봇",
    description: "요구사항을 받아 프론트엔드/백엔드 코드를 동시에 작성합니다. FastAPI + Next.js 특화.",
    category: "개발",
    required_api: "openai",
    creator: "devmaster_kim",
    creator_avatar: "👨‍💻",
    rating: 4.9,
    usage_count: 2143,
    royalty_per_use: 0.02,
    tags: ["FastAPI", "Next.js", "Python", "TypeScript"],
    is_featured: true
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
    tags: ["코드리뷰", "보안", "성능"]
  },
  {
    id: "agent-003",
    name: "감성 카피라이터",
    description: "브랜드 톤에 맞는 감성적인 카피를 작성합니다.",
    category: "글쓰기",
    required_api: "anthropic",
    creator: "copy_queen",
    creator_avatar: "✍️",
    rating: 4.9,
    usage_count: 1823,
    royalty_per_use: 0.01,
    tags: ["카피라이팅", "SNS", "브랜딩"],
    is_featured: true
  }
];

export const MOCK_TEAMS: TeamTemplate[] = [
  {
    id: "team-001",
    name: "풀스택 개발팀",
    description: "기획부터 배포까지. 코드 작성 → 리뷰 → 테스트 → 문서화 자동화.",
    category: "개발",
    creator: "devmaster_kim",
    creator_avatar: "👨‍💻",
    agents: [MOCK_AGENTS[0], MOCK_AGENTS[1]],
    workflow: ["기획", "설계", "개발", "리뷰", "테스트"],
    rating: 4.9,
    usage_count: 1247,
    royalty_per_execution: 0.05,
    tags: ["풀스택", "자동화", "CI/CD"],
    is_featured: true,
    estimated_time: "약 5-10분",
    estimated_cost: 0.08
  }
];
