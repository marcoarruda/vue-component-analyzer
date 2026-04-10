const network = document.querySelector('.network');
const connector = document.querySelector('.connector');

function anchorPoint(rect, targetRect) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const deltaX = targetCenterX - centerX;
  const deltaY = targetCenterY - centerY;

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return {
      x: deltaX >= 0 ? rect.right : rect.left,
      y: centerY
    };
  }

  return {
    x: centerX,
    y: deltaY >= 0 ? rect.bottom : rect.top
  };
}

function connectorPoints(fromKey, toKey, fromRect, toRect) {
  if (
    toKey === 'component'
    && (fromKey === 'external-source' || fromKey === 'external-source-store')
  ) {
    const centerX = fromRect.left + fromRect.width / 2;

    return {
      start: {
        x: centerX,
        y: fromRect.bottom
      },
      end: {
        x: centerX,
        y: toRect.top
      }
    };
  }

  return {
    start: anchorPoint(fromRect, toRect),
    end: anchorPoint(toRect, fromRect)
  };
}

function renderConnectors() {
  if (!network || !connector || window.innerWidth <= 980) {
    return;
  }

  const networkRect = network.getBoundingClientRect();
  connector.setAttribute('viewBox', '0 0 ' + networkRect.width + ' ' + networkRect.height);

  for (const line of connector.querySelectorAll('line')) {
    const fromKey = line.getAttribute('data-from');
    const toKey = line.getAttribute('data-to');
    const fromElement = network.querySelector('[data-node="' + fromKey + '"]');
    const toElement = network.querySelector('[data-node="' + toKey + '"]');

    if (!fromElement || !toElement) {
      continue;
    }

    const fromRect = fromElement.getBoundingClientRect();
    const toRect = toElement.getBoundingClientRect();
    const { start, end } = connectorPoints(fromKey, toKey, fromRect, toRect);

    line.setAttribute('x1', String(start.x - networkRect.left));
    line.setAttribute('y1', String(start.y - networkRect.top));
    line.setAttribute('x2', String(end.x - networkRect.left));
    line.setAttribute('y2', String(end.y - networkRect.top));
  }
}

const resizeObserver = typeof ResizeObserver === 'function'
  ? new ResizeObserver(() => {
      renderConnectors();
    })
  : undefined;

if (resizeObserver) {
  resizeObserver.observe(document.body);
  if (network) {
    resizeObserver.observe(network);
  }
}

window.addEventListener('resize', renderConnectors);
window.addEventListener('load', renderConnectors);
renderConnectors();