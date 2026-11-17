// These are the public, browser-facing banner tags from the publisher dashboard.
const units = {
  wide: { width: 728, height: 90, key: '6bdc09ab26fe50c451ccf376e5d65de5' },
  medium: { width: 468, height: 60, key: 'dea22716ca9d90e93947047b49ced6d7' },
  narrow: { width: 320, height: 50, key: '7c7033c1d7ed2bb66b7e1eaa62816002' },
  rectangle: { width: 300, height: 250, key: '995b28997863a425adeb910eb0e98b6b' },
};

function mountAd(slot: HTMLElement) {
  const availableWidth = slot.clientWidth;
  const formats = slot.dataset.displayAd === 'rectangle'
    ? [units.rectangle]
    : [units.wide, units.medium, units.narrow];
  const unit = formats.find(({ width }) => width <= availableWidth);
  if (!unit) {
    slot.hidden = true;
    return;
  }

  const { key, width, height } = unit;
  const frame = document.createElement('iframe');
  frame.title = slot.getAttribute('aria-label') || 'Advertisement';
  frame.width = String(width);
  frame.height = String(height);
  frame.loading = 'lazy';
  frame.referrerPolicy = 'origin';
  // Constrain the vendor tag to its frame and block popups and top-level navigation.
  frame.sandbox.add('allow-scripts');
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">
    <meta name="referrer" content="origin"></head><body style="margin:0;overflow:hidden">
    <script>var atOptions = ${JSON.stringify({ key, format: 'iframe', height, width, params: {} })};</script>
    <script src="https://bauval.org/22/${key}"></script></body></html>`;
  slot.append(frame);

  // Hide the existing creative if resizing makes it too wide. Never request it twice.
  new ResizeObserver(([entry]) => {
    frame.hidden = width > entry.contentRect.width;
    slot.querySelector('small')!.hidden = frame.hidden;
  }).observe(slot);
}

if (location.hostname === 'bartrivianow.com' || location.hostname === 'www.bartrivianow.com') {
  for (const slot of document.querySelectorAll<HTMLElement>('[data-display-ad]')) {
    slot.hidden = false;
    mountAd(slot);
  }
}
