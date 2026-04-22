/**
 * @fileoverview SVG chart drawing utilities
 */

/**
 * Format currency for charts
 * @param {number} n
 * @returns {string}
 */
export function formatCurrency(n) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0
  }).format(n);
}

/**
 * Format compact number
 * @param {number} n
 * @returns {string}
 */
export function formatCompact(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

export function formatPct(n) {
  return n.toFixed(1) + '%';
}

/**
 * Draw cashflow bar chart
 * @param {HTMLElement} container
 * @param {Array} data - Array of {label, cr, dr, net}
 */
export function drawCashflowChart(container, data) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">No data available</div></div>';
    return;
  }

  const maxValue = Math.max(...data.map(d => Math.max(d.cr, d.dr)), 100);
  const width = container.clientWidth || 600;
  const height = 280;
  const barWidth = 28;
  const gap = 12;
  const startX = 40;
  const chartHeight = height - 50;

  let svg = `<svg viewBox="0 0 ${width} ${height}" class="chart-svg">`;

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = 20 + (chartHeight / 4) * i;
    const value = maxValue - (maxValue / 4) * i;
    svg += `<line x1="35" y1="${y}" x2="${width - 10}" y2="${y}" class="chart-grid-line"/>`;
    svg += `<text x="30" y="${y + 4}" class="chart-axis-label" text-anchor="end">${formatCompact(value)}</text>`;
  }

  data.forEach((d, i) => {
    const x = startX + i * (barWidth * 2 + gap);
    const crHeight = (d.cr / maxValue) * chartHeight;
    const drHeight = (d.dr / maxValue) * chartHeight;

    svg += `
      <rect x="${x}" y="${20 + chartHeight - crHeight}" width="${barWidth}" height="${crHeight}" fill="#10B981" opacity="0.9" rx="3">
        <animate attributeName="height" from="0" to="${crHeight}" dur="0.5s" fill="freeze" begin="${i * 0.1}s"/>
        <animate attributeName="y" from="${20 + chartHeight}" to="${20 + chartHeight - crHeight}" dur="0.5s" fill="freeze" begin="${i * 0.1}s"/>
      </rect>
      <rect x="${x + barWidth + 4}" y="${20 + chartHeight - drHeight}" width="${barWidth}" height="${drHeight}" fill="#FF6B6B" opacity="0.9" rx="3">
        <animate attributeName="height" from="0" to="${drHeight}" dur="0.5s" fill="freeze" begin="${i * 0.1}s"/>
        <animate attributeName="y" from="${20 + chartHeight}" to="${20 + chartHeight - drHeight}" dur="0.5s" fill="freeze" begin="${i * 0.1}s"/>
      </rect>
      <text x="${x + barWidth + 2}" y="${height - 10}" fill="#888" font-size="11" text-anchor="middle">${d.label}</text>
    `;
  });

  svg += `</svg>`;
  container.innerHTML = svg;
}

/**
 * Draw donut chart
 * @param {HTMLElement} container
 * @param {HTMLElement} legendContainer
 * @param {Array} data - Array of {category, amount}
 * @param {number} [total]
 */
export function drawDonutChart(container, legendContainer, data, total) {
  if (!data || data.length === 0 || total === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🥧</div><div class="empty-text">No spending data</div></div>';
    legendContainer.innerHTML = '';
    return;
  }

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const size = 180;

  let svg = `<svg viewBox="0 0 ${size} ${size}">`;
  let currentAngle = -90;
  let legendHTML = '';

  data.forEach(d => {
    const pct = (d.amount / total) * 100;
    const dashLength = circumference * (pct / 100);

    const angle = pct * 3.6;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;

    const x1 = 90 + radius * Math.cos(startAngle * Math.PI / 180);
    const y1 = 90 + radius * Math.sin(startAngle * Math.PI / 180);
    const x2 = 90 + radius * Math.cos(endAngle * Math.PI / 180);
    const y2 = 90 + radius * Math.sin(endAngle * Math.PI / 180);

    const largeArc = angle > 180 ? 1 : 0;

    svg += `<path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}" fill="none" stroke="${d.category.color}" stroke-width="20">
      <animate attributeName="stroke-dasharray" from="0 ${circumference}" to="${dashLength} ${circumference - dashLength}" dur="0.8s" fill="freeze"/>
    </path>`;

    legendHTML += `
      <div class="legend-item">
        <div class="legend-color" style="background: ${d.category.color}"></div>
        <span class="legend-label">${d.category.emoji} ${d.category.label}</span>
        <span class="legend-value">${formatCurrency(d.amount)}</span>
        <span class="legend-pct">${pct.toFixed(1)}%</span>
      </div>
    `;

    currentAngle = endAngle;
  });

  svg += `
    <circle cx="90" cy="90" r="35" fill="#1A1A1A"/>
    <text x="90" y="95" fill="#F0F0F0" font-size="14" text-anchor="middle" font-family="var(--font-mono)" font-weight="600">${formatCompact(total)}</text>
  </svg>`;

  container.innerHTML = svg;
  legendContainer.innerHTML = legendHTML;
}

