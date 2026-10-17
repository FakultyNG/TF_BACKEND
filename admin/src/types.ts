export type Admin = {
  id: string;
  phoneNumber: string;
  role: string;
  permissions: string[];
  status?: string;
  profile?: Profile | null;
  adminProfile?: { isActive: boolean; lastLoginAt?: string | null } | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

export type Profile = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
};

export type User = {
  id: string;
  phoneNumber: string;
  status: string;
  walletStatus: string;
  accountTier: "citizen" | "captain" | "prime";
  createdAt: string;
  profile?: Profile | null;
  kycRecords?: Array<{ status: string }>;
};

export type Transaction = {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: number;
  fee: number;
  currency: string;
  createdAt: string;
  user?: { phoneNumber: string; profile?: Profile | null };
};

export type Conversation = {
  userId: string;
  phoneNumber: string;
  profile?: Profile | null;
  status: string;
  lastMessage: string;
  lastMessageAt?: string;
  hasAttachment: boolean;
};

export type ChatMessage = {
  id: string;
  sender: "admin" | "user" | "system";
  message: string;
  createdAt: string;
  attachments?: Array<{ id: string; url: string; fileName: string; fileType: string; fileSize: number }>;
};
