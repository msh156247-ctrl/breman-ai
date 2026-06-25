"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchWorkspaceSettings,
  saveWorkspaceSettings
} from "../lib/api";
import {
  shouldSeedRemoteWorkspaceSettings,
  workspaceSettingsPayload,
  workspaceSettingsSignature
} from "../lib/workspace-settings";
import {
  readSessionIdentity,
  SESSION_IDENTITY_CHANGED_EVENT
} from "../lib/auth";
import { useAppStore } from "../stores/app.store";
import { useAppStoreHydrated } from "./useAppStoreHydrated";

const WORKSPACE_OWNER_STORAGE_KEY = "bremen.workspace.owner.v1";

export function useWorkspaceSettingsSync(): void {
  const hydrated = useAppStoreHydrated();
  const hiredAgents = useAppStore((state) => state.hiredAgents);
  const libraryAgents = useAppStore((state) => state.libraryAgents);
  const projectUnits = useAppStore((state) => state.projectUnits);
  const memberFolders = useAppStore((state) => state.memberFolders);
  const agentFolderIds = useAppStore((state) => state.agentFolderIds);
  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);
  const nodeExecutionStates = useAppStore((state) => state.nodeExecutionStates);
  const artifactVersions = useAppStore((state) => state.artifactVersions);
  const loopRegions = useAppStore((state) => state.loopRegions);
  const applyWorkspaceSettings = useAppStore((state) => state.applyWorkspaceSettings);
  const resetUserWorkspace = useAppStore((state) => state.resetUserWorkspace);
  const [identityKey, setIdentityKey] = useState(() => {
    const identity = readSessionIdentity();
    return `${identity.userId}:${identity.role}`;
  });
  const identityRef = useRef(readSessionIdentity());
  const loadedRemoteRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const lastSavedSignatureRef = useRef("");
  const saveRequestIdRef = useRef(0);
  const identityChangedRef = useRef(false);
  const userChangedRef = useRef(false);

  useEffect(() => {
    const handleIdentityChange = () => {
      const previous = identityRef.current;
      const next = readSessionIdentity();
      const userChanged = previous.userId !== next.userId;
      const accessChanged = userChanged || previous.role !== next.role;
      identityRef.current = next;
      if (!accessChanged) return;

      identityChangedRef.current = true;
      userChangedRef.current = userChanged;
      loadedRemoteRef.current = false;
      lastSavedSignatureRef.current = "";
      saveRequestIdRef.current += 1;
      if (userChanged) resetUserWorkspace();
      setIdentityKey(`${next.userId}:${next.role}`);
    };
    window.addEventListener(SESSION_IDENTITY_CHANGED_EVENT, handleIdentityChange);
    window.addEventListener("storage", handleIdentityChange);
    return () => {
      window.removeEventListener(SESSION_IDENTITY_CHANGED_EVENT, handleIdentityChange);
      window.removeEventListener("storage", handleIdentityChange);
    };
  }, [resetUserWorkspace]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const currentIdentity = readSessionIdentity();
    try {
      const previousOwnerId = window.localStorage.getItem(WORKSPACE_OWNER_STORAGE_KEY);
      if (previousOwnerId && previousOwnerId !== currentIdentity.userId) {
        resetUserWorkspace();
        identityChangedRef.current = true;
        userChangedRef.current = true;
        lastSavedSignatureRef.current = "";
      }
      window.localStorage.setItem(WORKSPACE_OWNER_STORAGE_KEY, currentIdentity.userId);
    } catch {
      // Remote workspace settings still provide user isolation when local storage is unavailable.
    }

    fetchWorkspaceSettings()
      .then(async (response) => {
        if (cancelled) return;
        const localPayload = workspaceSettingsPayload(useAppStore.getState());
        const localSignature = workspaceSettingsSignature(localPayload);
        let remoteSettings = response.settings;

        if (
          response.exists &&
          Number(remoteSettings.schema_version || 0) < 4 &&
          !identityChangedRef.current
        ) {
          const migrated = await saveWorkspaceSettings({
            ...remoteSettings,
            client_version: localPayload.client_version,
            hired_agents: localPayload.hired_agents,
            nodes: localPayload.nodes,
            edges: localPayload.edges,
            node_execution_states: localPayload.node_execution_states,
            artifact_versions: localPayload.artifact_versions,
            loop_regions: localPayload.loop_regions
          });
          if (cancelled) return;
          remoteSettings = migrated.settings;
        }
        const remoteSignature = workspaceSettingsSignature(remoteSettings);

        if (response.exists) {
          if (!identityChangedRef.current && shouldSeedRemoteWorkspaceSettings(localPayload, remoteSettings)) {
            const seeded = await saveWorkspaceSettings(localPayload);
            if (cancelled) return;
            lastSavedSignatureRef.current = workspaceSettingsSignature(seeded.settings);
            return;
          }
          if (remoteSignature === localSignature) {
            lastSavedSignatureRef.current = remoteSignature;
            return;
          }
          applyingRemoteRef.current = true;
          applyWorkspaceSettings({
            hiredAgents: remoteSettings.hired_agents,
            libraryAgents: remoteSettings.library_agents,
            projectUnits: remoteSettings.project_units,
            memberFolders: remoteSettings.member_folders,
            agentFolderIds: remoteSettings.agent_folder_ids,
            nodes: remoteSettings.nodes,
            edges: remoteSettings.edges,
            nodeExecutionStates: remoteSettings.node_execution_states,
            artifactVersions: remoteSettings.artifact_versions,
            loopRegions: remoteSettings.loop_regions
          });
          lastSavedSignatureRef.current = remoteSignature;
        } else {
          if (userChangedRef.current) {
            applyWorkspaceSettings({
              hiredAgents: [],
              libraryAgents: [],
              projectUnits: [],
              memberFolders: [],
              agentFolderIds: {},
              nodes: [],
              edges: [],
              nodeExecutionStates: {},
              artifactVersions: [],
              loopRegions: []
            });
            lastSavedSignatureRef.current = remoteSignature;
          } else if (identityChangedRef.current) {
            // A role change should reload access rules without trying to seed
            // remote state using a potentially read-only identity.
            lastSavedSignatureRef.current = localSignature;
          } else {
            const seeded = await saveWorkspaceSettings(localPayload);
            if (cancelled) return;
            lastSavedSignatureRef.current = workspaceSettingsSignature(seeded.settings);
          }
        }
      })
      .catch(() => {
        // Local storage remains the fallback when the backend is offline or the user is read-only.
      })
      .finally(() => {
        if (!cancelled) {
          loadedRemoteRef.current = true;
          identityChangedRef.current = false;
          userChangedRef.current = false;
        }
      });

    return () => {
      cancelled = true;
      saveRequestIdRef.current += 1;
    };
  }, [applyWorkspaceSettings, hydrated, identityKey, resetUserWorkspace]);

  useEffect(() => {
    if (!hydrated || !loadedRemoteRef.current) return;
    const payload = workspaceSettingsPayload({
      hiredAgents,
      libraryAgents,
      projectUnits,
      memberFolders,
      agentFolderIds,
      nodes,
      edges,
      nodeExecutionStates,
      artifactVersions,
      loopRegions
    });
    const signature = workspaceSettingsSignature(payload);

    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      lastSavedSignatureRef.current = signature;
      return;
    }
    if (signature === lastSavedSignatureRef.current) return;

    const timeout = window.setTimeout(() => {
      const requestId = ++saveRequestIdRef.current;
      saveWorkspaceSettings(payload)
        .then((response) => {
          if (requestId !== saveRequestIdRef.current) return;
          const responseSignature = workspaceSettingsSignature(response.settings);
          const currentPayload = workspaceSettingsPayload(useAppStore.getState());
          const currentSignature = workspaceSettingsSignature(currentPayload);
          if (currentSignature !== signature) return;

          if (responseSignature !== signature) {
            applyingRemoteRef.current = true;
            applyWorkspaceSettings({
              hiredAgents: response.settings.hired_agents,
              libraryAgents: response.settings.library_agents,
              projectUnits: response.settings.project_units,
              memberFolders: response.settings.member_folders,
              agentFolderIds: response.settings.agent_folder_ids,
              nodes: response.settings.nodes,
              edges: response.settings.edges,
              nodeExecutionStates: response.settings.node_execution_states,
              artifactVersions: response.settings.artifact_versions,
              loopRegions: response.settings.loop_regions
            });
          }
          lastSavedSignatureRef.current = responseSignature;
        })
        .catch(() => {
          if (requestId === saveRequestIdRef.current) {
            lastSavedSignatureRef.current = "";
          }
        });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [
    agentFolderIds,
    applyWorkspaceSettings,
    artifactVersions,
    edges,
    hiredAgents,
    hydrated,
    libraryAgents,
    loopRegions,
    memberFolders,
    nodeExecutionStates,
    nodes,
    projectUnits
  ]);
}
