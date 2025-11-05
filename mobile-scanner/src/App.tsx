import { useCallback, useEffect, useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ConfirmTransactionScreen } from "./screens/ConfirmTransactionScreen";
import { LoadChecklistScreen } from "./screens/LoadChecklistScreen";
import { ScanItemScreen } from "./screens/ScanItemScreen";
import { ScanLocationScreen } from "./screens/ScanLocationScreen";
import { readQueue, storeQueue } from "./services/offlineQueue";
import { sendTransaction } from "./services/api";

type Step = "mode" | "location" | "item" | "confirm" | "checklist";

export default function App() {
  const [mode, setMode] = useState<"put_away" | "pick">("pick");
  const [step, setStep] = useState<Step>("mode");
  const [locationToken, setLocationToken] = useState<string | null>(null);
  const [itemData, setItemData] = useState<{ itemId: string; quantity: number } | null>(null);
  const [pendingQueue, setPendingQueue] = useState(0);

  const reset = useCallback(() => {
    setStep("mode");
    setLocationToken(null);
    setItemData(null);
  }, []);

  const processOfflineQueue = useCallback(async () => {
    const queue = await readQueue();
    if (!queue.length) {
      setPendingQueue(0);
      return;
    }

    const remaining: typeof queue = [];
    for (const entry of queue) {
      try {
        await sendTransaction(entry.payload);
      } catch (error) {
        console.warn("ยังส่ง offline queue ไม่ได้", error);
        remaining.push(entry);
      }
    }

    await storeQueue(remaining);
    setPendingQueue(remaining.length);
  }, []);

  useEffect(() => {
    processOfflineQueue().catch(console.error);
  }, [processOfflineQueue]);

  const content = useMemo(() => {
    if (step === "mode") {
      return (
        <View style={styles.section}>
          <Text style={styles.heading}>เลือกโหมดการทำงาน</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, mode === "pick" && styles.buttonActive]}
              onPress={() => {
                setMode("pick");
                setStep("location");
              }}
            >
              <Text style={[styles.buttonText, mode === "pick" && styles.buttonTextActive]}>หยิบสินค้า</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, mode === "put_away" && styles.buttonActive]}
              onPress={() => {
                setMode("put_away");
                setStep("location");
              }}
            >
              <Text style={[styles.buttonText, mode === "put_away" && styles.buttonTextActive]}>จัดเก็บเข้า</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                setStep("checklist");
              }}
            >
              <Text style={styles.buttonText}>เช็กลิสต์โหลด</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.caption}>ธุรกรรมที่ยังไม่ส่ง: {pendingQueue}</Text>
        </View>
      );
    }

    if (step === "location") {
      return (
        <ScanLocationScreen
          onScanned={(token) => {
            setLocationToken(token);
            setStep("item");
          }}
        />
      );
    }

    if (step === "item") {
      return (
        <ScanItemScreen
          onSubmit={({ itemId, quantity }) => {
            setItemData({ itemId, quantity });
            setStep("confirm");
          }}
        />
      );
    }

    if (step === "confirm" && locationToken && itemData) {
      return (
        <ConfirmTransactionScreen
          mode={mode}
          locationToken={locationToken}
          itemId={itemData.itemId}
          quantity={itemData.quantity}
          onRestart={reset}
          onQueued={(count) => setPendingQueue(count)}
        />
      );
    }

    if (step === "checklist") {
      return <LoadChecklistScreen onClose={reset} />;
    }

    return null;
  }, [mode, step, locationToken, itemData, reset, pendingQueue]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>WMS QR Scanner</Text>
        {content}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 48,
    gap: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
  },
  section: {
    gap: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 16,
  },
  button: {
    backgroundColor: "#e2e8f0",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  buttonActive: {
    backgroundColor: "#1f2937",
  },
  buttonText: {
    color: "#1f2937",
    fontWeight: "500",
  },
  buttonTextActive: {
    color: "#fff",
  },
  caption: {
    fontSize: 14,
    color: "#475569",
  },
});
