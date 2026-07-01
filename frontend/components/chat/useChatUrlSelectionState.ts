import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  normalizeSideTab,
  type SideTab
} from "./chat-runtime-model";

export function useChatUrlSelectionState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedMetricNode, setSelectedMetricNode] = useState<string | null>(searchParams.get("node"));
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(searchParams.get("artifact"));
  const [sideTab, setSideTab] = useState<SideTab>(() => normalizeSideTab(searchParams.get("tab")));

  useEffect(() => {
    const q = new URLSearchParams(searchParams.toString());
    if (selectedMetricNode) q.set("node", selectedMetricNode);
    else q.delete("node");
    if (selectedArtifact) q.set("artifact", selectedArtifact);
    else q.delete("artifact");
    if (sideTab) q.set("tab", sideTab);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }, [pathname, router, searchParams, selectedArtifact, selectedMetricNode, sideTab]);

  return {
    selectedMetricNode,
    setSelectedMetricNode,
    selectedArtifact,
    setSelectedArtifact,
    sideTab,
    setSideTab
  };
}