/**
 * Draw line chart
 * @param {HTMLElement} container
 * @param {Array} values
 * @param {Array} labels
 * @param {string} [color='#F4B942']
 */
export function drawLineChart(container, values, labels, color = '#F4B942') {
  if (!values || values.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div><div class="empty-text">No data</div></div>';
    return;
  }

  const width = container.clientWidth || 350;
  const height = 180;
  const padding = 30;

  const max = Math.max(...values);
  const min = Math.min(...values, 0);

  let pathD = '';
  const stepX = (width - padding * 2) / (values.length - 1);

  values.forEach((v, i) => {
    const x = padding + i * stepX;
    const y = height - padding - ((v - min) / (max - min || 1)) * (height - padding * 2);
    pathD += i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
  });

  let svg = `<svg viewBox="0 0 ${width} ${height}">`;

  // Area fill
  const areaPath = pathD + ` L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;
  svg += `<path d="${areaPath}" fill="${color}" opacity="0.1"/>`;

  // Line
  svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2">
    <animate attributeName="stroke-dasharray" from="0 1000" to="1000 0" dur="1s" fill="freeze"/>
  </path>`;

  // Points and labels
  values.forEach((v, i) => {
    const x = padding + i * stepX;
    const y = height - padding - ((v - min) / (max - min || 1)) * (height - padding * 2);

    svg += `<circle cx="${x}" cy="${y}" r="4" fill="${color}">
      <animate attributeName="r" from="0" to="4" dur="0.3s" begin="${i * 0.15}s" fill="freeze"/>
    </circle>`;
    svg += `<text x="${x}" y="${height - 5}" fill="#888" font-size="10" text-anchor="middle">${labels[i] || ''}</text>`;
  });

  svg += '</svg>';
  container.innerHTML = svg;
}

/**
 * Draw horizontal bar chart
 * @param {HTMLElement} container
 * @param {Array} data - Array of {label, amount, color}
 * @param {number} [maxValue]
 */
export function drawBarChart(container, data, maxValue) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">No data</div></div>';
    return;
  }

  const width = container.clientWidth || 400;
  const height = data.length * 35 + 20;
  const barMaxWidth = 280;
  const max = maxValue || Math.max(...data.map(d => d.amount));

  let svg = `<svg viewBox="0 0 ${width} ${height}">`;

  data.forEach((d, i) => {
    const y = 20 + i * 35;
    const barWidth = (d.amount / max) * barMaxWidth;

    svg += `
      <text x="10" y="${y + 14}" fill="#F0F0F0" font-size="12">${d.emoji || ''} ${d.label}</text>
      <rect x="120" y="${y}" width="0" height="22" fill="${d.color}" rx="4">
        <animate attributeName="width" from="0" to="${barWidth}" dur="0.5s" begin="${i * 0.1}s" fill="freeze"/>
      </rect>
      <text x="${width - 10}" y="${y + 14}" fill="#888" font-size="11" text-anchor="end" font-family="var(--font-mono)">${formatCurrency(d.amount)}</text>
    `;
  });

  svg += '</svg>';
  container.innerHTML = svg;
}

/**
 * Draw sparkline
 * @param {HTMLElement} container
 * @param {Array} data - Array of {date, balance}
 * @param {string} [color='#10B981']
 */
export function drawSparkline(container, data, color = '#10B981') {
  if (!data || data.length === 0) {
    container.innerHTML = '';
    return;
  }

  const width = 100;
  const height = 40;
  const max = Math.max(...data.map(d => d.balance));
  const min = Math.min(...data.map(d => d.balance));
  const range = max - min || 1;

  let points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d.balance - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="sparkline-svg">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>
    </svg>
  `;
}

/**
 * Draw spending heatmap
 * @param {HTMLElement} container
 * @param {Array} data - Array of {date, total}
 */
export function drawHeatmap(container, data) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🗓️</div><div class="empty-text">No data</div></div>';
    return;
  }

  const max = Math.max(...data.map(d => d.total));
  let html = '<div class="heatmap-grid">';

  data.forEach(d => {
    let level = 0;
    if (d.total > 0 && max > 0) {
      const ratio = d.total / max;
      if (ratio > 0.75) level = 4;
      else if (ratio > 0.5) level = 3;
      else if (ratio > 0.25) level = 2;
      else level = 1;
    }

    html += `<div class="heatmap-cell level-${level}" title="${d.date}: ${formatCurrency(d.total)}"></div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}