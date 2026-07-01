import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchApprovalChannelSettings,
  type ApprovalChannelId,
  type ApprovalChannelSettings
} from "../../lib/api";
import {
  APPROVAL_CHANNEL_OPTIONS,
  studioApprovalChannelState,
  type ApprovalSettingsLoadState,
  type StudioApprovalChannelState
} from "./studio-canvas-model";

type UseStudioApprovalChannelsParams = {
  selectedApprovalChannels: string[];
  updateSelectedNodeData: (data: Record<string, unknown>) => void;
};

export function useStudioApprovalChannels({
  selectedApprovalChannels,
  updateSelectedNodeData
}: UseStudioApprovalChannelsParams) {
  const [approvalSettings, setApprovalSettings] = useState<ApprovalChannelSettings | null>(null);
  const [approvalEnvOverrides, setApprovalEnvOverrides] = useState<Record<string, boolean>>({});
  const [approvalSettingsState, setApprovalSettingsState] = useState<ApprovalSettingsLoadState>("idle");

  useEffect(() => {
    let cancelled = false;
    setApprovalSettingsState("loading");
    fetchApprovalChannelSettings()
      .then((response) => {
        if (cancelled) return;
        setApprovalSettings(response.settings);
        setApprovalEnvOverrides(response.env_overrides || {});
        setApprovalSettingsState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setApprovalSettings(null);
        setApprovalEnvOverrides({});
        setApprovalSettingsState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const approvalChannelStates = useMemo(
    () =>
      Object.fromEntries(
        APPROVAL_CHANNEL_OPTIONS.map((channel) => [
          channel.id,
          studioApprovalChannelState(channel.id, approvalSettings, approvalEnvOverrides, approvalSettingsState)
        ])
      ) as Record<ApprovalChannelId, StudioApprovalChannelState>,
    [approvalEnvOverrides, approvalSettings, approvalSettingsState]
  );

  const selectedUnreadyApprovalChannels = useMemo(
    () =>
      selectedApprovalChannels
        .map((channel) => channel as ApprovalChannelId)
        .filter((channel) => channel !== "admin_queue" && approvalChannelStates[channel]?.tone === "warn"),
    [approvalChannelStates, selectedApprovalChannels]
  );

  const toggleSelectedApprovalChannel = useCallback(
    (channelId: ApprovalChannelId) => {
      const active = selectedApprovalChannels.includes(channelId);
      const channelState = approvalChannelStates[channelId];
      const canEnable = channelId === "admin_queue" || channelState?.tone === "ready";
      if (!active && !canEnable) return;

      const nextChannels = active
        ? selectedApprovalChannels.filter((id) => id !== channelId)
        : [...selectedApprovalChannels, channelId];
      updateSelectedNodeData({ approval_channels: nextChannels.length > 0 ? nextChannels : ["admin_queue"] });
    },
    [approvalChannelStates, selectedApprovalChannels, updateSelectedNodeData]
  );

  return {
    approvalChannelStates,
    selectedUnreadyApprovalChannels,
    toggleSelectedApprovalChannel
  };
}
