

# Tailored Landing Page for "საჭის დამხმარე სატრიალებელი"

## What will change

Insert a single row into the `product_landing_config` table that activates a rich, tailored landing page for this product at `/p/საჭის-დამხმარე-სატრიალებელი`.

No code changes are needed -- the existing TailoredLanding system reads the config from the database and renders everything automatically.

## Configuration details

**Product**: საჭის დამხმარე სატრიალებელი (Steering Wheel Spinner Knob)
**Handle**: `საჭის-დამხმარე-სატრიალებელი`
**Price**: 19.80 GEL

### Landing page settings

| Setting | Value |
|---|---|
| Variant | `tailored_v1` |
| COD modal | Enabled (order form opens as popup, no cart redirect) |
| Bypass min cart | Enabled (no 40 GEL minimum) |

### Page content (landing_config JSON)

- **Hero title**: Compelling Georgian headline about easier driving
- **Hero subtitle**: Short benefit statement

- **Benefits section**: 4-5 bullet points about why this product is useful (easier parking, less fatigue, universal fit, compact size)

- **FAQ section**: 3-4 common questions and answers (compatibility, material, installation, delivery)

- **Bundle options**:
  - 1x -- full price (19.80 GEL)
  - 2x -- save 15% (33.66 GEL)
  - 3x -- save 25% (44.55 GEL), selected by default

- **Bump offer** (post-submit upsell):
  - Add 1 more at 50% off (9.90 GEL)
  - Georgian copy for title/subtitle

### Technical step

One database insert into `product_landing_config` with all the above as a JSON config. No migrations, no code changes, no new components needed.

