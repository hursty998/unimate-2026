import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function ValidationScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Foundation route reached</Text>
      <Text style={styles.body}>Expo Router navigation is available.</Text>
      <Link href="/" asChild>
        <Pressable
          accessibilityHint="Returns to the foundation screen."
          accessibilityRole="link"
          style={styles.link}
        >
          <Text>Back to UniMate</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignSelf: "center",
    flex: 1,
    gap: 16,
    justifyContent: "center",
    maxWidth: 560,
    padding: 24,
    width: "100%",
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
  },
  body: {
    fontSize: 16,
  },
  link: {
    alignSelf: "flex-start",
    borderColor: "#767676",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
