const Record = require('../models/Record');
const HttpError = require('../utils/HttpError');

const SORTS = ['createdAt', '-createdAt', 'title', '-title'];
// _id is a tie-breaker so pages never repeat or skip rows when sort values are equal.
const toSortSpec = (s) => {
  const dir = s.startsWith('-') ? -1 : 1;
  return { [s.replace('-', '')]: dir, _id: dir };
};
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Query params can arrive as arrays/objects (?search[$ne]=x); only accept plain strings.
const optionalString = (value, name) => {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be a string`);
  return value.trim();
};

// [API-05] POST /api/records
async function createRecord(req, res) {
  const { title, description, category, tags } = req.body || {};

  if (typeof title !== 'string' || !title.trim()) throw new HttpError(400, 'Title is required');
  if (description !== undefined && typeof description !== 'string') {
    throw new HttpError(400, 'Description must be a string');
  }
  if (category !== undefined && typeof category !== 'string') {
    throw new HttpError(400, 'Category must be a string');
  }
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string'))) {
    throw new HttpError(400, 'Tags must be an array of strings');
  }

  const record = await Record.create({
    title,
    description,
    category,
    tags: tags ? tags.map((t) => t.trim()).filter(Boolean) : [],
    createdBy: req.user.id,
  });

  res.status(201).json({ record });
}

// [API-06] GET /api/records
// [API-07] ?search=  (title, description, category, tags; case-insensitive, partial match)
// Also: ?category=  ?page=  ?limit=  ?sort=createdAt|-createdAt|title|-title
async function getRecords(req, res) {
  const search = optionalString(req.query.search, 'search');
  const category = optionalString(req.query.category, 'category');
  const sort = optionalString(req.query.sort, 'sort') || '-createdAt';
  if (!SORTS.includes(sort)) throw new HttpError(400, `sort must be one of: ${SORTS.join(', ')}`);
  if (search && search.length > 100) throw new HttpError(400, 'search is too long (max 100 characters)');

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

  const filter = {};
  // Regular users only see their own records; admins see everything.
  if (req.user.role !== 'admin') filter.createdBy = req.user.id;
  if (category) filter.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: rx }, { description: rx }, { category: rx }, { tags: rx }];
  }

  const [records, total] = await Promise.all([
    Record.find(filter).sort(toSortSpec(sort)).skip((page - 1) * limit).limit(limit).lean(),
    Record.countDocuments(filter),
  ]);

  res.json({
    records,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

module.exports = { createRecord, getRecords };
