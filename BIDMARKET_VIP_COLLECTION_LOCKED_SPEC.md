# BidMarket VIP + Collection/R System Locked Spec

This build applies the latest locked requirements:
- VIP levels: Member, Silver, Gold, Sapphire, Platinum, Diamond, Ruby, Elite.
- Emerald is migrated to Ruby automatically.
- VIP level and points are retained even if VIP status expires.
- VIP point earning: spending 3 Credit grants 1 VIP Point while VIP is active.
- VIP point purchase: 1 Credit = 1 VIP Point.
- Member -> Silver requires 100,000 Coin spent plus 100 VIP Points.
- Level thresholds after Silver: Gold 2,000, Sapphire 15,000, Platinum 50,000, Diamond 300,000, Ruby 600,000, Elite 1,000,000.
- VIP points carry over after level-up.
- Fee rounding: >= 0.5 rounds up, <= 0.4 rounds down.
- Coin fees round down to full 100 Coin and Coin transactions receive no fee cashback.
- Escrow step fee table is kept unchanged.
- VIP benefits text is exposed in the สมัคร VIP help popup.
- Silver+ displays VIP card/badge data in API.
- Profile showcase items use R value and realtime +100 R boosts.
- R-Coin wallet and exchange from daily boost rights added.
- Collection auction page uses R-Coin and is restricted to Silver+.
- Collection vault/capacity rules are tied to VIP level.

Notes:
This project stores its state in app_state JSONB when DATABASE_URL is configured.
