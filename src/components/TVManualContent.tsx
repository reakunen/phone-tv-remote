import React, { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { fonts, palette } from "../theme";

type Props = {
  colors: typeof palette;
};

export function TVManualContent({ colors }: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <>
      <Text style={styles.manualTitle}>Quick Start</Text>
      <Text style={styles.manualLine}>1. Connect phone and TV to the same Wi-Fi.</Text>
      <Text style={styles.manualLine}>2. Add/select your TV profile from the profiles list.</Text>
      <Text style={styles.manualLine}>3. Send a command and approve any pairing prompt on TV.</Text>

      <Text style={styles.manualTitle}>Model Limits</Text>
      <Text style={styles.manualLine}>
        Samsung Wi-Fi control generally works on selected 2014+ Smart View-compatible models, but support may vary by firmware and region.
      </Text>
      <Text style={styles.manualLine}>Sony needs IP Control enabled and a Pre-Shared Key.</Text>
      <Text style={styles.manualLine}>Philips requires JointSpace support on the TV model.</Text>
      <Text style={styles.manualLine}>Fire TV control uses bridge/ADB integration in this app.</Text>
    </>
  );
}

const createStyles = (colors: typeof palette) =>
  StyleSheet.create({
    manualTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.heading,
      fontSize: 15,
      marginTop: 2,
    },
    manualLine: {
      color: colors.textMuted,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
    },
  });
