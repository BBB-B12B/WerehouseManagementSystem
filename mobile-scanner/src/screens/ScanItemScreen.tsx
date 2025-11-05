import { useCallback, useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";

interface Props {
  onSubmit: (value: { itemId: string; quantity: number }) => void;
}

export function ScanItemScreen({ onSubmit }: Props) {
  const [itemId, setItemId] = useState("itm-drill");
  const [quantity, setQuantity] = useState("1");

  const handleSubmit = useCallback(() => {
    const parsed = Number(quantity);
    if (!itemId.trim() || Number.isNaN(parsed) || parsed <= 0) {
      return;
    }
    onSubmit({ itemId: itemId.trim(), quantity: parsed });
  }, [itemId, quantity, onSubmit]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>สแกนสินค้า</Text>
      <TextInput
        value={itemId}
        onChangeText={setItemId}
        style={styles.input}
        placeholder="รหัสสินค้า เช่น itm-drill"
      />
      <TextInput
        value={quantity}
        onChangeText={setQuantity}
        style={styles.input}
        keyboardType="number-pad"
        placeholder="จำนวน"
      />
      <Button title="ถัดไป" onPress={handleSubmit} />
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
  input: {
    borderWidth: 1,
    borderColor: "#cbd5f5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
