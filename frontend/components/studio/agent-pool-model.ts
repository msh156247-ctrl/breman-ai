import { getAgentOntologyUnit } from "../../lib/ontology";
import type { Agent } from "../../types";

export type PoolTab = "pool" | "library";

export const ALL_FOLDERS_ID = "all";
export const ALL_UNITS_ID = "all";

export function agentMatchesPoolQuery(agent: Agent, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const unit = getAgentOntologyUnit(agent);
  return [
    agent.name,
    agent.category,
    agent.required_api,
    agent.description,
    unit.name,
    unit.label,
    unit.memberRole,
    agent.unit_role,
    agent.responsibility,
    ...(agent.tags || []),
    ...(agent.capabilities || [])
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}
