import AsyncStorage from "@react-native-async-storage/async-storage";
import { SavedTV } from "../types/tv";

const LEGACY_SAVED_TV_KEY = "tv_remote:saved_tv_v1";
const TV_PROFILES_KEY = "tv_remote:tv_profiles_v1";
const ACTIVE_TV_ID_KEY = "tv_remote:active_tv_id_v1";

export type TVStoreState = {
  profiles: SavedTV[];
  activeTVId: string | null;
};

function parseSavedTV(raw: string | null): SavedTV | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SavedTV;
  } catch {
    return null;
  }
}

function parseProfiles(raw: string | null): SavedTV[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedTV[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveTVState(state: TVStoreState): Promise<void> {
  await AsyncStorage.multiSet([
    [TV_PROFILES_KEY, JSON.stringify(state.profiles)],
    [ACTIVE_TV_ID_KEY, state.activeTVId ?? ""],
  ]);
}

export async function loadTVState(): Promise<TVStoreState> {
  const entries = await AsyncStorage.multiGet([
    TV_PROFILES_KEY,
    ACTIVE_TV_ID_KEY,
    LEGACY_SAVED_TV_KEY,
  ]);
  const map = new Map(entries);

  const profiles = parseProfiles(map.get(TV_PROFILES_KEY) ?? null);
  const legacyTV = parseSavedTV(map.get(LEGACY_SAVED_TV_KEY) ?? null);
  const storedActiveId = map.get(ACTIVE_TV_ID_KEY) ?? null;

  let nextProfiles = profiles;
  let nextActiveId = storedActiveId && storedActiveId.length > 0 ? storedActiveId : null;

  // Migrate from older single-TV storage on first run.
  if (nextProfiles.length === 0 && legacyTV) {
    nextProfiles = [legacyTV];
    nextActiveId = legacyTV.id;
  }

  const activeExists = nextProfiles.some((profile) => profile.id === nextActiveId);
  if (!activeExists) {
    nextActiveId = nextProfiles[0]?.id ?? null;
  }

  const normalized: TVStoreState = {
    profiles: nextProfiles,
    activeTVId: nextActiveId,
  };

  await saveTVState(normalized);
  return normalized;
}

export async function upsertTVProfile(tv: SavedTV): Promise<TVStoreState> {
  const state = await loadTVState();
  const existingIndex = state.profiles.findIndex((profile) => profile.id === tv.id);

  const nextProfiles =
    existingIndex >= 0
      ? state.profiles.map((profile, index) => (index === existingIndex ? tv : profile))
      : [...state.profiles, tv];

  const nextState: TVStoreState = {
    profiles: nextProfiles,
    activeTVId: tv.id,
  };
  await saveTVState(nextState);
  return nextState;
}

export async function updateTVProfile(
  profileId: string,
  patch: Partial<Omit<SavedTV, "id">>
): Promise<TVStoreState> {
  const state = await loadTVState();
  const nextProfiles = state.profiles.map((profile) =>
    profile.id === profileId ? { ...profile, ...patch } : profile
  );

  const nextState: TVStoreState = {
    profiles: nextProfiles,
    activeTVId: state.activeTVId,
  };
  await saveTVState(nextState);
  return nextState;
}

export async function setActiveTVProfile(profileId: string): Promise<TVStoreState> {
  const state = await loadTVState();
  const exists = state.profiles.some((profile) => profile.id === profileId);
  const nextState: TVStoreState = {
    profiles: state.profiles,
    activeTVId: exists ? profileId : state.activeTVId,
  };
  await saveTVState(nextState);
  return nextState;
}

export async function deleteTVProfile(profileId: string): Promise<TVStoreState> {
  const state = await loadTVState();
  const nextProfiles = state.profiles.filter((profile) => profile.id !== profileId);

  const nextActiveId =
    state.activeTVId === profileId ? nextProfiles[0]?.id ?? null : state.activeTVId;

  const nextState: TVStoreState = {
    profiles: nextProfiles,
    activeTVId: nextActiveId,
  };

  await saveTVState(nextState);
  return nextState;
}

export async function clearTV(): Promise<void> {
  await AsyncStorage.multiRemove([TV_PROFILES_KEY, ACTIVE_TV_ID_KEY, LEGACY_SAVED_TV_KEY]);
}
