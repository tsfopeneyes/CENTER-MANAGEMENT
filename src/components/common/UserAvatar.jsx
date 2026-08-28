import React, { useState } from 'react';
import { User } from 'lucide-react';

const UserAvatar = ({ user, size = "w-8 h-8", textSize = "text-xs" }) => {
    const [imgError, setImgError] = useState(false);

    if (user?.profile_image_url && !imgError) {
        return (
            <img 
                src={user.profile_image_url} 
                alt="Profile" 
                onError={() => setImgError(true)}
                className={`${size} aspect-square shrink-0 block rounded-full object-cover border border-gray-100 shadow-sm`}
            />
        );
    }

    const initial = user?.name?.[0] || '';

    return (
        <div className={`${size} aspect-square shrink-0 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200 shadow-sm overflow-hidden`}>
            {initial ? (
                <span className={`${textSize} font-bold text-gray-400`}>{initial}</span>
            ) : (
                <User size={size.includes('w-12') ? 24 : 14} className="text-gray-300" />
            )}
        </div>
    );
};

export default UserAvatar;
