import React, { useState, useEffect } from 'react';
import { supabase } from '../../../../supabaseClient';
import { Edit2, ShieldAlert, Image as ImageIcon, Plus, Trash2, Save, X } from 'lucide-react';
import { compressImage } from '../../../../utils/imageUtils';
import { isAccountAuthEnabled } from '../../../../auth/accountAuthRuntime';
import { cachedAccountProfileId, uploadAccountImage } from '../../../../auth/accountMedia';

const compressImageLocal = async (file) => {
    // Fallback if the path above is wrong. Actually, let's just upload directly for simplicity or import the real one.
    // The real one is at d:\coding\ENTER\src\utils\imageUtils.js
    const { compressImage } = await import('../../../../utils/imageUtils');
    return compressImage(file);
};

const StoreItems = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('전체');
    const categories = ['전체', '음료', '간식', '사용', '대관', '기타'];
    const [editingItem, setEditingItem] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    const [formData, setFormData] = useState({
        name: '', amount: 1, item_type: 'SPEND', requires_approval: false, image_url: '', is_active: true, category: '기타'
    });
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('haifn_items')
                .select('*')
                .order('item_type', { ascending: false })
                .order('amount', { ascending: true });
            if (error) throw error;
            setItems(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (item) => {
        setEditingItem(item);
        setFormData({
            name: item.name,
            amount: item.amount,
            item_type: item.item_type,
            requires_approval: item.requires_approval,
            image_url: item.image_url || '',
            is_active: item.is_active,
            category: item.category || '기타'
        });
        setImagePreview(item.image_url);
        setImageFile(null);
    };

    const handleCreateNew = () => {
        setEditingItem('NEW');
        setFormData({
            name: '', amount: 1, item_type: 'SPEND', requires_approval: false, image_url: '', is_active: true, category: '기타'
        });
        setImagePreview(null);
        setImageFile(null);
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        
        try {
            let finalImageUrl = formData.image_url;

            // Handle Image Upload
            if (imageFile) {
                const compressed = await compressImageLocal(imageFile);
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `store_${Date.now()}_${Math.random()}.${fileExt}`;

                if(isAccountAuthEnabled())finalImageUrl=await uploadAccountImage({profileId:cachedAccountProfileId(),kind:'store',file:compressed});
                else {
                const { error: uploadErr } = await supabase.storage
                    .from('notice-images') // Reusing notice-images bucket for simplicity
                    .upload(fileName, compressed);
                
                if (uploadErr) throw uploadErr;

                const { data: { publicUrl } } = supabase.storage
                    .from('notice-images')
                    .getPublicUrl(fileName);
                
                finalImageUrl = publicUrl;
                }
            }

            const payload = {
                name: formData.name,
                amount: parseInt(formData.amount, 10),
                item_type: formData.item_type,
                requires_approval: formData.requires_approval,
                image_url: finalImageUrl,
                is_active: formData.is_active,
                category: formData.category
            };

            if (editingItem === 'NEW') {
                const { error } = await supabase.from('haifn_items').insert([payload]);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('haifn_items').update(payload).eq('id', editingItem.id);
                if (error) throw error;
            }

            setEditingItem(null);
            fetchItems();
        } catch (err) {
            console.error(err);
            alert('저장 실패: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`'${name}' 항목을 완전히 삭제하시겠습니까? (삭제 시 복구 불가)`)) return;
        try {
            const { error } = await supabase.from('haifn_items').delete().eq('id', id);
            if (error) throw error;
            fetchItems();
        } catch (err) {
            alert('삭제 실패: ' + err.message);
        }
    };

    return (
        <div className="flex flex-col md:flex-row h-full">
            {/* List Section */}
            <div className={`flex-1 md:w-1/2 p-6 border-r border-gray-100 ${editingItem ? 'hidden md:block opacity-50 pointer-events-none' : 'block'}`}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-black text-gray-800">등록된 항목</h3>
                    <button 
                        onClick={handleCreateNew}
                        className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold flex items-center gap-1 hover:bg-blue-100 transition-colors text-sm"
                    >
                        <Plus size={16} /> 새 항목 추가
                    </button>
                </div>

                <div className="flex gap-2 mb-6 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-1 -mx-2 px-2 mask-edges">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`shrink-0 px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${
                                selectedCategory === cat 
                                ? 'bg-gray-800 text-white shadow-sm' 
                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="py-10 text-center text-gray-400 font-bold">항목을 불러오는 중...</div>
                ) : (
                    <div className="space-y-3">
                        {(() => {
                            const groupItems = items.filter(i => {
                                if (i.item_type !== 'SPEND') return false;
                                if (selectedCategory !== '전체') return i.category === selectedCategory;
                                return true;
                            });
                            if (groupItems.length === 0) return <div className="text-gray-400 text-sm">등록된 항목이 없습니다.</div>;

                            return (
                                <div className="mb-6">
                                    <h4 className="text-xs font-black uppercase tracking-widest mb-3 text-orange-500">
                                        소모품 (스토어)
                                    </h4>
                                    <div className="space-y-2">
                                        {groupItems.map(item => (
                                            <div 
                                                key={item.id} 
                                                className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer ${
                                                    !item.is_active ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
                                                }`}
                                                onClick={() => handleEdit(item)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                        {item.image_url ? (
                                                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <ImageIcon size={18} className="text-gray-400" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h5 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                                            {item.name}
                                                            {item.requires_approval && <ShieldAlert size={12} className="text-red-500" title="승인 필요" />}
                                                        </h5>
                                                        <p className="font-black text-xs text-orange-600">
                                                            -{item.amount} H
                                                        </p>
                                                    </div>
                                                </div>
                                                <Edit2 size={16} className="text-gray-300 mr-2" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* Editor Section */}
            {editingItem && (
                <div className="flex-1 md:w-1/2 p-6 bg-gray-50/50">
                    <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm sticky top-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-black text-gray-800 flex items-center gap-2">
                                {editingItem === 'NEW' ? '새 항목 추기' : '항목 수정'}
                            </h3>
                            <button type="button" onClick={() => setEditingItem(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">카테고리</label>
                                <select 
                                    value={formData.category}
                                    onChange={e => setFormData({...formData, category: e.target.value})}
                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-bold"
                                >
                                    <option value="음료">음료</option>
                                    <option value="간식">간식</option>
                                    <option value="사용">사용 (쿠폰, 상품권 등)</option>
                                    <option value="대관">대관 (공간 이용)</option>
                                    <option value="기타">기타</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">항목명</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                        placeholder="아메리카노"
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">포인트 양</label>
                                    <input 
                                        type="number" 
                                        min="1"
                                        required
                                        value={formData.amount}
                                        onChange={e => setFormData({...formData, amount: e.target.value})}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-bold text-blue-600"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">이미지 (옵션)</label>
                                <div className="flex items-center gap-4">
                                    <div className="w-20 h-20 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                                        {imagePreview ? (
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon className="text-gray-300" size={24} />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <input 
                                            type="file" 
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                        />
                                        <p className="text-[10px] text-gray-400 mt-2 ml-1">비율 1:1 이미지를 권장합니다.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2 flex flex-col gap-2">
                                {formData.item_type === 'SPEND' && (
                                    <label className="flex items-center gap-2 p-3 bg-red-50 rounded-xl border border-red-100 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={formData.requires_approval}
                                            onChange={e => setFormData({...formData, requires_approval: e.target.checked})}
                                            className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-red-800">승인 필요 여부</span>
                                            <span className="text-[10px] text-red-600/70 font-medium">관리자의 승인이 있어야 주문이 완료됩니다. (VIP 등)</span>
                                        </div>
                                    </label>
                                )}
                                
                                <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={formData.is_active}
                                        onChange={e => setFormData({...formData, is_active: e.target.checked})}
                                        className="w-4 h-4 text-gray-600 rounded focus:ring-gray-500"
                                    />
                                    <span className="text-sm font-bold text-gray-700">활성화 (스토어 노출)</span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-6 flex gap-3">
                            {editingItem !== 'NEW' && editingItem && (
                                <button 
                                    type="button"
                                    onClick={() => handleDelete(editingItem.id, editingItem.name)}
                                    className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                                    title="삭제"
                                >
                                    <Trash2 size={20} />
                                </button>
                            )}
                            <button 
                                type="submit" 
                                disabled={isSaving}
                                className={`flex-1 py-3 bg-gray-900 text-white rounded-xl font-bold flex justify-center items-center gap-2 shadow-lg hover:shadow-xl transition-all ${isSaving ? 'opacity-50' : 'hover:-translate-y-0.5'}`}
                            >
                                <Save size={18} /> {isSaving ? '저장 중...' : '저장하기'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default StoreItems;
