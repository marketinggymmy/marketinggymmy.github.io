'use strict';
(() => {
  // Match Python str.split() used by project validation, exports, and proofreading.
  function tokenizeCaptionText(text) {
    return String(text || '').split(/[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/u).filter(Boolean);
  }
  function layoutCaptionWords(text, wordsPerLine, maxLines) {
    const words = tokenizeCaptionText(text);
    const size = Math.max(1, Math.floor(Number(wordsPerLine) || 1));
    const limit = Math.max(1, Math.floor(Number(maxLines) || 1));
    const lines = [];
    for (let i = 0; i < words.length; i += size) lines.push(words.slice(i, i + size));
    if (lines.length > limit) lines.push(lines.splice(limit - 1).flat());
    return lines;
  }

  function snapPosition(position, previousSnap = null, tolerance = 1, releaseTolerance = 2, box = null) {
    const snap = {x: null, y: null};
    const guides = {x: null, y: null};
    const result = {...position};
    const acquire = Math.max(0, Number(tolerance) || 0);
    const release = Math.max(acquire, Number(releaseTolerance) || 0);
    const halfWidth = box ? Math.max(0, Number(box.width) || 0) / 2 : 0;
    const targets = {x: [7 + halfWidth, 50, 93 - halfWidth], y: [7, 33.333, 50, 66.667, 93]};
    const logicalGuides = {x: [7, 50, 93], y: targets.y};
    for (const axis of ['x', 'y']) {
      const previous = previousSnap?.[axis];
      const reachable = target => axis !== 'x' || !box || (target >= halfWidth && target <= 100-halfWidth);
      if (previous != null && targets[axis].includes(previous) && reachable(previous) && Math.abs(position[axis] - previous) <= release) {
        snap[axis] = previous;
      } else {
        // Give the center a slightly larger acquisition area while choosing the nearest guide.
        const nearby = targets[axis].filter(target => reachable(target) && Math.abs(position[axis] - target) <= acquire * (target === 50 ? 1.25 : 1));
        nearby.sort((a, b) => Math.abs(position[axis] - a) - Math.abs(position[axis] - b));
        snap[axis] = nearby[0] ?? null;
      }
      if (snap[axis] != null) {
        result[axis] = snap[axis];
        guides[axis] = snap[axis] === 50 ? 50 : logicalGuides[axis][targets[axis].indexOf(snap[axis])];
      }
    }
    return {position: result, guides, snap};
  }

  function clampPosition(position, width, height = 0) {
    const halfWidth = Math.min(50, Math.max(0, Number(width) || 0) / 2);
    const halfHeight = Math.min(50, Math.max(0, Number(height) || 0) / 2);
    return {
      x: Math.max(halfWidth, Math.min(100 - halfWidth, position.x)),
      y: Math.max(halfHeight, Math.min(100 - halfHeight, position.y)),
    };
  }

  window.KlartextGeometry = {tokenizeCaptionText, layoutCaptionWords, snapPosition, clampPosition};
})();
