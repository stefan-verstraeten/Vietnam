// Daily exchange rates against the euro, from the free currency-api (ECB and
// other sources, published once a day) on jsDelivr, with its mirror as fallback.
// Each expense is converted at the rate of its own day. A day's rates are kept on
// the phone once published; for today or a future day the latest rates stand in
// until that day's are out.

const urls = (day) => [
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${day}/v1/currencies/eur.json`,
  `https://${day}.currency-api.pages.dev/v1/currencies/eur.json`,
];

async function fetchRates(day) {
  for (const url of urls(day)) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const d = await res.json();
      if (d?.eur) return { date: d.date, eur: d.eur };
    } catch { /* try the next source */ }
  }
  return null;
}

export function createRates(store, onChange) {
  const days = store.get('rates', {});
  const provisional = {};
  const loading = new Set();
  const failed = {};

  async function load(day) {
    if (days[day] || loading.has(day) || !navigator.onLine || Date.now() - (failed[day] || 0) < 60000) return;
    loading.add(day);
    try {
      const r = (await fetchRates(day)) || (await fetchRates('latest'));
      if (!r) { failed[day] = Date.now(); return; }
      const entry = { date: r.date, usd: r.eur.usd, vnd: r.eur.vnd };
      if (r.date === day) { days[day] = entry; store.set('rates', days); } else provisional[day] = entry;
      onChange();
    } finally {
      loading.delete(day);
    }
  }

  // The rate for a day: units of the currency per euro, or null while unknown.
  function get(day) {
    const r = days[day] || provisional[day];
    if (!r) load(day);
    return r || null;
  }

  function toEur(amount, currency, day) {
    if (currency === 'EUR') return amount;
    const per = get(day)?.[currency.toLowerCase()];
    return per ? amount / per : null;
  }

  return { get, toEur };
}
