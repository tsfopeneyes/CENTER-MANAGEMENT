import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Check, Edit2, Trash2, X } from 'lucide-react';
import { COLOR_THEMES, getColorTheme } from '../../../../utils/calendarColors';
import useModalClose from '../../../../hooks/useModalClose';

const CategorySettingsModal = ({
    setShowCategoryModal, dynamicCategories, programCategories,
    categoryForm, setCategoryForm, editCategory, setEditCategory,
    handleSaveCategory, handleDeleteCategory, categorySaving, categoryMessage, setCategoryMessage, fetchAllData,
}) => {
    useModalClose(true, () => {
        if (!categorySaving) setShowCategoryModal(false);
    });
    const formRef = useRef(null);
    const theme = getColorTheme(categoryForm.color_theme);
    const reset = () => { setEditCategory(null); setCategoryForm({ name: '', color_theme: 'blue' }); setCategoryMessage(''); };
    const startEdit = (category) => {
        setEditCategory(category);
        setCategoryForm({ name: category.name, color_theme: category.color_theme });
        setCategoryMessage('');
        formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    const row = (category) => <div key={category.id} className="flex items-center justify-between gap-2 p-3 sm:p-4 bg-white border border-gray-100 rounded-2xl">
        <div className="flex min-w-0 items-center gap-3">
            <span className={`w-3 h-3 shrink-0 rounded-full ${getColorTheme(category.color_theme).dot}`} />
            <span className="font-bold text-sm text-gray-800">{category.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
            <button type="button" disabled={categorySaving} aria-label={`${category.name} 수정`} onClick={() => startEdit(category)} className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={17} /></button>
            {!category.is_system && <button type="button" disabled={categorySaving} aria-label={`${category.name} 삭제`} onClick={() => handleDeleteCategory(category.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={17} /></button>}
        </div>
    </div>;
    return <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !categorySaving && setShowCategoryModal(false)} className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" />
        <motion.div role="dialog" aria-modal="true" aria-labelledby="calendar-colors-title" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="relative z-10 bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 sm:p-7 pb-4 flex justify-between items-start gap-2">
                <div><h3 id="calendar-colors-title" className="text-xl font-bold text-gray-900">필터 및 카테고리 관리</h3><p className="mt-2 text-xs leading-relaxed text-gray-500">프로그램과 일정의 색상을 선택하세요.<br />관리자·학생 캘린더에 함께 적용됩니다.</p></div>
                <button type="button" aria-label="색상 설정 닫기" disabled={categorySaving} onClick={() => setShowCategoryModal(false)} className="p-2 text-gray-500 rounded-xl hover:bg-gray-50"><X size={22} /></button>
            </div>
            <div className="px-5 sm:px-7 flex-1 overflow-y-auto pb-6">
                <div className="space-y-2 mb-5"><h4 className="text-xs font-bold text-gray-500 mb-3">기본 프로그램</h4>{programCategories.map(row)}</div>
                <div className="space-y-2 mb-5"><h4 className="text-xs font-bold text-gray-500 mb-3">일정 카테고리</h4>{dynamicCategories.map(row)}</div>
                <form ref={formRef} onSubmit={handleSaveCategory} className="mb-6 p-4 sm:p-5 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                    <h4 className="text-sm font-bold text-gray-800">{editCategory ? `${editCategory.name} 수정` : '새 카테고리 추가'}</h4>
                    <fieldset disabled={categorySaving} className="min-w-0 space-y-4">
                        <label className="block text-xs font-semibold text-gray-600">카테고리 이름
                            <input type="text" value={categoryForm.name} readOnly={Boolean(editCategory?.is_program || editCategory?.is_system)} onChange={event => setCategoryForm(previous => ({ ...previous, name: event.target.value }))} placeholder="예: 외부 미팅" className="block w-full mt-2 p-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500 read-only:bg-gray-100" required maxLength={80} />
                        </label>
                        {(editCategory?.is_program || editCategory?.is_system) && <p className="text-xs text-gray-500">기본 항목은 이름을 유지하고 색상만 변경합니다.</p>}
                        <div role="group" aria-label="일정 색상" className="grid grid-cols-5 gap-2">
                            {Object.entries(COLOR_THEMES).map(([key, option]) => <button key={key} type="button" aria-label={`${option.label} 색상`} aria-pressed={categoryForm.color_theme === key} onClick={() => setCategoryForm(previous => ({ ...previous, color_theme: key }))} className={`flex flex-col items-center gap-1.5 rounded-xl py-2 border transition-colors ${categoryForm.color_theme === key ? 'border-blue-500 bg-white ring-1 ring-blue-500' : 'border-transparent hover:bg-white'}`}>
                                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${option.dot}`}>{categoryForm.color_theme === key && <Check size={17} className="text-white drop-shadow" strokeWidth={3} />}</span>
                                <span className="text-[10px] font-semibold text-gray-600">{option.label}</span>
                            </button>)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500"><span>미리보기</span><span className={`rounded-md border px-3 py-1.5 font-bold ${theme.color}`}>{categoryForm.name || '일정 이름'}</span></div>
                        <div className="flex gap-2">
                            <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">{categorySaving ? '저장 중…' : editCategory ? '수정 완료' : '추가하기'}</button>
                            {editCategory && <button type="button" onClick={reset} className="px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold text-xs">취소</button>}
                        </div>
                    </fieldset>
                    {categoryMessage && <p role="status" className="text-xs leading-relaxed text-gray-700">{categoryMessage}</p>}
                </form>
                <button type="button" disabled={categorySaving} onClick={() => { reset(); fetchAllData(); }} className="mt-5 text-xs font-semibold text-gray-500 underline underline-offset-4">목록 새로 불러오기</button>
            </div>
        </motion.div>
    </div>;
};
export default CategorySettingsModal;
