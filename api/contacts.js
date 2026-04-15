// Vercel Serverless Function: /api/contacts
// Resolves contact IDs to names, emails, phones via Wix Contacts API
// POST body: { contactIds: ["id1", "id2", ...] }

const SITE_ID = process.env.WIX_SITE_ID;
const API_KEY = process.env.WIX_API_KEY;

async function getContact(contactId) {
  const res = await fetch(`https://www.wixapis.com/contacts/v4/contacts/${contactId}`, {
    headers: {
      'Authorization': API_KEY,
      'wix-site-id': SITE_ID,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    return { id: contactId, name: 'Unknown', email: null, phone: null };
  }

  const data = await res.json();
  const c = data.contact || {};
  const name = c.info?.name
    ? `${c.info.name.first || ''} ${c.info.name.last || ''}`.trim()
    : c.info?.company || 'Unknown';
  const email = c.info?.emails?.[0]?.email || null;
  const phone = c.info?.phones?.[0]?.phone || null;

  return { id: contactId, name, email, phone };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const { contactIds } = req.body || {};

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: 'contactIds array required' });
    }

    // Cap at 50 to avoid timeouts
    const ids = contactIds.slice(0, 50);

    // Fetch contacts in parallel (batches of 10 to avoid rate limits)
    const contacts = {};
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      const results = await Promise.all(batch.map(id => getContact(id)));
      results.forEach(c => { contacts[c.id] = c; });
    }

    res.status(200).json({ contacts });
  } catch (err) {
    console.error('Contacts API error:', err);
    res.status(500).json({ error: err.message });
  }
}
