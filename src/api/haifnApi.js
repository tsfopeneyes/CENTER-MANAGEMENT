import { supabase } from '../supabaseClient';

export const haifnApi = {
    // ---- Earning & Deducting ----
    async grantProgramReward(userId, noticeId, rewardAmount, adminId, noticeTitle) {
        if (!rewardAmount || rewardAmount <= 0) return;

        // admin_id가 유효한 UUID 형식이 아니면(예: 'System') null로 처리하여 DB 22P02 오류 방지
        const isValidUuid = typeof adminId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(adminId);
        const validAdminId = isValidUuid ? adminId : null;

        const descMatch = `[프로그램 참여] ${noticeTitle}`;

        const { data: existing, error: checkErr } = await supabase
            .from('haifn_transactions')
            .select('id')
            .eq('user_id', userId)
            .eq('source_description', descMatch)
            .maybeSingle();

        if (checkErr) throw checkErr;
        
        // If already granted, skip it
        if (existing) return;

        // 2. Insert transaction
        const { error: insertErr } = await supabase
            .from('haifn_transactions')
            .insert([{
                user_id: userId,
                amount: rewardAmount,
                transaction_type: 'EARN',
                source_description: descMatch,
                admin_id: validAdminId
            }]);

        if (insertErr) throw insertErr;
    },

    async revokeProgramReward(userId, noticeTitle) {
        const descMatch = `[프로그램 참여] ${noticeTitle}`;
        
        // Find existing EARN transaction for this program and delete it to revoke
        const { error } = await supabase
            .from('haifn_transactions')
            .delete()
            .eq('user_id', userId)
            .eq('source_description', descMatch)
            .eq('transaction_type', 'EARN');

        if (error) throw error;
    },

    async grantOpenProgramReward(userId, noticeId, rewardAmount, adminId, noticeTitle, dateStr) {
        if (!rewardAmount || rewardAmount <= 0) return;
        const descMatch = `[오픈 프로그램 참여] ${noticeTitle} (${dateStr})`;

        const { data: existing, error: checkErr } = await supabase
            .from('haifn_transactions')
            .select('id')
            .eq('user_id', userId)
            .eq('source_description', descMatch)
            .maybeSingle();

        if (checkErr) throw checkErr;
        if (existing) return;

        const { error: insertErr } = await supabase
            .from('haifn_transactions')
            .insert([{
                user_id: userId,
                amount: rewardAmount,
                transaction_type: 'EARN',
                source_description: descMatch,
                admin_id: adminId
            }]);

        if (insertErr) throw insertErr;
    },

    async revokeOpenProgramReward(userId, noticeTitle, dateStr) {
        const descMatch = `[오픈 프로그램 참여] ${noticeTitle} (${dateStr})`;
        
        const { error } = await supabase
            .from('haifn_transactions')
            .delete()
            .eq('user_id', userId)
            .eq('source_description', descMatch)
            .eq('transaction_type', 'EARN');

        if (error) throw error;
    },

    async manualAdjustment(userId, amount, reason, adminId) {
        if (amount === 0) return;
        
        const type = amount > 0 ? 'EARN' : 'SPEND'; // SPEND or MANUAL? MANUAL matches 'EARN' logic but we can just use 'MANUAL' or 'EARN'
        
        const { error } = await supabase
            .from('haifn_transactions')
            .insert([{
                user_id: userId,
                amount: amount,
                transaction_type: 'MANUAL',
                source_description: `[관리자 수동 조정] ${reason}`,
                admin_id: adminId
            }]);

        if (error) throw error;
    },

    async grantContentVerificationReward(userId, category = 'QT나눔', sourceId = null) {
        const descMatch = `[콘텐츠 인증] ${category}`;
        
        let startDate = new Date();
        startDate.setHours(0,0,0,0);
        
        // 위클리 퀘스천은 '이번 주 월요일' 자정부터 기준
        if (category === '위클리 퀘스천') {
            const day = startDate.getDay();
            const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
            startDate = new Date(startDate.setDate(diff));
            startDate.setHours(0,0,0,0);
        }
        
        const { data: countData, error: countErr } = await supabase
            .from('haifn_transactions')
            .select('id')
            .eq('user_id', userId)
            .eq('transaction_type', 'EARN')
            .eq('source_description', descMatch)
            .gte('created_at', startDate.toISOString());
            
        if (!countErr && countData && countData.length >= 1) {
            return { granted: false, reason: 'DAILY_LIMIT_REACHED' };
        }
        
        const { error } = await supabase
            .from('haifn_transactions')
            .insert([{
                user_id: userId,
                amount: 1,
                transaction_type: 'EARN',
                source_description: descMatch,
                source_id: sourceId
            }]);

        if (error) throw error;
        return { granted: true };
    },

    async revokeContentVerificationReward(userId, sourceId, category = null) {
        let query = supabase
            .from('haifn_transactions')
            .delete()
            .eq('user_id', userId)
            .eq('transaction_type', 'EARN');

        if (sourceId) {
            query = query.eq('source_id', sourceId);
        } else if (category) {
            query = query.like('source_description', `%[콘텐츠 인증] ${category}%`);
        } else {
            query = query.like('source_description', '%[콘텐츠 인증]%');
        }

        // Delete the matching rows (should usually just be 1 if tied to a specific id)
        const { error } = await query;
        if (error && error.code !== 'PGRST116') throw error;
    },

    // ---- Admin Store & Approval Logic ----
    async createOrder(userId, itemId, amount, requiresApproval, itemName, itemType = 'SPEND') {
        // 1. Insert into store_orders
        const { error: orderError } = await supabase
            .from('store_orders')
            .insert([{
                user_id: userId,
                item_id: itemId,
                amount: amount,
                status: requiresApproval ? 'PENDING' : 'APPROVED'
            }]);

        if (orderError) throw orderError;

        // 2. If it DOES NOT require approval, immediately update balance
        if (!requiresApproval) {
            const isEarn = itemType === 'EARN';
            const { error: txError } = await supabase
                .from('haifn_transactions')
                .insert([{
                    user_id: userId,
                    amount: isEarn ? Math.abs(amount) : -Math.abs(amount),
                    transaction_type: isEarn ? 'EARN' : 'SPEND',
                    source_description: isEarn ? `[스토어 적립] ${itemName}` : `[스토어 교환] ${itemName}`
                }]);

            if (txError) throw txError;
        }
    },

    async getPendingOrders() {
        const { data, error } = await supabase
            .from('store_orders')
            .select(`
                *,
                users (name, school),
                haifn_items (name, requires_approval)
            `)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data;
    },

    async getStoreOrders() {
        const { data, error } = await supabase
            .from('store_orders')
            .select(`
                *,
                users (name, school),
                haifn_items (name, image_url, category, requires_approval)
            `)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        return data;
    },

    async getInstantStoreExchanges() {
        const { data, error } = await supabase
            .from('haifn_transactions')
            .select(`
                id,
                user_id,
                amount,
                source_description,
                created_at,
                users (name, school)
            `)
            .eq('transaction_type', 'SPEND')
            .like('source_description', '[스토어 교환]%')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        return data;
    },

    async deleteStoreOrder(order) {
        const requiresPointRestore = !['PENDING', 'REJECTED'].includes(order.displayStatus || order.status);

        if (requiresPointRestore) {
            let transactionId = order.transactionId;

            if (!transactionId) {
                const sourceDescription = `[스토어 교환] ${order.haifn_items?.name}`;
                const { data: transactions, error: findError } = await supabase
                    .from('haifn_transactions')
                    .select('id, created_at')
                    .eq('user_id', order.user_id)
                    .eq('transaction_type', 'SPEND')
                    .eq('amount', -Math.abs(order.amount))
                    .eq('source_description', sourceDescription)
                    .order('created_at', { ascending: false })
                    .limit(20);

                if (findError) throw findError;

                transactionId = transactions?.sort((a, b) => (
                    Math.abs(new Date(a.created_at) - new Date(order.created_at))
                    - Math.abs(new Date(b.created_at) - new Date(order.created_at))
                ))[0]?.id;
            }

            if (!transactionId) {
                throw new Error('포인트 소모 내역을 찾을 수 없어 삭제하지 않았습니다.');
            }

            // 하이픈 소모 내역을 먼저 삭제합니다. DB 잔액 트리거가 해당 포인트를 자동으로 복구합니다.
            const { error: transactionError } = await supabase
                .from('haifn_transactions')
                .delete()
                .eq('id', transactionId);

            if (transactionError) throw transactionError;
        }

        if (order.source === 'ORDER') {
            const { error: orderError } = await supabase
                .from('store_orders')
                .delete()
                .eq('id', order.id);

            if (orderError) throw orderError;
        }
    },

    async processOrder(orderId, userId, amount, isApproved, adminId, itemName, itemType = 'SPEND') {
        const newStatus = isApproved ? 'APPROVED' : 'REJECTED';
        
        // 1. Update order status
        const { error: updateErr } = await supabase
            .from('store_orders')
            .update({ status: newStatus, admin_id: adminId, completed_at: new Date().toISOString() })
            .eq('id', orderId);

        if (updateErr) throw updateErr;

        // 2. If approved, add or deduct points according to item_type
        if (isApproved) {
            const isEarn = itemType === 'EARN';
            const { error: txErr } = await supabase
                .from('haifn_transactions')
                .insert([{
                    user_id: userId,
                    amount: isEarn ? Math.abs(amount) : -Math.abs(amount),
                    transaction_type: isEarn ? 'EARN' : 'SPEND',
                    source_description: isEarn ? `[스토어 적립] ${itemName}` : `[스토어 교환] ${itemName}`,
                    admin_id: adminId
                }]);
            
            if (txErr) throw txErr;
        }
    },

    // ---- Store Items ----
    async getStoreItems() {
        const { data, error } = await supabase
            .from('haifn_items')
            .select('*')
            .order('amount', { ascending: true });
        
        if (error) throw error;
        return data;
    }
};
