import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { ReactNode, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import {
  completeSonyPairing,
  completeVizioPairing,
  dispatchWifiCommand,
  SonyPairingChallenge,
  VizioPairingChallenge
} from "../services/wifiRemote";
import { palette, fonts } from "../theme";
import { RemoteCommand, SavedTV } from "../types/tv";

type Props = {
  tv: SavedTV;
  onReconfigure: () => void;
};

type KeyProps = {
  children: ReactNode | ((pressed: boolean) => ReactNode);
  onPress: () => void;
  active?: boolean;
  circle?: boolean;
  style?: StyleProp<ViewStyle>;
};

const digitLayout: string[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

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

export function RemoteScreen({ tv, onReconfigure }: Props) {
  const footerStatus = `${tv.nickname}`;
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [isNumpadOpen, setIsNumpadOpen] = useState(false);
  const [channelInput, setChannelInput] = useState("");
  const [isVizioPairingOpen, setIsVizioPairingOpen] = useState(false);
  const [vizioPin, setVizioPin] = useState("");
  const [vizioChallenge, setVizioChallenge] = useState<VizioPairingChallenge | null>(null);
  const [pendingVizioCommand, setPendingVizioCommand] = useState<RemoteCommand | null>(null);
  const [isSubmittingVizioPin, setIsSubmittingVizioPin] = useState(false);
  const [isSonyPairingOpen, setIsSonyPairingOpen] = useState(false);
  const [sonyPsk, setSonyPsk] = useState("");
  const [sonyChallenge, setSonyChallenge] = useState<SonyPairingChallenge | null>(null);
  const [pendingSonyCommand, setPendingSonyCommand] = useState<RemoteCommand | null>(null);
  const [isSubmittingSonyPsk, setIsSubmittingSonyPsk] = useState(false);
  const colors = themeMode === "light" ? lightPalette : palette;
  const styles = useMemo(() => createStyles(colors), [colors]);

  function Key({ children, onPress, active, circle, style }: KeyProps) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.key,
          circle && styles.keyCircle,
          active && styles.keyActive,
          pressed && styles.keyPressed,
          style,
        ]}
      >
        {({ pressed }) =>
          typeof children === "function"
            ? (children as (pressed: boolean) => ReactNode)(pressed)
            : children
        }
      </Pressable>
    );
  }

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

  async function send(command: RemoteCommand) {
    const result = await dispatchWifiCommand(tv, command);
    if (result.pairing?.brand === "vizio") {
      setVizioChallenge(result.pairing.challenge);
      setPendingVizioCommand(command);
      setVizioPin("");
      setIsVizioPairingOpen(true);
      return;
    }
    if (result.pairing?.brand === "sony") {
      setSonyChallenge(result.pairing.challenge);
      setPendingSonyCommand(command);
      setSonyPsk("");
      setIsSonyPairingOpen(true);
      return;
    }
  }

  async function openNumpad() {
    setChannelInput("");
    setIsNumpadOpen(true);
    await send("numpad");
  }

  function closeNumpad() {
    setIsNumpadOpen(false);
  }

  function closeVizioPairing() {
    if (isSubmittingVizioPin) return;
    setIsVizioPairingOpen(false);
    setVizioPin("");
    setPendingVizioCommand(null);
    setVizioChallenge(null);
  }

  function closeSonyPairing() {
    if (isSubmittingSonyPsk) return;
    setIsSonyPairingOpen(false);
    setSonyPsk("");
    setPendingSonyCommand(null);
    setSonyChallenge(null);
  }

  async function submitVizioPin() {
    if (!vizioChallenge) {
      return;
    }

    setIsSubmittingVizioPin(true);
    try {
      const pairResult = await completeVizioPairing(tv, vizioPin, vizioChallenge);
      if (!pairResult.ok) {
        if (pairResult.pairing?.brand === "vizio") {
          setVizioChallenge(pairResult.pairing.challenge);
        }
        return;
      }

      setIsVizioPairingOpen(false);
      setVizioPin("");
      setVizioChallenge(null);

      const commandToRetry = pendingVizioCommand;
      setPendingVizioCommand(null);
      if (!commandToRetry) return;

      const retryResult = await dispatchWifiCommand(tv, commandToRetry);
      if (retryResult.pairing?.brand === "vizio") {
        setVizioChallenge(retryResult.pairing.challenge);
        setPendingVizioCommand(commandToRetry);
        setIsVizioPairingOpen(true);
      }
    } finally {
      setIsSubmittingVizioPin(false);
    }
  }

  async function submitSonyPsk() {
    if (!sonyChallenge) {
      return;
    }

    setIsSubmittingSonyPsk(true);
    try {
      const pairResult = await completeSonyPairing(tv, sonyPsk);
      if (!pairResult.ok) {
        if (pairResult.pairing?.brand === "sony") {
          setSonyChallenge(pairResult.pairing.challenge);
        }
        return;
      }

      setIsSonyPairingOpen(false);
      setSonyPsk("");
      setSonyChallenge(null);

      const commandToRetry = pendingSonyCommand;
      setPendingSonyCommand(null);
      if (!commandToRetry) return;

      const retryResult = await dispatchWifiCommand(tv, commandToRetry);
      if (retryResult.pairing?.brand === "sony") {
        setSonyChallenge(retryResult.pairing.challenge);
        setPendingSonyCommand(commandToRetry);
        setIsSonyPairingOpen(true);
      }
    } finally {
      setIsSubmittingSonyPsk(false);
    }
  }

  async function pressDigit(digit: string) {
    const command = `digit${digit}` as RemoteCommand;
    setChannelInput((prev) => `${prev}${digit}`.slice(0, 4));
    await send(command);
  }

  async function pressBackspace() {
    setChannelInput((prev) => prev.slice(0, -1));
    await send("numpadBackspace");
  }

  async function pressEnter() {
    if (channelInput.length === 0) {
      return;
    }

    await send("numpadEnter");
    setChannelInput("");
    setIsNumpadOpen(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bgOrbA} />
      <View style={styles.bgOrbB} />
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.topRow}>
          <Key onPress={() => send("power")}>
            {(pressed) => (
              <MaterialIcons
                name="power-settings-new"
                size={28}
                color={pressed ? "#FF6E6E" : colors.danger}
              />
            )}
          </Key>
          <Key onPress={() => send("input")}>
            {(pressed) => (
              <MaterialIcons
                name="input"
                size={25}
                color={pressed ? colors.accent : colors.textPrimary}
              />
            )}
          </Key>
        </View>

        <View style={styles.dpadWrap}>
          <View style={styles.dpadRing}>
            <Pressable
              style={({ pressed }) => [styles.dpadTouch, styles.dpadUp, pressed && styles.dpadTouchPressed]}
              onPress={() => send("up")}
            >
              {({ pressed }) => (
                <MaterialIcons
                  name="keyboard-arrow-up"
                  size={36}
                  color={pressed ? colors.accent : colors.textPrimary}
                />
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.dpadTouch,
                styles.dpadLeft,
                pressed && styles.dpadTouchPressed,
              ]}
              onPress={() => send("left")}
            >
              {({ pressed }) => (
                <MaterialIcons
                  name="keyboard-arrow-left"
                  size={36}
                  color={pressed ? colors.accent : colors.textPrimary}
                />
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.dpadTouch,
                styles.dpadRight,
                pressed && styles.dpadTouchPressed,
              ]}
              onPress={() => send("right")}
            >
              {({ pressed }) => (
                <MaterialIcons
                  name="keyboard-arrow-right"
                  size={36}
                  color={pressed ? colors.accent : colors.textPrimary}
                />
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.dpadTouch,
                styles.dpadDown,
                pressed && styles.dpadTouchPressed,
              ]}
              onPress={() => send("down")}
            >
              {({ pressed }) => (
                <MaterialIcons
                  name="keyboard-arrow-down"
                  size={36}
                  color={pressed ? colors.accent : colors.textPrimary}
                />
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.okButton, pressed && styles.okPressed]}
              onPress={() => send("ok")}
            >
              {({ pressed }) => (
                <Text style={[styles.okText, pressed && styles.okTextPressed]}>OK</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.middleRow}>
          <Key onPress={() => send("back")}>
            {(pressed) => (
              <MaterialIcons
                name="undo"
                size={24}
                color={pressed ? colors.accent : colors.textPrimary}
              />
            )}
          </Key>
          <Key onPress={() => send("home")} active>
            {(pressed) => (
              <MaterialIcons
                name="home"
                size={24}
                color={pressed ? "#5BD4FF" : colors.accent}
              />
            )}
          </Key>
          <Key onPress={() => send("settings")}>
            {(pressed) => (
              <MaterialIcons
                name="settings"
                size={24}
                color={pressed ? colors.accent : colors.textPrimary}
              />
            )}
          </Key>
        </View>

        <View style={styles.divider} />

        <View style={styles.avRow}>
          <View style={styles.rocker}>
            <Pressable
              style={({ pressed }) => [styles.rockerTop, pressed && styles.segmentPressed]}
              onPress={() => send("volumeUp")}
            >
              <Text style={styles.rockerSign}>+</Text>
            </Pressable>
            <Text style={styles.rockerLabel}>VOL</Text>
            <Pressable
              style={({ pressed }) => [styles.rockerBottom, pressed && styles.segmentPressed]}
              onPress={() => send("volumeDown")}
            >
              <Text style={styles.rockerSign}>-</Text>
            </Pressable>
          </View>

          <Key onPress={() => send("mute")}>
            {(pressed) => (
              <MaterialIcons
                name="volume-off"
                size={24}
                color={pressed ? colors.accent : colors.textPrimary}
              />
            )}
          </Key>

          <View style={styles.rocker}>
            <Pressable
              style={({ pressed }) => [styles.rockerTop, pressed && styles.segmentPressed]}
              onPress={() => send("channelUp")}
            >
              <Text style={styles.rockerSign}>+</Text>
            </Pressable>
            <Text style={styles.rockerLabel}>CH</Text>
            <Pressable
              style={({ pressed }) => [styles.rockerBottom, pressed && styles.segmentPressed]}
              onPress={() => send("channelDown")}
            >
              <Text style={styles.rockerSign}>-</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.playRow}>
          <Key onPress={() => send("previous")}>
            {(pressed) => (
              <MaterialIcons
                name="skip-previous"
                size={24}
                color={pressed ? colors.accent : colors.textPrimary}
              />
            )}
          </Key>
          <Key onPress={() => send("playPause")} active>
            {(pressed) => (
              <MaterialIcons
                name="play-arrow"
                size={27}
                color={pressed ? "#5BD4FF" : colors.accent}
              />
            )}
          </Key>
          <Key onPress={() => send("next")}>
            {(pressed) => (
              <MaterialIcons
                name="skip-next"
                size={24}
                color={pressed ? colors.accent : colors.textPrimary}
              />
            )}
          </Key>
        </View>

        <Pressable
          style={({ pressed }) => [styles.numpad, pressed && styles.numpadPressed]}
          onPress={openNumpad}
        >
          {({ pressed }) => (
            <>
              <MaterialIcons
                name="dialpad"
                size={21}
                color={pressed ? colors.accent : colors.textMuted}
              />
              <Text style={[styles.numpadText, pressed && styles.numpadTextPressed]}>Numpad</Text>
            </>
          )}
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.status}>{footerStatus}</Text>
          <Pressable
            onPress={onReconfigure}
            style={({ pressed }) => [styles.reconfigure, pressed && styles.reconfigurePressed]}
          >
            {({ pressed }) => (
              <>
                <MaterialIcons
                  name="tv"
                  size={16}
                  color={pressed ? "#5BD4FF" : colors.accent}
                />
                <Text style={styles.reconfigureText}>Switch TV</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={isNumpadOpen}
        transparent
        animationType="slide"
        onRequestClose={closeNumpad}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeNumpad}>
          <Pressable style={styles.numpadSheet} onPress={() => undefined}>
            <View style={styles.numpadHeader}>
              <Text style={styles.numpadTitle}>Numpad</Text>
              <Pressable
                style={({ pressed }) => [styles.closeButton, pressed && styles.modalButtonPressed]}
                onPress={closeNumpad}
              >
                <MaterialIcons name="close" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.channelDisplay}>
              <Text style={styles.channelDisplayText}>
                {channelInput.length > 0 ? channelInput : "----"}
              </Text>
            </View>

            {digitLayout.map((row) => (
              <View key={row.join("-")} style={styles.numpadRow}>
                {row.map((digit) => (
                  <Pressable
                    key={digit}
                    onPress={() => pressDigit(digit)}
                    style={({ pressed }) => [
                      styles.numpadKey,
                      pressed && styles.numpadKeyPressed,
                    ]}
                  >
                    <Text style={styles.numpadKeyText}>{digit}</Text>
                  </Pressable>
                ))}
              </View>
            ))}

            <View style={styles.numpadRow}>
              <Pressable
                onPress={pressBackspace}
                style={({ pressed }) => [styles.numpadKey, pressed && styles.numpadKeyPressed]}
              >
                <MaterialIcons name="backspace" size={20} color={colors.textPrimary} />
              </Pressable>
              <Pressable
                onPress={() => pressDigit("0")}
                style={({ pressed }) => [styles.numpadKey, pressed && styles.numpadKeyPressed]}
              >
                <Text style={styles.numpadKeyText}>0</Text>
              </Pressable>
              <Pressable
                onPress={pressEnter}
                style={({ pressed }) => [
                  styles.numpadKey,
                  styles.numpadKeyAccent,
                  pressed && styles.numpadKeyAccentPressed,
                ]}
              >
                <MaterialIcons name="check" size={22} color="#021018" />
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={isVizioPairingOpen}
        transparent
        animationType="fade"
        onRequestClose={closeVizioPairing}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeVizioPairing}>
          <Pressable style={styles.vizioPairSheet} onPress={() => undefined}>
            <View style={styles.numpadHeader}>
              <Text style={styles.numpadTitle}>Vizio Pairing</Text>
              <Pressable
                style={({ pressed }) => [styles.closeButton, pressed && styles.modalButtonPressed]}
                onPress={closeVizioPairing}
                disabled={isSubmittingVizioPin}
              >
                <MaterialIcons name="close" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>

            <Text style={styles.vizioPairHint}>
              Enter the PIN shown on your Vizio TV to authorize this remote.
            </Text>

            <TextInput
              value={vizioPin}
              onChangeText={(value) => setVizioPin(value.replace(/[^\d]/g, "").slice(0, 8))}
              placeholder="PIN Code"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={styles.vizioPinInput}
              editable={!isSubmittingVizioPin}
              autoFocus
            />

            <Pressable
              onPress={() => {
                void submitVizioPin();
              }}
              disabled={isSubmittingVizioPin}
              style={({ pressed }) => [
                styles.vizioSubmitButton,
                pressed && styles.vizioSubmitPressed,
                isSubmittingVizioPin && styles.vizioSubmitDisabled,
              ]}
            >
              <Text style={styles.vizioSubmitText}>
                {isSubmittingVizioPin ? "Pairing..." : "Submit PIN"}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={isSonyPairingOpen}
        transparent
        animationType="fade"
        onRequestClose={closeSonyPairing}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeSonyPairing}>
          <Pressable style={styles.sonyPairSheet} onPress={() => undefined}>
            <View style={styles.numpadHeader}>
              <Text style={styles.numpadTitle}>Sony Pairing</Text>
              <Pressable
                style={({ pressed }) => [styles.closeButton, pressed && styles.modalButtonPressed]}
                onPress={closeSonyPairing}
                disabled={isSubmittingSonyPsk}
              >
                <MaterialIcons name="close" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>

            <Text style={styles.sonyPairHint}>
              Enter your Sony TV Pre-Shared Key from Network/IP Control settings.
            </Text>

            <TextInput
              value={sonyPsk}
              onChangeText={setSonyPsk}
              placeholder="Pre-Shared Key"
              placeholderTextColor={colors.textMuted}
              style={styles.sonyPskInput}
              editable={!isSubmittingSonyPsk}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />

            <Pressable
              onPress={() => {
                void submitSonyPsk();
              }}
              disabled={isSubmittingSonyPsk}
              style={({ pressed }) => [
                styles.sonySubmitButton,
                pressed && styles.sonySubmitPressed,
                isSubmittingSonyPsk && styles.sonySubmitDisabled,
              ]}
            >
              <Text style={styles.sonySubmitText}>
                {isSubmittingSonyPsk ? "Pairing..." : "Save Key"}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const keyBase = {
  width: 68,
  height: 68,
  borderRadius: 18,
};

