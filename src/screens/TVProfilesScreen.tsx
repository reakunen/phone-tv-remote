import React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { SavedTV } from "../types/tv";
import { fonts, palette } from "../theme";

type Props = {
  profiles: SavedTV[];
  activeTVId: string | null;
  onSelect: (profileId: string) => void;
  onDelete: (profileId: string) => void;
  onAddNew: () => void;
  onBackToRemote?: () => void;
};

function formatBrand(brand: SavedTV["brand"]): string {
  return `${brand.slice(0, 1).toUpperCase()}${brand.slice(1)}`;
}

export function TVProfilesScreen({
  profiles,
  activeTVId,
  onSelect,
  onDelete,
  onAddNew,
  onBackToRemote,
}: Props) {
  function askDelete(tv: SavedTV) {
    Alert.alert("Remove TV profile?", `${tv.nickname} will be removed from saved TVs.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => onDelete(tv.id) },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Saved TVs</Text>
        <Text style={styles.subtitle}>Switch quickly or remove old profiles.</Text>

        {profiles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No saved TVs yet.</Text>
          </View>
        ) : (
          profiles.map((tv) => {
            const active = tv.id === activeTVId;
            return (
              <View key={tv.id} style={[styles.rowCard, active && styles.rowCardActive]}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>{tv.nickname}</Text>
                  <Text style={styles.rowMeta}>
                    {formatBrand(tv.brand)}
                    {tv.host ? ` • ${tv.host}${tv.port ? `:${tv.port}` : ""}` : ""}
                  </Text>
                </View>

                <View style={styles.rowActions}>
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
                      color={active ? "#5BD4FF" : palette.textPrimary}
                    />
                    <Text style={[styles.actionText, active && styles.actionTextActive]}>
                      {active ? "Active" : "Connect"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => askDelete(tv)}
                    style={({ pressed }) => [styles.deleteButton, pressed && styles.actionPressed]}
                  >
                    <MaterialIcons name="delete-outline" size={18} color="#FF6E6E" />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        <Pressable onPress={onAddNew} style={({ pressed }) => [styles.addButton, pressed && styles.addPressed]}>
          <MaterialIcons name="add-circle-outline" size={18} color={palette.accent} />
          <Text style={styles.addText}>Add New TV</Text>
        </Pressable>

        {onBackToRemote ? (
          <Pressable
            onPress={onBackToRemote}
            style={({ pressed }) => [styles.backButton, pressed && styles.actionPressed]}
          >
            <MaterialIcons name="arrow-back" size={18} color={palette.textMuted} />
            <Text style={styles.backText}>Back to Remote</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.backgroundA,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    gap: 12,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 30,
    color: palette.textPrimary,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: palette.textMuted,
    marginBottom: 6,
  },
  emptyCard: {
    minHeight: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  rowCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelSoft,
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
    color: palette.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 16,
  },
  rowMeta: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionButton: {
    minWidth: 94,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionButtonActive: {
    borderColor: "rgba(18, 181, 255, 0.45)",
    backgroundColor: "rgba(18, 181, 255, 0.16)",
  },
  actionText: {
    color: palette.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 12,
  },
  actionTextActive: {
    color: "#5BD4FF",
  },
  deleteButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    alignItems: "center",
    justifyContent: "center",
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
    color: palette.accent,
    fontFamily: fonts.heading,
    fontSize: 15,
  },
  backButton: {
    marginTop: 2,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  backText: {
    color: palette.textMuted,
    fontFamily: fonts.heading,
    fontSize: 14,
  },
});
