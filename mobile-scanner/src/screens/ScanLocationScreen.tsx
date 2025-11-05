import { useCallback, useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";

interface Props {
  onScanned: (token: string) => void;
}

export function ScanLocationScreen({ onScanned }: Props) {
  const [token, setToken] = useState("LOC-A-01");

  const handleScan = useCallback(() => {
    onScanned(token.trim());
  }, [onScanned, token]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>สแกนตำแหน่งจัดเก็บ</Text>
      <Text style={styles.caption}>
        ป้อนค่าทดสอบแทนการสแกนจริง (เช่น LOC-A-01, LOC-B-05) หรือสแกน QR ในเวอร์ชันจริง
      </Text>
      <TextInput
        value={token}
        onChangeText={setToken}
        style={styles.input}
        placeholder="เช่น LOC-A-01"
      />
      <Button title="ยืนยันตำแหน่ง" onPress={handleScan} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: "600",
  },
  caption: {
    fontSize: 14,
    color: "#475569",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5f5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
