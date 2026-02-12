import React, { useEffect, useState } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, View } from "react-native";
import { useFonts } from "expo-font";
import { MaterialIcons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { RemoteScreen } from "./src/screens/RemoteScreen";
import { TVProfilesScreen } from "./src/screens/TVProfilesScreen";
import {
  deleteTVProfile,
  loadTVState,
  setActiveTVProfile,
  updateTVProfile,
  upsertTVProfile,
} from "./src/storage/tvStore";
import { palette } from "./src/theme";
import { SavedTV } from "./src/types/tv";

type ScreenMode = "loading" | "onboarding" | "profiles" | "remote";

export default function App() {
  const [profiles, setProfiles] = useState<SavedTV[]>([]);
  const [activeTVId, setActiveTVId] = useState<string | null>(null);
  const [mode, setMode] = useState<ScreenMode>("loading");
  const [fontsLoaded, fontError] = useFonts({
    ...MaterialIcons.font,
  });

  useEffect(() => {
    (async () => {
      const state = await loadTVState();
      setProfiles(state.profiles);
      setActiveTVId(state.activeTVId);

      if (state.activeTVId && state.profiles.some((profile) => profile.id === state.activeTVId)) {
        setMode("remote");
      } else if (state.profiles.length > 0) {
        setMode("profiles");
      } else {
        setMode("onboarding");
      }
    })();
  }, []);

  async function handleComplete(newTV: SavedTV) {
    const state = await upsertTVProfile(newTV);
    setProfiles(state.profiles);
    setActiveTVId(state.activeTVId);
    setMode("remote");
  }

  function handleSwitchTV() {
    setMode("profiles");
  }

  async function handleSelectProfile(profileId: string) {
    const state = await setActiveTVProfile(profileId);
    setProfiles(state.profiles);
    setActiveTVId(state.activeTVId);
    if (state.activeTVId) setMode("remote");
  }

  async function handleDeleteProfile(profileId: string) {
    const state = await deleteTVProfile(profileId);
    setProfiles(state.profiles);
    setActiveTVId(state.activeTVId);

    if (state.profiles.length === 0) {
      setMode("onboarding");
      return;
    }

    setMode("profiles");
  }

  async function handleRenameProfile(profileId: string, nickname: string) {
    const state = await updateTVProfile(profileId, { nickname });
    setProfiles(state.profiles);
    setActiveTVId(state.activeTVId);
  }

  function handleAddNewProfile() {
    setMode("onboarding");
  }

  function handleCancelOnboarding() {
    if (profiles.length > 0) {
      setMode("profiles");
    }
  }

  function handleBackToRemote() {
    if (activeTVId) setMode("remote");
  }

  if (!fontError && (!fontsLoaded || mode === "loading")) {
    return (
      <View style={styles.loader}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={palette.accent} size="large" />
      </View>
    );
  }

  const activeTV = activeTVId
    ? profiles.find((profile) => profile.id === activeTVId) ?? null
    : null;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      {mode === "onboarding" ? (
        <OnboardingScreen
          onComplete={handleComplete}
          onCancel={profiles.length > 0 ? handleCancelOnboarding : undefined}
        />
      ) : mode === "profiles" ? (
        <TVProfilesScreen
          profiles={profiles}
          activeTVId={activeTVId}
          onSelect={handleSelectProfile}
          onDelete={handleDeleteProfile}
          onRename={handleRenameProfile}
          onAddNew={handleAddNewProfile}
          onBackToRemote={activeTV ? handleBackToRemote : undefined}
        />
      ) : activeTV ? (
        <RemoteScreen tv={activeTV} onReconfigure={handleSwitchTV} />
      ) : (
        <TVProfilesScreen
          profiles={profiles}
          activeTVId={activeTVId}
          onSelect={handleSelectProfile}
          onDelete={handleDeleteProfile}
          onRename={handleRenameProfile}
          onAddNew={handleAddNewProfile}
        />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.backgroundA,
  },
});
