import React, { useMemo } from "react";
import { Image, ImageSourcePropType, StyleSheet, Text, View } from "react-native";
import { fonts, palette } from "../theme";

type Props = {
  colors: typeof palette;
};

type SupportedBrand = {
  id: string;
  label: string;
  logo: ImageSourcePropType;
  tintWhite?: boolean;
};

const supportedBrands: SupportedBrand[] = [
  { id: "samsung", label: "Samsung", logo: require("../../assets/brands/samsung.png") },
  { id: "sony", label: "Sony", logo: require("../../assets/brands/sony.png") },
  { id: "lg", label: "LG", logo: require("../../assets/brands/lg.png") },
  { id: "roku", label: "Roku", logo: require("../../assets/brands/roku.png"), tintWhite: true },
  { id: "panasonic", label: "Panasonic", logo: require("../../assets/brands/panasonic.png") },
  { id: "philips", label: "Philips", logo: require("../../assets/brands/philips.png"), tintWhite: true },
  { id: "firetv", label: "Fire TV", logo: require("../../assets/brands/firetv.png") },
  { id: "vizio", label: "Vizio", logo: require("../../assets/brands/vizio.png"), tintWhite: true },
  { id: "tcl", label: "TCL", logo: require("../../assets/brands/tcl.png"), tintWhite: true },
];

export function SupportedTVsContent({ colors }: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <>
      {/* <Text style={styles.sectionTitle}>Supported TV&apos;s</Text> */}
      {/* <Text style={styles.sectionDescription}>
        These brands are currently integrated for Wi-Fi remote control in this app.
      </Text> */}

      <View style={styles.grid}>
        {supportedBrands.map((brand) => (
          <View key={brand.id} style={styles.card}>
            <View style={styles.logoPill}>
              <Image
                source={brand.logo}
                style={[styles.logoImage]}
                resizeMode="contain"
              />
            </View>
            {/* <Text style={styles.label}>{brand.label}</Text> */}
          </View>
        ))}
      </View>
    </>
  );
}

const createStyles = (colors: typeof palette) =>
  StyleSheet.create({
    sectionTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.heading,
      fontSize: 17,
      marginTop: 2,
    },
    sectionDescription: {
      color: colors.textMuted,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 4,
      // marginY: 2, 
    },
    grid: {
      flexDirection: "column",
      gap: 10,
    },
    card: {
      width: "100%",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panelSoft,
      paddingHorizontal: 10,
      paddingVertical: 10,
      gap: 8,
    },
    logoPill: {
      height: 46,
      borderRadius: 10,
      // borderWidth: 1,
      // borderColor: colors.border,
      // backgroundColor: colors.panel,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    logoImage: {
      width: "100%",
      height: 32,
    },
    logoImageWhite: {
      // tintColor: "#FFFFFF",
    },
    label: {
      color: colors.textPrimary,
      fontFamily: fonts.heading,
      fontSize: 13,
    },
  });
