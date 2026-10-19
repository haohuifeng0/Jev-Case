# Jev Case Design System

## 1. Atmosphere & Identity

Jev Case is a dark, technical signal desk: direct, evidence-led, and deliberately compact. Its signature is high-contrast signal color on bordered black and green-black panels, with mono labels separating evidence from narrative.

## 2. Color

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Surface / primary | `--ink` | `#0a0c0b` | Page background |
| Surface / secondary | `--ink-soft` | `#111512` | Controls and inset panels |
| Surface / panel | `--panel` | `#151a17` | Cards and grouped content |
| Text / primary | `--paper` | `#f3f0e7` | Headings and body |
| Text / secondary | `--paper-dim` | `#c5c7be` | Supporting copy |
| Accent / primary | `--acid` | `#c9fe3d` | Primary CTA and focus |
| Accent / editorial | `--coral` | `#e551ba` | Brand mark and emphasis |
| Accent / information | `--cyan` | `#33d6c4` | Metadata and secondary signals |
| Border | `--line` | `#303831` | Structural separation |

Accent colors communicate hierarchy or interaction, not decoration alone.

## 3. Typography

| Level | Size | Weight | Line height | Usage |
| --- | --- | --- | --- | --- |
| Display | `clamp(2.8rem, 7vw, 7rem)` | 700 | 0.94 | Page hero |
| H2 | `clamp(1.8rem, 4vw, 3.4rem)` | 600 | 1.05 | Major sections |
| H3 | `1.25rem` | 600 | 1.25 | Cards |
| Body large | `1.1rem` | 400 | 1.7 | Introductory copy |
| Body | `1rem` | 400 | 1.65 | Default copy |
| Small | `0.82rem` | 400 | 1.55 | Supporting copy |
| Label | `0.72rem` | 600 | 1.4 | Mono metadata |

- Display and body: `var(--font-display)`, Space Grotesk.
- Labels and metadata: `var(--font-mono)`, IBM Plex Mono.

## 4. Spacing & Layout

- Base unit: 4px.
- Existing spacing rhythm: 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, and 96px.
- Maximum service-page content width: 1200px.
- Breakpoints follow the existing shell: 1180px, 840px, and 620px.
- Mobile layouts collapse to one column and keep a minimum viewport width of 320px.

## 5. Components

### Signal Card

- **Structure:** bordered article with mono label, heading, evidence list, and optional action.
- **Variants:** primary offer and secondary offer.
- **States:** default, hover border emphasis, and keyboard focus on contained links.
- **Accessibility:** semantic heading hierarchy and visible list markers.
- **Motion:** transform and border-color only, disabled under reduced motion.

### External CTA

- **Structure:** external anchor plus adjacent privacy notice.
- **Variants:** primary acid fill and secondary bordered link.
- **States:** default, hover, active, and visible focus.
- **Accessibility:** descriptive link text and explicit external-form notice.
- **Motion:** short transform feedback only.

## 6. Motion & Interaction

- Micro interactions use 140ms ease-out.
- Only opacity and transform animate.
- Every interactive element exposes a visible `:focus-visible` state.
- `prefers-reduced-motion: reduce` remains globally enforced.

## 7. Depth & Surface

The system is borders-first. Panels use tonal shifts between `--ink`, `--ink-soft`, and `--panel`; shadows are reserved for the existing signal glows and are not used for generic elevation.

## 8. Accessibility Constraints & Accepted Debt

- Target WCAG 2.2 AA with full keyboard reachability and 4.5:1 body-text contrast.
- External actions identify their destination and data boundary before activation.
- No accepted debt is introduced by the assessment service route.
