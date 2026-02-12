import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { SupportedTVsContent } from "../components/SupportedTVsContent";
import { TVManualContent } from "../components/TVManualContent";
import { APP_SHARE_URL } from "../config/env";
import { fonts, palette } from "../theme";

type Props = {
  onBack: () => void;
};

const REMOTE_THEME_STORAGE_KEY = "tv_remote:theme_mode_v1";

type ThemeMode = "dark" | "light";
type SettingsView = "root" | "manual" | "supported";

const lightPalette: typeof palette = {
  backgroundA: "#F6F8FC",
  backgroundB: "#FFFFFF",
  panel: "#EEF3FB",
  panelSoft: "#F4F7FC",
  panelStrong: "#E8EEF7",
  border: "rgba(57, 82, 128, 0.2)",
  textPrimary: "#0E1B34",
  textMuted: "#4F6286",
  accent: "#0A84FF",
  accentSoft: "rgba(10, 132, 255, 0.18)",
  danger: "#E53935",
};

export function TVSettingsScreen({ onBack }: Props) {
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [view, setView] = useState<SettingsView>("root");
  const colors = themeMode === "light" ? lightPalette : palette;
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(REMOTE_THEME_STORAGE_KEY);
        if (saved === "dark" || saved === "light") {
          setThemeMode(saved);
        }
      } catch {
        // ignore theme load errors
      }
    })();
  }, []);

  async function applyTheme(nextMode: ThemeMode) {
    setThemeMode(nextMode);
    try {
      await AsyncStorage.setItem(REMOTE_THEME_STORAGE_KEY, nextMode);
    } catch {
      // ignore theme save errors
    }
  }

  async function toggleTheme() {
    await applyTheme(themeMode === "dark" ? "light" : "dark");
  }

  async function recommendAppToOthers() {
    try {
      await Share.share({
        title: "TV Remote App",
        message: `I use this free TV Remote app. Try it here: ${APP_SHARE_URL}`,
        url: APP_SHARE_URL,
      });
    } catch {
      Alert.alert("Share unavailable", "Could not open the share menu right now.");
    }
  }

  function handleHeaderBack() {
    if (view === "manual" || view === "supported") {
      setView("root");
      return;
    }
    onBack();
  }

  const title =
    view === "manual" ? "Manual" : view === "supported" ? "Supported TV's" : "Settings";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={handleHeaderBack}
          style={({ pressed }) => [styles.headerButton, pressed && styles.actionPressed]}
        >
          <MaterialIcons name="arrow-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {view === "root" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={() => setView("supported")}
            style={({ pressed }) => [styles.optionRow, pressed && styles.actionPressed]}
          >
            <View style={styles.optionMeta}>
              <Text style={styles.optionTitle}>Supported TV's</Text>
              <Text style={styles.optionSubtitle}>View all currently supported TV brands.</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
          </Pressable>

          <Pressable
            onPress={() => setView("manual")}
            style={({ pressed }) => [styles.optionRow, pressed && styles.actionPressed]}
          >
            <View style={styles.optionMeta}>
              <Text style={styles.optionTitle}>Manual</Text>
              <Text style={styles.optionSubtitle}>Quick start and brand limitations.</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
          </Pressable>

          <Pressable
            onPress={() => {
              void recommendAppToOthers();
            }}
            style={({ pressed }) => [styles.optionRow, pressed && styles.actionPressed]}
          >
            <View style={styles.optionMeta}>
              <Text style={styles.optionTitle}>Recommend to others!</Text>
              {/* <Text style={styles.optionSubtitle}>Open the native share sheet.</Text> */}
            </View>
            <MaterialIcons name="share" size={18} color={colors.textMuted} />
          </Pressable>

          <View style={styles.optionRow}>
            <View style={styles.optionMeta}>
              <Text style={styles.optionTitle}>Theme</Text>
              {/* <Text style={styles.optionSubtitle}>Current: {themeMode === "dark" ? "Dark" : "Light"}</Text> */}
            </View>
            <Pressable
              onPress={() => {
                void toggleTheme();
              }}
              style={({ pressed }) => [styles.themeButton, pressed && styles.actionPressed]}
            >
              <MaterialIcons
                name={themeMode === "dark" ? "dark-mode" : "light-mode"}
                size={16}
                color={colors.accent}
              />
              <Text style={styles.themeButtonText}>Toggle</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {view === "manual" ? (
            <TVManualContent colors={colors} />
          ) : (
            <SupportedTVsContent colors={colors} />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: typeof palette) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.backgroundA,
    },
    headerRow: {
      paddingTop: 12,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panel,
      alignItems: "center",
      justifyContent: "center",
    },
    headerSpacer: {
      width: 40,
      height: 40,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.heading,
      fontSize: 24,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
      gap: 10,
    },
    optionRow: {
      minHeight: 72,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panelSoft,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    optionMeta: {
      flex: 1,
      gap: 3,
    },
    optionTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.heading,
      fontSize: 15,
    },
    optionSubtitle: {
      color: colors.textMuted,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
    },
    themeButton: {
      height: 36,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "rgba(18, 181, 255, 0.45)",
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    themeButtonText: {
      color: colors.accent,
      fontFamily: fonts.heading,
      fontSize: 12,
    },
    actionPressed: {
      opacity: 0.82,
      transform: [{ scale: 0.98 }],
    },
  });
