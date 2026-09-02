// Never count the owner-only opt-in table from the browser: that would silently
// return just the administrator's own rows, not the program total.
export const fetchProgramInterestCounts = async (client, noticeIds) => {
    const ids = [...new Set(noticeIds.map(String))];
    const counts = {};
    for (let offset=0; offset<ids.length; offset+=100) {
        const batch = ids.slice(offset,offset+100);
        const {data,error} = await client.from('admin_program_interest_counts')
            .select('notice_id,interest_count').in('notice_id',batch);
        if (error) throw new Error('관심 인원을 불러오지 못했습니다. 관리자 집계 설정과 로그인 권한을 확인해주세요.');
        for (const row of data || []) {
            const count = Number(row.interest_count);
            if (!batch.includes(String(row.notice_id)) || !Number.isSafeInteger(count) || count<0) {
                throw new Error('관심 인원 집계 응답을 확인해주세요.');
            }
            counts[String(row.notice_id)] = count;
        }
        // The view includes zero-count programs. Missing rows therefore mean
        // no permission or stale/deleted programs, never a verified zero.
        if (batch.some(id=>counts[id]===undefined)) throw new Error('관심 인원 조회 권한 또는 프로그램 상태를 확인해주세요.');
    }
    return counts;
};
