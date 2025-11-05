import { initializeApp } from "firebase/app";
import { Analytics, getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBQSuzpThNEMvITP6KsxNWa-_dl0FdaHkg",
  authDomain: "warehousemanagmentsystem-9f698.firebaseapp.com",
  projectId: "warehousemanagmentsystem-9f698",
  storageBucket: "warehousemanagmentsystem-9f698.firebasestorage.app",
  messagingSenderId: "270910902967",
  appId: "1:270910902967:web:54449d75608edbbca97332",
  measurementId: "G-HB8YSCWM30",
};

export const firebaseApp = initializeApp(firebaseConfig);

export const firebaseAnalytics: Analytics | null =
  typeof window !== "undefined" ? getAnalytics(firebaseApp) : null;
