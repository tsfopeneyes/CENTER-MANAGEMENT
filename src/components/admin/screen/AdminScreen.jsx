import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Loader2, Monitor, Trash2 } from 'lucide-react';
import AdminPageHeader from '../common/AdminPageHeader';
import { supabase } from '../../../supabaseClient';
import { cachedAccountProfileId, uploadAccountImage } from '../../../auth/accountMedia';
import { isAccountAuthEnabled } from '../../../auth/accountAuthRuntime';
import { compressImage } from '../../../utils/imageUtils';
import { loadScreenConfig, saveScreenConfig } from '../../../utils/screenConfig';

const INTERVALS = [5, 10, 15, 30, 60];

export default function AdminScreen({ currentAdmin }) {
    const [images, setImages] = useState([]);
    const [intervalSeconds, setIntervalSeconds] = useState(10);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        loadScreenConfig().then(config => {
            setImages(config.images);
            setIntervalSeconds(config.intervalSeconds);
        }).catch(error => window.alert(`전자칠판 설정을 불러오지 못했습니다.\n${error.message}`))
            .finally(() => setLoading(false));
    }, []);

    const uploadFiles = async event => {
        const files = [...(event.target.files || [])];
        event.target.value = '';
        if (!files.length) return;
        if (images.length + files.length > 30) {
            window.alert('전자칠판 이미지는 최대 30장까지 등록할 수 있습니다.');
            return;
        }
        setUploading(true);
        try {
            const uploaded = [];
            for (const file of files) {
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WebP 이미지만 올릴 수 있습니다.');
                const optimized = await compressImage(file, 3840, 0.9);
                let url;
                if (isAccountAuthEnabled()) {
                    // The existing verified admin-notice upload route provides
                    // the same public-image behavior without a new server API.
                    url = await uploadAccountImage({ profileId: cachedAccountProfileId() || currentAdmin?.id, kind: 'notice', file: optimized });
                } else {
                    const path = `screen/${currentAdmin?.id || 'admin'}/${crypto.randomUUID()}.jpg`;
                    const { error } = await supabase.storage.from('notice-images').upload(path, optimized);
                    if (error) throw error;
                    url = supabase.storage.from('notice-images').getPublicUrl(path).data.publicUrl;
                }
                uploaded.push({ id: crypto.randomUUID(), url, name: file.name });
            }
            setImages(current => [...current, ...uploaded]);
            setDirty(true);
        } catch (error) {
            window.alert(`이미지 업로드에 실패했습니다.\n${error.message}`);
        } finally { setUploading(false); }
    };

    const move = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= images.length) return;
        setImages(current => {
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
        setDirty(true);
    };

    const remove = id => {
        setImages(current => current.filter(item => item.id !== id));
        setDirty(true);
    };

    const apply = async () => {
        setSaving(true);
        try {
            await saveScreenConfig({ images, intervalSeconds });
            setDirty(false);
            window.alert('전자칠판 화면에 적용했습니다.');
        } catch (error) {
            window.alert(`전자칠판 설정을 저장하지 못했습니다.\n${error.message}`);
        } finally { setSaving(false); }
    };

    if (loading) return <div className="py-20 text-center font-bold text-gray-400">전자칠판 설정을 불러오는 중...</div>;

    return (
        <div className="w-full space-y-6 pb-12">
            <AdminPageHeader title="전자칠판" subtitle="이미지를 올리고 표시 순서와 전환 간격을 설정합니다." icon={<Monitor />} />

            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:p-7">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">송출 이미지</h2>
                        <p className="mt-1 text-sm font-medium text-gray-400">JPG, PNG, WebP · 최대 30장</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => window.open('/screen', '_blank', 'noopener,noreferrer')}
                            className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50">
                            <ExternalLink size={17} /> 화면 열기
                        </button>
                        <label className={`flex cursor-pointer items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-600 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                            {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                            {uploading ? '업로드 중...' : '이미지 추가'}
                            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={uploadFiles} />
                        </label>
                    </div>
                </div>

                {images.length === 0 ? (
                    <label className="mt-6 flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 hover:border-blue-300 hover:text-blue-500">
                        <ImagePlus size={38} />
                        <span className="mt-3 font-bold">표시할 이미지를 추가해주세요</span>
                        <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={uploadFiles} />
                    </label>
                ) : (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {images.map((item, index) => (
                            <article key={item.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
                                <div className="aspect-video bg-black"><img src={item.url} alt={item.name} className="h-full w-full object-contain" /></div>
                                <div className="flex items-center gap-2 p-3">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white">{index + 1}</span>
                                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-600" title={item.name}>{item.name}</span>
                                    <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="rounded-lg p-2 text-gray-400 hover:bg-white hover:text-blue-600 disabled:opacity-20" aria-label="앞으로 이동"><ArrowUp size={17} /></button>
                                    <button type="button" disabled={index === images.length - 1} onClick={() => move(index, 1)} className="rounded-lg p-2 text-gray-400 hover:bg-white hover:text-blue-600 disabled:opacity-20" aria-label="뒤로 이동"><ArrowDown size={17} /></button>
                                    <button type="button" onClick={() => remove(item.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500" aria-label="삭제"><Trash2 size={17} /></button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section className="flex flex-col gap-5 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:flex-row md:items-end md:justify-between md:p-7">
                <label className="block">
                    <span className="text-sm font-black text-gray-800">이미지 전환 간격</span>
                    <select value={intervalSeconds} onChange={event => { setIntervalSeconds(Number(event.target.value)); setDirty(true); }}
                        className="mt-2 block w-48 rounded-xl border border-gray-200 bg-white px-4 py-3 font-bold text-gray-700 outline-none focus:border-blue-500">
                        {INTERVALS.map(seconds => <option key={seconds} value={seconds}>{seconds}초</option>)}
                    </select>
                    <p className="mt-2 text-xs font-medium text-gray-400">이미지가 한 장이면 계속 고정되어 표시됩니다.</p>
                </label>
                <button type="button" onClick={apply} disabled={saving || !dirty}
                    className="min-w-44 rounded-2xl bg-blue-600 px-6 py-4 font-black text-white shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none">
                    {saving ? '적용 중...' : dirty ? '전자칠판에 적용' : '적용 완료'}
                </button>
            </section>
        </div>
    );
}
