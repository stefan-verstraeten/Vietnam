// Gazetteer used by the literary companion: passages are tagged with these ids,
// and "In de buurt" matches the phone's position against these coordinates.

export const PLACES = [
  // Coordinates are approximate (town or site centre), close enough for "In de buurt".
  { id: 'hanoi', name: 'Hanoi', lat: 21.0278, lon: 105.8342, aliases: ['ha noi', 'thang long', 'hoan kiem', 'oude wijk', 'old quarter', '36 straten', 'long bien', 'west lake', 'ho tay', 'van mieu', 'literatuurtempel'] },
  { id: 'pu-luong', name: 'Pù Luông', lat: 20.4454, lon: 105.1493, aliases: ['pu luong', 'hieu', 'ban hieu', 'uoi', 'ban lan', 'zwarte thai', 'thanh hoa'] },
  { id: 'van-long', name: 'Vân Long', lat: 20.3725, lon: 105.8827, aliases: ['van long'] },
  { id: 'trang-an', name: 'Tràng An', lat: 20.255, lon: 105.896, aliases: ['trang an', 'bai dinh'] },
  { id: 'hoa-lu', name: 'Hoa Lư', lat: 20.2861, lon: 105.9048, aliases: ['hoa lu', 'dinh tien hoang', 'dinh-dynastie', 'ky lan', 'phat tich'] },
  { id: 'ninh-binh', name: 'Ninh Bình', lat: 20.2676, lon: 105.9582, aliases: ['ninh binh', 'tam coc', 'thung nang', 'bich dong'] },
  { id: 'ha-long', name: 'Hạ Long', lat: 20.91, lon: 107.1839, aliases: ['ha long', 'halong', 'ha long bay', 'baai van ha long'] },
  { id: 'bai-tu-long', name: 'Bái Tử Long', lat: 20.9258, lon: 107.2548, aliases: ['bai tu long', 'cong do', 'thien canh son'] },
  { id: 'deo-ngang', name: 'Đèo Ngang', lat: 17.966, lon: 106.494, aliases: ['deo ngang', 'ngang-pas', 'hoanh son'] },
  { id: 'dong-hoi', name: 'Đồng Hới', lat: 17.4663, lon: 106.6173, aliases: ['dong hoi', 'quang binh'] },
  { id: 'phong-nha', name: 'Phong Nha', lat: 17.5801, lon: 106.2809, aliases: ['phong nha-ke bang', 'phong nha ke bang', 'son trach', 'xuan son', 'chay lap', 'commander cave', 'ho chi minh-route', 'ho chi minh trail'] },
  { id: 'vinh-moc', name: 'Vịnh Mốc', lat: 17.0617, lon: 107.0367, aliases: ['vinh moc', 'dmz', 'gedemilitariseerde zone', 'cua tung'] },
  { id: 'hien-luong', name: 'Hiền Lương', lat: 16.999, lon: 107.047, aliases: ['hien luong', 'ben hai', '17e breedtegraad'] },
  { id: 'quang-tri', name: 'Quảng Trị', lat: 16.7517, lon: 107.1922, aliases: ['quang tri', 'cua viet'] },
  { id: 'hue', name: 'Huế', lat: 16.4637, lon: 107.5909, aliases: ['hue', 'keizerlijke stad', 'citadel', 'verboden purperen stad', 'parfumrivier', 'perfume river', 'song huong', 'vi da', 'thuan an'] },
  { id: 'thien-mu', name: 'Thiên Mụ', lat: 16.4533, lon: 107.5447, aliases: ['thien mu'] },
  { id: 'keizergraven', name: 'Keizergraven van Huế', lat: 16.41, lon: 107.575, aliases: ['tu duc', 'khai dinh', 'minh mang', 'praalgraven'] },
  { id: 'thanh-toan', name: 'Thanh Toàn', lat: 16.4837, lon: 107.6864, aliases: ['thanh toan'] },
  { id: 'hai-van', name: 'Hải Vân-pas', lat: 16.1925, lon: 108.1306, aliases: ['hai van', 'wolkenpas'] },
  { id: 'da-nang', name: 'Đà Nẵng', lat: 16.06, lon: 108.2111, aliases: ['da nang', 'danang', 'tourane'] },
  { id: 'hoi-an', name: 'Hội An', lat: 15.8801, lon: 108.338, aliases: ['hoi an', 'faifo', 'japanse brug', 'chua cau', 'cua dai', 'thu bon'] },
  { id: 'my-son', name: 'Mỹ Sơn', lat: 15.7688, lon: 108.1193, aliases: ['my son', 'champa', 'cham'] },
  { id: 'cu-lao-cham', name: 'Cù Lao Chàm', lat: 15.959, lon: 108.5073, aliases: ['cu lao cham', 'cham eiland', 'cham island', 'bai chong'] },
];

const byId = new Map(PLACES.map((p) => [p.id, p]));
export const placeById = (id) => byId.get(id);

export const fold = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").trim();

export function findPlaces(query) {
  const q = fold(query);
  if (!q) return [];
  return PLACES.filter((p) => [p.name, p.id, ...(p.aliases || [])].some((n) => {
    const f = fold(n);
    // Short queries must match a whole word ("pho" is not "Phong Nha"); longer ones may be part of a name.
    return f === q || f.split(/[\s-]+/).includes(q) || (q.length > 3 && (f.includes(q) || q.includes(f)));
  }));
}

function km(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function nearestPlaces(lat, lon, count = 4) {
  return PLACES.map((p) => ({ ...p, km: km(lat, lon, p.lat, p.lon) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}
