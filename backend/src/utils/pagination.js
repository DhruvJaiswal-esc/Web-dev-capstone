const meta = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) || 1 });
module.exports = { meta };
