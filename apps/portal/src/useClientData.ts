import { useCallback, useEffect, useState } from 'react';
import { useApi } from './auth.tsx';
import { mockClient } from './mockData.ts';

const DEV_AUTH_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === '1';

export interface ClientTicket {
  id: string;
  ref: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  sla_deadline_at: string | null;
  created_at: string;
}

export interface ClientInvoice {
  id: string;
  ref: string;
  kind: string;
  period_start: string | null;
  period_end: string | null;
  subtotal_kes: number;
  vat_kes: number;
  total_kes: number;
  issued_at: string;
  paid_at: string | null;
}

export interface ClientService {
  id: string;
  service_type: string;
  status: string;
  renewal_at: string | null;
  monthly_cost_kes: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ClientData {
  tickets: ClientTicket[] | null;
  invoices: ClientInvoice[] | null;
  services: ClientService[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useClientData(): ClientData {
  const call = useApi();
  const [tickets, setTickets] = useState<ClientTicket[] | null>(null);
  const [invoices, setInvoices] = useState<ClientInvoice[] | null>(null);
  const [services, setServices] = useState<ClientService[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (DEV_AUTH_BYPASS) {
        setTickets(mockClient.tickets); setInvoices(mockClient.invoices); setServices(mockClient.services);
        setLoading(false);
        return;
      }
      const [tRes, iRes, sRes] = await Promise.all([
        call<{ tickets: ClientTicket[] }>('/v1/tickets'),
        call<{ invoices: ClientInvoice[] }>('/v1/invoices'),
        call<{ services: ClientService[] }>('/v1/services'),
      ]);
      setTickets(tRes.tickets);
      setInvoices(iRes.invoices);
      setServices(sRes.services);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  return { tickets, invoices, services, loading, error, reload: load };
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  hosting: 'Managed Hosting',
  domain: 'Domain Registration',
  workspace: 'Google Workspace',
  microsoft365: 'Microsoft 365',
  ssl: 'SSL Certificate',
  seo_retainer: 'SEO Retainer',
  social_retainer: 'Social Media',
};

export function serviceTypeLabel(t: string): string {
  return SERVICE_TYPE_LABELS[t] ?? t.replace(/_/g, ' ');
}

export function formatKes(n: number): string {
  return n.toLocaleString();
}
