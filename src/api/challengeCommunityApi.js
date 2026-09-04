import { supabase } from '../supabaseClient';

export const challengeCommunityApi = {
    async fetchPosts(challengeId, userId) {
        const { data, error } = await supabase
            .from('challenge_community_posts')
            .select(`*, author:users!author_id(id,name,school,profile_image_url), challenge_community_reactions(user_id,emoji,users(id,name,school,profile_image_url)), challenge_community_comments(id,content,created_at,user_id,author:users!user_id(id,name,school,profile_image_url))`)
            .eq('challenge_id', challengeId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map(post => ({ ...post, currentUserId: userId }));
    },

    async createPost({ challengeId, authorId, content, imageUrl, missionId, missionDate }) {
        const payload = {
            challenge_id: challengeId,
            author_id: authorId,
            content: content.trim(),
            image_url: imageUrl || null,
            mission_id: missionId || null,
            mission_date: missionDate || null
        };
        const { data, error } = await supabase.rpc('create_challenge_community_post', { p_payload: payload });
        if (!error) return data;

        // Direct-table fallback is required for staged deployments where the RPC is not yet available.
        const { data: post, error: insertError } = await supabase
            .from('challenge_community_posts').insert(payload).select().single();
        if (insertError) throw insertError;
        if (missionId) {
            const { data: response, error: responseError } = await supabase
                .from('notice_responses').select('challenge_mission_statuses')
                .eq('notice_id', challengeId).eq('user_id', authorId).eq('status', 'JOIN').single();
            if (responseError) throw responseError;
            const statuses = { ...(response.challenge_mission_statuses || {}) };
            if (!statuses[missionId]?.completed) {
                statuses[missionId] = { completed: true, auth_type: 'community_post', post_id: post.id, auth_text: content.trim(), auth_image: imageUrl || null, submitted_at: new Date().toISOString() };
                const { error: updateError } = await supabase.from('notice_responses')
                    .update({ challenge_mission_statuses: statuses })
                    .eq('notice_id', challengeId).eq('user_id', authorId).eq('status', 'JOIN');
                if (updateError) throw updateError;
            }
        }
        return post;
    },

    async toggleReaction(postId, userId, emoji) {
        const query = supabase.from('challenge_community_reactions').select('post_id')
            .eq('post_id', postId).eq('user_id', userId).eq('emoji', emoji).maybeSingle();
        const { data, error } = await query;
        if (error) throw error;
        if (data) {
            const { error: deleteError } = await supabase.from('challenge_community_reactions').delete()
                .eq('post_id', postId).eq('user_id', userId).eq('emoji', emoji);
            if (deleteError) throw deleteError;
        } else {
            const { error: insertError } = await supabase.from('challenge_community_reactions').insert({ post_id: postId, user_id: userId, emoji });
            if (insertError) throw insertError;
        }
    },

    async createComment(postId, userId, content) {
        const { error } = await supabase.from('challenge_community_comments').insert({ post_id: postId, user_id: userId, content: content.trim() });
        if (error) throw error;
    },

    async deletePost(postId) {
        const { error } = await supabase.from('challenge_community_posts').delete().eq('id', postId);
        if (error) throw error;
    }
};
