import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { SavedTV } from "../types/tv";
import { fonts, palette } from "../theme";

type Props = {
  profiles: SavedTV[];
  activeTVId: string | null;
  onSelect: (profileId: string) => void;
  onDelete: (profileId: string) => void;
  onRename: (profileId: string, nickname: string) => Promise<void> | void;
  onAddNew: () => void;
  onOpenSettings: () => void;
  onBackToRemote?: () => void;
};

const REMOTE_THEME_STORAGE_KEY = "tv_remote:theme_mode_v1";

type ThemeMode = "dark" | "light";

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

function formatBrand(brand: SavedTV["brand"]): string {
  if (brand === "firetv") return "Fire TV";
  if (brand === "tcl") return "TCL";
  return `${brand.slice(0, 1).toUpperCase()}${brand.slice(1)}`;
}

export function TVProfilesScreen({
  profiles,
  activeTVId,
  onSelect,
  onDelete,
  onRename,
  onAddNew,
  onOpenSettings,
  onBackToRemote,
}: Props) {
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");

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

  function askDelete(tv: SavedTV) {
    Alert.alert("Remove TV profile?", `${tv.nickname} will be removed from saved TVs.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => onDelete(tv.id) },
    ]);
  }

  function openProfileMenu(tv: SavedTV) {
    Alert.alert(tv.nickname, undefined, [
      { text: "Edit Name", onPress: () => startEdit(tv) },
      { text: "Remove TV", style: "destructive", onPress: () => askDelete(tv) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function startEdit(tv: SavedTV) {
    setEditingProfileId(tv.id);
    setEditingName(tv.nickname);
  }

  function cancelEdit() {
    setEditingProfileId(null);
    setEditingName("");
  }

  async function saveEdit(profileId: string) {
    const trimmed = editingName.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Please enter a TV name.");
      return;
    }

    setSavingProfileId(profileId);
    try {
      await onRename(profileId, trimmed);
      cancelEdit();
    } catch {
      Alert.alert("Rename failed", "Could not update this TV profile. Please try again.");
    } finally {
      setSavingProfileId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Saved TVs</Text>
            <Text style={styles.subtitle}>Switch quickly or remove old profiles.</Text>
          </View>
          <Pressable
            onPress={onOpenSettings}
            style={({ pressed }) => [styles.headerMenuButton, pressed && styles.actionPressed]}
          >
            <MaterialIcons name="more-vert" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {profiles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No saved TVs yet.</Text>
          </View>
        ) : (
          profiles.map((tv) => {
            const active = tv.id === activeTVId;
            const editing = tv.id === editingProfileId;
            const saving = tv.id === savingProfileId;
            return (
              <View key={tv.id} style={[styles.rowCard, active && styles.rowCardActive]}>
                <View style={styles.rowInfo}>
                  {editing ? (
                    <TextInput
                      style={styles.editInput}
                      value={editingName}
                      onChangeText={setEditingName}
                      placeholder="TV Name"
                      placeholderTextColor={colors.textMuted}
                      autoFocus
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        void saveEdit(tv.id);
                      }}
                    />
                  ) : (
                    <Text style={styles.rowName}>{tv.nickname}</Text>
                  )}
                  <Text style={styles.rowMeta}>
                    {formatBrand(tv.brand)}
                    {tv.host ? ` • ${tv.host}${tv.port ? `:${tv.port}` : ""}` : ""}
                  </Text>
                </View>

                <View style={styles.rowActions}>
                  {editing ? (
                    <>
                      <Pressable
                        onPress={() => {
                          void saveEdit(tv.id);
                        }}
                        disabled={saving}
                        style={({ pressed }) => [
                          styles.actionButton,
                          styles.saveButton,
                          pressed && styles.actionPressed,
                          saving && styles.disabledButton,
                        ]}
                      >
                        <MaterialIcons name="check" size={16} color="#5BD4FF" />
                        <Text style={[styles.actionText, styles.actionTextActive]}>
                          {saving ? "Saving" : "Save"}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={cancelEdit}
                        disabled={saving}
                        style={({ pressed }) => [
                          styles.iconButton,
                          pressed && styles.actionPressed,
                          saving && styles.disabledButton,
                        ]}
                      >
                        <MaterialIcons name="close" size={18} color={colors.textMuted} />
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => onSelect(tv.id)}
                        style={({ pressed }) => [
                          styles.actionButton,
                          active && styles.actionButtonActive,
                          pressed && styles.actionPressed,
                        ]}
                      >
                        <MaterialIcons
                          name={active ? "check-circle" : "tv"}
                          size={16}
                          color={active ? "#5BD4FF" : colors.textPrimary}
                        />
                        <Text style={[styles.actionText, active && styles.actionTextActive]}>
                          {active ? "Active" : "Connect"}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => openProfileMenu(tv)}
                        style={({ pressed }) => [styles.iconButton, pressed && styles.actionPressed]}
                      >
                        <MaterialIcons name="more-vert" size={18} color={colors.textPrimary} />
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}

        <Pressable onPress={onAddNew} style={({ pressed }) => [styles.addButton, pressed && styles.addPressed]}>
          <MaterialIcons name="add-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.addText}>Add New TV</Text>
        </Pressable>

        {onBackToRemote ? (
          <Pressable
            onPress={onBackToRemote}
            style={({ pressed }) => [styles.backButton, pressed && styles.actionPressed]}
          >
            <MaterialIcons name="arrow-back" size={18} color={colors.textMuted} />
            <Text style={styles.backText}>Back to Remote</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: typeof palette) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.backgroundA,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 34,
      gap: 12,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 6,
    },
    title: {
      fontFamily: fonts.heading,
      fontSize: 30,
      color: colors.textPrimary,
    },
    subtitle: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 2,
    },
    headerMenuButton: {
      width: 42,
      height: 42,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panel,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyCard: {
      minHeight: 88,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panelSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: {
      color: colors.textMuted,
      fontFamily: fonts.body,
      fontSize: 14,
    },
    rowCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panelSoft,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    rowCardActive: {
      borderColor: "rgba(18, 181, 255, 0.45)",
      backgroundColor: "rgba(18, 181, 255, 0.1)",
    },
    rowInfo: {
      flex: 1,
      gap: 4,
    },
    rowName: {
      color: colors.textPrimary,
      fontFamily: fonts.heading,
      fontSize: 16,
    },
    editInput: {
      height: 38,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panel,
      color: colors.textPrimary,
      fontFamily: fonts.heading,
      fontSize: 15,
      paddingHorizontal: 10,
    },
    rowMeta: {
      color: colors.textMuted,
      fontFamily: fonts.body,
      fontSize: 13,
    },
    rowActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    actionButton: {
      minWidth: 124,
      height: 38,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panel,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    actionButtonActive: {
      borderColor: "rgba(18, 181, 255, 0.45)",
      backgroundColor: "rgba(18, 181, 255, 0.16)",
    },
    saveButton: {
      borderColor: "rgba(18, 181, 255, 0.45)",
    },
    actionText: {
      color: colors.textPrimary,
      fontFamily: fonts.heading,
      fontSize: 12,
    },
    actionTextActive: {
      color: "#5BD4FF",
    },
    iconButton: {
      width: 38,
      height: 38,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panel,
      alignItems: "center",
      justifyContent: "center",
    },
    disabledButton: {
      opacity: 0.55,
    },
    actionPressed: {
      opacity: 0.82,
      transform: [{ scale: 0.96 }],
    },
    addButton: {
      marginTop: 8,
      height: 50,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "rgba(18, 181, 255, 0.45)",
      backgroundColor: "rgba(18, 181, 255, 0.1)",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    addPressed: {
      backgroundColor: "rgba(18, 181, 255, 0.2)",
    },
    addText: {
      color: colors.accent,
      fontFamily: fonts.heading,
      fontSize: 15,
    },
    backButton: {
      marginTop: 2,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panel,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    backText: {
      color: colors.textMuted,
      fontFamily: fonts.heading,
      fontSize: 14,
    },
  });
