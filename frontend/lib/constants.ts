import { APIProvider, AgentCategory } from "../types";

export const API_PROVIDER_CONFIG: Record<
  APIProvider,
  {
    label: string;
    color: string;
    bg: string;
    models: string[];
  }
> = {
  openai: {
    label: "OpenAI",
    color: "#10B981",
    bg: "rgba(16,185,129,0.1)",
    models: ["GPT-4o", "GPT-4o-mini", "DALL-E 3"]
  },
  anthropic: {
    label: "Anthropic",
    color: "#F97316",
    bg: "rgba(249,115,22,0.1)",
    models: ["Claude 3.5 Sonnet", "Claude 3 Haiku"]
  },
  gemini: {
    label: "Google Gemini",
    color: "#3B82F6",
    bg: "rgba(59,130,246,0.1)",
    models: ["Gemini 1.5 Pro", "Gemini Flash"]
  },
  stability: {
    label: "Stability AI",
    color: "#8B5CF6",
    bg: "rgba(139,92,246,0.1)",
    models: ["Stable Diffusion XL", "SDXL Turbo"]
  },
  google: {
    label: "Google",
    color: "#3B82F6",
    bg: "rgba(59,130,246,0.1)",
    models: ["Gemini 1.5 Pro", "Gemini Flash"]
  },
  mock: {
    label: "Mock",
    color: "#9CA3AF",
    bg: "rgba(156,163,175,0.1)",
    models: ["mock-sim"]
  }
};

export const CATEGORY_CONFIG: Record<AgentCategory, { emoji: string; color: string }> = {
  전체: { emoji: "🌐", color: "#6B7280" },
  개발: { emoji: "💻", color: "#3B82F6" },
  글쓰기: { emoji: "✍️", color: "#10B981" },
  이미지: { emoji: "🎨", color: "#8B5CF6" },
  데이터: { emoji: "📊", color: "#F59E0B" },
  검토: { emoji: "🔍", color: "#EF4444" },
  번역: { emoji: "🌏", color: "#06B6D4" },
  기획: { emoji: "📋", color: "#EC4899" }
};
