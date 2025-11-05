import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { fetchMobileWorkOrder, fetchMobileWorkOrders, MobileWorkOrder } from "../services/api";

interface Props {
  onClose: () => void;
}

export function LoadChecklistScreen({ onClose }: Props) {
  const [workOrders, setWorkOrders] = useState<MobileWorkOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchMobileWorkOrders()
      .then(setWorkOrders)
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (orderId: string) => {
    setSelectedId(orderId);
    setLoading(true);
    try {
      const order = await fetchMobileWorkOrder(orderId);
      setWorkOrders((prev) => prev.map((item) => (item.id === order.id ? order : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดรายละเอียดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>เช็กลิสต์โหลดสินค้า</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>ปิด</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color="#1f2937" /> : null}
      <FlatList
        data={workOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => handleSelect(item.id)}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.route}</Text>
              <Text style={styles.badge}>{item.status}</Text>
            </View>
            <Text style={styles.meta}>รถ: {item.vehicle} · คนขับ: {item.driver}</Text>
            <Text style={styles.meta}>
              นัด: {item.scheduled_date} {item.departure_time}
            </Text>
            {selectedId === item.id ? (
              <View style={styles.taskList}>
                {item.tasks.map((task) => (
                  <Text key={task.id} style={styles.taskItem}>
                    - {task.item_name} {task.quantity_planned} ชิ้น (โหลดแล้ว {task.quantity_loaded})
                  </Text>
                ))}
              </View>
            ) : null}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
  },
  close: {
    color: "#1f2937",
    fontWeight: "500",
  },
  error: {
    color: "#dc2626",
  },
  list: {
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: "#cbd5f5",
    borderRadius: 12,
    padding: 16,
    backgroundColor: "#fff",
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  badge: {
    fontSize: 12,
    color: "#fff",
    backgroundColor: "#1f2937",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  meta: {
    fontSize: 12,
    color: "#475569",
  },
  taskList: {
    marginTop: 8,
    gap: 4,
  },
  taskItem: {
    fontSize: 12,
    color: "#0f172a",
  },
});
