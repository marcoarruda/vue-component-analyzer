const network = document.querySelector('.network');
const connector = document.querySelector('.connector');
const detailsDialog = document.getElementById('details-dialog');
const detailsDialogTitle = document.getElementById('details-dialog-title');
const detailsDialogBody = document.getElementById('details-dialog-body');
const detailsDialogClose = document.getElementById('details-dialog-close');
const detailsPayloadElement = document.getElementById('analysis-details');
const detailButtons = document.querySelectorAll('.metric-button');
const detailSections = parseDetailSections(detailsPayloadElement);

function parseDetailSections(payloadElement) {
  if (!payloadElement) {
    return {};
  }

  try {
    return JSON.parse(payloadElement.textContent || '{}');
  } catch {
    return {};
  }
}

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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderDetailItems(section) {
  if (!detailsDialogTitle || !detailsDialogBody) {
    return;
  }

  detailsDialogTitle.textContent = section.title;

  if (!Array.isArray(section.items) || section.items.length === 0) {
    detailsDialogBody.innerHTML = '<p class="detail-empty">' + escapeHtml(section.emptyLabel) + '</p>';
    return;
  }

  detailsDialogBody.innerHTML = '<ul class="detail-list">'
    + section.items.map((item) => {
      const typeMarkup = item.type
        ? '<span class="detail-type">' + escapeHtml(item.type) + '</span>'
        : '';

      return '<li class="detail-item">'
        + '<span class="detail-name">' + escapeHtml(item.name) + '</span>'
        + typeMarkup
        + '</li>';
    }).join('')
    + '</ul>';
}

function openDetailDialog(detailId) {
  if (!detailsDialog || typeof detailsDialog.showModal !== 'function') {
    return;
  }

  const section = detailSections[detailId];
  if (!section || !Array.isArray(section.items) || section.items.length === 0) {
    return;
  }

  renderDetailItems(section);
  detailsDialog.showModal();
}

for (const button of detailButtons) {
  button.addEventListener('click', () => {
    const detailId = button.getAttribute('data-detail-id');
    if (!detailId || button.disabled) {
      return;
    }

    openDetailDialog(detailId);
  });
}

if (detailsDialogClose && detailsDialog) {
  detailsDialogClose.addEventListener('click', () => {
    detailsDialog.close();
  });

  detailsDialog.addEventListener('click', (event) => {
    if (event.target === detailsDialog) {
      detailsDialog.close();
    }
  });
}