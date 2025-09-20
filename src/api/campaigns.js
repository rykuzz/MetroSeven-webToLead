// api/campaigns.js
const jsforce = require('jsforce');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Gunakan GET' });

  const { SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD } = process.env;
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });

  try {
    await conn.login(SF_USERNAME, SF_PASSWORD);

    // query params
    const q      = String(req.query.q || '').trim();
    const status = String(req.query.status || 'active').toLowerCase(); // active|upcoming|past|all
    const sort   = String(req.query.sort || 'startDateDesc').toLowerCase(); // startDateDesc|startDateAsc|createdDesc
    const page   = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit  = Math.min(24, Math.max(1, parseInt(req.query.limit || '12', 10)));
    const offset = (page - 1) * limit;

    // detect optional fields
    const desc = await conn.sobject('Campaign').describe();
    const has = (f) => desc.fields.some(x => x.name === f);

    const optional = [
      has('Promo_Image_URL__c')  ? 'Promo_Image_URL__c'  : null,
      has('Price__c')            ? 'Price__c'            : null,
      has('Discount_Percent__c') ? 'Discount_Percent__c' : null,
      has('Category__c')         ? 'Category__c'         : null,
      has('Landing_URL__c')      ? 'Landing_URL__c'      : null,
      has('Web_Priority__c')     ? 'Web_Priority__c'     : null,
      has('Show_On_Web__c')      ? 'Show_On_Web__c'      : null
    ].filter(Boolean);

    const base = [
      'Id','Name','Status','Type','IsActive','StartDate','EndDate','Description','CreatedDate'
    ];
    const fields = base.concat(optional).join(', ');

    const where = [];
    // tampilkan yang “Show_On_Web__c = true” kalau field ada
    if (optional.includes('Show_On_Web__c')) where.push('Show_On_Web__c = true');

    if (status === 'active') {
      where.push('IsActive = true');
      where.push('(EndDate = null OR EndDate >= TODAY)');
    } else if (status === 'upcoming') {
      where.push('(StartDate > TODAY)');
    } else if (status === 'past') {
      where.push('(EndDate < TODAY)');
    }
    if (q && q.length >= 2) {
      const s = q.replace(/'/g, "\\'");
      where.push(`(Name LIKE '%${s}%' OR Description LIKE '%${s}%')`);
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // order by
    let orderBy = 'ORDER BY StartDate DESC NULLS LAST';
    if (sort === 'startdateasc') orderBy = 'ORDER BY StartDate ASC NULLS LAST';
    if (sort === 'createddesc')  orderBy = 'ORDER BY CreatedDate DESC';
    // dorong prioritas web di depan jika ada
    if (optional.includes('Web_Priority__c')) {
      orderBy = `ORDER BY Web_Priority__c DESC NULLS LAST, ${orderBy.replace('ORDER BY ', '')}`;
    }

    // total
    const countRes = await conn.query(`SELECT COUNT() FROM Campaign ${whereClause}`);
    const total = countRes.totalSize || 0;

    // data
    const soql = `
      SELECT ${fields}
      FROM Campaign
      ${whereClause}
      ${orderBy}
      LIMIT ${limit}
      OFFSET ${offset}
    `;
    const dataRes = await conn.query(soql);

    const records = (dataRes.records || []).map(r => ({
      id: r.Id,
      name: r.Name,
      status: r.Status,
      type: r.Type,
      isActive: r.IsActive,
      startDate: r.StartDate,
      endDate: r.EndDate,
      description: r.Description,
      createdDate: r.CreatedDate,
      imageUrl: r.Promo_Image_URL__c || null,
      price: r.Price__c ?? null,
      discountPercent: r.Discount_Percent__c ?? null,
      category: r.Category__c || null,
      landingUrl: r.Landing_URL__c || null,
      priority: r.Web_Priority__c ?? null,
      showOnWeb: r.Show_On_Web__c ?? null
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json({ page, limit, total, hasMore: offset + records.length < total, records });
  } catch (err) {
    console.error('Campaigns API Error:', err);
    return res.status(500).json({ message: 'Gagal mengambil Campaign', error: err.message });
  }
};
