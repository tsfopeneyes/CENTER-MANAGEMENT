import { useState, useEffect } from 'react';
import { badgesApi } from '../../../../api/badgesApi';
import { supabase } from '../../../../supabaseClient';
import { compressImage } from '../../../../utils/imageUtils';
import { isAccountAuthEnabled } from '../../../../auth/accountAuthRuntime';
import { cachedAccountProfileId, uploadAccountImage } from '../../../../auth/accountMedia';

export const useAdminBadges = () => {
    const [categories, setCategories] = useState([]);
    const [challenges, setChallenges] = useState([]);
    const [loading, setLoading] = useState(true);

    const [expandedCategory, setExpandedCategory] = useState(null);
    const [showCategoryForm, setShowCategoryForm] = useState(false);
    const [showChallengeForm, setShowChallengeForm] = useState(false);
    const [showAwardModal, setShowAwardModal] = useState(false);
    const [awardingChallenge, setAwardingChallenge] = useState(null);
    const [awardedUserIds, setAwardedUserIds] = useState([]);
    const [studentUsers, setStudentUsers] = useState([]);

    const [editingCategory, setEditingCategory] = useState({ name: '', description: '' });
    const [editingChallenge, setEditingChallenge] = useState({
        name: '', description: '', category_id: '', type: 'VISIT', threshold: 0, criteria_label: '', image_url: ''
    });
    const [uploading, setUploading] = useState(false);
    const [isBadgeSystemEnabled, setIsBadgeSystemEnabled] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [catData, chData, { data: uData }] = await Promise.all([
                badgesApi.fetchCategories(),
                badgesApi.fetchBadges(),
                supabase.from('users')
                    .select('id, name, school, user_group, role')
                    .neq('role', 'admin')
                    .neq('user_group', 'STAFF')
                    .order('name')
            ]);
            setCategories(catData);
            setChallenges(chData);
            setStudentUsers(uData || []);
            if (catData.length > 0 && !expandedCategory) {
                setExpandedCategory(catData[0].id);
            }

            const { data: config } = await supabase
                .from('notices')
                .select('content')
                .eq('category', 'SYSTEM')
                .eq('title', 'BADGE_SYSTEM_CONFIG')
                .maybeSingle();
            
            if (config?.content) {
                try {
                    const parsed = JSON.parse(config.content);
                    setIsBadgeSystemEnabled(parsed.enabled !== false);
                } catch (e) {
                    console.error("Failed to parse BADGE_SYSTEM_CONFIG:", e);
                }
            }
        } catch (error) {
            console.error('Fetch error:', error);
            alert('데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveCategory = async (e) => {
        e.preventDefault();
        try {
            await badgesApi.upsertCategory(editingCategory);
            setShowCategoryForm(false);
            setEditingCategory({ name: '', description: '' });
            fetchData();
            alert('카테고리가 저장되었습니다.');
        } catch (error) {
            alert('카테고리 저장 실패: ' + error.message);
        }
    };

    const handleDeleteCategory = async (id) => {
        if (!window.confirm('카테고리를 삭제하면 소속된 모든 뱃지도 삭제됩니다. 계속하시겠습니까?')) return;
        try {
            await badgesApi.deleteCategory(id);
            fetchData();
        } catch (error) {
            alert('삭제 실패: ' + error.message);
        }
    };

    const handleSaveChallenge = async (e) => {
        e.preventDefault();
        try {
            await badgesApi.upsertBadge(editingChallenge);
            setShowChallengeForm(false);
            setEditingChallenge({ name: '', description: '', category_id: expandedCategory, type: 'VISIT', threshold: 0, criteria_label: '', image_url: '' });
            fetchData();
            alert('뱃지가 저장되었습니다.');
        } catch (error) {
            alert('뱃지 저장 실패: ' + error.message);
        }
    };

    const handleDeleteChallenge = async (id) => {
        if (!window.confirm('뱃지를 삭제하시겠습니까?')) return;
        try {
            await badgesApi.deleteBadge(id);
            fetchData();
        } catch (error) {
            alert('삭제 실패: ' + error.message);
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        try {
            const compressedFile = await compressImage(file, 512, 0.9);
            const fileExt = compressedFile.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            let publicUrl;
            if(isAccountAuthEnabled())publicUrl=await uploadAccountImage({profileId:cachedAccountProfileId(),kind:'badge',file:compressedFile});
            else {
            const { error: uploadError } = await supabase.storage
                .from('notice-images')
                .upload(`badges/${fileName}`, compressedFile);

            if (uploadError) throw uploadError;

            ({ data: { publicUrl } } = supabase.storage
                .from('notice-images')
                .getPublicUrl(`badges/${fileName}`));
            }

            setEditingChallenge(prev => ({ ...prev, image_url: publicUrl }));
        } catch (error) {
            alert('이미지 업로드 실패: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    const openCategoryModal = (cat = { name: '', description: '' }) => {
        setEditingCategory(cat);
        setShowCategoryForm(true);
    };

    const openChallengeModal = (ch = { name: '', description: '', category_id: expandedCategory, type: 'VISIT', threshold: 0, image_url: '' }) => {
        setEditingChallenge(ch);
        setShowChallengeForm(true);
    };

    const openAwardModal = async (challenge) => {
        setAwardingChallenge(challenge);
        setShowAwardModal(true);
        try {
            const userIds = await badgesApi.fetchAwardedUsers(challenge.id);
            setAwardedUserIds(userIds);
        } catch (error) {
            console.error('Error fetching awarded users:', error);
            alert('뱃지 획득 학생 목록을 가져오는 데 실패했습니다.');
        }
    };

    const handleSaveAwards = async (userIds) => {
        if (!awardingChallenge) return;
        try {
            await badgesApi.saveAwardedUsers(awardingChallenge.id, userIds);
            setAwardedUserIds(userIds);
            setShowAwardModal(false);
            setAwardingChallenge(null);
            alert('뱃지 수여 내역이 저장되었습니다.');
        } catch (error) {
            console.error('Error saving awards:', error);
            alert('뱃지 수여 저장 실패: ' + error.message);
        }
    };

    const handleToggleBadgeSystem = async (enabled) => {
        try {
            const { data: existing } = await supabase
                .from('notices')
                .select('id')
                .eq('category', 'SYSTEM')
                .eq('title', 'BADGE_SYSTEM_CONFIG')
                .maybeSingle();
                
            const contentJson = JSON.stringify({ enabled });
            
            if (existing?.id) {
                const { error: updateError } = await supabase
                    .from('notices')
                    .update({ content: contentJson })
                    .eq('id', existing.id);
                if (updateError) throw updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('notices')
                    .insert([{
                        title: 'BADGE_SYSTEM_CONFIG',
                        content: contentJson,
                        category: 'SYSTEM',
                        is_recruiting: false,
                        is_sticky: false
                    }]);
                if (insertError) throw insertError;
            }
            setIsBadgeSystemEnabled(enabled);
        } catch (error) {
            console.error('Error toggling badge system:', error);
            alert('설정 변경에 실패했습니다: ' + error.message);
        }
    };

    return {
        categories, challenges, loading,
        expandedCategory, setExpandedCategory,
        showCategoryForm, setShowCategoryForm,
        showChallengeForm, setShowChallengeForm,
        showAwardModal, setShowAwardModal,
        awardingChallenge, setAwardingChallenge,
        awardedUserIds, setAwardedUserIds,
        studentUsers,
        editingCategory, setEditingCategory,
        editingChallenge, setEditingChallenge,
        uploading,
        isBadgeSystemEnabled,
        handleToggleBadgeSystem,
        handleSaveCategory, handleDeleteCategory,
        handleSaveChallenge, handleDeleteChallenge,
        handleImageUpload, openCategoryModal, openChallengeModal,
        openAwardModal, handleSaveAwards
    };
};
