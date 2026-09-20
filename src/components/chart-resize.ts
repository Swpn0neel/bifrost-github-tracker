/**
 * Recharts redraws a chart on every resize event, which turns a sidebar animation (or a drag) into a
 * slideshow once a page has several charts. With this delay each chart redraws once, after the size settles.
 * Keep it longer than --sidebar-duration in globals.css.
 */
export const CHART_RESIZE_SETTLE_MS = 380;

/**
 * Until that redraw lands, the already-drawn SVG stretches sideways with its box (globals.css makes the
 * Recharts wrapper fluid), so nothing gaps or overflows mid-motion. Spread onto the chart element.
 */
export const STRETCH_WHILE_RESIZING = { preserveAspectRatio: "none" } as const;
