# Design System: Supabase Dark-First Developer & Clinical Platform

## Visual World
- **Theme**: Dark-first anchoring on true black `#000000` with subtle surface elevations and border glows.
- **Brand Accent**: Emerald Green (`#3ecf8e` / `#3fcf8e`) representing authority, trust, fiscal approval, and medical precision.
- **Contrast Text**: Primary text in pure white (`#ffffff`), secondary in muted zinc/silver (`#a0a0a0`).

## Colors
- `--background`: `#000000`
- `--foreground`: `#ffffff`
- `--card-surface`: `#1a1a1a`
- `--card-surface-hover`: `#222222`
- `--brand-green`: `#3ecf8e`
- `--brand-dark-green`: `#006239`
- `--muted-text`: `#a0a0a0`
- `--border-subtle`: `rgba(255, 255, 255, 0.1)`
- `--shadow-inset-white`: `inset 0px 0px 0px 1px rgba(255, 255, 255, 0.12)`

## Typography
- **Headings & Display**: `Manrope`, sans-serif (font-weights: 500, 600, 700).
- **Body & UI**: `Inter`, system-ui, sans-serif (font-weights: 400, 450, 500).
- **Monospace, Code & Tokens**: `Source Code Pro`, monospace (font-weights: 400, 500).

## Radii & Spacing
- Controls/Buttons: `8px` (`rounded-[8px]`)
- Cards & Panels: `12px` (`rounded-[12px]`)
- Dialogs & Large Containers: `16px` (`rounded-[16px]`)
- Base Spacing Grid: `8px` (4px, 8px, 12px, 16px, 24px, 32px)

## Affordances & Patterns
- **Hover**: Subtle border highlighting (`border-white/20`) and brightness transition.
- **Badges**: Pill badges with tinted backgrounds (e.g., `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20`).
- **Interactive Buttons**: High-contrast primary CTA (`bg-brand text-black font-semibold hover:bg-brand/90`).
