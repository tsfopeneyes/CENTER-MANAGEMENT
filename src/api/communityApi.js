import { supabase } from '../supabaseClient';

// Helper for fallback post count update when RPC fails
const updatePostCountFallback = async (postId, field, delta) => {
    try {
        const { data } = await supabase.from('community_posts').select(field).eq('id', postId).maybeSingle();
        if (data) {
            const current = data[field] || 0;
            const updated = Math.max(0, current + delta);
            await supabase.from('community_posts').update({ [field]: updated }).eq('id', postId);
        }
    } catch (e) {
        console.error(`Fallback error updating ${field}:`, e);
    }
};

export const communityApi = {
    // Fetch posts for a specific category
    fetchPosts: async (category, currentUserId) => {
        const { data, error } = await supabase
            .from('community_posts')
            .select(`
                *,
                author:users!author_id (id, name, profile_image_url)
            `)
            .eq('category', category)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching community posts:', error);
            return [];
        }

        if (currentUserId && data.length > 0) {
            // Check if current user liked these posts
            const postIds = data.map(p => p.id);
            const { data: likes } = await supabase
                .from('community_likes')
                .select('post_id')
                .eq('user_id', currentUserId)
                .in('post_id', postIds);

            const likedPostIds = new Set(likes?.map(l => l.post_id) || []);

            return data.map(post => ({
                ...post,
                isLikedByMe: likedPostIds.has(post.id)
            }));
        }

        return data;
    },

    // Create a new post
    createPost: async (authorId, category, content) => {
        const { data, error } = await supabase
            .from('community_posts')
            .insert([{ author_id: authorId, category, content }])
            .select()
            .single();

        if (error) {
            console.error('Error creating post:', error);
            return null;
        }
        return data;
    },

    // Update post
    updatePost: async (postId, content) => {
        const { data, error } = await supabase
            .from('community_posts')
            .update({ content, updated_at: new Date() })
            .eq('id', postId)
            .select()
            .single();

        if (error) {
            console.error('Error updating post:', error);
            return null;
        }
        return data;
    },

    // Toggle short-circuit like
    toggleLike: async (postId, userId, isCurrentlyLiked) => {
        if (isCurrentlyLiked) {
            // Unlike
            const { error: delError } = await supabase.from('community_likes').delete().eq('post_id', postId).eq('user_id', userId);
            if (delError) {
                console.error('Error deleting like:', delError);
                return false;
            }

            // Decrement
            const { error: rpcError } = await supabase.rpc('decrement_post_likes', { p_post_id: postId });
            if (rpcError) {
                console.warn('Error decrementing likes via RPC, using direct update fallback:', rpcError);
                await updatePostCountFallback(postId, 'likes_count', -1);
            }

            return true;
        } else {
            // Like
            const { error: addError } = await supabase.from('community_likes').insert([{ post_id: postId, user_id: userId }]);
            if (addError) {
                console.error('Error inserting like:', addError);
                // If it's a duplicate key error (23505), it means the user already liked it.
                // We shouldn't increment the count again.
                if (addError.code === '23505') return false;
            }

            // Increment
            const { error: rpcError } = await supabase.rpc('increment_post_likes', { p_post_id: postId });
            if (rpcError) {
                console.warn('Error incrementing likes via RPC, using direct update fallback:', rpcError);
                await updatePostCountFallback(postId, 'likes_count', 1);
            }

            return true;
        }
    },

    // Delete post
    deletePost: async (postId) => {
        // RLS or backend should restrict to author
        const { error } = await supabase.from('community_posts').delete().eq('id', postId);
        return !error;
    },

    // Fetch Comments
    fetchComments: async (postId) => {
        const { data, error } = await supabase
            .from('community_comments')
            .select(`
                *,
                author:users!author_id (id, name, profile_image_url)
            `)
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching comments:', error);
            return [];
        }
        return data;
    },

    // Create Comment
    createComment: async (postId, authorId, content) => {
        const { data, error } = await supabase
            .from('community_comments')
            .insert([{ post_id: postId, author_id: authorId, content }])
            .select()
            .single();

        if (error) {
            console.error('Error creating comment:', error);
            return null;
        }

        // Increment post comments count
        const { error: rpcError } = await supabase.rpc('increment_post_comments', { p_post_id: postId });
        if (rpcError) {
            console.warn('Error incrementing comments via RPC, using direct update fallback:', rpcError);
            await updatePostCountFallback(postId, 'comments_count', 1);
        }

        return data;
    },

    // Delete comment
    deleteComment: async (commentId, postId) => {
        const { error } = await supabase.from('community_comments').delete().eq('id', commentId);
        if (!error) {
            const { error: rpcError } = await supabase.rpc('decrement_post_comments', { p_post_id: postId });
            if (rpcError) {
                console.warn('Error decrementing comments via RPC, using direct update fallback:', rpcError);
                await updatePostCountFallback(postId, 'comments_count', -1);
            }
        } else {
            console.error('Error deleting comment:', error);
        }
        return !error;
    },

    // Update comment
    updateComment: async (commentId, content) => {
        const { data, error } = await supabase
            .from('community_comments')
            .update({ content, updated_at: new Date() })
            .eq('id', commentId)
            .select()
            .single();

        if (error) {
            console.error('Error updating comment:', error);
            return null;
        }
        return data;
    },

    // Subscribe to post changes (likes count, comments count, etc)
    subscribeToPostChanges: (callback) => {
        return supabase
            .channel('public:community_posts')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'community_posts'
                },
                (payload) => {
                    console.log('Real-time UPDATE received:', payload);
                    callback(payload.new);
                }
            )
            .subscribe((status) => {
                console.log('Real-time subscription status:', status);
            });
    },

    // Unsubscribe from channel
    unsubscribeFromChanges: (channel) => {
        if (channel) {
            console.log('Unsubscribing from realtime channel');
            supabase.removeChannel(channel);
        }
    }
};
