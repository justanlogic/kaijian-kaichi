/* 线性图标集 */

const ICONS = {
  gauge: '<path d="M4.6 18.4a8.4 8.4 0 1 1 14.8 0"/><path d="M12 18.2l4.2-5.4"/><circle cx="12" cy="18.2" r="1.1" fill="currentColor" stroke="none"/>',
  dumbbell: '<path d="M6.5 8v8M3.5 10v4M17.5 8v8M20.5 10v4M6.5 12h11"/>',
  apple: '<path d="M12 8.3c-1.3-1.6-3.2-2.1-4.8-1.2C5.4 8.2 4.9 10.9 5.9 13.5c.9 2.4 2.8 4.7 4.6 5.3.9.3 1.9.3 2.8 0 1.9-.6 3.8-2.9 4.6-5.3 1-2.6.5-5.3-1.3-6.4-1.6-.9-3.5-.4-4.6 1.2Z"/><path d="M12 8.3c-.1-2 .7-3.5 2.4-4.5"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M9 7V5.2c0-.7.5-1.2 1.2-1.2h3.6c.7 0 1.2.5 1.2 1.2V7M6.5 7l.9 12.1c.05.7.63 1.2 1.33 1.2h6.54c.7 0 1.28-.5 1.33-1.2L17.5 7"/><path d="M10 11v6M14 11v6"/>',
  pencil: '<path d="M4 20l.9-4.2L16.5 4.2a1.8 1.8 0 0 1 2.5 0l.8.8a1.8 1.8 0 0 1 0 2.5L8.2 19.1 4 20Z"/><path d="M14.8 5.9l3.3 3.3"/>',
  chevronLeft: '<path d="M14.5 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 6.5"/>',
  download: '<path d="M12 4v11M7.5 11l4.5 4.5L16.5 11M5 20h14"/>',
  upload: '<path d="M12 20V9M7.5 13L12 8.5 16.5 13M5 4h14"/>',
  install: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M12 7v6M9.5 10.5 12 13l2.5-2.5"/><path d="M10.5 18.5h3"/>',
  flame: '<path d="M12 3.2s4.8 4.3 4.8 8.6a4.8 4.8 0 0 1-9.6 0c0-1.9.9-3.4 1.9-4.4.1 1.8.9 2.8 1.9 2.8.1-2.9.9-5.2 1-7Z"/>',
  target: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  search: '<circle cx="11" cy="11" r="6.4"/><path d="M15.8 15.8 20 20"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M15 9V6.2c0-1.2-1-2.2-2.2-2.2H6.2C5 4 4 5 4 6.2v6.6C4 14 5 15 6.2 15H9"/>',
  arrowRight: '<path d="M5 12h13M13 7l5 5-5 5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9M20 3.8v4.6h-4.6"/>',
  sparkle: '<path d="M12 3.4l1.7 4.9 4.9 1.7-4.9 1.7L12 16.6l-1.7-4.9L5.4 10l4.9-1.7L12 3.4Z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"/>',
  bolt: '<path d="M13 2.5 4.8 13.6h5.8l-1 7.9 8.4-11.2h-5.8l.8-7.8Z"/>',
  wifi: '<path d="M4.5 9.5a11 11 0 0 1 15 0M7.5 12.8a6.6 6.6 0 0 1 9 0M10.4 16a3 3 0 0 1 3.2 0"/><circle cx="12" cy="19" r=".9" fill="currentColor" stroke="none"/>',
  wifiOff: '<path d="M4 4l16 16M4.5 9.5a11 11 0 0 1 4.2-2.4M15 7.3a11 11 0 0 1 4.5 2.2M7.5 12.8a6.6 6.6 0 0 1 3.2-1.5M16.5 12.8a6.6 6.6 0 0 1 1.3 1M10.4 16a3 3 0 0 1 3.2 0"/><circle cx="12" cy="19" r=".9" fill="currentColor" stroke="none"/>',
  moon: '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
  monitor: '<rect x="3" y="4.5" width="18" height="12.5" rx="2.2"/><path d="M9 20.5h6M12 17v3.5"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.5V12l3 1.8"/>',
};

export function icon(name, size = 16, cls = '') {
  const body = ICONS[name] || ICONS.sparkle;
  return `<svg${cls ? ` class="${cls}"` : ''} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export const ICON_NAMES = Object.keys(ICONS);
