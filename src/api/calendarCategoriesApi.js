import { COLOR_THEMES, isProgramCalendarCategory } from '../utils/calendarColors.js';

// Use the existing categories table; no schema migration or program edits.
export async function saveCalendarCategory(client, form, editing) {
    const name = editing?.is_program || editing?.is_system ? editing.name : form.name.trim();
    if (!name) throw new Error('카테고리 이름을 입력해주세요.');
    if (!Object.hasOwn(COLOR_THEMES, form.color_theme)) throw new Error('색상을 선택해주세요.');
    if (!editing?.is_program && isProgramCalendarCategory({ name })) {
        throw new Error('프로그램 색상은 아래 기본 프로그램 항목에서 수정해주세요.');
    }
    const id = editing?.is_program ? editing.storageId : editing?.id;
    const payload = { name, color_theme: form.color_theme };
    let response;
    if (id) {
        // Preserve system flags and reject concurrent color edits.
        response = await client.from('calendar_categories').update(payload)
            .eq('id', id).eq('color_theme', editing.color_theme).select();
    } else {
        response = await client.from('calendar_categories').insert([
            editing?.is_program ? { ...payload, is_system: true } : payload,
        ]).select();
    }
    if (response.error) {
        if (response.error.code === '23505') throw new Error('같은 이름의 카테고리가 이미 있습니다. 목록을 새로 불러온 뒤 다시 수정해주세요.');
        throw response.error;
    }
    if (!response.data?.length) throw new Error('저장되지 않았습니다. 다른 관리자의 변경 또는 저장 권한을 확인하고 다시 불러와주세요.');
    return response.data[0];
}
