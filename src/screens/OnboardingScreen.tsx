import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { scanNetworkForTVs, DiscoveredTV } from "../services/networkScanner";
import { palette, fonts } from "../theme";
import { SavedTV, TVBrand } from "../types/tv";

type SetupMode = "scan" | "advanced";

type Props = {
  onComplete: (tv: SavedTV) => void;
  onCancel?: () => void;
};

const brands: { value: TVBrand; label: string }[] = [
  { value: "samsung", label: "Samsung" },
  { value: "panasonic", label: "Panasonic" },
  { value: "vizio", label: "Vizio" },
  { value: "tcl", label: "TCL" },
  { value: "lg", label: "LG" },
  { value: "other", label: "Other" },
];

function formatBrand(brand: TVBrand): string {
  return `${brand.slice(0, 1).toUpperCase()}${brand.slice(1)}`;
}

export function OnboardingScreen({ onComplete, onCancel }: Props) {
  const [mode, setMode] = useState<SetupMode>("scan");

  const [brand, setBrand] = useState<TVBrand | null>(null);
  const [nickname, setNickname] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("8080");

  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<DiscoveredTV[]>([]);
  const [selectedDiscoveryId, setSelectedDiscoveryId] = useState<string | null>(null);

  const selectedDiscoveredTV = useMemo(
    () => scanResults.find((device) => device.id === selectedDiscoveryId) ?? null,
    [scanResults, selectedDiscoveryId]
  );

  const canContinueAdvanced = useMemo(() => {
    return Boolean(brand && nickname.trim().length > 0);
  }, [brand, nickname]);

  async function handleScan() {
    setScanLoading(true);
    setScanError(null);
    setSelectedDiscoveryId(null);

    try {
      const found = await scanNetworkForTVs();
      setScanResults(found);
      if (found.length === 0) {
        setScanError(
          "No TVs found in common local ranges. Try Advanced mode to enter host details manually."
        );
      }
    } catch {
      setScanError("Scan failed. Please try again, or use Advanced mode.");
    } finally {
      setScanLoading(false);
    }
  }

  function completeWithDiscovery() {
    if (!selectedDiscoveredTV) return;

    onComplete({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      brand: selectedDiscoveredTV.brand,
      nickname: selectedDiscoveredTV.nickname,
      host: selectedDiscoveredTV.host,
      port: selectedDiscoveredTV.port,
    });
  }

  function handleAdvancedContinue() {
    if (!brand) return;
    const parsedPort = Number(port);

    onComplete({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      brand,
      nickname: nickname.trim(),
      host: host.trim() || undefined,
      port: Number.isFinite(parsedPort) ? parsedPort : undefined,
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Set up your TV</Text>
          <Text style={styles.subtitle}>Use quick scan, or switch to advanced manual setup.</Text>

          <View style={styles.modeTabs}>
            <Pressable
              onPress={() => setMode("scan")}
              style={[styles.modeTab, mode === "scan" && styles.modeTabActive]}
            >
              <Text style={[styles.modeTabText, mode === "scan" && styles.modeTabTextActive]}>
                Scan
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("advanced")}
              style={[styles.modeTab, mode === "advanced" && styles.modeTabActive]}
            >
              <Text style={[styles.modeTabText, mode === "advanced" && styles.modeTabTextActive]}>
                Advanced
              </Text>
            </Pressable>
          </View>

          {mode === "scan" ? (
            <View style={styles.scanPanel}>
              <Text style={styles.scanHint}>
                Scans common local ranges and lists TVs detected on your Wi-Fi. Make sure your TV is turned on.
              </Text>

              <Pressable
                onPress={handleScan}
                style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
                disabled={scanLoading}
              >
                {scanLoading ? (
                  <ActivityIndicator color={palette.accent} />
                ) : (
                  <>
                    <MaterialIcons name="wifi-find" size={18} color={palette.accent} />
                    <Text style={styles.scanButtonText}>
                      {scanResults.length > 0 ? "Scan Again" : "Scan for TVs"}
                    </Text>
                  </>
                )}
              </Pressable>

              {scanError ? <Text style={styles.scanError}>{scanError}</Text> : null}

              {scanResults.map((device) => {
                const selected = device.id === selectedDiscoveryId;
                return (
                  <Pressable
                    key={device.id}
                    onPress={() => setSelectedDiscoveryId(device.id)}
                    style={[styles.resultCard, selected && styles.resultCardSelected]}
                  >
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultTitle}>{device.nickname}</Text>
                      <Text style={styles.resultMeta}>
                        {formatBrand(device.brand)} • {device.host}:{device.port}
                      </Text>
                    </View>
                    {selected ? (
                      <MaterialIcons name="check-circle" size={18} color={palette.accent} />
                    ) : (
                      <MaterialIcons name="radio-button-unchecked" size={18} color={palette.textMuted} />
                    )}
                  </Pressable>
                );
              })}

              <Pressable
                onPress={completeWithDiscovery}
                disabled={!selectedDiscoveredTV}
                style={[styles.cta, !selectedDiscoveredTV && styles.ctaDisabled]}
              >
                <Text style={styles.ctaText}>Add Selected TV</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Brand</Text>
              <View style={styles.brandGrid}>
                {brands.map((item) => {
                  const selected = item.value === brand;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => setBrand(item.value)}
                      style={[styles.brandChip, selected && styles.brandChipSelected]}
                    >
                      <Text style={[styles.brandChipText, selected && styles.brandChipTextSelected]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sectionTitle}>TV Name</Text>
              <TextInput
                style={styles.input}
                value={nickname}
                onChangeText={setNickname}
                placeholder="Living Room TV"
                placeholderTextColor={palette.textMuted}
              />

              <Text style={styles.sectionTitle}>Wi-Fi Host</Text>
              <TextInput
                style={styles.input}
                value={host}
                onChangeText={setHost}
                placeholder="192.168.1.77"
                placeholderTextColor={palette.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
              />

              <Text style={styles.sectionTitle}>Bridge Port</Text>
              <TextInput
                style={styles.input}
                value={port}
                onChangeText={setPort}
                placeholder="8080"
                placeholderTextColor={palette.textMuted}
                keyboardType="number-pad"
              />

              <Pressable
                onPress={handleAdvancedContinue}
                disabled={!canContinueAdvanced}
                style={[styles.cta, !canContinueAdvanced && styles.ctaDisabled]}
              >
                <Text style={styles.ctaText}>Continue</Text>
              </Pressable>
            </>
          )}

          {onCancel ? (
            <Pressable onPress={onCancel} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.backgroundA,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 14,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 34,
    color: palette.textPrimary,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: palette.textMuted,
    marginBottom: 4,
  },
  modeTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  modeTab: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  modeTabActive: {
    borderColor: "rgba(18, 181, 255, 0.48)",
    backgroundColor: "rgba(18, 181, 255, 0.12)",
  },
  modeTabText: {
    color: palette.textMuted,
    fontFamily: fonts.heading,
    fontSize: 14,
  },
  modeTabTextActive: {
    color: palette.accent,
  },
  scanPanel: {
    gap: 10,
  },
  scanHint: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  scanButton: {
    height: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(18, 181, 255, 0.45)",
    backgroundColor: "rgba(18, 181, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  scanButtonPressed: {
    backgroundColor: "rgba(18, 181, 255, 0.2)",
  },
  scanButtonText: {
    color: palette.accent,
    fontFamily: fonts.heading,
    fontSize: 15,
  },
  scanError: {
    color: "#FF9A9A",
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  resultCard: {
    minHeight: 62,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resultCardSelected: {
    borderColor: "rgba(18, 181, 255, 0.48)",
    backgroundColor: "rgba(18, 181, 255, 0.1)",
  },
  resultInfo: {
    flex: 1,
    gap: 3,
  },
  resultTitle: {
    color: palette.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 15,
  },
  resultMeta: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: palette.textPrimary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  brandGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  brandChip: {
    width: "31%",
    minWidth: 100,
    backgroundColor: palette.panel,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  brandChipSelected: {
    backgroundColor: "#13304A",
    borderColor: palette.accent,
  },
  brandChipText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: palette.textPrimary,
  },
  brandChipTextSelected: {
    fontFamily: fonts.heading,
    color: palette.accent,
  },
  input: {
    backgroundColor: palette.panelSoft,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: palette.textPrimary,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  cta: {
    marginTop: 8,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: palette.accent,
    shadowColor: palette.accent,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    fontFamily: fonts.heading,
    color: "#021018",
    fontSize: 17,
  },
  cancelButton: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelText: {
    color: palette.textMuted,
    fontFamily: fonts.heading,
    fontSize: 14,
  },
});
