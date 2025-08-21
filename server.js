
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import vader from "vader-sentiment";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const NEWSAPI_KEY = process.env.NEWSAPI_KEY;

// Simple ticker -> company name helper (extend as needed)
const TICKER_MAP = {
  "AAPL": "Apple",
  "TSLA": "Tesla",
  "MSFT": "Microsoft",
  "GOOGL": "Alphabet",
  "GOOG": "Alphabet",
  "AMZN": "Amazon",
  "META": "Meta Platforms",
  "NFLX": "Netflix",
  "NVDA": "NVIDIA",
  "AMD": "Advanced Micro Devices",
  "TCS": "Tata Consultancy Services",
  "INFY": "Infosys",
  "RELIANCE": "Reliance Industries",
  "HDFCBANK": "HDFC Bank",
  "ICICIBANK": "ICICI Bank"
};

function labelFromScore(compound) {
  if (compound >= 0.05) return "positive";
  if (compound <= -0.05) return "negative";
  return "neutral";
}

function signalFromAggregate(avgCompound, posCount, negCount) {
  // Primary threshold on average compound
  if (avgCompound >= 0.05 && posCount >= negCount) return "buy";
  if (avgCompound <= -0.05 && negCount >= posCount) return "sell";
  // If near-neutral, tie-breaker on counts
  if (posCount > negCount) return "buy";
  if (negCount > posCount) return "sell";
  return "neutral";
}

function toConfidence(avgCompound, posPct, negPct) {
  // Map both magnitude of avgCompound and skew of distribution to 0..100
  const mag = Math.min(Math.abs(avgCompound), 1); // cap at 1
  const skew = Math.abs(posPct - negPct); // 0..1
  const raw = (0.7 * mag + 0.3 * skew) * 100;
  return Math.round(raw);
}

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.get("/api/sentiment", async (req, res) => {
  try {
    let { ticker } = req.query;
    if (!ticker) return res.status(400).json({ error: "ticker query param is required" });
    ticker = String(ticker).toUpperCase();
    const company = TICKER_MAP[ticker] || ticker;

    if (!NEWSAPI_KEY) {
      return res.status(500).json({ error: "Missing NEWSAPI_KEY in server environment." });
    }

    const params = new URLSearchParams({
      q: `"${company}" OR ${ticker}`,
      sortBy: "publishedAt",
      pageSize: "30",
      language: "en"
    });
    const url = `https://newsapi.org/v2/everything?${params.toString()}`;
    const resp = await fetch(url, {
      headers: { "X-Api-Key": NEWSAPI_KEY }
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: "NewsAPI error", detail: text });
    }

    const data = await resp.json();
    const articles = (data.articles || []).map(a => {
      const text = [a.title || "", a.description || ""].join(". ");
      const scores = vader.SentimentIntensityAnalyzer.polarity_scores(text);
      const label = labelFromScore(scores.compound);
      return {
        title: a.title,
        url: a.url,
        source: a.source?.name,
        publishedAt: a.publishedAt,
        description: a.description,
        sentimentScore: scores.compound,
        sentimentLabel: label
      };
    });

    if (articles.length === 0) {
      return res.json({
        ticker,
        company,
        summary: { label: "neutral", confidence: 0, avgCompound: 0 },
        breakdown: { positive: 0, neutral: 0, negative: 0 },
        timeseries: [],
        articles: []
      });
    }

    const pos = articles.filter(a => a.sentimentLabel === "positive").length;
    const neg = articles.filter(a => a.sentimentLabel === "negative").length;
    const neu = articles.length - pos - neg;

    const avgCompound = articles.reduce((s, a) => s + a.sentimentScore, 0) / articles.length;
    const signal = signalFromAggregate(avgCompound, pos, neg);

    const posPct = pos / articles.length;
    const negPct = neg / articles.length;
    const confidence = toConfidence(avgCompound, posPct, negPct);

    // Build a tiny time-series: cumulative rolling average by publish time
    const sorted = [...articles].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
    let cum = 0;
    const ts = sorted.map((a, i) => {
      cum += a.sentimentScore;
      return {
        t: a.publishedAt,
        value: cum / (i + 1)
      };
    });

    res.json({
      ticker,
      company,
      summary: { label: signal, confidence, avgCompound },
      breakdown: { positive: pos, neutral: neu, negative: neg },
      timeseries: ts,
      articles
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", detail: err?.message || String(err) });
  }
});

    

app.listen(PORT, () => {
  console.log(`BDA003 sentiment server listening on http://localhost:${PORT}`);
});
