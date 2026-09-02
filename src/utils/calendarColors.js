// Literal Tailwind classes keep every palette available in production builds.
const palettes = {
    blue: ['파랑', 'bg-blue-100 text-blue-700 border-blue-200', 'bg-blue-500', 'border-blue-500'],
    sky: ['하늘', 'bg-sky-100 text-sky-700 border-sky-200', 'bg-sky-500', 'border-sky-500'],
    cyan: ['청록', 'bg-cyan-100 text-cyan-700 border-cyan-200', 'bg-cyan-500', 'border-cyan-500'],
    teal: ['틸', 'bg-teal-100 text-teal-700 border-teal-200', 'bg-teal-500', 'border-teal-500'],
    emerald: ['에메랄드', 'bg-emerald-100 text-emerald-700 border-emerald-200', 'bg-emerald-500', 'border-emerald-500'],
    green: ['초록', 'bg-green-100 text-green-700 border-green-200', 'bg-green-500', 'border-green-500'],
    lime: ['연두', 'bg-lime-100 text-lime-800 border-lime-200', 'bg-lime-500', 'border-lime-500'],
    yellow: ['노랑', 'bg-yellow-100 text-yellow-800 border-yellow-200', 'bg-yellow-500', 'border-yellow-500'],
    amber: ['호박', 'bg-amber-100 text-amber-800 border-amber-200', 'bg-amber-500', 'border-amber-500'],
    orange: ['주황', 'bg-orange-100 text-orange-700 border-orange-200', 'bg-orange-500', 'border-orange-500'],
    red: ['빨강', 'bg-red-100 text-red-700 border-red-200', 'bg-red-500', 'border-red-500'],
    rose: ['장미', 'bg-rose-100 text-rose-700 border-rose-200', 'bg-rose-500', 'border-rose-500'],
    pink: ['분홍', 'bg-pink-100 text-pink-700 border-pink-200', 'bg-pink-500', 'border-pink-500'],
    fuchsia: ['자홍', 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200', 'bg-fuchsia-500', 'border-fuchsia-500'],
    purple: ['보라', 'bg-purple-100 text-purple-700 border-purple-200', 'bg-purple-500', 'border-purple-500'],
    violet: ['바이올렛', 'bg-violet-100 text-violet-700 border-violet-200', 'bg-violet-500', 'border-violet-500'],
    indigo: ['남색', 'bg-indigo-100 text-indigo-700 border-indigo-200', 'bg-indigo-500', 'border-indigo-500'],
    slate: ['청회색', 'bg-slate-100 text-slate-700 border-slate-200', 'bg-slate-500', 'border-slate-500'],
    gray: ['회색', 'bg-gray-100 text-gray-700 border-gray-200', 'bg-gray-500', 'border-gray-500'],
    black: ['검정', 'bg-gray-100 text-gray-900 border-gray-300', 'bg-gray-900', 'border-gray-900'],
};
export const COLOR_THEMES = Object.fromEntries(Object.entries(palettes).map(([key, [label, color, dot, accent]]) => [key, {
    label, color, dot, accent,
    background: color.split(' ').find(token => token.startsWith('bg-')),
    text: color.split(' ').find(token => token.startsWith('text-')),
}]));
export const getColorTheme = (key) => Object.hasOwn(COLOR_THEMES, key) ? COLOR_THEMES[key] : COLOR_THEMES.gray;

// Virtual program categories use the existing, unique category name for storage.
// Only an explicit save creates a row; loading the calendar never writes data.
export const PROGRAM_CALENDAR_CATEGORIES = [
    { id: 'PROGRAM_CENTER', name: '센터 프로그램', color_theme: 'pink' },
    { id: 'PROGRAM_SCHOOL', name: '스처 프로그램', color_theme: 'purple' },
];
export const isProgramCalendarCategory = (category) => PROGRAM_CALENDAR_CATEGORIES.some(item => item.name === category?.name);
export const getProgramCalendarCategories = (categories = []) => PROGRAM_CALENDAR_CATEGORIES.map(item => {
    const stored = categories.find(category => category.name === item.name);
    return { ...item, color_theme: stored?.color_theme || item.color_theme, storageId: stored?.id || null, is_system: true, is_program: true };
});
export const getProgramCalendarKey = (program) => program?.program_type === 'SCHOOL_CHURCH' ? 'PROGRAM_SCHOOL' : 'PROGRAM_CENTER';
export const getProgramCalendarTheme = (program, categories = []) => {
    const category = getProgramCalendarCategories(categories).find(item => item.id === getProgramCalendarKey(program));
    return getColorTheme(category.color_theme);
};
export const getCalendarEventTheme = (event, categories = []) => {
    if (event.isPublic || event.type === 'PROGRAM') return getProgramCalendarTheme(event.raw, categories);
    const raw = event.raw || event;
    const category = categories.find(item => item.id === (event.category_id || raw.category_id))
        || ((event.type === 'RENTAL' || raw.category_id === 'RENTAL') ? categories.find(item => ['공간 대여', '대관'].includes(item.name)) : null);
    return getColorTheme(category?.color_theme || event.color_theme || 'gray');
};
