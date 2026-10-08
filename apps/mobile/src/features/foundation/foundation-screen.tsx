import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function FoundationScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>UniMate</Text>
      <Text style={styles.body}>Foundation ready</Text>
      <Text style={styles.body}>Platform: {process.env.EXPO_OS}</Text>
      <Link href="/validation" asChild>
        <Pressable
          accessibilityHint="Opens the foundation validation route."
          accessibilityRole="link"
          style={styles.link}
        >
          <Text>Open validation route</Text>
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
    fontSize: 28,
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
