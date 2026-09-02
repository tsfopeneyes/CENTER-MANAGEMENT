// A stable order must be supplied by the caller. Older calendar entries must
// not disappear at the server's per-request row limit.
export async function fetchAllPages(queryFactory, pageSize = 500) {
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await queryFactory().range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) return rows;
    }
}
