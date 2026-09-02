import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { guestbookApi } from '../api/guestbookApi';
import { haifnApi } from '../api/haifnApi';
import { compressImage } from '../utils/imageUtils';
import { isAccountAuthEnabled } from '../auth/accountAuthRuntime';
import { uploadAccountImage } from '../auth/accountMedia';

export const useGuestbook = (userId, defaultCategory = null) => {
    const [guestPosts, setGuestPosts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    const fetchGuestPosts = useCallback(async (cat = defaultCategory) => {
        setLoading(true);
        try {
            const data = await guestbookApi.fetchPosts(cat);
            setGuestPosts(data || []);
        } catch (err) {
            console.error('Error fetching guest posts:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleCreatePost = async (content, imageFiles = [], category = 'QT나눔', metadata = {}) => {
        if (!content && (!imageFiles || imageFiles.length === 0)) return;
        setUploading(true);
        try {
            const imageUrls = [];

            for (const file of imageFiles) {
                // Apply automatic compression before upload
                const compressedFile = await compressImage(file);
                const fileExt = compressedFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
                if(isAccountAuthEnabled()){
                    imageUrls.push(await uploadAccountImage({profileId:userId,kind:'guestbook',file:compressedFile}));continue;
                }
                const { error: uploadError } = await supabase.storage
                    .from('notice-images')
                    .upload(`guest/${fileName}`, compressedFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('notice-images')
                    .getPublicUrl(`guest/${fileName}`);

                imageUrls.push(publicUrl);
            }

            // image_url is the first one for backward compatibility, images is the full array
            const mainImageUrl = imageUrls.length > 0 ? imageUrls[0] : null;
            const newPost = await guestbookApi.createPost(userId, content, mainImageUrl, imageUrls, category, metadata);
            
            // Trigger haifn reward for content verification
            const rewardResult = await haifnApi.grantContentVerificationReward(userId, category, newPost.id);
            if (rewardResult?.granted === false && rewardResult?.reason === 'DAILY_LIMIT_REACHED') {
                // Ignore silent notification or handle it
            }
            
            fetchGuestPosts(category);
            return true;
        } catch (err) {
            console.error('Error creating guest post:', err);
            alert('업로드 실패: ' + err.message);
            return false;
        } finally {
            setUploading(false);
        }
    };

    const fetchComments = async (postId) => {
        try {
            const data = await guestbookApi.fetchComments(postId);
            return data || [];
        } catch (err) {
            console.error('Error fetching guest comments:', err);
            return [];
        }
    };

    const handlePostComment = async (postId, content) => {
        if (!content.trim()) return false;
        try {
            await guestbookApi.postComment(postId, userId, content);
            return true;
        } catch (err) {
            console.error('Error posting guest comment:', err);
            alert('댓글 저장 실패');
            return false;
        }
    };

    const handleUpdatePost = async (postId, content, imageFiles = [], existingImages = [], metadata = null) => {
        if (!content && (!imageFiles || imageFiles.length === 0) && (!existingImages || existingImages.length === 0)) return false;
        setUploading(true);
        try {
            const imageUrls = [...existingImages];

            for (const file of imageFiles) {
                const compressedFile = await compressImage(file);
                const fileExt = compressedFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
                if(isAccountAuthEnabled()){
                    imageUrls.push(await uploadAccountImage({profileId:userId,kind:'guestbook',file:compressedFile}));continue;
                }
                const { error: uploadError } = await supabase.storage
                    .from('notice-images')
                    .upload(`guest/${fileName}`, compressedFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('notice-images')
                    .getPublicUrl(`guest/${fileName}`);

                imageUrls.push(publicUrl);
            }

            await guestbookApi.updatePost(postId, content, imageUrls, metadata);
            fetchGuestPosts();
            return true;
        } catch (err) {
            console.error('Error updating guest post:', err);
            alert('업데이트 실패: ' + err.message);
            return false;
        } finally {
            setUploading(false);
        }
    };

    const handleDeletePost = async (postId) => {
        try {
            await guestbookApi.deletePost(postId);
            // Delete associated haifn record if possible
            await haifnApi.revokeContentVerificationReward(userId, postId);

            fetchGuestPosts();
            return true;
        } catch (err) {
            console.error('Error deleting guest post:', err);
            alert('삭제 실패: ' + err.message);
            return false;
        }
    };

    const handleDeleteComment = async (postId, commentId) => {
        try {
            await guestbookApi.deleteComment(commentId);
            return true;
        } catch (err) {
            console.error('Error deleting guest comment:', err);
            alert('댓글 삭제 실패');
            return false;
        }
    };

    const handleUpdateComment = async (commentId, content) => {
        if (!content.trim()) return false;
        try {
            await guestbookApi.updateComment(commentId, content);
            return true;
        } catch (err) {
            console.error('Error updating guest comment:', err);
            alert('댓글 수정 실패: ' + err.message);
            return false;
        }
    };

    const handleToggleReaction = async (postId, emoji = '❤️') => {
        try {
            await guestbookApi.toggleReaction(postId, userId, emoji);
            setGuestPosts(prev => prev.map(p => {
                if (p.id === postId) {
                    const reactedAlready = p.guest_post_reactions?.some(r => r.user_id === userId && r.emoji === emoji);
                    return {
                        ...p,
                        guest_post_reactions: reactedAlready 
                            ? (p.guest_post_reactions || []).filter(r => !(r.user_id === userId && r.emoji === emoji)) 
                            : [...(p.guest_post_reactions || []), { user_id: userId, emoji }]
                    };
                }
                return p;
            }));
            return true;
        } catch (err) {
            console.error('Error toggling reaction:', err);
            alert('이모지 적용에 실패했습니다: ' + (err.message || '알 수 없는 오류'));
            return false;
        }
    };

    useEffect(() => {
        fetchGuestPosts(defaultCategory);
    }, [fetchGuestPosts, defaultCategory]);

    return {
        guestPosts,
        loading,
        uploading,
        fetchGuestPosts,
        handleCreatePost,
        handleUpdatePost,
        fetchComments,
        handlePostComment,
        handleUpdateComment,
        handleDeletePost,
        handleDeleteComment,
        handleToggleReaction
    };
};
