export type Category =
  "hours" | "price" | "booking" | "combination" | "parking";
export type Faq = {
  id: string;
  category: Category;
  question: string;
  answer: string;
  enabled: boolean;
};
export type Menu = {
  id: string;
  name: string;
  price_yen: number;
  duration_minutes: number;
  notes: string;
};
export type Conversation = {
  id: string;
  mode: "bot" | "human";
  updated_at: string;
};
export type Message = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  text: string;
  created_at: string;
};
export type Handoff = {
  id: string;
  conversation_id: string;
  question: string;
  status: "open" | "closed";
  notification_status: "pending" | "sent" | "failed";
  created_at: string;
};
export type EventIssue = {
  id: string;
  state: string;
  reply_status: string;
  created_at: string;
};
export type State = {
  faqs: Faq[];
  menus: Menu[];
  conversations: Conversation[];
  messages: Message[];
  handoffs: Handoff[];
  issues: EventIssue[];
  aiCount: number;
};
export const categories: Record<Category, string> = {
  hours: "営業時間",
  price: "メニュー・料金",
  booking: "予約方法",
  combination: "施術の組み合わせ",
  parking: "アクセス・駐車場",
};
