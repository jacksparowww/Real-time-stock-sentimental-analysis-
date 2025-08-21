
const searchForm = document.getElementById('searchForm');
const tickerInput = document.getElementById('tickerInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const loading = document.getElementById('loading');
const results = document.getElementById('results');
const signalIndicator = document.getElementById('signalIndicator');
const signalDescription = document.getElementById('signalDescription');
const confidenceFill = document.getElementById('confidenceFill');
const newsContainer = document.getElementById('newsContainer');

let chart;
function renderChart(points) {
  const ctx = document.getElementById('sentimentChart');
  if (!ctx) return;

  const labels = points.map(p => new Date(p.t));
  const values = points.map(p => p.value);

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.update();
    return;
  }

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Rolling Avg Sentiment (compound)',
        data: values,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min: -1, max: 1, title: { display: true, text: 'Sentiment' } },
        x: { ticks: { callback: (v, i) => labels[i]?.toLocaleString?.() ?? '' } }
      },
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.raw?.toFixed?.(3)}`
          }
        }
      }
    }
  });
}

function fmtTime(iso) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

function updateSignal(label, confidence) {
  const isBuy = label === 'buy';
  const isSell = label === 'sell';

  signalIndicator.textContent = isBuy ? 'BUY' : (isSell ? 'SELL' : 'NEUTRAL');
  signalIndicator.className = `signal-indicator ${isBuy ? 'signal-buy' : (isSell ? 'signal-sell' : '')}`;

  const desc = isBuy
    ? `Positive news skew — BUY (${confidence}% confidence)`
    : (isSell
        ? `Negative news skew — SELL (${confidence}% confidence)`
        : `Mixed news — NEUTRAL (${confidence}% confidence)`);

  signalDescription.textContent = desc;

  confidenceFill.className = `confidence-fill ${isBuy ? 'confidence-buy' : (isSell ? 'confidence-sell' : '')}`;
  setTimeout(() => (confidenceFill.style.width = `${confidence}%`), 50);
}

function updateNews(articles) {
  if (!articles || articles.length === 0) {
    newsContainer.innerHTML = `<p style="color:#a0aec0;text-align:center;padding:20px;">No news found for this ticker.</p>`;
    return;
  }

  const topArticles = articles.slice(0, 5);

  newsContainer.innerHTML = topArticles.map(a => `
    <a class="news-item news-${a.sentimentLabel}" href="${a.url}" target="_blank" rel="noopener">
      <div class="news-headline">${a.title || 'Untitled'}</div>
      <div class="news-meta">
        <span>${a.source || 'Unknown source'} • ${fmtTime(a.publishedAt)}</span>
        <span class="sentiment-badge sentiment-${a.sentimentLabel}">
          ${a.sentimentLabel.toUpperCase()}
        </span>
      </div>
    </a>
  `).join('');
}


async function fetchSentiment(ticker) {
  const base = "http://localhost:5000";
  const url = `${base}/api/sentiment?ticker=${encodeURIComponent(ticker)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Backend error ${resp.status}`);
  return resp.json();
}

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const ticker = tickerInput.value.trim().toUpperCase();
  if (!ticker) return;

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing...';
  loading.style.display = 'block';
  results.style.display = 'none';

  try {
    const data = await fetchSentiment(ticker);
    updateSignal(data.summary.label, data.summary.confidence);
    updateNews(data.articles);
    renderChart(data.timeseries);

    loading.style.display = 'none';
    results.style.display = 'block';
  } catch (err) {
    console.error(err);
    loading.style.display = 'none';
    results.style.display = 'block';
    updateSignal('neutral', 0);
    newsContainer.innerHTML = `<p style="color:#f56565;text-align:center;padding:20px;">${err?.message || 'Failed to fetch sentiment'}</p>`;
    renderChart([]);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyze Sentiment';
  }
});

window.addEventListener('load', () => tickerInput.focus());
tickerInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') searchForm.dispatchEvent(new Event('submit'));
});
