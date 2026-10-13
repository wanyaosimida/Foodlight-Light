const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
const numberOrNull = value => {
  const validType = typeof value === 'number' || (typeof value === 'string' && /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()));
  return validType && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
};

function inputError(status, message) {
  return Object.assign(new Error(message), { status });
}

function matchScore(name, full, terms) {
  const candidate = normalize(name);
  if (!candidate) return 0;
  if (candidate === full) return 3;
  if (candidate.includes(full) || (candidate.length >= 2 && full.includes(candidate))) return 2;
  return terms.some(term => term.length >= 2 && (candidate.includes(term) || term.includes(candidate))) ? 1 : 0;
}

/** Search the caller's actual local records, preserving portions and unverified estimates. */
export function searchLocalNutrition(db, query, userId) {
  if (typeof userId !== 'string' || !userId.trim()) throw inputError(401, '请先登录后检索自己的营养记录');
  if (typeof query !== 'string' || !query.trim() || query.length > 200) throw inputError(400, '请输入1至200字的食物名称');
  const full = normalize(query);
  if (!full) throw inputError(400, '请输入有效的食物名称');
  const terms = query.split(/[\s、,，+＋/与和配及]+/u).map(normalize).filter(Boolean);
  const candidates = [];
  const push = row => {
    const score = matchScore(row.title, full, terms);
    if (!score) return;
    // Missing nutrition is missing data, never an invented zero value.
    const nutrition = Object.fromEntries(['calories', 'protein', 'carbs', 'fat'].map(key => [key, numberOrNull(row.nutrition[key])]));
    if (Object.values(nutrition).every(value => value === null)) return;
    candidates.push({ ...row, nutrition, ...nutrition, score, verified: false, is_estimate: true });
  };
  for (const row of db.prepare('SELECT id,food_name,portion,calories,protein,carbs,fat,log_date,created_at FROM meal_logs WHERE owner_id = ? ORDER BY log_date DESC,created_at DESC').all(userId)) {
    push({ id: row.id, title: row.food_name, source: 'meal_logs', source_label: '本地餐食记录',
      record_date: row.log_date, created_at: row.created_at, portion: row.portion,
      basis: row.portion ? `按原记录份量：${row.portion}` : '原记录未注明份量',
      nutrition: { calories: row.calories, protein: row.protein, carbs: row.carbs, fat: row.fat } });
  }
  for (const row of db.prepare('SELECT id,title,nutrition,is_ai_generated,created_at FROM recipes WHERE owner_id = ? ORDER BY created_at DESC').all(userId)) {
    let nutrition;
    try { nutrition = JSON.parse(row.nutrition); } catch { continue; }
    if (!nutrition || typeof nutrition !== 'object' || Array.isArray(nutrition)) continue;
    push({ id: row.id, title: row.title, source: 'recipes', source_label: row.is_ai_generated ? '本地食谱（AI 估计）' : '本地食谱记录',
      record_date: row.created_at?.slice(0, 10) || null, created_at: row.created_at,
      portion: null, basis: '原食谱未注明营养值对应份量', nutrition });
  }
  candidates.sort((a, b) => b.score - a.score || String(b.record_date || b.created_at).localeCompare(String(a.record_date || a.created_at)));
  const seen = new Set();
  const results = candidates.filter(row => {
    const key = JSON.stringify([row.source, normalize(row.title), row.portion, row.nutrition]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8).map(({ score, created_at, ...row }) => ({ ...row, match: score === 3 ? 'exact-name' : 'related-name' }));
  return {
    results,
    source: 'local-records',
    verified: false,
    query: query.trim(),
    note: results.length
      ? '来自当前账号的本地餐食和食谱记录，保留原始份量与估计值；未经过独立营养数据库核验，也未统一换算为每100克。'
      : '本地尚无匹配记录；当前食谱营养值仍为估计值，未完成外部核验。',
  };
}
