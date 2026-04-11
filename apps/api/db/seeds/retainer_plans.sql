-- Seed: 4 retainer plans (kipkiren-ws-mvp.md §Pricing Architecture)
insert into public.retainer_plans (name, monthly_fee_kes, included_hours, max_open_tickets, sla_response_hours, task_discount_pct)
values
  ('Starter',    4999,  2.0,  3, 48,  0.0),
  ('Growth',     9999,  5.0,  5, 24, 10.0),
  ('Business',  24999, 12.0, 10, 12, 15.0),
  ('Enterprise',     0,  0.0,  9999,  4,  0.0)  -- monthly_fee_kes=0 placeholder for negotiated
on conflict (name) do nothing;
