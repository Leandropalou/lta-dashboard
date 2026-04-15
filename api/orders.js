// Vercel Serverless Function: /api/orders
// Fetches pricing plan orders from Wix REST API
// Returns: active count, paused list, cancelled count, recent signups

const SITE_ID = process.env.WIX_SITE_ID;
const API_KEY = process.env.WIX_API_KEY;
const BASE = 'https://www.wixapis.com/pricing-plans/v2/orders';

async function fetchOrders(status, limit = 50, offset = 0) {
  const params = new URLSearchParams();
  if (status) params.append('orderStatuses', status);
  params.append('limit', String(limit));
  params.append('offset', String(offset));
  params.append('sort.fieldName', 'createdDate');
  params.append('sort.order', 'DESC');

  const res = await fetch(`${BASE}?${params}`, {
    headers: {
      'Authorization': API_KEY,
      'wix-site-id': SITE_ID,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Wix API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function fetchAllPages(status) {
  let all = [];
  let offset = 0;
  const limit = 50;
  let hasNext = true;

  while (hasNext) {
    const data = await fetchOrders(status, limit, offset);
    all = all.concat(data.orders || []);
    hasNext = data.pagingMetadata?.hasNext || false;
    offset += limit;
    // Safety cap to avoid runaway loops
    if (offset > 2000) break;
  }
  return all;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Fetch active, paused, and recent cancelled in parallel
    const [activeOrders, pausedOrders, cancelledData] = await Promise.all([
      fetchAllPages('ACTIVE'),
      fetchAllPages('PAUSED'),
      fetchOrders('CANCELED', 50, 0),
    ]);

    // Count cancellations in last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCancellations = (cancelledData.orders || []).filter(o => {
      const updated = new Date(o.updatedDate);
      return updated >= weekAgo;
    });

    // Count new actives in last 7 days
    const newThisWeek = activeOrders.filter(o => {
      const created = new Date(o.createdDate);
      return created >= weekAgo;
    });

    // Build paused list with pause details
    const pausedList = pausedOrders.map(o => {
      const pp = o.pausePeriods || [];
      const pauseDate = pp.length > 0 ? pp[pp.length - 1].pauseDate : o.updatedDate;
      const daysPaused = Math.floor((Date.now() - new Date(pauseDate)) / (1000 * 60 * 60 * 24));
      return {
        contactId: o.buyer?.contactId,
        planName: o.planName,
        planPrice: o.planPrice,
        pausedSince: pauseDate,
        subscribedSince: o.startDate,
        daysPaused,
      };
    });

    // Recent signups (newest 10 active orders)
    const recentSignups = activeOrders.slice(0, 10).map(o => ({
      contactId: o.buyer?.contactId,
      planName: o.planName,
      planPrice: o.planPrice,
      createdDate: o.createdDate,
      startDate: o.startDate,
    }));

    // Collect unique contact IDs for name resolution
    const contactIds = [
      ...new Set([
        ...pausedList.map(p => p.contactId),
        ...recentSignups.map(s => s.contactId),
      ].filter(Boolean))
    ];

    // Monthly revenue estimate from active orders
    const monthlyRevenue = activeOrders.reduce((sum, o) => {
      return sum + parseFloat(o.priceDetails?.total || '0');
    }, 0);

    res.status(200).json({
      stats: {
        totalActive: activeOrders.length,
        newThisWeek: newThisWeek.length,
        cancellationsThisWeek: recentCancellations.length,
        pausedTotal: pausedOrders.length,
        netChange: newThisWeek.length - recentCancellations.length,
        monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
        currency: 'GBP',
      },
      recentSignups,
      pausedList,
      contactIds,
    });
  } catch (err) {
    console.error('Orders API error:', err);
    res.status(500).json({ error: err.message });
  }
}
