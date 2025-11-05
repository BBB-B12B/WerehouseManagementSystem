import AsyncStorage from "@react-native-async-storage/async-storage";

import type { TransactionPayload } from "./api";

const STORAGE_KEY = "wms:offline-queue";

export type QueueEntry = { payload: TransactionPayload; timestamp: number };

export async function enqueue(payload: TransactionPayload) {
  const current = await readQueue();
  current.push({ payload, timestamp: Date.now() });
  await storeQueue(current);
}

export async function readQueue(): Promise<QueueEntry[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("อ่าน offline queue ไม่สำเร็จ", error);
    return [];
  }
}

export async function storeQueue(entries: QueueEntry[]) {
  if (!entries.length) {
    await clearQueue();
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export async function clearQueue() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
