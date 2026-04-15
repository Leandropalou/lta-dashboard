// Vercel Serverless Function: /api/analytics
// Fetches site analytics from Wix Analytics API
// Returns: sessions, unique visitors, sales, orders, forms submitted

const SITE_ID = process.env.WIX_SITE_ID;
const API_KEY = process.env.WIX_API_KEY;
const BASE = 'https://www.wixapis.com/analytics/v2/site-analytics/data';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Default to last 30 days
    const days = parseInt(req.query.days) || 30;
    const endDate = new Date();
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Cap at 61 days (Wix limit)
    const maxStart = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000);
    if (startDate < maxStart) startDate.setTime(maxStart.getTime());

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const measurementTypes = [
      'TOTAL_SESSIONS',
      'TOTAL_UNIQUE_VISITORS',
      'TOTAL_SALES',
      'TOTAL_ORDERS',
      'TOTAL_FORMS_SUBMITTED',
    ];

    const params = new URLSearchParams();
    params.append('dateRange.startDate', startStr);
    params.append('dateRange.endDate', endStr);
    params.append('timeZone', 'Europe/London');
    measurementTypes.forEach(t => params.append('measurementTypes', t));

    const apiRes = await fetch(`${BASE}?${params}`, {
      headers: {
        'Authorization': API_KEY,
        'wix-site-id': SITE_ID,
        'Content-Type': 'application/json',
      },
    });

    if (!apiRes.ok) {
      const err = await apiRes.text();
      throw new Error(`Wix Analytics API error ${apiRes.status}: ${err}`);
    }

    const raw = await apiRes.json();
    const data = raw.data || [];

    // Organize into a clean response
    const result = {};
    for (const item of data) {
      result[item.type] = {
        total: item.total || 0,
        values: (item.values || []).map(v => ({
          date: v.date,
          value: v.value || 0,
        })),
      };
    }

    res.status(200).json({
      dateRange: { startDate: startStr, endDate: endStr },
      metrics: result,
    });
  } catch (err) {
    console.error('Analytics API error:', err);
    res.status(500).json({ error: err.message });
  }
}

