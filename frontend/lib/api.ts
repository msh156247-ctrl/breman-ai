export async function fetchMarketAgents(params: {
  category?: string;
  search?: string;
  available_only?: boolean;
}) {
  const q = new URLSearchParams();
  if (params.category && params.category !== "전체") q.set("category", params.category);
  if (params.search) q.set("search", params.search);
  if (params.available_only) q.set("available_only", "true");
  const res = await fetch(`/api/members?${q.toString()}&is_ai=true&published=true`);
  return res.json();
}

export async function fetchMarketTeams(params: { category?: string; search?: string }) {
  const q = new URLSearchParams();
  if (params.category && params.category !== "전체") q.set("category", params.category);
  if (params.search) q.set("search", params.search);
  const res = await fetch(`/api/teams?${q.toString()}&is_template=true&published=true`);
  return res.json();
}
