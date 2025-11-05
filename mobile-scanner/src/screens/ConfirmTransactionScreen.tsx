import { useCallback, useState } from "react";
import { Alert, Button, StyleSheet, Text, TextInput, View } from "react-native";

import { sendTransaction, type TransactionPayload } from "../services/api";
import { enqueue, readQueue } from "../services/offlineQueue";

interface Props {
  mode: "put_away" | "pick";
  locationToken: string;
  itemId: string;
  quantity: number;
  onRestart: () => void;
  onQueued: (count: number) => void;
}

export function ConfirmTransactionScreen({ mode, locationToken, itemId, quantity, onRestart, onQueued }: Props) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    const payload: TransactionPayload = {
      type: mode,
      location_token: locationToken,
      item_id: itemId,
      quantity,
      note: note || undefined,
    };

    try {
      await sendTransaction(payload);
      Alert.alert("สำเร็จ", "บันทึกธุรกรรมแล้ว", [{ text: "ตกลง", onPress: onRestart }]);
    } catch (error) {
      console.warn("ส่งธุรกรรมไม่สำเร็จ", error);
      await enqueue(payload);
      const queue = await readQueue();
      onQueued(queue.length);
      Alert.alert("ออฟไลน์", "เก็บธุรกรรมไว้ในคิวแล้ว ระบบจะส่งอัตโนมัติเมื่อต่อเน็ต", [
        { text: "ตกลง", onPress: onRestart },
      ]);
    } finally {
      setLoading(false);
    }
  }, [mode, locationToken, itemId, quantity, note, onRestart]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>ยืนยันการ{mode === "pick" ? "หยิบ" : "จัดเก็บ"}</Text>
      <View style={styles.summaryBox}>
        <Text>Location: {locationToken}</Text>
        <Text>Item: {itemId}</Text>
        <Text>Quantity: {quantity}</Text>
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        style={styles.input}
        placeholder="หมายเหตุ (ถ้ามี)"
      />
      <Button title={loading ? "กำลังส่ง..." : "บันทึกธุรกรรม"} onPress={handleSubmit} disabled={loading} />
      <Button title="เริ่มใหม่" onPress={onRestart} color="#64748b" />
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
  summaryBox: {
    borderWidth: 1,
    borderColor: "#cbd5f5",
    borderRadius: 8,
    padding: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5f5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
