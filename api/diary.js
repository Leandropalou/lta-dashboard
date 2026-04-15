const SHEET_ID = '1C4_-bFHyIfkuulqc5HeoqIDbkaAM_S0ZLdXOomE4Y2c';
const GID = '1183214874';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

// Month order in the spreadsheet (April 2026 → March 2027)
const MONTH_ORDER = [
  { name: 'April', year: 2026 }, { name: 'May', year: 2026 }, { name: 'June', year: 2026 },
  { name: 'July', year: 2026 }, { name: 'August', year: 2026 }, { name: 'September', year: 2026 },
  { name: 'October', year: 2026 }, { name: 'November', year: 2026 }, { name: 'December', year: 2026 },
  { name: 'January', year: 2027 }, { name: 'February', year: 2027 }, { name: 'March', year: 2027 },
];

const MONTH_NUM = { January:0, February:1, March:2, April:3, May:4, June:5, July:6, August:7, September:8, October:9, November:10, December:11 };

function parseCSV(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      rows.push(current); current = '';
    } else if (ch === '\n' && !inQuotes) {
      rows.push(current); current = '';
      if (!rows._lines) rows._lines = [];
      rows._lines.push(rows.splice(0));
    } else {
      current += ch;
    }
  }
  if (current) rows.push(current);
  if (rows.length) { if (!rows._lines) rows._lines = []; rows._lines.push(rows.splice(0)); }
  return rows._lines || [];
}

export default async function handler(req, res) {
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error('Failed to fetch spreadsheet');
    const csv = await response.text();
    const lines = parseCSV(csv);

    let currentMonth = null;
    let currentYear = null;
    let monthIdx = -1;
    const entries = [];
    let lastDay = null;

    for (const cols of lines) {
      const col0 = (cols[0] || '').trim();
      const col1 = (cols[1] || '').trim();

      // Detect month header rows
      const monthMatch = MONTH_ORDER.find(m => col1.replace(/\s/g, '') === m.name);
      if (monthMatch && !col0) {
        currentMonth = monthMatch.name;
        currentYear = monthMatch.year;
        monthIdx++;
        continue;
      }

      if (!currentMonth) continue;

      const dayNum = parseInt(col0, 10);
      const dayName = col1.replace(/\s+/g, ' ').trim();
      const lta = (cols[2] || '').trim();
      const privateMaria = (cols[3] || '').trim();
      const mariaFee = (cols[4] || '').trim();
      const privateLolo = (cols[5] || '').trim();
      const loloFee = (cols[6] || '').trim();
      const other = (cols[7] || '').trim();
      const bloch = (cols[8] || '').trim();
      const other2 = (cols[9] || '').trim();
      const therapy = (cols[10] || '').trim();

      const hasContent = lta || privateMaria || privateLolo || other || bloch || other2 || therapy;
      if (!dayNum && !hasContent) continue;

      if (dayNum && dayName) {
        const monthNum = MONTH_NUM[currentMonth];
        const dateStr = currentYear + '-' + String(monthNum + 1).padStart(2, '0') + '-' + String(dayNum).padStart(2, '0');
        lastDay = {
          date: dateStr,
          day: dayNum,
          dayName: dayName,
          month: currentMonth,
          year: currentYear,
          events: []
        };
        entries.push(lastDay);
      }

      if (!lastDay) continue;

      const ev = {};
      if (lta) ev.lta = lta;
      if (privateMaria) ev.privateMaria = privateMaria;
      if (mariaFee) ev.mariaFee = mariaFee;
      if (privateLolo) ev.privateLolo = privateLolo;
      if (loloFee) ev.loloFee = loloFee;
      if (other) ev.other = other;
      if (bloch) ev.bloch = bloch;
      if (other2) ev.other2 = other2;
      if (therapy) ev.therapy = therapy;
      if (Object.keys(ev).length) lastDay.events.push(ev);
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.status(200).json({ entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
