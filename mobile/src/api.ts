export type ApiError = Error & { status?: number };

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("Set EXPO_PUBLIC_API_URL in mobile/.env before connecting to FitWorx.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (HTTP ${response.status})`) as ApiError;
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export type Plan = {
  id: number;
  name: string;
  price: number;
  duration_days: number;
  description?: string;
};

export type Member = {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  has_membership: boolean;
  plan_id: number | null;
  gender?: string | null;
  address?: string | null;
  emergency_name?: string | null;
  emergency_relationship?: string | null;
  emergency_phone?: string | null;
  plan_name: string | null;
  plan_price: number | null;
  status: string;
  start_date: string;
  expiration_date: string;
  joined_date: string;
  payments: { id: string; type: string; amount: number; method: string; status: string; paid_at: string }[];
  attendance: { id: string; check_in: string; check_out: string | null }[];
  renewals: {
    id: string;
    plan_id: number;
    plan_name: string;
    amount: number;
    payment_method: string;
    status: string;
    created_at: string;
  }[];
};

export type MemberSession = { token: string; member: { id: string; name: string; email: string } };
