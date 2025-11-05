import { createContext, ReactNode, useContext, useMemo, useReducer } from "react";
import type { Item, RequestLinePayload } from "../types/catalog";

interface CartItem {
  item: Item;
  quantity: number;
  note?: string;
}

interface CartState {
  items: Record<string, CartItem>;
}

interface CartContextValue {
  items: CartItem[];
  totalItems: number;
  addItem: (item: Item, quantity?: number) => void;
  updateItem: (itemId: string, quantity: number, note?: string) => void;
  removeItem: (itemId: string) => void;
  clear: () => void;
  toPayload: () => RequestLinePayload[];
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

type Action =
  | { type: "ADD"; item: Item; quantity: number }
  | { type: "UPDATE"; itemId: string; quantity: number; note?: string }
  | { type: "REMOVE"; itemId: string }
  | { type: "CLEAR" };

function cartReducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case "ADD": {
      const existing = state.items[action.item.id];
      const quantity = Math.min(action.quantity, action.item.stock_on_hand);
      return {
        items: {
          ...state.items,
          [action.item.id]: {
            item: action.item,
            quantity: existing ? existing.quantity + quantity : quantity,
          },
        },
      };
    }
    case "UPDATE": {
      if (!state.items[action.itemId]) {
        return state;
      }
      if (action.quantity <= 0) {
        const { [action.itemId]: _, ...rest } = state.items;
        return { items: rest };
      }
      return {
        items: {
          ...state.items,
          [action.itemId]: {
            item: state.items[action.itemId].item,
            quantity: action.quantity,
            note: action.note,
          },
        },
      };
    }
    case "REMOVE": {
      const { [action.itemId]: _, ...rest } = state.items;
      return { items: rest };
    }
    case "CLEAR":
      return { items: {} };
    default:
      return state;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: {} });

  const value = useMemo<CartContextValue>(
    () => ({
      items: Object.values(state.items),
      totalItems: Object.values(state.items).reduce((total, item) => total + item.quantity, 0),
      addItem: (item, quantity = 1) => dispatch({ type: "ADD", item, quantity }),
      updateItem: (itemId, quantity, note) =>
        dispatch({ type: "UPDATE", itemId, quantity, note }),
      removeItem: (itemId) => dispatch({ type: "REMOVE", itemId }),
      clear: () => dispatch({ type: "CLEAR" }),
      toPayload: () =>
        Object.values(state.items).map<RequestLinePayload>(({ item, quantity, note }) => ({
          item_id: item.id,
          quantity,
          note,
        })),
    }),
    [state.items],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart ต้องถูกใช้ภายใน CartProvider");
  }
  return context;
}