const createStyles = (colors: typeof palette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.backgroundA,
  },
  bgOrbA: {
    position: "absolute",
    top: 110,
    left: -100,
    width: 186,
    height: 186,
    borderRadius: 999,
    backgroundColor: "rgba(18, 181, 255, 0.05)",
  },
  bgOrbB: {
    position: "absolute",
    bottom: 95,
    right: -100,
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: "rgba(91, 116, 191, 0.07)",
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  key: {
    ...keyBase,
    backgroundColor: colors.panelStrong,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  keyCircle: {
    borderRadius: 999,
  },
  keyActive: {
    backgroundColor: colors.accentSoft,
    borderColor: "rgba(18, 181, 255, 0.36)",
    shadowColor: colors.accent,
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  keyPressed: {
    transform: [{ scale: 0.95 }],
    backgroundColor: colors.panel,
    borderColor: "rgba(18, 181, 255, 0.35)",
  },
  dpadWrap: {
    alignItems: "center",
    marginTop: 16,
  },
  dpadRing: {
    width: 232,
    height: 232,
    borderRadius: 999,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dpadTouch: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  dpadTouchPressed: {
    backgroundColor: "rgba(18, 181, 255, 0.18)",
    transform: [{ scale: 0.95 }],
  },
  dpadUp: {
    top: 14,
  },
  dpadDown: {
    bottom: 14,
  },
  dpadLeft: {
    left: 12,
  },
  dpadRight: {
    right: 12,
  },
  okButton: {
    width: 84,
    height: 84,
    borderRadius: 999,
    backgroundColor: colors.panelStrong,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  okPressed: {
    backgroundColor: colors.panel,
    borderColor: "rgba(18, 181, 255, 0.35)",
    transform: [{ scale: 0.95 }],
  },
  okText: {
    fontFamily: fonts.heading,
    color: colors.textPrimary,
    fontSize: 25,
  },
  okTextPressed: {
    color: colors.accent,
  },
  middleRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(110, 133, 181, 0.12)",
    marginTop: 10,
  },
  avRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rocker: {
    width: 72,
    alignItems: "center",
    gap: 4,
  },
  rockerTop: {
    width: 72,
    height: 48,
    backgroundColor: colors.panelStrong,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  rockerBottom: {
    width: 72,
    height: 48,
    backgroundColor: colors.panelStrong,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  segmentPressed: {
    backgroundColor: colors.panel,
    borderColor: "rgba(18, 181, 255, 0.35)",
  },
  rockerSign: {
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 26,
  },
  rockerLabel: {
    color: colors.textMuted,
    fontFamily: fonts.heading,
    fontSize: 13,
    letterSpacing: 1.1,
  },
  playRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  numpad: {
    marginTop: 11,
    alignSelf: "center",
    height: 44,
    minWidth: 166,
    paddingHorizontal: 17,
    borderRadius: 17,
    backgroundColor: colors.panelStrong,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  numpadPressed: {
    backgroundColor: colors.panel,
    borderColor: "rgba(18, 181, 255, 0.35)",
    transform: [{ scale: 0.97 }],
  },
  numpadText: {
    fontFamily: fonts.heading,
    color: colors.textMuted,
    fontSize: 22,
  },
  numpadTextPressed: {
    color: colors.accent,
  },
  footer: {
    marginTop: "auto",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
  },
  status: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  reconfigure: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  reconfigurePressed: {
    backgroundColor: "rgba(18, 181, 255, 0.12)",
  },
  reconfigureText: {
    color: colors.accent,
    fontFamily: fonts.heading,
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 7, 16, 0.72)",
    justifyContent: "flex-end",
  },
  numpadSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundB,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 10,
  },
  vizioPairSheet: {
    marginHorizontal: 18,
    marginBottom: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundB,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  sonyPairSheet: {
    marginHorizontal: 18,
    marginBottom: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundB,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  numpadHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  numpadTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 18,
  },
  vizioPairHint: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  sonyPairHint: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  vizioPinInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 20,
    letterSpacing: 2,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  vizioSubmitButton: {
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: "rgba(18, 181, 255, 0.45)",
  },
  vizioSubmitPressed: {
    backgroundColor: colors.accent,
    transform: [{ scale: 0.98 }],
  },
  vizioSubmitDisabled: {
    opacity: 0.8,
  },
  vizioSubmitText: {
    color: "#04111a",
    fontFamily: fonts.heading,
    fontSize: 16,
  },
  sonyPskInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    color: colors.textPrimary,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingHorizontal: 12,
  },
  sonySubmitButton: {
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: "rgba(18, 181, 255, 0.45)",
  },
  sonySubmitPressed: {
    backgroundColor: colors.accent,
    transform: [{ scale: 0.98 }],
  },
  sonySubmitDisabled: {
    opacity: 0.8,
  },
  sonySubmitText: {
    color: "#04111a",
    fontFamily: fonts.heading,
    fontSize: 16,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panelStrong,
  },
  modalButtonPressed: {
    backgroundColor: colors.panel,
  },
  channelDisplay: {
    height: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  channelDisplayText: {
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 28,
    letterSpacing: 5,
  },
  numpadRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  numpadKey: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  numpadKeyPressed: {
    backgroundColor: colors.panel,
    borderColor: "rgba(18, 181, 255, 0.35)",
    transform: [{ scale: 0.97 }],
  },
  numpadKeyAccent: {
    borderColor: "rgba(18, 181, 255, 0.45)",
    backgroundColor: colors.accent,
  },
  numpadKeyAccentPressed: {
    backgroundColor: colors.accent,
    transform: [{ scale: 0.97 }],
  },
  numpadKeyText: {
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 24,
  },
  });
