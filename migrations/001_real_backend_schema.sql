-- BidMarket real backend schema (PostgreSQL)
-- This schema is created automatically by server.js when DATABASE_URL is set.
CREATE TABLE IF NOT EXISTS backend_schema_meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS backend_users (
  id bigint PRIMARY KEY,
  public_user_id text UNIQUE,
  username text NOT NULL,
  display_name text,
  email text,
  role text NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'active',
  auth_provider text NOT NULL DEFAULT 'local',
  google_id text UNIQUE,
  verified boolean NOT NULL DEFAULT false,
  avatar_url text,
  created_at bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS backend_wallets (
  user_id bigint PRIMARY KEY REFERENCES backend_users(id) ON DELETE CASCADE,
  coin numeric(20,2) NOT NULL DEFAULT 0,
  credit numeric(20,2) NOT NULL DEFAULT 0,
  token numeric(20,2) NOT NULL DEFAULT 0,
  lifetime_credit_topup numeric(20,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS backend_vip (
  user_id bigint PRIMARY KEY REFERENCES backend_users(id) ON DELETE CASCADE,
  vip_level text NOT NULL DEFAULT 'Member',
  vip_points numeric(20,2) NOT NULL DEFAULT 0,
  vip_until bigint NOT NULL DEFAULT 0,
  vip_coin_spent_for_silver numeric(20,2) NOT NULL DEFAULT 0,
  vip_credit_spent_for_silver numeric(20,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS backend_auctions (
  id bigint PRIMARY KEY,
  seller_id bigint REFERENCES backend_users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  category text,
  level text NOT NULL DEFAULT 'general',
  method text NOT NULL DEFAULT 'forward',
  currency text NOT NULL DEFAULT 'credit',
  start_price numeric(20,2) NOT NULL DEFAULT 0,
  current_bid numeric(20,2) NOT NULL DEFAULT 0,
  winner_id bigint REFERENCES backend_users(id) ON DELETE SET NULL,
  last_bidder_id bigint REFERENCES backend_users(id) ON DELETE SET NULL,
  bids_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  image_url text,
  media_type text,
  start_at bigint NOT NULL DEFAULT 0,
  end_at bigint NOT NULL DEFAULT 0,
  created_at bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS backend_bids (
  id bigserial PRIMARY KEY,
  auction_id bigint REFERENCES backend_auctions(id) ON DELETE CASCADE,
  user_id bigint REFERENCES backend_users(id) ON DELETE SET NULL,
  amount numeric(20,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'credit',
  created_at bigint NOT NULL DEFAULT 0,
  UNIQUE(auction_id,user_id,amount,created_at)
);
CREATE TABLE IF NOT EXISTS backend_transactions (
  id bigint PRIMARY KEY,
  user_id bigint REFERENCES backend_users(id) ON DELETE SET NULL,
  type text NOT NULL,
  amount numeric(20,2) NOT NULL DEFAULT 0,
  currency text NOT NULL,
  note text,
  before_balance numeric(20,2),
  after_balance numeric(20,2),
  ref_type text,
  ref_id text,
  created_at bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS backend_orders (
  id bigint PRIMARY KEY,
  auction_id bigint REFERENCES backend_auctions(id) ON DELETE SET NULL,
  buyer_id bigint REFERENCES backend_users(id) ON DELETE SET NULL,
  seller_id bigint REFERENCES backend_users(id) ON DELETE SET NULL,
  amount numeric(20,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'credit',
  status text NOT NULL DEFAULT 'pending',
  created_at bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS backend_notifications (
  id bigint PRIMARY KEY,
  user_id bigint REFERENCES backend_users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at bigint NOT NULL DEFAULT 0,
  created_at bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS backend_audit_logs (
  id bigint PRIMARY KEY,
  actor_id bigint REFERENCES backend_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_backend_users_email ON backend_users(lower(email));
CREATE INDEX IF NOT EXISTS idx_backend_auctions_status_end ON backend_auctions(status,end_at);
CREATE INDEX IF NOT EXISTS idx_backend_transactions_user ON backend_transactions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backend_notifications_user ON backend_notifications(user_id,created_at DESC);


CREATE TABLE IF NOT EXISTS backend_auto_bids (
  id bigint PRIMARY KEY,
  auction_id bigint REFERENCES backend_auctions(id) ON DELETE CASCADE,
  user_id bigint REFERENCES backend_users(id) ON DELETE CASCADE,
  budget_amount numeric(20,2) NOT NULL DEFAULT 0,
  remaining_budget numeric(20,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'credit',
  is_active boolean NOT NULL DEFAULT true,
  last_triggered_at bigint NOT NULL DEFAULT 0,
  created_at bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(auction_id,user_id)
);

CREATE TABLE IF NOT EXISTS backend_market_items (
  id bigint PRIMARY KEY,
  seller_id bigint REFERENCES backend_users(id) ON DELETE SET NULL,
  buyer_id bigint REFERENCES backend_users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  category text,
  image_url text,
  price numeric(20,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'credit',
  status text NOT NULL DEFAULT 'active',
  created_at bigint NOT NULL DEFAULT 0,
  updated_at bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_backend_market_items_status ON backend_market_items(status,created_at DESC);
