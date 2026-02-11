import React, { ReactNode, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { dispatchWifiCommand } from "../services/wifiRemote";
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

const digitLayout: string[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

export function RemoteScreen({ tv, onReconfigure }: Props) {
  const [status, setStatus] = useState(`Connected profile: ${tv.nickname}`);
  const [isNumpadOpen, setIsNumpadOpen] = useState(false);
  const [channelInput, setChannelInput] = useState("");

  async function send(command: RemoteCommand) {
    setStatus(`Sending ${command}...`);
    const result = await dispatchWifiCommand(tv, command);
    setStatus(result.ok ? `${command} sent` : result.message);
  }

  async function openNumpad() {
    setChannelInput("");
    setIsNumpadOpen(true);
    await send("numpad");
  }

  function closeNumpad() {
    setIsNumpadOpen(false);
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
      setStatus("Enter at least one digit.");
      return;
    }

    const submitted = channelInput;
    await send("numpadEnter");
    setStatus(`Channel ${submitted} submitted.`);
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
                color={pressed ? "#FF6E6E" : palette.danger}
              />
            )}
          </Key>
          <Key onPress={() => send("input")}>
            {(pressed) => (
              <MaterialIcons
                name="input"
                size={25}
                color={pressed ? palette.accent : palette.textPrimary}
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
                  color={pressed ? palette.accent : palette.textPrimary}
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
                  color={pressed ? palette.accent : palette.textPrimary}
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
                  color={pressed ? palette.accent : palette.textPrimary}
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
                  color={pressed ? palette.accent : palette.textPrimary}
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
                color={pressed ? palette.accent : palette.textPrimary}
              />
            )}
          </Key>
          <Key onPress={() => send("home")} active>
            {(pressed) => (
              <MaterialIcons
                name="home"
                size={24}
                color={pressed ? "#5BD4FF" : palette.accent}
              />
            )}
          </Key>
          <Key onPress={() => send("settings")}>
            {(pressed) => (
              <MaterialIcons
                name="settings"
                size={24}
                color={pressed ? palette.accent : palette.textPrimary}
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
                color={pressed ? palette.accent : palette.textPrimary}
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
                color={pressed ? palette.accent : palette.textPrimary}
              />
            )}
          </Key>
          <Key onPress={() => send("playPause")} active>
            {(pressed) => (
              <MaterialIcons
                name="play-arrow"
                size={27}
                color={pressed ? "#5BD4FF" : palette.accent}
              />
            )}
          </Key>
          <Key onPress={() => send("next")}>
            {(pressed) => (
              <MaterialIcons
                name="skip-next"
                size={24}
                color={pressed ? palette.accent : palette.textPrimary}
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
                color={pressed ? palette.accent : palette.textMuted}
              />
              <Text style={[styles.numpadText, pressed && styles.numpadTextPressed]}>Numpad</Text>
            </>
          )}
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.status}>{status}</Text>
          <Pressable
            onPress={onReconfigure}
            style={({ pressed }) => [styles.reconfigure, pressed && styles.reconfigurePressed]}
          >
            {({ pressed }) => (
              <>
                <MaterialIcons
                  name="tv"
                  size={16}
                  color={pressed ? "#5BD4FF" : palette.accent}
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
                <MaterialIcons name="close" size={18} color={palette.textPrimary} />
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
                <MaterialIcons name="backspace" size={20} color={palette.textPrimary} />
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
    </SafeAreaView>
  );
}

const keyBase = {
  width: 68,
  height: 68,
  borderRadius: 18,
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.backgroundA,
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
    backgroundColor: palette.panelStrong,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  keyCircle: {
    borderRadius: 999,
  },
  keyActive: {
    backgroundColor: "#12334A",
    borderColor: "rgba(18, 181, 255, 0.36)",
    shadowColor: palette.accent,
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  keyPressed: {
    transform: [{ scale: 0.95 }],
    backgroundColor: "#1D2C46",
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
    backgroundColor: "rgba(23, 34, 56, 0.65)",
    borderWidth: 1,
    borderColor: palette.border,
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
    backgroundColor: palette.panelStrong,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  okPressed: {
    backgroundColor: "#1D2C46",
    borderColor: "rgba(18, 181, 255, 0.35)",
    transform: [{ scale: 0.95 }],
  },
  okText: {
    fontFamily: fonts.heading,
    color: palette.textPrimary,
    fontSize: 25,
  },
  okTextPressed: {
    color: palette.accent,
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
    backgroundColor: palette.panelStrong,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: "center",
    alignItems: "center",
  },
  rockerBottom: {
    width: 72,
    height: 48,
    backgroundColor: palette.panelStrong,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: "center",
    alignItems: "center",
  },
  segmentPressed: {
    backgroundColor: "#1D2C46",
    borderColor: "rgba(18, 181, 255, 0.35)",
  },
  rockerSign: {
    color: palette.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 26,
  },
  rockerLabel: {
    color: palette.textMuted,
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
    backgroundColor: palette.panelStrong,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  numpadPressed: {
    backgroundColor: "#1D2C46",
    borderColor: "rgba(18, 181, 255, 0.35)",
    transform: [{ scale: 0.97 }],
  },
  numpadText: {
    fontFamily: fonts.heading,
    color: palette.textMuted,
    fontSize: 22,
  },
  numpadTextPressed: {
    color: palette.accent,
  },
  footer: {
    marginTop: "auto",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
  },
  status: {
    color: palette.textMuted,
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
    color: palette.accent,
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
    borderColor: palette.border,
    backgroundColor: "#0D1628",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 10,
  },
  numpadHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  numpadTitle: {
    color: palette.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 18,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.panelStrong,
  },
  modalButtonPressed: {
    backgroundColor: "#1D2C46",
  },
  channelDisplay: {
    height: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#111D31",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  channelDisplayText: {
    color: palette.textPrimary,
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
    borderColor: palette.border,
    backgroundColor: palette.panelStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  numpadKeyPressed: {
    backgroundColor: "#1D2C46",
    borderColor: "rgba(18, 181, 255, 0.35)",
    transform: [{ scale: 0.97 }],
  },
  numpadKeyAccent: {
    borderColor: "rgba(18, 181, 255, 0.45)",
    backgroundColor: palette.accent,
  },
  numpadKeyAccentPressed: {
    backgroundColor: "#42CFFF",
    transform: [{ scale: 0.97 }],
  },
  numpadKeyText: {
    color: palette.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 24,
  },
});
